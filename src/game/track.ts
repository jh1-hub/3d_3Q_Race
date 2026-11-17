import * as THREE from 'three';
import { ProceduralTextures } from './textures';
import { COURSES, CourseId } from './types';

export interface TrackSample {
  s: number; // 0..1 normalized progress
  arcLength: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bankAngle: number;
}

export interface BoostPad {
  s: number;
  lateral: number; // -1..1 normalized across track half-width
  width: number;
  length: number;
  mesh: THREE.Mesh;
}

export interface TrackData {
  courseId: CourseId;
  group: THREE.Group;
  samples: TrackSample[];
  totalLength: number;
  halfWidth: number;
  boostPads: BoostPad[];
  minimapPoints: { x: number; y: number }[];
  worldToMinimap: (x: number, z: number) => { x: number; y: number };
  sampleAtS: (s: number, out: TrackSample) => void;
  findClosestS: (pos: THREE.Vector3, hintS: number, outSample: TrackSample) => { s: number; lateral: number };
  dispose: () => void;
}

const _tmpVec = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function getCourseControlPoints(courseId: CourseId): THREE.Vector3[] {
  switch (courseId) {
    case 'oceanic':
      return [
        new THREE.Vector3(0, 12, 0),
        new THREE.Vector3(0, 12, -460),
        new THREE.Vector3(240, 18, -820),
        new THREE.Vector3(680, 26, -780),
        new THREE.Vector3(920, 22, -380),
        new THREE.Vector3(740, 14, 40),
        new THREE.Vector3(880, 20, 460),
        new THREE.Vector3(620, 28, 820),
        new THREE.Vector3(160, 22, 860),
        new THREE.Vector3(-120, 14, 540),
        new THREE.Vector3(-40, 12, 260),
      ];
    case 'lunar':
      return [
        new THREE.Vector3(0, 14, 0),
        new THREE.Vector3(0, 14, -500),
        new THREE.Vector3(-280, 24, -880),
        new THREE.Vector3(-760, 32, -840),
        new THREE.Vector3(-1020, 24, -440),
        new THREE.Vector3(-820, 16, -20),
        new THREE.Vector3(-460, 18, 220),
        new THREE.Vector3(-720, 28, 620),
        new THREE.Vector3(-460, 34, 960),
        new THREE.Vector3(-20, 24, 840),
        new THREE.Vector3(80, 16, 440),
      ];
    case 'skycity':
      return [
        new THREE.Vector3(0, 22, 0),
        new THREE.Vector3(180, 30, -400),
        new THREE.Vector3(520, 42, -680),
        new THREE.Vector3(460, 46, -1040),
        new THREE.Vector3(20, 34, -1080),
        new THREE.Vector3(-380, 22, -780),
        new THREE.Vector3(-560, 26, -340),
        new THREE.Vector3(-520, 38, 120),
        new THREE.Vector3(-280, 42, 520),
        new THREE.Vector3(40, 30, 560),
        new THREE.Vector3(40, 22, 280),
      ];
    case 'orbital':
    default:
      return [
        new THREE.Vector3(0, 14, 0),
        new THREE.Vector3(0, 14, -420),
        new THREE.Vector3(-122, 22, -768),
        new THREE.Vector3(-464, 34, -885),
        new THREE.Vector3(-798, 30, -652),
        new THREE.Vector3(-900, 18, -261),
        new THREE.Vector3(-624, 12, 58),
        new THREE.Vector3(-855, 22, 420),
        new THREE.Vector3(-682, 36, 768),
        new THREE.Vector3(-261, 30, 870),
        new THREE.Vector3(102, 18, 624),
        new THREE.Vector3(52, 14, 319),
      ];
  }
}

function isClearOfTrack(
  tx: number,
  tz: number,
  samples: TrackSample[],
  minDist: number
): boolean {
  const minDistSq = minDist * minDist;
  for (let j = 0; j < samples.length; j += 8) {
    const sp = samples[j].position;
    const dx = tx - sp.x;
    const dz = tz - sp.z;
    if (dx * dx + dz * dz < minDistSq) {
      return false;
    }
  }
  return true;
}

export function createTrack(
  courseId: CourseId,
  textures: ProceduralTextures,
  isSoftwareGl: boolean
): TrackData {
  const courseSpec = COURSES.find((c) => c.id === courseId) ?? COURSES[0];
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Closed-loop 3D circuit waypoints (~4750-4950m smooth flowing curves)
  const controlPoints = getCourseControlPoints(courseId);
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();
  const SAMPLE_COUNT = 1200;
  const halfWidth = 16.0;

  // Compute circuit center for environment placement
  let sumX = 0;
  let sumZ = 0;
  const rawPositions: THREE.Vector3[] = [];
  const rawTangents: THREE.Vector3[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const u = i / SAMPLE_COUNT;
    const pt = curve.getPointAt(u);
    rawPositions.push(pt);
    rawTangents.push(curve.getTangentAt(u).normalize());
    sumX += pt.x;
    sumZ += pt.z;
  }
  const centerX = sumX / SAMPLE_COUNT;
  const centerZ = sumZ / SAMPLE_COUNT;

  const rawBanks = new Float32Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const prev = rawTangents[(i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT];
    const next = rawTangents[(i + 2) % SAMPLE_COUNT];
    const right = new THREE.Vector3().crossVectors(rawTangents[i], _worldUp).normalize();
    const deltaT = new THREE.Vector3().subVectors(next, prev);
    const curvature = deltaT.dot(right);
    rawBanks[i] = THREE.MathUtils.clamp(-curvature * 3.2, -0.26, 0.26);
  }

  const smoothBanks = new Float32Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    let sum = 0;
    const radius = 8;
    for (let k = -radius; k <= radius; k++) {
      sum += rawBanks[(i + k + SAMPLE_COUNT) % SAMPLE_COUNT];
    }
    smoothBanks[i] = sum / (radius * 2 + 1);
  }

  const samples: TrackSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const tangent = rawTangents[i].clone();
    const flatRight = new THREE.Vector3().crossVectors(tangent, _worldUp).normalize();
    const baseUp = new THREE.Vector3().crossVectors(flatRight, tangent).normalize();
    const bankAngle = smoothBanks[i];

    const bankQuat = new THREE.Quaternion().setFromAxisAngle(tangent, bankAngle);
    const right = flatRight.clone().applyQuaternion(bankQuat).normalize();
    const up = baseUp.clone().applyQuaternion(bankQuat).normalize();

    samples.push({
      s: i / SAMPLE_COUNT,
      arcLength: (i / SAMPLE_COUNT) * totalLength,
      position: rawPositions[i].clone(),
      tangent,
      right,
      up,
      bankAngle,
    });
  }

  // Build Road Deck Ribbon + Underside Hull + Side Energy Barriers
  const segCount = SAMPLE_COUNT;
  const vertCount = (segCount + 1) * 2;
  const roadPos = new Float32Array(vertCount * 3);
  const roadNorm = new Float32Array(vertCount * 3);
  const roadUv = new Float32Array(vertCount * 2);
  const roadIndices: number[] = [];

  const deckVertCount = (segCount + 1) * 6;
  const deckPos = new Float32Array(deckVertCount * 3);
  const deckIndices: number[] = [];

  const railPos = new Float32Array((segCount + 1) * 4 * 3);
  const railIndices: number[] = [];

  const tileLength = 16;
  const uvRepeatTotal = Math.round(totalLength / tileLength);

  for (let i = 0; i <= segCount; i++) {
    const s = samples[i % SAMPLE_COUNT];
    const vCoord = (i / segCount) * uvRepeatTotal;

    const leftEdge = s.position.clone().addScaledVector(s.right, -halfWidth);
    const rightEdge = s.position.clone().addScaledVector(s.right, halfWidth);

    const vi = i * 2;
    roadPos[vi * 3] = leftEdge.x;
    roadPos[vi * 3 + 1] = leftEdge.y;
    roadPos[vi * 3 + 2] = leftEdge.z;
    roadNorm[vi * 3] = s.up.x;
    roadNorm[vi * 3 + 1] = s.up.y;
    roadNorm[vi * 3 + 2] = s.up.z;
    roadUv[vi * 2] = 0;
    roadUv[vi * 2 + 1] = vCoord;

    roadPos[(vi + 1) * 3] = rightEdge.x;
    roadPos[(vi + 1) * 3 + 1] = rightEdge.y;
    roadPos[(vi + 1) * 3 + 2] = rightEdge.z;
    roadNorm[(vi + 1) * 3] = s.up.x;
    roadNorm[(vi + 1) * 3 + 1] = s.up.y;
    roadNorm[(vi + 1) * 3 + 2] = s.up.z;
    roadUv[(vi + 1) * 2] = 1;
    roadUv[(vi + 1) * 2 + 1] = vCoord;

    const ilEdge = s.position.clone().addScaledVector(s.right, -halfWidth);
    const olTop = s.position.clone().addScaledVector(s.right, -(halfWidth + 0.55)).addScaledVector(s.up, 1.05);
    const olBot = s.position.clone().addScaledVector(s.right, -(halfWidth + 0.35)).addScaledVector(s.up, -1.65);
    const orBot = s.position.clone().addScaledVector(s.right, halfWidth + 0.35).addScaledVector(s.up, -1.65);
    const orTop = s.position.clone().addScaledVector(s.right, halfWidth + 0.55).addScaledVector(s.up, 1.05);
    const irEdge = s.position.clone().addScaledVector(s.right, halfWidth);

    const di = i * 6;
    const pts = [ilEdge, olTop, olBot, orBot, orTop, irEdge];
    for (let k = 0; k < 6; k++) {
      deckPos[(di + k) * 3] = pts[k].x;
      deckPos[(di + k) * 3 + 1] = pts[k].y;
      deckPos[(di + k) * 3 + 2] = pts[k].z;
    }

    const rlA = s.position.clone().addScaledVector(s.right, -(halfWidth + 0.12)).addScaledVector(s.up, 0.85);
    const rlB = s.position.clone().addScaledVector(s.right, -(halfWidth + 0.12)).addScaledVector(s.up, 1.12);
    const rrA = s.position.clone().addScaledVector(s.right, halfWidth + 0.12).addScaledVector(s.up, 0.85);
    const rrB = s.position.clone().addScaledVector(s.right, halfWidth + 0.12).addScaledVector(s.up, 1.12);

    const ri = i * 4;
    const rPts = [rlA, rlB, rrA, rrB];
    for (let k = 0; k < 4; k++) {
      railPos[(ri + k) * 3] = rPts[k].x;
      railPos[(ri + k) * 3 + 1] = rPts[k].y;
      railPos[(ri + k) * 3 + 2] = rPts[k].z;
    }

    if (i < segCount) {
      roadIndices.push(vi, vi + 2, vi + 1);
      roadIndices.push(vi + 1, vi + 2, vi + 3);

      deckIndices.push(di, di + 6, di + 1);
      deckIndices.push(di + 1, di + 6, di + 7);
      deckIndices.push(di + 1, di + 7, di + 2);
      deckIndices.push(di + 2, di + 7, di + 8);
      deckIndices.push(di + 2, di + 8, di + 3);
      deckIndices.push(di + 3, di + 8, di + 9);
      deckIndices.push(di + 3, di + 9, di + 4);
      deckIndices.push(di + 4, di + 9, di + 10);
      deckIndices.push(di + 4, di + 10, di + 5);
      deckIndices.push(di + 5, di + 10, di + 11);

      railIndices.push(ri, ri + 4, ri + 1);
      railIndices.push(ri + 1, ri + 4, ri + 5);
      railIndices.push(ri + 2, ri + 3, ri + 6);
      railIndices.push(ri + 3, ri + 7, ri + 6);
    }
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('normal', new THREE.BufferAttribute(roadNorm, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIndices);

  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.trackAlbedo,
      emissiveMap: textures.trackEmissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.35,
      roughnessMap: textures.trackRoughness,
      roughness: 0.72,
      metalness: 0.35,
      side: THREE.DoubleSide,
    })
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const deckGeo = trackGeo(new THREE.BufferGeometry());
  deckGeo.setAttribute('position', new THREE.BufferAttribute(deckPos, 3));
  deckGeo.setIndex(deckIndices);
  deckGeo.computeVertexNormals();
  const deckColor =
    courseId === 'lunar' ? 0x1e2433 : courseId === 'skycity' ? 0x191838 : 0x0b1220;
  const deckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: deckColor,
      metalness: 0.65,
      roughness: 0.45,
      side: THREE.DoubleSide,
    })
  );
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  const railGeo = trackGeo(new THREE.BufferGeometry());
  railGeo.setAttribute('position', new THREE.BufferAttribute(railPos, 3));
  railGeo.setIndex(railIndices);
  railGeo.computeVertexNormals();
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: courseSpec.railColor,
      emissive: courseSpec.railEmissive,
      emissiveIntensity: 2.0,
      roughness: 0.25,
      side: THREE.DoubleSide,
    })
  );
  const railMesh = new THREE.Mesh(railGeo, railMat);
  group.add(railMesh);

  // Start / Finish Laser Line Decal
  const startSample = samples[0];
  const sfGeo = trackGeo(new THREE.PlaneGeometry(halfWidth * 1.9, 4.2));
  sfGeo.rotateX(-Math.PI / 2);
  const sfMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.startFinishAlbedo,
      emissive: courseSpec.accentColor,
      emissiveIntensity: 0.28,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const sfMesh = new THREE.Mesh(sfGeo, sfMat);
  const startLeft = startSample.right.clone().negate();
  const sfMatrix = new THREE.Matrix4().makeBasis(startLeft, startSample.up, startSample.tangent);
  sfMesh.quaternion.setFromRotationMatrix(sfMatrix);
  sfMesh.position.copy(startSample.position).addScaledVector(startSample.up, 0.03);
  sfMesh.receiveShadow = true;
  group.add(sfMesh);

  // Start / Finish Futuristic Gantry Arch
  const gantryGroup = new THREE.Group();
  gantryGroup.quaternion.setFromRotationMatrix(sfMatrix);
  gantryGroup.position.copy(startSample.position);

  const pillarGeo = trackGeo(new THREE.BoxGeometry(1.1, 10.5, 1.4));
  const pillarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x162033,
      metalness: 0.8,
      roughness: 0.28,
    })
  );
  const gantryGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: courseSpec.railColor,
      emissive: courseSpec.railEmissive,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    })
  );

  [-halfWidth - 0.8, halfWidth + 0.8].forEach((px) => {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(px, 5.2, 0);
    p.castShadow = !isSoftwareGl;
    gantryGroup.add(p);
  });

  const beamGeo = trackGeo(new THREE.BoxGeometry(halfWidth * 2 + 3.0, 1.4, 1.8));
  const beam = new THREE.Mesh(beamGeo, pillarMat);
  beam.position.set(0, 10.2, 0);
  gantryGroup.add(beam);

  const lightBarGeo = trackGeo(new THREE.BoxGeometry(halfWidth * 1.8, 0.35, 1.9));
  const lightBar = new THREE.Mesh(lightBarGeo, gantryGlowMat);
  lightBar.position.set(0, 9.7, 0);
  gantryGroup.add(lightBar);
  group.add(gantryGroup);

  // Holographic Speed Arches along circuit (10 arches)
  const archCount = 10;
  const archFrameGeo = trackGeo(new THREE.TorusGeometry(halfWidth + 0.6, 0.24, 8, 28, Math.PI));
  const archFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: courseSpec.railEmissive,
      emissiveIntensity: 1.35,
      metalness: 0.7,
      roughness: 0.25,
    })
  );
  for (let a = 1; a <= archCount; a++) {
    const idx = Math.floor((a / (archCount + 1)) * SAMPLE_COUNT);
    const s = samples[idx];
    const arch = new THREE.Mesh(archFrameGeo, archFrameMat);
    const archLeft = s.right.clone().negate();
    const mat4 = new THREE.Matrix4().makeBasis(archLeft, s.up, s.tangent);
    arch.quaternion.setFromRotationMatrix(mat4);
    arch.position.copy(s.position).addScaledVector(s.up, 0.2);
    group.add(arch);
  }

  // Boost Pads (8 glowing chevron accelerators clear of quiz item gates at 0.48 and 0.95)
  const boostPadSpecs = [
    { s: 0.08, lateral: 0.0 },
    { s: 0.20, lateral: -0.35 },
    { s: 0.33, lateral: 0.32 },
    { s: 0.41, lateral: -0.25 },
    { s: 0.56, lateral: 0.3 },
    { s: 0.68, lateral: -0.32 },
    { s: 0.80, lateral: 0.28 },
    { s: 0.88, lateral: 0.0 },
  ];
  const boostPads: BoostPad[] = [];
  const bpGeo = trackGeo(new THREE.PlaneGeometry(3.8, 10.5));
  bpGeo.rotateX(-Math.PI / 2);
  bpGeo.rotateY(Math.PI);
  const bpMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.boostPadTexture,
      emissiveMap: textures.boostPadTexture,
      emissive: new THREE.Color(courseSpec.railColor),
      emissiveIntensity: 1.6,
      roughness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );

  for (const spec of boostPadSpecs) {
    const idx = Math.floor(spec.s * SAMPLE_COUNT) % SAMPLE_COUNT;
    const s = samples[idx];
    const padMesh = new THREE.Mesh(bpGeo, bpMat);
    const padLeft = s.right.clone().negate();
    const m4 = new THREE.Matrix4().makeBasis(padLeft, s.up, s.tangent);
    padMesh.quaternion.setFromRotationMatrix(m4);
    padMesh.position
      .copy(s.position)
      .addScaledVector(s.right, spec.lateral * (halfWidth - 2.6))
      .addScaledVector(s.up, 0.035);
    group.add(padMesh);
    boostPads.push({
      s: spec.s,
      lateral: spec.lateral * (halfWidth - 2.6),
      width: 3.8,
      length: 10.5,
      mesh: padMesh,
    });
  }

  // Track Support Pylons (skip floating pylons for Sky City so skyway feels suspended in air!)
  const dummy = new THREE.Object3D();
  const FLOOR_Y =
    courseId === 'oceanic'
      ? -26
      : courseId === 'lunar'
        ? -34
        : courseId === 'skycity'
          ? -54
          : -40;

  if (courseId !== 'skycity') {
    const pylonCount = 64;
    const pylonGeo = trackGeo(new THREE.BoxGeometry(3.2, 1, 3.2));
    const pylonMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: courseId === 'lunar' ? 0x293040 : courseId === 'oceanic' ? 0x0b2538 : 0x0f172a,
        metalness: 0.7,
        roughness: 0.45,
      })
    );
    const pylonInstanced = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);
    for (let i = 0; i < pylonCount; i++) {
      const s = samples[Math.floor((i / pylonCount) * SAMPLE_COUNT)];
      const topY = s.position.y - 1.4;
      const height = Math.max(2, topY - FLOOR_Y);
      dummy.position.set(s.position.x, FLOOR_Y + height / 2, s.position.z);
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      pylonInstanced.setMatrixAt(i, dummy.matrix);
    }
    pylonInstanced.instanceMatrix.needsUpdate = true;
    pylonInstanced.computeBoundingSphere();
    group.add(pylonInstanced);
  } else {
    // Anti-gravity thruster pods underneath Sky City track every ~60m
    const podCount = 48;
    const podGeo = trackGeo(new THREE.CylinderGeometry(2.6, 1.4, 1.4, 12));
    const podMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        emissive: 0x9333ea,
        emissiveIntensity: 1.5,
        metalness: 0.6,
        roughness: 0.3,
      })
    );
    const podInst = new THREE.InstancedMesh(podGeo, podMat, podCount);
    for (let i = 0; i < podCount; i++) {
      const s = samples[Math.floor((i / podCount) * SAMPLE_COUNT)];
      dummy.position.set(s.position.x, s.position.y - 2.3, s.position.z);
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      podInst.setMatrixAt(i, dummy.matrix);
    }
    podInst.instanceMatrix.needsUpdate = true;
    podInst.computeBoundingSphere();
    group.add(podInst);
  }

  // Course-Specific Environment World Builder
  if (courseId === 'oceanic') {
    // 1. Expansive Ocean Surface Plane
    const oceanGeo = trackGeo(new THREE.PlaneGeometry(7600, 7600));
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.oceanSurfaceTexture,
        roughness: 0.22,
        metalness: 0.55,
      })
    );
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.set(centerX, FLOOR_Y, centerZ);
    group.add(oceanMesh);

    // 2. Offshore Marine City Towers (InstancedMesh)
    const towerCount = 110;
    const towerGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const towerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0a2538,
        emissiveMap: textures.buildingEmissive,
        emissive: new THREE.Color(0x5eead4),
        emissiveIntensity: 0.9,
        metalness: 0.55,
        roughness: 0.45,
      })
    );
    const towerInst = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
    const tint = new THREE.Color();
    let placed = 0;
    let attempt = 0;
    while (placed < towerCount && attempt < 1100) {
      attempt++;
      const angle = ((attempt * 137.508) % 360) * (Math.PI / 180);
      const dist = 160 + ((attempt * 97) % 1350);
      const tx = centerX + Math.cos(angle) * dist;
      const tz = centerZ + Math.sin(angle) * dist;
      if (!isClearOfTrack(tx, tz, samples, 54)) continue;

      const w = 22 + ((attempt * 23) % 36);
      const d = 22 + ((attempt * 31) % 36);
      const h = 55 + ((attempt * 79) % 175);
      dummy.position.set(tx, FLOOR_Y + h / 2, tz);
      dummy.rotation.set(0, ((attempt * 13) % 4) * (Math.PI / 2), 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      towerInst.setMatrixAt(placed, dummy.matrix);

      const shade = 0.72 + (attempt % 5) * 0.07;
      tint.setRGB(shade * 0.7, shade * 1.0, shade * 1.05);
      towerInst.setColorAt(placed, tint);
      placed++;
    }
    towerInst.count = placed;
    towerInst.instanceMatrix.needsUpdate = true;
    if (towerInst.instanceColor) towerInst.instanceColor.needsUpdate = true;
    towerInst.computeBoundingSphere();
    group.add(towerInst);

    // 3. Composite Multi-Part Offshore Power Plant Complexes (6 facilities)
    const plantBaseGeo = trackGeo(new THREE.CylinderGeometry(28, 34, 16, 16));
    const plantDomeGeo = trackGeo(new THREE.SphereGeometry(18, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const plantCoreRingGeo = trackGeo(new THREE.TorusGeometry(22, 1.8, 10, 28));
    plantCoreRingGeo.rotateX(Math.PI / 2);
    const plantSpireGeo = trackGeo(new THREE.CylinderGeometry(2.2, 4.5, 58, 10));

    const plantShellMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x163246, metalness: 0.75, roughness: 0.3 })
    );
    const plantReactorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.1,
        roughness: 0.2,
      })
    );
    const plantAquaGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        emissive: 0x14b8a6,
        emissiveIntensity: 1.7,
        roughness: 0.25,
      })
    );

    const plantSpots = [
      [centerX + 180, centerZ - 260],
      [centerX - 240, centerZ + 180],
      [centerX + 460, centerZ + 280],
      [centerX - 420, centerZ - 420],
      [centerX + 680, centerZ - 180],
      [centerX + 60, centerZ + 520],
    ];
    for (const [px, pz] of plantSpots) {
      if (!isClearOfTrack(px, pz, samples, 68)) continue;
      const plant = new THREE.Group();
      plant.position.set(px, FLOOR_Y, pz);

      const base = new THREE.Mesh(plantBaseGeo, plantShellMat);
      base.position.y = 8;
      plant.add(base);

      const dome = new THREE.Mesh(plantDomeGeo, plantAquaGlowMat);
      dome.position.y = 16;
      plant.add(dome);

      const ring = new THREE.Mesh(plantCoreRingGeo, plantReactorMat);
      ring.position.y = 22;
      plant.add(ring);

      const spire = new THREE.Mesh(plantSpireGeo, plantShellMat);
      spire.position.y = 44;
      plant.add(spire);

      const beacon = new THREE.Mesh(plantCoreRingGeo, plantReactorMat);
      beacon.scale.setScalar(0.28);
      beacon.position.y = 70;
      plant.add(beacon);

      group.add(plant);
    }
  } else if (courseId === 'lunar') {
    // 1. Lunar Regolith Surface Basin
    const lunarGeo = trackGeo(new THREE.PlaneGeometry(7600, 7600));
    lunarGeo.rotateX(-Math.PI / 2);
    const lunarMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.lunarSurfaceTexture,
        roughness: 0.92,
        metalness: 0.06,
      })
    );
    const lunarMesh = new THREE.Mesh(lunarGeo, lunarMat);
    lunarMesh.position.set(centerX, FLOOR_Y, centerZ);
    group.add(lunarMesh);

    // 2. Starfield Dome & Blue Earth in Lunar Sky
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const phi = (((i * 73) % 75) + 8) * (Math.PI / 180);
      const rad = 1850;
      starPos[i * 3] = centerX + rad * Math.cos(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = rad * Math.sin(phi);
      starPos[i * 3 + 2] = centerZ + rad * Math.cos(phi) * Math.sin(theta);
    }
    const starGeo = trackGeo(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = trackMat(
      new THREE.PointsMaterial({ color: 0xe2e8f0, size: 4.5, sizeAttenuation: true })
    );
    group.add(new THREE.Points(starGeo, starMat));

    const earthGroup = new THREE.Group();
    earthGroup.position.set(centerX + 520, 420, centerZ - 1450);
    const earthSphere = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(125, 28, 24)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x1d4ed8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.65,
          roughness: 0.55,
        })
      )
    );
    const earthHalo = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(134, 24, 20)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.22,
          side: THREE.BackSide,
        })
      )
    );
    earthGroup.add(earthSphere);
    earthGroup.add(earthHalo);
    group.add(earthGroup);

    // 3. Geodesic Lunar Bio-Domes & Parabolic Comms Arrays (Composite 3D Structures)
    const domeBaseGeo = trackGeo(new THREE.CylinderGeometry(32, 36, 8, 20));
    const domeGlassGeo = trackGeo(new THREE.IcosahedronGeometry(26, 2));
    const domeRingGeo = trackGeo(new THREE.TorusGeometry(30, 1.2, 8, 28));
    domeRingGeo.rotateX(Math.PI / 2);
    const radarMastGeo = trackGeo(new THREE.CylinderGeometry(2.2, 3.6, 48, 8));
    const radarDishGeo = trackGeo(new THREE.SphereGeometry(14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.38));

    const titaniumMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.72, roughness: 0.35 })
    );
    const bioGlassMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0369a1,
        emissiveIntensity: 0.55,
        roughness: 0.18,
        metalness: 0.25,
        wireframe: true,
      })
    );
    const baseAmberMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 1.9,
        roughness: 0.3,
      })
    );

    const baseLocations = [
      [centerX - 180, centerZ - 260],
      [centerX - 420, centerZ + 120],
      [centerX - 240, centerZ + 480],
      [centerX + 260, centerZ - 420],
      [centerX - 640, centerZ - 520],
      [centerX - 680, centerZ + 380],
      [centerX + 220, centerZ + 220],
    ];
    for (const [bx, bz] of baseLocations) {
      if (!isClearOfTrack(bx, bz, samples, 72)) continue;
      const base = new THREE.Group();
      base.position.set(bx, FLOOR_Y, bz);

      const pad = new THREE.Mesh(domeBaseGeo, titaniumMat);
      pad.position.y = 4;
      base.add(pad);

      const ring = new THREE.Mesh(domeRingGeo, baseAmberMat);
      ring.position.y = 8;
      base.add(ring);

      const dome = new THREE.Mesh(domeGlassGeo, bioGlassMat);
      dome.position.y = 8;
      base.add(dome);

      const coreTower = new THREE.Mesh(radarMastGeo, titaniumMat);
      coreTower.position.set(22, 24, -12);
      base.add(coreTower);

      const dish = new THREE.Mesh(radarDishGeo, titaniumMat);
      dish.position.set(22, 48, -12);
      dish.rotation.x = Math.PI * 0.68;
      base.add(dish);

      group.add(base);
    }

    // 4. Crater Rim Boulders & Solar Array Wings (InstancedMesh)
    const solarCount = 96;
    const solarGeo = trackGeo(new THREE.BoxGeometry(16, 0.8, 9));
    const solarMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.45,
        metalness: 0.85,
        roughness: 0.15,
      })
    );
    const solarInst = new THREE.InstancedMesh(solarGeo, solarMat, solarCount);
    let placed = 0;
    let attempt = 0;
    while (placed < solarCount && attempt < 950) {
      attempt++;
      const angle = ((attempt * 137.508) % 360) * (Math.PI / 180);
      const dist = 140 + ((attempt * 89) % 1300);
      const sx = centerX + Math.cos(angle) * dist;
      const sz = centerZ + Math.sin(angle) * dist;
      if (!isClearOfTrack(sx, sz, samples, 48)) continue;

      dummy.position.set(sx, FLOOR_Y + 6, sz);
      dummy.rotation.set(0.38, angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      solarInst.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    solarInst.count = placed;
    solarInst.instanceMatrix.needsUpdate = true;
    solarInst.computeBoundingSphere();
    group.add(solarInst);
  } else if (courseId === 'skycity') {
    // 1. Dual Cloud-Sea Atmospheric Horizon
    const cloudGeo = trackGeo(new THREE.PlaneGeometry(7600, 7600));
    cloudGeo.rotateX(-Math.PI / 2);
    const cloudMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.skyCloudsTexture,
        emissiveMap: textures.skyCloudsTexture,
        emissive: new THREE.Color(0x7e22ce),
        emissiveIntensity: 0.45,
        roughness: 0.85,
        metalness: 0.1,
      })
    );
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.position.set(centerX, FLOOR_Y, centerZ);
    group.add(cloudMesh);

    // 2. Floating Sky Citadel Towers & Anti-Grav Islands (Instanced + Composite Islands)
    const islandCount = 95;
    const spireGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.72, 1, 8));
    const spireMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        emissiveMap: textures.buildingEmissive,
        emissive: new THREE.Color(0xc084fc),
        emissiveIntensity: 0.95,
        metalness: 0.65,
        roughness: 0.35,
      })
    );
    const spireInst = new THREE.InstancedMesh(spireGeo, spireMat, islandCount);
    const tint = new THREE.Color();
    let placed = 0;
    let attempt = 0;
    while (placed < islandCount && attempt < 1050) {
      attempt++;
      const angle = ((attempt * 137.508) % 360) * (Math.PI / 180);
      const dist = 150 + ((attempt * 101) % 1300);
      const fx = centerX + Math.cos(angle) * dist;
      const fz = centerZ + Math.sin(angle) * dist;
      if (!isClearOfTrack(fx, fz, samples, 54)) continue;

      const rad = 18 + ((attempt * 19) % 24);
      const h = 75 + ((attempt * 67) % 190);
      const baseAlt = -18 + ((attempt * 29) % 42);
      dummy.position.set(fx, baseAlt + h / 2, fz);
      dummy.rotation.set(0, ((attempt * 23) % 6) * (Math.PI / 3), 0);
      dummy.scale.set(rad, h, rad);
      dummy.updateMatrix();
      spireInst.setMatrixAt(placed, dummy.matrix);

      const shade = 0.78 + (attempt % 4) * 0.08;
      tint.setRGB(shade * 0.95, shade * 0.85, shade * 1.15);
      spireInst.setColorAt(placed, tint);
      placed++;
    }
    spireInst.count = placed;
    spireInst.instanceMatrix.needsUpdate = true;
    if (spireInst.instanceColor) spireInst.instanceColor.needsUpdate = true;
    spireInst.computeBoundingSphere();
    group.add(spireInst);

    // 3. Composite Floating Citadel Platforms with Anti-Grav Halo Rings (8 hero landmarks)
    const hullGeo = trackGeo(new THREE.ConeGeometry(28, 36, 8));
    hullGeo.rotateX(Math.PI);
    const deckTopGeo = trackGeo(new THREE.CylinderGeometry(28, 28, 6, 8));
    const thrusterHaloGeo = trackGeo(new THREE.TorusGeometry(22, 1.8, 10, 28));
    thrusterHaloGeo.rotateX(Math.PI / 2);
    const crystalSpireGeo = trackGeo(new THREE.ConeGeometry(10, 68, 6));

    const citadelMetalMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x312e81, metalness: 0.75, roughness: 0.25 })
    );
    const haloCyanMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x06b6d4,
        emissiveIntensity: 2.2,
        roughness: 0.2,
      })
    );
    const spireVioletMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe9d5ff,
        emissive: 0xa855f7,
        emissiveIntensity: 1.5,
        metalness: 0.5,
        roughness: 0.25,
      })
    );

    const citadelCoords = [
      [centerX + 260, centerZ - 320, 28],
      [centerX - 280, centerZ - 160, 36],
      [centerX + 120, centerZ + 180, 24],
      [centerX - 180, centerZ + 380, 34],
      [centerX + 420, centerZ + 60, 40],
      [centerX - 480, centerZ - 480, 30],
    ];
    for (const [cx, cz, cy] of citadelCoords) {
      if (!isClearOfTrack(cx, cz, samples, 72)) continue;
      const island = new THREE.Group();
      island.position.set(cx, cy, cz);

      const underHull = new THREE.Mesh(hullGeo, citadelMetalMat);
      underHull.position.y = -18;
      island.add(underHull);

      const platform = new THREE.Mesh(deckTopGeo, citadelMetalMat);
      platform.position.y = 3;
      island.add(platform);

      const halo = new THREE.Mesh(thrusterHaloGeo, haloCyanMat);
      halo.position.y = -4;
      island.add(halo);

      const spire = new THREE.Mesh(crystalSpireGeo, spireVioletMat);
      spire.position.y = 40;
      island.add(spire);

      group.add(island);
    }
  } else {
    // 'orbital' (Default Cyber-Metropolis Basin + Megastructure Skyline)
    const basinGeo = trackGeo(new THREE.PlaneGeometry(7200, 7200));
    basinGeo.rotateX(-Math.PI / 2);
    const basinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.groundGridTexture,
        roughness: 0.82,
        metalness: 0.25,
      })
    );
    const basinMesh = new THREE.Mesh(basinGeo, basinMat);
    basinMesh.position.set(centerX, FLOOR_Y, centerZ);
    group.add(basinMesh);

    const towerCount = 140;
    const towerGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const towerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0a1120,
        emissiveMap: textures.buildingEmissive,
        emissive: new THREE.Color(0x94a3b8),
        emissiveIntensity: 0.85,
        metalness: 0.55,
        roughness: 0.55,
      })
    );
    const towerInstanced = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
    const tintColor = new THREE.Color();
    let placed = 0;
    let attempt = 0;
    while (placed < towerCount && attempt < 1100) {
      attempt++;
      const angle = ((attempt * 137.508) % 360) * (Math.PI / 180);
      const dist = 120 + ((attempt * 97) % 1350);
      const tx = centerX + Math.cos(angle) * dist;
      const tz = centerZ + Math.sin(angle) * dist;

      if (!isClearOfTrack(tx, tz, samples, 48)) continue;

      const w = 24 + ((attempt * 23) % 42);
      const d = 24 + ((attempt * 31) % 42);
      const h = 75 + ((attempt * 83) % 210);
      dummy.position.set(tx, FLOOR_Y + h / 2, tz);
      dummy.rotation.set(0, ((attempt * 13) % 4) * (Math.PI / 2), 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      towerInstanced.setMatrixAt(placed, dummy.matrix);

      const shade = 0.7 + ((attempt % 5) * 0.08);
      tintColor.setRGB(shade * 0.85, shade * 0.95, shade * 1.1);
      towerInstanced.setColorAt(placed, tintColor);
      placed++;
    }
    towerInstanced.count = placed;
    towerInstanced.instanceMatrix.needsUpdate = true;
    if (towerInstanced.instanceColor) towerInstanced.instanceColor.needsUpdate = true;
    towerInstanced.computeBoundingSphere();
    group.add(towerInstanced);
  }

  // Compute normalized 2D minimap coordinates
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.position.x < minX) minX = s.position.x;
    if (s.position.x > maxX) maxX = s.position.x;
    if (s.position.z < minZ) minZ = s.position.z;
    if (s.position.z > maxZ) maxZ = s.position.z;
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const maxSpan = Math.max(spanX, spanZ);
  const padX = (maxSpan - spanX) * 0.5;
  const padZ = (maxSpan - spanZ) * 0.5;

  const worldToMinimap = (x: number, z: number) => ({
    x: 0.1 + ((x - minX + padX) / maxSpan) * 0.8,
    y: 0.1 + ((z - minZ + padZ) / maxSpan) * 0.8,
  });

  const minimapPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 6) {
    minimapPoints.push(worldToMinimap(samples[i].position.x, samples[i].position.z));
  }

  const sampleAtS = (sInput: number, out: TrackSample) => {
    const wrapped = ((sInput % 1) + 1) % 1;
    const fIdx = wrapped * SAMPLE_COUNT;
    const i0 = Math.floor(fIdx) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const alpha = fIdx - Math.floor(fIdx);

    const a = samples[i0];
    const b = samples[i1];

    out.s = wrapped;
    out.arcLength = wrapped * totalLength;
    out.position.lerpVectors(a.position, b.position, alpha);
    out.tangent.lerpVectors(a.tangent, b.tangent, alpha).normalize();
    out.right.lerpVectors(a.right, b.right, alpha).normalize();
    out.up.lerpVectors(a.up, b.up, alpha).normalize();
    out.bankAngle = THREE.MathUtils.lerp(a.bankAngle, b.bankAngle, alpha);
  };

  const findClosestS = (pos: THREE.Vector3, hintS: number, outSample: TrackSample) => {
    const centerIdx = Math.floor((((hintS % 1) + 1) % 1) * SAMPLE_COUNT);
    let bestIdx = centerIdx;
    let bestDistSq = Infinity;

    const searchRadius = 28;
    for (let offset = -searchRadius; offset <= searchRadius; offset++) {
      const idx = (centerIdx + offset + SAMPLE_COUNT) % SAMPLE_COUNT;
      const dSq = pos.distanceToSquared(samples[idx].position);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    const sample = samples[bestIdx];
    _tmpVec.subVectors(pos, sample.position);
    const along = _tmpVec.dot(sample.tangent);
    const ds = along / totalLength;
    const refinedS = ((bestIdx / SAMPLE_COUNT + ds) % 1 + 1) % 1;

    sampleAtS(refinedS, outSample);
    _tmpVec.subVectors(pos, outSample.position);
    const lateral = _tmpVec.dot(outSample.right);

    return { s: refinedS, lateral };
  };

  return {
    courseId,
    group,
    samples,
    totalLength,
    halfWidth,
    boostPads,
    minimapPoints,
    worldToMinimap,
    sampleAtS,
    findClosestS,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
