import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ChassisStyle, PlayerModelDetail } from './types';

export interface MachineSurfaceTextures {
  hullPanelBump: THREE.Texture;
  hullPanelRoughness: THREE.Texture;
  carbonWeaveAlbedo: THREE.Texture;
  carbonWeaveBump: THREE.Texture;
  titaniumBrushedBump: THREE.Texture;
}

export interface HypercarModel {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  thrusterFlames: THREE.Mesh[];
  boostGlowMaterial: THREE.MeshStandardMaterial;
  shadowPlane: THREE.Mesh;
  shieldDome: THREE.Mesh;
  glowAura: THREE.Group;
  hoverHalo: THREE.Mesh;
  spinSparkRing: THREE.Group;
  boostAura: THREE.Group;
  updateBoosters?: (dt: number, elapsed: number, speedRatio: number, boosting: boolean) => void;
  dispose: () => void;
}

type BucketKey =
  | 'hull'
  | 'secondary'
  | 'carbon'
  | 'titanium'
  | 'cockpitInterior'
  | 'canopy'
  | 'accentGlow'
  | 'headlight'
  | 'tailLight';

interface SweptWingParams {
  side: -1 | 1;
  rootX: number;
  tipX: number;
  rootZFront: number;
  rootZBack: number;
  tipZFront: number;
  tipZBack: number;
  rootY: number;
  tipY: number;
  rootThick: number;
  tipThick: number;
  camberPeak?: number;
}

/**
 * Builds a clean non-indexed 3D swept tapered airfoil wing geometry for either side.
 * Left side (-1) mirrors X and flips triangle winding so all normals point strictly outward.
 */
function createSweptWingGeometry(p: SweptWingParams): THREE.BufferGeometry {
  const peak = p.camberPeak ?? 0.34;
  const makeSection = (x: number, zF: number, zB: number, y: number, thick: number): [number, number, number][] => {
    const chord = zF - zB;
    const zPeak = zF - chord * peak;
    const zMidB = zF - chord * 0.72;
    return [
      [x, y - thick * 0.08, zF], // 0: sharp leading edge
      [x, y + thick * 0.56, zPeak], // 1: upper camber crest
      [x, y + thick * 0.28, zMidB], // 2: upper aft slope
      [x, y + thick * 0.04, zB], // 3: trailing edge
      [x, y - thick * 0.22, zMidB], // 4: lower aft
      [x, y - thick * 0.34, zPeak], // 5: lower belly
    ];
  };

  const rootPts = makeSection(p.side * p.rootX, p.rootZFront, p.rootZBack, p.rootY, p.rootThick);
  const tipPts = makeSection(p.side * p.tipX, p.tipZFront, p.tipZBack, p.tipY, p.tipThick);

  const positions: number[] = [];
  const pushTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    if (p.side === 1) {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    } else {
      // Reverse winding when mirrored across X
      positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
    }
  };

  const n = 6;
  // Side airfoil panels (ordered so outward normal for side=+1 via (b-a)x(c-a))
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const r0 = rootPts[i];
    const r1 = rootPts[j];
    const t0 = tipPts[i];
    const t1 = tipPts[j];
    pushTri(r0, t0, t1);
    pushTri(r0, t1, r1);
  }

  // Tip cap (+X on side=+1)
  for (let i = 1; i < n - 1; i++) {
    pushTri(tipPts[0], tipPts[i], tipPts[i + 1]);
  }

  // Root cap (-X on side=+1)
  for (let i = 1; i < n - 1; i++) {
    pushTri(rootPts[0], rootPts[i + 1], rootPts[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // Placeholder UVs (overwritten uniformly by box-projection before merging)
  const vCount = positions.length / 3;
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vCount * 2), 2));
  return geo;
}

/**
 * Applies world-space triplanar/box UV projection so procedural panel seams and carbon weave
 * render at a consistent, distortion-free physical scale across every merged part.
 */
function applyBoxUVs(geo: THREE.BufferGeometry, uvScale: number): void {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!pos || !norm) return;

  const uvArr = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    if (ny >= nx && ny >= nz) {
      uvArr[i * 2] = x * uvScale;
      uvArr[i * 2 + 1] = z * uvScale;
    } else if (nx >= nz) {
      uvArr[i * 2] = z * uvScale;
      uvArr[i * 2 + 1] = y * uvScale;
    } else {
      uvArr[i * 2] = x * uvScale;
      uvArr[i * 2 + 1] = y * uvScale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
}

function makeCenteredExtrude(
  points: [number, number][],
  depth: number,
  bevelThickness = 0.08,
  bevelSize = 0.06,
  bevelSegments = 3
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a single merged 6-blade titanium turbine impeller + center spinner cone for thruster throats.
 */
function createTurbineRotorGeometry(radius: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);

  const hub = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.06, 12).toNonIndexed();
  hub.rotateX(Math.PI / 2);
  parts.push(hub);

  const cone = new THREE.ConeGeometry(radius * 0.21, 0.13, 10).toNonIndexed();
  cone.rotateX(-Math.PI / 2);
  cone.translate(0, 0, -0.075);
  parts.push(cone);

  const bladeTemplate = new THREE.BoxGeometry(radius * 0.56, radius * 0.16, 0.022).toNonIndexed();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const blade = bladeTemplate.clone();
    // Pitch blade around X first, then place radially around Z
    e.set(0.46, 0, 0);
    q.setFromEuler(e);
    p.set(radius * 0.44, 0, 0);
    mat4.compose(p, q, s);
    blade.applyMatrix4(mat4);

    e.set(0, 0, angle);
    q.setFromEuler(e);
    p.set(0, 0, 0);
    mat4.compose(p, q, s);
    blade.applyMatrix4(mat4);
    parts.push(blade);
  }
  bladeTemplate.dispose();

  for (const part of parts) {
    for (const k of Object.keys(part.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') part.deleteAttribute(k);
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  const out = merged ?? new THREE.BoxGeometry(radius, radius, 0.05);
  out.computeVertexNormals();
  applyBoxUVs(out, 0.9);
  return out;
}

/**
 * Builds an 8-petal articulated titanium exhaust vectoring iris collar merged into 1 BufferGeometry.
 */
function createVectorIrisGeometry(radius: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);

  const petalTemplate = new THREE.BoxGeometry(radius * 0.52, 0.042, 0.19).toNonIndexed();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const petal = petalTemplate.clone();
    // Tilt petal inward slightly aft so it forms a tapered jet nozzle collar
    e.set(-0.22, 0, 0);
    q.setFromEuler(e);
    p.set(0, radius * 0.91, 0);
    mat4.compose(p, q, s);
    petal.applyMatrix4(mat4);

    e.set(0, 0, angle);
    q.setFromEuler(e);
    p.set(0, 0, 0);
    mat4.compose(p, q, s);
    petal.applyMatrix4(mat4);
    parts.push(petal);
  }
  petalTemplate.dispose();

  for (const part of parts) {
    for (const k of Object.keys(part.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') part.deleteAttribute(k);
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  const out = merged ?? new THREE.TorusGeometry(radius * 0.9, 0.03, 6, 16);
  out.computeVertexNormals();
  applyBoxUVs(out, 0.9);
  return out;
}

/**
 * Builds one of six distinct composite futuristic anti-grav hypercar silhouettes
 * (Player: 'valkyrie', 'tempest', 'phantom'; Rivals: 'solaris', 'crimson', 'titan')
 * with merged-per-material PBR geometry, procedural panel/carbon micro-detail, layered cockpits,
 * recessed intakes, multi-stage repulsor pods, and dual-core plasma thrusters.
 */
export function createHypercarMesh(
  bodyColor: number,
  secondaryColor: number,
  accentColor: number,
  shadowTexture: THREE.Texture,
  castShadow: boolean,
  chassisStyle: ChassisStyle = 'valkyrie',
  ghostOpacity: number | null = null,
  machineTextures?: MachineSurfaceTextures,
  detailTier: PlayerModelDetail = 'ultra'
): HypercarModel {
  const isGhost = ghostOpacity !== null;
  const gOpacity = ghostOpacity ?? 1;
  const effectiveCastShadow = isGhost ? false : castShadow;
  const isPlayerChassis =
    chassisStyle === 'phantom' || chassisStyle === 'valkyrie' || chassisStyle === 'tempest';
  const isUltraPlayer = !isGhost && detailTier === 'ultra' && isPlayerChassis;

  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  // Hover height above track surface (lowest turbine coil at -0.32 -> +0.48m clear above deck)
  chassisGroup.position.y = 0.8;
  root.add(chassisGroup);

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

  // Distinct PBR materials (or translucent holographic materials when rendered as a ghost)
  const hasHullMaps = !isGhost && Boolean(machineTextures);
  const hullMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 0.72,
          roughness: 0.3,
          metalness: 0.2,
          transparent: true,
          opacity: gOpacity,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: bodyColor,
          metalness: chassisStyle === 'tempest' || chassisStyle === 'crimson' ? 0.7 : 0.86,
          roughness: hasHullMaps
            ? chassisStyle === 'tempest' || chassisStyle === 'crimson'
              ? 0.86
              : 0.7
            : chassisStyle === 'tempest' || chassisStyle === 'crimson'
              ? 0.34
              : 0.18,
          roughnessMap: machineTextures?.hullPanelRoughness ?? null,
          bumpMap: machineTextures?.hullPanelBump ?? null,
          bumpScale: 0.018,
          clearcoat: 1.0,
          clearcoatRoughness: 0.07,
        })
  );

  const secondaryMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: secondaryColor,
          emissive: accentColor,
          emissiveIntensity: 0.45,
          roughness: 0.35,
          metalness: 0.2,
          transparent: true,
          opacity: gOpacity * 0.9,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: secondaryColor,
          metalness: 0.78,
          roughness: hasHullMaps ? 0.76 : 0.26,
          roughnessMap: machineTextures?.hullPanelRoughness ?? null,
          bumpMap: machineTextures?.hullPanelBump ?? null,
          bumpScale: 0.014,
          clearcoat: 0.88,
          clearcoatRoughness: 0.11,
        })
  );

  const carbonMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 0.35,
          metalness: 0.2,
          roughness: 0.5,
          transparent: true,
          opacity: gOpacity * 0.75,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color: machineTextures ? 0xdbeafe : 0x0f172a,
          map: machineTextures?.carbonWeaveAlbedo ?? null,
          bumpMap: machineTextures?.carbonWeaveBump ?? null,
          bumpScale: 0.015,
          metalness: 0.32,
          roughness: 0.52,
        })
  );

  const brushedTitaniumMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 0.45,
          metalness: 0.3,
          roughness: 0.3,
          transparent: true,
          opacity: gOpacity * 0.8,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xaab7c8,
          metalness: 0.92,
          roughness: 0.28,
          bumpMap: machineTextures?.titaniumBrushedBump ?? null,
          bumpScale: 0.01,
          anisotropy: 0.75,
        })
  );

  const cockpitInteriorMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: gOpacity * 0.45,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x060911,
          metalness: 0.2,
          roughness: 0.88,
        })
  );

  const canopyMat = trackMat(
    isGhost
      ? new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: accentColor,
          emissiveIntensity: 0.6,
          roughness: 0.2,
          transparent: true,
          opacity: gOpacity * 0.65,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x07111f,
          metalness: 0.16,
          roughness: 0.04,
          clearcoat: 1.0,
          clearcoatRoughness: 0.03,
          envMapIntensity: 2.0,
          transparent: true,
          opacity: 0.84,
          depthWrite: false,
        })
  );

  const accentGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: isGhost ? 1.4 : 2.3,
      roughness: 0.2,
      metalness: 0.1,
      transparent: isGhost,
      opacity: isGhost ? Math.min(1, gOpacity * 1.45) : 1,
      depthWrite: !isGhost,
    })
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGhost ? accentColor : 0xf0f9ff,
      emissive: isGhost ? accentColor : 0xdbeafe,
      emissiveIntensity: isGhost ? 1.3 : 2.6,
      roughness: 0.15,
      transparent: isGhost,
      opacity: isGhost ? Math.min(1, gOpacity * 1.3) : 1,
      depthWrite: !isGhost,
    })
  );

  const tailLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isGhost ? accentColor : 0xff2a4b,
      emissive: isGhost ? accentColor : 0xff1e42,
      emissiveIntensity: isGhost ? 1.3 : 2.4,
      roughness: 0.2,
      transparent: isGhost,
      opacity: isGhost ? Math.min(1, gOpacity * 1.35) : 1,
      depthWrite: !isGhost,
    })
  );

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: isGhost ? gOpacity * 0.72 : 0.78,
      blending: isGhost ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const coreFlameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: isGhost ? accentColor : 0xf8fafc,
      transparent: true,
      opacity: isGhost ? gOpacity * 0.85 : 0.92,
      blending: isGhost ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  // Geometry buckets merged per material to minimize draw calls while maximizing silhouette detail
  const buckets: Record<BucketKey, THREE.BufferGeometry[]> = {
    hull: [],
    secondary: [],
    carbon: [],
    titanium: [],
    cockpitInterior: [],
    canopy: [],
    accentGlow: [],
    headlight: [],
    tailLight: [],
  };

  const _mat4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _euler = new THREE.Euler();
  const _quat = new THREE.Quaternion();
  const _scale = new THREE.Vector3();

  const defaultUvScale: Record<BucketKey, number> = {
    hull: 0.42,
    secondary: 0.45,
    carbon: 1.85,
    titanium: 0.85,
    cockpitInterior: 0.5,
    canopy: 0.5,
    accentGlow: 0.5,
    headlight: 0.5,
    tailLight: 0.5,
  };

  const addPart = (
    bucket: BucketKey,
    srcGeo: THREE.BufferGeometry,
    px = 0,
    py = 0,
    pz = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    uvMode: 'box' | 'keep' = 'box'
  ) => {
    const g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
    _pos.set(px, py, pz);
    _euler.set(rx, ry, rz);
    _quat.setFromEuler(_euler);
    _scale.set(sx, sy, sz);
    _mat4.compose(_pos, _quat, _scale);
    g.applyMatrix4(_mat4);

    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    for (const attrName of Object.keys(g.attributes)) {
      if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
        g.deleteAttribute(attrName);
      }
    }
    if (!g.attributes.uv || uvMode === 'box') {
      applyBoxUVs(g, defaultUvScale[bucket]);
    }
    buckets[bucket].push(g);
  };

  const thrusterFlames: THREE.Mesh[] = [];
  const animatedBoosters: {
    rotor: THREE.Mesh;
    iris: THREE.Mesh;
    plasmaRing: THREE.Mesh;
    baseRingZ: number;
    phase: number;
    sign: number;
  }[] = [];

  // Shared multi-stage turbine levitation pod geometries (disposed after bucketing)
  const podHousingGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.15),
      new THREE.Vector2(0.28, -0.15),
      new THREE.Vector2(0.39, -0.07),
      new THREE.Vector2(0.45, -0.01),
      new THREE.Vector2(0.45, 0.05),
      new THREE.Vector2(0.39, 0.07),
      new THREE.Vector2(0.41, 0.13),
      new THREE.Vector2(0.33, 0.18),
      new THREE.Vector2(0.2, 0.2),
      new THREE.Vector2(0.0, 0.2),
    ],
    22
  );
  const podStatorRingGeo = new THREE.TorusGeometry(0.34, 0.036, 8, 24);
  podStatorRingGeo.rotateX(Math.PI / 2);
  const podOuterCoilGeo = new THREE.TorusGeometry(0.27, 0.036, 10, 24);
  podOuterCoilGeo.rotateX(Math.PI / 2);
  const podInnerCoreGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 16);

  const addTurbinePod = (px: number, pz: number, py = -0.16, scale = 1.0) => {
    addPart('titanium', podHousingGeo, px, py, pz, 0, 0, 0, scale, scale, scale, 'keep');
    addPart('carbon', podStatorRingGeo, px, py - 0.07 * scale, pz, 0, 0, 0, scale, scale, scale, 'box');
    addPart('accentGlow', podOuterCoilGeo, px, py - 0.12 * scale, pz, 0, 0, 0, scale, scale, scale, 'box');
    addPart('accentGlow', podInnerCoreGeo, px, py - 0.125 * scale, pz, 0, 0, 0, scale, scale, scale, 'box');
  };

  // Ultra Player Cockpit Interior & Mechanical Suspension Wishbones (merged into shared buckets -> 0 extra draw calls)
  const _armStart = new THREE.Vector3();
  const _armEnd = new THREE.Vector3();
  const _armDir = new THREE.Vector3();
  const _armUp = new THREE.Vector3(0, 1, 0);
  const _armQuat = new THREE.Quaternion();
  const _armEuler = new THREE.Euler();

  const addStrutBetween = (
    bucket: BucketKey,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    radius: number
  ) => {
    _armStart.set(x1, y1, z1);
    _armEnd.set(x2, y2, z2);
    _armDir.subVectors(_armEnd, _armStart);
    const len = _armDir.length();
    if (len < 0.02) return;
    _armDir.normalize();
    _armQuat.setFromUnitVectors(_armUp, _armDir);
    _armEuler.setFromQuaternion(_armQuat);
    const strut = new THREE.CylinderGeometry(radius, radius * 1.1, len, 6);
    addPart(
      bucket,
      strut,
      (x1 + x2) * 0.5,
      (y1 + y2) * 0.5,
      (z1 + z2) * 0.5,
      _armEuler.x,
      _armEuler.y,
      _armEuler.z
    );
    strut.dispose();
  };

  const addUltraPodStruts = (
    podX: number,
    podZ: number,
    podY: number,
    hullEdgeX: number,
    hullAttachY: number
  ) => {
    const sign = podX >= 0 ? 1 : -1;
    const innerPodX = podX - sign * 0.18;
    addStrutBetween('titanium', innerPodX, podY + 0.08, podZ + 0.16, hullEdgeX, hullAttachY, podZ + 0.04, 0.032);
    addStrutBetween('titanium', innerPodX, podY + 0.08, podZ - 0.16, hullEdgeX, hullAttachY, podZ - 0.04, 0.032);
    addStrutBetween('carbon', innerPodX, podY + 0.02, podZ, hullEdgeX, hullAttachY - 0.06, podZ, 0.044);
  };

  const addUltraCockpitInterior = (floorY: number, cz: number, widthScale: number) => {
    const backrest = new THREE.BoxGeometry(0.42 * widthScale, 0.26, 0.09);
    addPart('cockpitInterior', backrest, 0, floorY + 0.13, cz - 0.34, -0.24, 0, 0);
    backrest.dispose();

    const headrest = new THREE.BoxGeometry(0.24 * widthScale, 0.13, 0.085);
    addPart('titanium', headrest, 0, floorY + 0.27, cz - 0.4, -0.18, 0, 0);
    headrest.dispose();

    const bolster = new THREE.BoxGeometry(0.08, 0.2, 0.24);
    [-1, 1].forEach((s) =>
      addPart('cockpitInterior', bolster, s * 0.23 * widthScale, floorY + 0.12, cz - 0.24, -0.2, 0, s * -0.12)
    );
    bolster.dispose();

    const yoke = new THREE.BoxGeometry(0.048, 0.11, 0.055);
    [-1, 1].forEach((s) => addPart('carbon', yoke, s * 0.14 * widthScale, floorY + 0.11, cz + 0.34, 0.18, 0, 0));
    yoke.dispose();

    const hudWing = new THREE.BoxGeometry(0.13, 0.022, 0.03);
    [-1, 1].forEach((s) =>
      addPart('accentGlow', hudWing, s * 0.18 * widthScale, floorY + 0.16, cz + 0.56, -0.32, s * -0.24, 0)
    );
    hudWing.dispose();
  };

  // Shared multi-stage afterburner nozzle helper
  const addAfterburner = (
    tx: number,
    ty: number,
    tz: number,
    nozzleRadius: number,
    nozzleLen: number,
    flameRadius: number,
    flameLen: number,
    flameGeo: THREE.BufferGeometry,
    coreFlameGeo: THREE.BufferGeometry
  ) => {
    const outerNozzleGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(nozzleRadius * 0.72, -nozzleLen * 0.5),
        new THREE.Vector2(nozzleRadius * 0.92, -nozzleLen * 0.45),
        new THREE.Vector2(nozzleRadius * 1.04, -nozzleLen * 0.1),
        new THREE.Vector2(nozzleRadius * 0.96, nozzleLen * 0.15),
        new THREE.Vector2(nozzleRadius * 1.02, nozzleLen * 0.35),
        new THREE.Vector2(nozzleRadius * 0.86, nozzleLen * 0.5),
        new THREE.Vector2(nozzleRadius * 0.68, nozzleLen * 0.5),
      ],
      20
    );
    outerNozzleGeo.rotateX(Math.PI / 2);

    const innerLinerGeo = new THREE.CylinderGeometry(nozzleRadius * 0.74, nozzleRadius * 0.66, nozzleLen * 0.88, 16, 1, true);
    innerLinerGeo.rotateX(Math.PI / 2);

    const coreDiskGeo = new THREE.CylinderGeometry(nozzleRadius * 0.56, nozzleRadius * 0.56, 0.06, 16);
    coreDiskGeo.rotateX(Math.PI / 2);

    const petalRingGeo = new THREE.TorusGeometry(nozzleRadius * 0.88, 0.025, 8, 12);

    addPart('titanium', outerNozzleGeo, tx, ty, tz, 0, 0, 0, 1, 1, 1, 'keep');
    addPart('carbon', innerLinerGeo, tx, ty, tz - nozzleLen * 0.05, 0, 0, 0, 1, 1, 1, 'box');
    addPart('carbon', petalRingGeo, tx, ty, tz - nozzleLen * 0.46, 0, 0, 0, 1, 1, 1, 'box');
    addPart('accentGlow', coreDiskGeo, tx, ty, tz - nozzleLen * 0.18, 0, 0, 0, 1, 1, 1, 'box');

    outerNozzleGeo.dispose();
    innerLinerGeo.dispose();
    coreDiskGeo.dispose();
    petalRingGeo.dispose();

    if (isUltraPlayer) {
      // Articulated Rear Boost Mechanism: spinning turbine impeller + breathing vectoring iris + floating plasma ring
      const rotorGeo = trackGeo(createTurbineRotorGeometry(nozzleRadius * 0.72));
      const rotorMesh = new THREE.Mesh(rotorGeo, brushedTitaniumMat);
      rotorMesh.position.set(tx, ty, tz - nozzleLen * 0.25);
      chassisGroup.add(rotorMesh);

      const irisGeo = trackGeo(createVectorIrisGeometry(nozzleRadius * 0.94));
      const irisMesh = new THREE.Mesh(irisGeo, brushedTitaniumMat);
      irisMesh.position.set(tx, ty, tz - nozzleLen * 0.48);
      chassisGroup.add(irisMesh);

      const stabRingGeo = trackGeo(new THREE.TorusGeometry(nozzleRadius * 0.96, 0.022, 8, 24));
      const plasmaRingMesh = new THREE.Mesh(stabRingGeo, accentGlowMat);
      const baseRingZ = tz - nozzleLen * 0.62;
      plasmaRingMesh.position.set(tx, ty, baseRingZ);
      chassisGroup.add(plasmaRingMesh);

      animatedBoosters.push({
        rotor: rotorMesh,
        iris: irisMesh,
        plasmaRing: plasmaRingMesh,
        baseRingZ,
        phase: animatedBoosters.length * 1.45,
        sign: tx < 0 ? -1 : 1,
      });
    }

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(tx, ty, tz - nozzleLen * 0.48);
    const innerCore = new THREE.Mesh(coreFlameGeo, coreFlameMat);
    innerCore.scale.set(0.52 * (flameRadius > 0 ? 1 : 1), 0.52, 0.74 * (flameLen > 0 ? 1 : 1));
    flame.add(innerCore);
    chassisGroup.add(flame);
    thrusterFlames.push(flame);
  };

  if (chassisStyle === 'tempest') {
    // =========================================================================
    // TEMPEST-R: Twin-Prong Needle Spearhead + Razor Delta Wings + Dorsal Fin
    // =========================================================================
    const coreGeo = makeCenteredExtrude(
      [
        [-2.58, -0.14],
        [1.35, -0.14],
        [2.05, 0.03],
        [1.1, 0.31],
        [-0.35, 0.45],
        [-1.35, 0.44],
        [-2.58, 0.22],
      ],
      1.02,
      0.11,
      0.08,
      3
    );
    addPart('hull', coreGeo, 0, 0, 0);
    coreGeo.dispose();

    // Sculpted center needle nose splitter bridge & carbon venturi undertray
    const undertrayGeo = new THREE.BoxGeometry(1.42, 0.12, 4.35);
    addPart('carbon', undertrayGeo, 0, -0.15, -0.32);
    undertrayGeo.dispose();

    const frontSplitterGeo = makeCenteredExtrude(
      [
        [1.15, -0.18],
        [2.48, -0.17],
        [2.58, -0.11],
        [1.25, -0.1],
      ],
      1.26,
      0.02,
      0.02,
      1
    );
    addPart('carbon', frontSplitterGeo, 0, 0, 0);
    frontSplitterGeo.dispose();

    // Central nose aero crest & twin-fang DRL headlights
    const noseCrestGeo = makeCenteredExtrude(
      [
        [0.95, 0.25],
        [2.12, 0.04],
        [1.75, 0.16],
        [0.95, 0.34],
      ],
      0.24,
      0.03,
      0.03,
      2
    );
    addPart('secondary', noseCrestGeo, 0, 0, 0);
    noseCrestGeo.dispose();

    const drlFangGeo = new THREE.BoxGeometry(0.14, 0.045, 0.56);
    [-0.38, 0.38].forEach((dx) => {
      addPart('headlight', drlFangGeo, dx, 0.07, 1.72, 0.14, dx > 0 ? -0.18 : 0.18, 0);
    });
    drlFangGeo.dispose();

    // Sculpted Twin Protruding Spearhead Sponsons + Recessed Ram-Air Intakes
    const prongGeo = makeCenteredExtrude(
      [
        [0.25, -0.14],
        [2.72, -0.09],
        [3.12, -0.01],
        [2.45, 0.11],
        [0.35, 0.17],
      ],
      0.32,
      0.04,
      0.035,
      2
    );
    const prongTipGeo = new THREE.ConeGeometry(0.16, 0.78, 4);
    prongTipGeo.rotateX(Math.PI / 2);
    prongTipGeo.rotateZ(Math.PI / 4);
    const prongRidgeGeo = new THREE.BoxGeometry(0.06, 0.04, 2.38);
    const intakeRecessGeo = new THREE.BoxGeometry(0.24, 0.16, 0.45);
    const intakeVaneGeo = new THREE.BoxGeometry(0.2, 0.025, 0.26);
    const prongFlankCowlGeo = new THREE.BoxGeometry(0.12, 0.14, 1.75);

    [-1, 1].forEach((side) => {
      const px = side * 0.66;
      addPart('secondary', prongGeo, px, 0, 0);
      addPart('hull', prongTipGeo, px, -0.01, 3.16);
      addPart('accentGlow', prongRidgeGeo, px, 0.16, 1.56, -0.03, 0, 0);
      // Recessed dark carbon ram-air throat + titanium vane inside prong root
      addPart('carbon', intakeRecessGeo, side * 0.56, 0.01, 0.55);
      addPart('titanium', intakeVaneGeo, side * 0.56, 0.01, 0.62);
      addPart('carbon', prongFlankCowlGeo, side * 0.85, -0.02, 1.32);
    });
    prongGeo.dispose();
    prongTipGeo.dispose();
    prongRidgeGeo.dispose();
    intakeRecessGeo.dispose();
    intakeVaneGeo.dispose();
    prongFlankCowlGeo.dispose();

    // Swept Razor Delta Wings + Copper Root Fairings + Downward Wingtip Stabilizers
    const wingletGeo = new THREE.BoxGeometry(0.065, 0.36, 0.72);
    const wingEdgeGeo = new THREE.BoxGeometry(1.52, 0.035, 0.085);
    const wingFlapGeo = new THREE.BoxGeometry(1.18, 0.04, 0.22);
    const rootFairingGeo = new THREE.BoxGeometry(0.46, 0.14, 1.68);

    [-1, 1].forEach((side) => {
      const deltaWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.52,
        tipX: 1.98,
        rootZFront: -0.1,
        rootZBack: -2.05,
        tipZFront: -1.38,
        tipZBack: -2.22,
        rootY: 0.07,
        tipY: 0.01,
        rootThick: 0.15,
        tipThick: 0.055,
      });
      addPart('hull', deltaWingGeo);
      deltaWingGeo.dispose();

      // Copper-bronze root fairing & carbon trailing elevon
      addPart('secondary', rootFairingGeo, side * 0.68, 0.09, -1.08, 0, side * -0.12, 0);
      addPart('carbon', wingFlapGeo, side * 1.24, 0.04, -2.04, 0, side * -0.14, 0);
      // Amber leading-edge plasma rail
      addPart('accentGlow', wingEdgeGeo, side * 1.25, 0.055, -0.74, 0, side * -0.71, side * -0.04);
      // Downward-canted wingtip fin
      addPart('carbon', wingletGeo, side * 1.98, -0.08, -1.82, 0.15, 0, side * 0.24);
    });
    wingletGeo.dispose();
    wingEdgeGeo.dispose();
    wingFlapGeo.dispose();
    rootFairingGeo.dispose();

    // Low-Drag Teardrop Cockpit (Interior Tub + Amber HUD Arc + Roll Hoop + Tinted Canopy)
    const tubGeo = new THREE.BoxGeometry(0.68, 0.16, 1.48);
    addPart('cockpitInterior', tubGeo, 0, 0.34, 0.05);
    tubGeo.dispose();

    const rollHoopGeo = new THREE.TorusGeometry(0.28, 0.036, 8, 16, Math.PI);
    addPart('titanium', rollHoopGeo, 0, 0.42, -0.38);
    rollHoopGeo.dispose();

    const hudBarGeo = new THREE.BoxGeometry(0.42, 0.03, 0.04);
    addPart('accentGlow', hudBarGeo, 0, 0.43, 0.62, -0.35, 0, 0);
    hudBarGeo.dispose();

    const canopyGeo = new THREE.CapsuleGeometry(0.4, 1.15, 8, 18);
    canopyGeo.rotateX(Math.PI / 2);
    canopyGeo.scale(1.02, 0.68, 1.0);
    addPart('canopy', canopyGeo, 0, 0.43, 0.08, 0, 0, 0, 1, 1, 1, 'box');
    canopyGeo.dispose();

    const canopyFrameGeo = new THREE.BoxGeometry(0.1, 0.05, 0.92);
    addPart('carbon', canopyFrameGeo, 0, 0.61, -0.22, -0.14, 0, 0);
    canopyFrameGeo.dispose();

    // Tall Dorsal Shark Fin + Turbo Intake Scoop + Carbon Rudder Edge
    const finGeo = makeCenteredExtrude(
      [
        [-2.42, 0.28],
        [-0.45, 0.36],
        [-1.82, 0.98],
        [-2.48, 0.9],
      ],
      0.08,
      0.025,
      0.02,
      2
    );
    addPart('secondary', finGeo);
    finGeo.dispose();

    const finCarbonEdge = makeCenteredExtrude(
      [
        [-2.52, 0.3],
        [-2.35, 0.3],
        [-2.42, 0.91],
        [-2.58, 0.89],
      ],
      0.05,
      0.015,
      0.015,
      1
    );
    addPart('carbon', finCarbonEdge);
    finCarbonEdge.dispose();

    const dorsalSpineGlow = new THREE.BoxGeometry(0.055, 0.045, 1.38);
    addPart('accentGlow', dorsalSpineGlow, 0, 0.69, -1.16, 0.39, 0, 0);
    dorsalSpineGlow.dispose();

    const turboScoopGeo = new THREE.BoxGeometry(0.32, 0.16, 0.56);
    addPart('carbon', turboScoopGeo, 0, 0.53, -0.68);
    turboScoopGeo.dispose();

    // 4 Repulsor Turbine Pods
    [
      [-0.86, 1.45],
      [0.86, 1.45],
      [-1.36, -1.45],
      [1.36, -1.45],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.0));

    // Heavy Rear Diffuser Strakes + Segmented Taillights
    const diffuserDeckGeo = new THREE.BoxGeometry(1.52, 0.08, 0.52);
    addPart('carbon', diffuserDeckGeo, 0, -0.13, -2.48, 0.16, 0, 0);
    diffuserDeckGeo.dispose();
    const strakeGeo = new THREE.BoxGeometry(0.04, 0.18, 0.48);
    [-0.56, -0.2, 0.2, 0.56].forEach((sx) => addPart('carbon', strakeGeo, sx, -0.09, -2.52));
    strakeGeo.dispose();

    const tailBarCenter = new THREE.BoxGeometry(0.36, 0.075, 0.08);
    const tailBladeGeo = new THREE.BoxGeometry(0.58, 0.07, 0.08);
    addPart('tailLight', tailBarCenter, 0, 0.22, -2.63);
    [-0.56, 0.56].forEach((tx) => addPart('tailLight', tailBladeGeo, tx, 0.24, -2.62, 0, 0, tx > 0 ? 0.1 : -0.1));
    tailBarCenter.dispose();
    tailBladeGeo.dispose();

    // Oversized Dual Mega-Afterburners
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.24, 1.55, 16));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.775);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.22, 1.5, 12));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.75);

    [-0.46, 0.46].forEach((tx) => addAfterburner(tx, 0.06, -2.58, 0.3, 0.48, 0.24, 1.55, flameGeo, coreFlameGeo));

    if (isUltraPlayer) {
      addUltraCockpitInterior(0.32, 0.05, 0.92);
      [
        [-0.86, 1.45, -0.42],
        [0.86, 1.45, 0.42],
        [-1.36, -1.45, -0.52],
        [1.36, -1.45, 0.52],
      ].forEach(([px, pz, edgeX]) => addUltraPodStruts(px, pz, -0.16, edgeX, -0.1));

      // Nose telemetry pitot mast & cheek cooling louvers
      const pitotGeo = new THREE.CylinderGeometry(0.015, 0.032, 0.42, 8);
      pitotGeo.rotateX(Math.PI / 2);
      addPart('titanium', pitotGeo, 0, 0.08, 2.22);
      pitotGeo.dispose();

      const prongCollarGeo = new THREE.BoxGeometry(0.36, 0.09, 0.12);
      const prongFlickGeo = new THREE.BoxGeometry(0.24, 0.03, 0.34);
      const noseLouverGeo = new THREE.BoxGeometry(0.2, 0.035, 0.09);
      [-1, 1].forEach((side) => {
        addPart('titanium', prongCollarGeo, side * 0.66, 0.01, 2.74);
        addPart('carbon', prongFlickGeo, side * 0.46, -0.02, 2.28, 0.12, side * 0.22, 0);
        [1.32, 1.46].forEach((lz) =>
          addPart('titanium', noseLouverGeo, side * 0.4, 0.18, lz, -0.22, side * -0.18, 0)
        );
      });
      prongCollarGeo.dispose();
      prongFlickGeo.dispose();
      noseLouverGeo.dispose();

      // Canopy structural rib & delta-wing boundary-layer aero fences
      const canopyPillarGeo = new THREE.BoxGeometry(0.055, 0.05, 0.72);
      addPart('titanium', canopyPillarGeo, 0, 0.56, 0.42, 0.28, 0, 0);
      canopyPillarGeo.dispose();

      const wingFenceGeo = new THREE.BoxGeometry(0.04, 0.14, 0.64);
      const wingRootCuffGeo = new THREE.BoxGeometry(0.08, 0.09, 0.96);
      [-1, 1].forEach((side) => {
        addPart('carbon', wingFenceGeo, side * 1.24, 0.1, -1.36, 0, side * -0.18, 0);
        addPart('titanium', wingRootCuffGeo, side * 0.78, 0.09, -0.45, 0, side * -0.58, 0);
      });
      wingFenceGeo.dispose();
      wingRootCuffGeo.dispose();

      // Dorsal spine cooling ribs + exposed twin titanium turbocharger plenum tubes
      const gillRibGeo = new THREE.BoxGeometry(0.04, 0.11, 0.16);
      [-1, 1].forEach((side) => {
        [-1.32, -1.56, -1.8, -2.04].forEach((gz) =>
          addPart('titanium', gillRibGeo, side * 0.1, 0.46, gz, 0.2, 0, side * -0.28)
        );
      });
      gillRibGeo.dispose();

      const plenumTubeGeo = new THREE.CylinderGeometry(0.065, 0.075, 1.35, 10);
      plenumTubeGeo.rotateX(Math.PI / 2);
      [-0.25, 0.25].forEach((px) => addPart('titanium', plenumTubeGeo, px, 0.34, -1.78, -0.1, 0, 0));
      plenumTubeGeo.dispose();

      // Rear afterburner upper heat-shield cowl, extra diffuser strakes & F1 brake beacon
      const rearCowlGeo = new THREE.BoxGeometry(1.36, 0.09, 0.38);
      addPart('carbon', rearCowlGeo, 0, 0.29, -2.42, -0.12, 0, 0);
      rearCowlGeo.dispose();
      const extraStrakeGeo = new THREE.BoxGeometry(0.04, 0.18, 0.48);
      [-0.38, 0.38].forEach((sx) => addPart('titanium', extraStrakeGeo, sx, -0.09, -2.52));
      extraStrakeGeo.dispose();
      const centerBrakeGeo = new THREE.BoxGeometry(0.14, 0.12, 0.07);
      addPart('tailLight', centerBrakeGeo, 0, 0.03, -2.62);
      centerBrakeGeo.dispose();
    }
  } else if (chassisStyle === 'phantom') {
    // =========================================================================
    // PHANTOM-V: Stealth Forward-Swept Fighter + Sensor Pod + Triple Vectoring
    // =========================================================================
    const hullGeo = makeCenteredExtrude(
      [
        [-2.14, -0.14],
        [1.45, -0.14],
        [2.26, 0.06],
        [1.22, 0.34],
        [-0.32, 0.48],
        [-2.14, 0.28],
      ],
      1.32,
      0.12,
      0.08,
      3
    );
    addPart('hull', hullGeo);
    hullGeo.dispose();

    // Front Carbon Chin Splitter & Nose Stealth Spine
    const chinGeo = makeCenteredExtrude(
      [
        [1.1, -0.18],
        [2.32, -0.15],
        [2.36, -0.09],
        [1.1, -0.11],
      ],
      1.38,
      0.025,
      0.02,
      2
    );
    addPart('carbon', chinGeo);
    chinGeo.dispose();

    const undertrayGeo = new THREE.BoxGeometry(1.64, 0.11, 3.85);
    addPart('carbon', undertrayGeo, 0, -0.15, -0.15);
    undertrayGeo.dispose();

    // Nose Ice-White Cheek DRL Blades + Center Vent Glow
    const noseDrlGeo = new THREE.BoxGeometry(0.36, 0.045, 0.14);
    [-0.46, 0.46].forEach((dx) => {
      addPart('headlight', noseDrlGeo, dx, 0.1, 2.02, 0.12, dx > 0 ? -0.34 : 0.34, dx > 0 ? -0.1 : 0.1);
    });
    noseDrlGeo.dispose();
    const noseCoreSlit = new THREE.BoxGeometry(0.42, 0.04, 0.08);
    addPart('accentGlow', noseCoreSlit, 0, 0.01, 2.26);
    noseCoreSlit.dispose();

    // Sculpted Pearl-White Armored Shoulder Cowls + Recessed Side Intake Ducts
    const cowlGeo = makeCenteredExtrude(
      [
        [-1.55, 0.08],
        [0.95, 0.1],
        [1.18, 0.22],
        [0.65, 0.35],
        [-1.45, 0.33],
      ],
      0.38,
      0.04,
      0.03,
      2
    );
    const intakeThroatGeo = new THREE.BoxGeometry(0.28, 0.16, 0.38);
    const intakeSplitterGeo = new THREE.BoxGeometry(0.24, 0.025, 0.28);
    const sideCoolingGlow = new THREE.BoxGeometry(0.05, 0.04, 1.35);

    [-0.79, 0.79].forEach((cx) => {
      addPart('secondary', cowlGeo, cx, 0, 0);
      addPart('carbon', intakeThroatGeo, cx, 0.21, 1.05);
      addPart('titanium', intakeSplitterGeo, cx, 0.21, 1.08);
      addPart('accentGlow', sideCoolingGlow, cx + (cx > 0 ? 0.19 : -0.19), 0.22, -0.2);
    });
    cowlGeo.dispose();
    intakeThroatGeo.dispose();
    intakeSplitterGeo.dispose();
    sideCoolingGlow.dispose();

    // Faceted Stealth Cockpit (Interior Tub + Cyan Holo HUD + Roll Hoop + Beveled Glass Prism)
    const tubGeo = new THREE.BoxGeometry(0.76, 0.16, 1.52);
    addPart('cockpitInterior', tubGeo, 0, 0.36, 0.12);
    tubGeo.dispose();

    const rollArchGeo = new THREE.TorusGeometry(0.32, 0.038, 8, 16, Math.PI);
    addPart('titanium', rollArchGeo, 0, 0.44, -0.35);
    rollArchGeo.dispose();

    const hudArcGeo = new THREE.BoxGeometry(0.48, 0.032, 0.045);
    addPart('accentGlow', hudArcGeo, 0, 0.46, 0.72, -0.32, 0, 0);
    hudArcGeo.dispose();

    const stealthCanopyGeo = makeCenteredExtrude(
      [
        [-0.78, 0.32],
        [1.06, 0.32],
        [0.52, 0.64],
        [-0.36, 0.68],
      ],
      0.78,
      0.07,
      0.06,
      2
    );
    addPart('canopy', stealthCanopyGeo, 0, 0, 0.04);
    stealthCanopyGeo.dispose();

    // Armored Canopy Spine Frame & Cheek Struts
    const canopyRibGeo = new THREE.BoxGeometry(0.11, 0.055, 0.98);
    addPart('secondary', canopyRibGeo, 0, 0.69, -0.18, -0.06, 0, 0);
    canopyRibGeo.dispose();

    // Multi-Tiered Dorsal Tactical Sensor & Item-Launcher Module
    const podBaseGeo = makeCenteredExtrude(
      [
        [-1.65, 0.44],
        [-0.55, 0.46],
        [-0.72, 0.68],
        [-1.52, 0.68],
      ],
      0.56,
      0.04,
      0.03,
      2
    );
    addPart('carbon', podBaseGeo);
    podBaseGeo.dispose();

    const sensorRingGeo = new THREE.TorusGeometry(0.17, 0.038, 10, 20);
    addPart('accentGlow', sensorRingGeo, 0, 0.66, -0.58);
    sensorRingGeo.dispose();
    const sensorOpticGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.06, 16);
    sensorOpticGeo.rotateX(Math.PI / 2);
    addPart('headlight', sensorOpticGeo, 0, 0.66, -0.59);
    sensorOpticGeo.dispose();

    const microFinGeo = new THREE.BoxGeometry(0.04, 0.18, 0.46);
    [-0.24, 0.24].forEach((mx) => addPart('titanium', microFinGeo, mx, 0.72, -1.16, 0, 0, mx > 0 ? -0.25 : 0.25));
    microFinGeo.dispose();

    // Forward-Swept Stealth Airfoil Wings + Wingtip ECM/Stabilizer Pods
    const tipPodBodyGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0, -0.78),
        new THREE.Vector2(0.07, -0.72),
        new THREE.Vector2(0.11, -0.35),
        new THREE.Vector2(0.115, 0.38),
        new THREE.Vector2(0.08, 0.68),
        new THREE.Vector2(0.0, 0.84),
      ],
      14
    );
    tipPodBodyGeo.rotateX(Math.PI / 2);
    const tipPodRingGeo = new THREE.TorusGeometry(0.115, 0.022, 8, 16);
    const wingLeadRailGeo = new THREE.BoxGeometry(1.26, 0.035, 0.075);
    const wingAftFlapGeo = new THREE.BoxGeometry(1.1, 0.035, 0.18);
    const tipFinGeo = new THREE.BoxGeometry(0.045, 0.24, 0.56);

    [-1, 1].forEach((side) => {
      const fWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.72,
        tipX: 1.88,
        rootZFront: 0.24,
        rootZBack: -0.64,
        tipZFront: 0.88,
        tipZBack: 0.12,
        rootY: 0.09,
        tipY: 0.14,
        rootThick: 0.13,
        tipThick: 0.065,
      });
      addPart('secondary', fWingGeo);
      fWingGeo.dispose();

      addPart('accentGlow', wingLeadRailGeo, side * 1.3, 0.12, 0.56, 0, side * 0.49, side * 0.04);
      addPart('carbon', wingAftFlapGeo, side * 1.28, 0.09, -0.26, 0, side * 0.56, side * 0.04);

      // Sleek tapered wingtip ECM pod + cyan glow ring + outward carbon winglet
      addPart('hull', tipPodBodyGeo, side * 1.9, 0.14, 0.52, 0, 0, 0, 1, 1, 1, 'keep');
      addPart('accentGlow', tipPodRingGeo, side * 1.9, 0.14, 1.06);
      addPart('carbon', tipFinGeo, side * 1.96, 0.24, 0.28, -0.15, 0, side * -0.28);
    });
    tipPodBodyGeo.dispose();
    tipPodRingGeo.dispose();
    wingLeadRailGeo.dispose();
    wingAftFlapGeo.dispose();
    tipFinGeo.dispose();

    // Swept Canted V-Tail Twin Stabilizers
    const vTailBodyGeo = makeCenteredExtrude(
      [
        [-2.22, 0.0],
        [-1.36, 0.0],
        [-1.92, 0.78],
        [-2.34, 0.74],
      ],
      0.085,
      0.02,
      0.02,
      2
    );
    const vTailTrimGeo = new THREE.BoxGeometry(0.04, 0.66, 0.06);
    [-1, 1].forEach((side) => {
      addPart('hull', vTailBodyGeo, side * 0.72, 0.24, 0, 0, 0, side * -0.46);
      addPart('accentGlow', vTailTrimGeo, side * 0.9, 0.58, -1.78, -0.48, 0, side * -0.46);
    });
    vTailBodyGeo.dispose();
    vTailTrimGeo.dispose();

    // 4 Repulsor Turbine Pods
    [
      [-1.38, 0.75],
      [1.38, 0.75],
      [-1.08, -1.4],
      [1.08, -1.4],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.0));

    // Carbon Rear Diffuser + Segmented Taillights
    const diffuserPlateGeo = new THREE.BoxGeometry(1.48, 0.08, 0.45);
    addPart('carbon', diffuserPlateGeo, 0, -0.13, -2.06, 0.16, 0, 0);
    diffuserPlateGeo.dispose();
    const diffStrakeGeo = new THREE.BoxGeometry(0.04, 0.16, 0.42);
    [-0.5, -0.18, 0.18, 0.5].forEach((sx) => addPart('carbon', diffStrakeGeo, sx, -0.09, -2.1));
    diffStrakeGeo.dispose();

    const tailBarGeo = new THREE.BoxGeometry(0.56, 0.065, 0.075);
    [-0.48, 0.48].forEach((tx) => addPart('tailLight', tailBarGeo, tx, 0.26, -2.19, 0, 0, tx > 0 ? -0.08 : 0.08));
    tailBarGeo.dispose();
    const centerBeaconGeo = new THREE.BoxGeometry(0.14, 0.08, 0.08);
    addPart('tailLight', centerBeaconGeo, 0, 0.29, -2.2);
    centerBeaconGeo.dispose();

    // Triple-Nozzle Vectoring Array
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.15, 1.15, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.575);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.14, 1.1, 10));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.55);

    [-0.5, 0, 0.5].forEach((tx, idx) => {
      const ty = idx === 1 ? 0.15 : 0.04;
      addAfterburner(tx, ty, -2.18, 0.19, 0.36, 0.15, 1.15, flameGeo, coreFlameGeo);
    });

    if (isUltraPlayer) {
      addUltraCockpitInterior(0.34, 0.12, 1.0);
      [
        [-1.38, 0.75, -0.66],
        [1.38, 0.75, 0.66],
        [-1.08, -1.4, -0.62],
        [1.08, -1.4, 0.62],
      ].forEach(([px, pz, edgeX]) => addUltraPodStruts(px, pz, -0.16, edgeX, -0.1));

      // Forward stealth canard flicks & chin sensor blister
      const chinSensorGeo = new THREE.BoxGeometry(0.28, 0.06, 0.36);
      addPart('titanium', chinSensorGeo, 0, -0.11, 2.02);
      chinSensorGeo.dispose();

      const frontCanardFlick = new THREE.BoxGeometry(0.26, 0.032, 0.32);
      const shoulderLouverGeo = new THREE.BoxGeometry(0.24, 0.035, 0.08);
      const sideVentSlit = new THREE.BoxGeometry(0.055, 0.035, 0.22);
      [-1, 1].forEach((side) => {
        addPart('titanium', frontCanardFlick, side * 0.72, -0.02, 1.88, 0.08, side * -0.35, 0);
        [0.64, 0.78].forEach((lz) =>
          addPart('titanium', shoulderLouverGeo, side * 0.79, 0.28, lz, -0.18, 0, 0)
        );
        [0.14, 0.42].forEach((vz) =>
          addPart('accentGlow', sideVentSlit, side * 0.99, 0.16, vz, 0.18, 0, 0)
        );
      });
      frontCanardFlick.dispose();
      shoulderLouverGeo.dispose();
      sideVentSlit.dispose();

      // Canopy twin diagonal A-pillar struts
      const aPillarGeo = new THREE.BoxGeometry(0.055, 0.05, 0.82);
      [-0.36, 0.36].forEach((px) =>
        addPart('titanium', aPillarGeo, px, 0.52, 0.48, 0.34, px > 0 ? -0.16 : 0.16, 0)
      );
      aPillarGeo.dispose();

      // Enhanced tactical dorsal sensor turret cheeks + laser designator visor + rear deck louvers
      const turretCheekGeo = new THREE.BoxGeometry(0.14, 0.18, 0.78);
      [-0.27, 0.27].forEach((tx) => addPart('titanium', turretCheekGeo, tx, 0.61, -0.82));
      turretCheekGeo.dispose();
      const visorBarGeo = new THREE.BoxGeometry(0.38, 0.032, 0.07);
      addPart('accentGlow', visorBarGeo, 0, 0.7, -0.62);
      visorBarGeo.dispose();

      const deckLouverGeo = new THREE.BoxGeometry(0.56, 0.032, 0.08);
      [-1.34, -1.5, -1.66, -1.82].forEach((lz) =>
        addPart('titanium', deckLouverGeo, 0, 0.42, lz, 0.16, 0, 0)
      );
      deckLouverGeo.dispose();

      // Forward-swept wing root vortex strakes & ECM wingtip pitot needles
      const rootStrakeGeo = new THREE.BoxGeometry(0.05, 0.13, 0.54);
      const tipNeedleGeo = new THREE.CylinderGeometry(0.012, 0.025, 0.36, 8);
      tipNeedleGeo.rotateX(Math.PI / 2);
      [-1, 1].forEach((side) => {
        addPart('carbon', rootStrakeGeo, side * 0.9, 0.14, 0.12, 0, side * 0.45, 0);
        addPart('titanium', tipNeedleGeo, side * 1.9, 0.14, 1.44);
      });
      rootStrakeGeo.dispose();
      tipNeedleGeo.dispose();

      // Triple-nozzle titanium rear heat-shield bridge, vertical brake fangs & outer diffuser fins
      const heatBridgeGeo = new THREE.BoxGeometry(1.24, 0.085, 0.34);
      addPart('titanium', heatBridgeGeo, 0, 0.32, -2.06);
      heatBridgeGeo.dispose();
      const tailFangGeo = new THREE.BoxGeometry(0.06, 0.2, 0.075);
      [-0.72, 0.72].forEach((tx) => addPart('tailLight', tailFangGeo, tx, 0.14, -2.18));
      tailFangGeo.dispose();
      const outerDiffFinGeo = new THREE.BoxGeometry(0.045, 0.18, 0.42);
      [-0.72, 0.72].forEach((sx) => addPart('titanium', outerDiffFinGeo, sx, -0.09, -2.1));
      outerDiffFinGeo.dispose();
    }
  } else if (chassisStyle === 'valkyrie') {
    // =========================================================================
    // VALKYRIE-X: Pearl Titanium + Deep Cobalt GT Flagship Wedge + Swan-Neck Wing
    // =========================================================================
    const hullGeo = makeCenteredExtrude(
      [
        [-2.38, -0.14],
        [1.76, -0.14],
        [2.52, 0.04],
        [1.42, 0.27],
        [0.36, 0.42],
        [-1.16, 0.45],
        [-2.38, 0.24],
      ],
      1.52,
      0.12,
      0.085,
      3
    );
    addPart('hull', hullGeo);
    hullGeo.dispose();

    // Full-Length Carbon Venturi Undertray & Stepped Front Aero Splitter
    const undertrayGeo = new THREE.BoxGeometry(1.94, 0.11, 4.46);
    addPart('carbon', undertrayGeo, 0, -0.155, -0.05);
    undertrayGeo.dispose();

    const frontSplitterGeo = makeCenteredExtrude(
      [
        [1.45, -0.18],
        [2.64, -0.16],
        [2.68, -0.1],
        [1.45, -0.11],
      ],
      1.78,
      0.02,
      0.02,
      1
    );
    addPart('carbon', frontSplitterGeo);
    frontSplitterGeo.dispose();

    // Sculpted Front Fender Arches & Recessed Nose Radiator Ducts + Sharp DRL Headlights
    const noseDuctGeo = new THREE.BoxGeometry(0.38, 0.1, 0.36);
    const drlBladeGeo = new THREE.BoxGeometry(0.42, 0.04, 0.12);
    [-0.52, 0.52].forEach((nx) => {
      addPart('carbon', noseDuctGeo, nx, 0.03, 2.28);
      addPart('headlight', drlBladeGeo, nx, 0.11, 2.24, 0.16, nx > 0 ? -0.28 : 0.28, nx > 0 ? -0.08 : 0.08);
    });
    noseDuctGeo.dispose();
    drlBladeGeo.dispose();

    const noseBridgeGlow = new THREE.BoxGeometry(0.54, 0.035, 0.08);
    addPart('accentGlow', noseBridgeGlow, 0, 0.06, 2.52);
    noseBridgeGlow.dispose();

    // Cobalt Racing Sidepods + Recessed Side Intake Throats & Titanium Aero Vanes
    const sidepodGeo = makeCenteredExtrude(
      [
        [-1.85, -0.04],
        [0.95, -0.04],
        [1.15, 0.08],
        [0.85, 0.24],
        [-1.72, 0.24],
      ],
      0.34,
      0.045,
      0.035,
      2
    );
    const sideIntakeThroat = new THREE.BoxGeometry(0.24, 0.18, 0.36);
    const sideIntakeVane = new THREE.BoxGeometry(0.22, 0.025, 0.26);
    const sideSkirtTrim = new THREE.BoxGeometry(0.06, 0.035, 2.15);

    [-0.9, 0.9].forEach((sx) => {
      addPart('secondary', sidepodGeo, sx, 0.04, 0);
      addPart('carbon', sideIntakeThroat, sx + (sx > 0 ? 0.03 : -0.03), 0.12, 0.92);
      addPart('titanium', sideIntakeVane, sx + (sx > 0 ? 0.03 : -0.03), 0.12, 0.96);
      addPart('accentGlow', sideSkirtTrim, sx + (sx > 0 ? 0.16 : -0.16), -0.08, -0.25);
    });
    sidepodGeo.dispose();
    sideIntakeThroat.dispose();
    sideIntakeVane.dispose();
    sideSkirtTrim.dispose();

    // Smoked GT Bubble Canopy + Cockpit Interior Tub + Roof Intake Snorkel
    const tubGeo = new THREE.BoxGeometry(0.76, 0.15, 1.54);
    addPart('cockpitInterior', tubGeo, 0, 0.35, -0.02);
    tubGeo.dispose();

    const rollCageGeo = new THREE.TorusGeometry(0.3, 0.036, 8, 16, Math.PI);
    addPart('titanium', rollCageGeo, 0, 0.43, -0.44);
    rollCageGeo.dispose();

    const hudDashGeo = new THREE.BoxGeometry(0.46, 0.03, 0.045);
    addPart('accentGlow', hudDashGeo, 0, 0.44, 0.62, -0.3, 0, 0);
    hudDashGeo.dispose();

    const canopyGeo = makeCenteredExtrude(
      [
        [-1.12, 0.0],
        [1.06, 0.0],
        [0.48, 0.35],
        [-0.56, 0.37],
      ],
      0.86,
      0.08,
      0.06,
      3
    );
    addPart('canopy', canopyGeo, 0, 0.36, -0.04);
    canopyGeo.dispose();

    const roofScoopGeo = makeCenteredExtrude(
      [
        [-1.35, 0.42],
        [-0.22, 0.68],
        [-0.45, 0.78],
        [-1.38, 0.56],
      ],
      0.22,
      0.03,
      0.025,
      2
    );
    addPart('secondary', roofScoopGeo);
    roofScoopGeo.dispose();

    // Swept Front Canards + Upturned Endplates + Cyan Edge Blades
    const canardEndplateGeo = new THREE.BoxGeometry(0.045, 0.18, 0.52);
    const canardGlowGeo = new THREE.BoxGeometry(0.7, 0.032, 0.075);
    [-1, 1].forEach((side) => {
      const canardWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.76,
        tipX: 1.44,
        rootZFront: 1.98,
        rootZBack: 1.24,
        tipZFront: 1.66,
        tipZBack: 1.12,
        rootY: -0.02,
        tipY: 0.03,
        rootThick: 0.08,
        tipThick: 0.045,
      });
      addPart('secondary', canardWingGeo);
      canardWingGeo.dispose();

      addPart('carbon', canardEndplateGeo, side * 1.45, 0.05, 1.39);
      addPart('accentGlow', canardGlowGeo, side * 1.1, 0.015, 1.84, 0, side * -0.44, side * 0.06);
    });
    canardEndplateGeo.dispose();
    canardGlowGeo.dispose();

    // 4 Repulsor Turbine Pods
    [
      [-1.08, 1.25],
      [1.08, 1.25],
      [-1.16, -1.35],
      [1.16, -1.35],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.0));

    // Swan-Neck Split GT Rear Wing + Sculpted Endplates + Dorsal Spine Fin
    const swanPylonGeo = makeCenteredExtrude(
      [
        [-2.06, 0.28],
        [-1.56, 0.28],
        [-1.82, 0.92],
        [-2.24, 0.92],
      ],
      0.07,
      0.015,
      0.015,
      1
    );
    const wingEndplateGeo = makeCenteredExtrude(
      [
        [-2.38, 0.52],
        [-1.78, 0.6],
        [-1.88, 1.02],
        [-2.42, 0.98],
      ],
      0.055,
      0.015,
      0.015,
      1
    );
    const endplateGlowGeo = new THREE.BoxGeometry(0.035, 0.04, 0.46);

    [-1, 1].forEach((side) => {
      addPart('secondary', swanPylonGeo, side * 0.62, 0, 0);
      addPart('secondary', wingEndplateGeo, side * 1.18, 0, 0);
      addPart('accentGlow', endplateGlowGeo, side * 1.21, 0.88, -2.14, 0.08, 0, 0);
    });
    swanPylonGeo.dispose();
    wingEndplateGeo.dispose();
    endplateGlowGeo.dispose();

    // Dual-element carbon rear GT airfoil (mainplane + upper DRS flap)
    [-1, 1].forEach((side) => {
      const mainWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.0,
        tipX: 1.17,
        rootZFront: -1.82,
        rootZBack: -2.26,
        tipZFront: -1.88,
        tipZBack: -2.28,
        rootY: 0.82,
        tipY: 0.84,
        rootThick: 0.095,
        tipThick: 0.075,
      });
      addPart('carbon', mainWingGeo);
      mainWingGeo.dispose();
    });

    const drsFlapGeo = new THREE.BoxGeometry(2.3, 0.045, 0.16);
    addPart('carbon', drsFlapGeo, 0, 0.92, -2.28, 0.24, 0, 0);
    drsFlapGeo.dispose();

    const wingTrim = new THREE.BoxGeometry(2.36, 0.032, 0.065);
    addPart('accentGlow', wingTrim, 0, 0.84, -2.31);
    wingTrim.dispose();

    // Dorsal Spine & Vent Fin
    const dorsalFinGeo = makeCenteredExtrude(
      [
        [-2.18, 0.34],
        [-0.85, 0.44],
        [-1.92, 0.62],
        [-2.22, 0.56],
      ],
      0.06,
      0.015,
      0.015,
      1
    );
    addPart('secondary', dorsalFinGeo);
    dorsalFinGeo.dispose();
    const spineGlow = new THREE.BoxGeometry(0.07, 0.045, 1.25);
    addPart('accentGlow', spineGlow, 0, 0.55, -1.48, 0.13, 0, 0);
    spineGlow.dispose();

    // Carbon Rear Diffuser + Cybernetic Tailbar + F1 Center Rain Light
    const diffuserGeo = new THREE.BoxGeometry(1.66, 0.08, 0.48);
    addPart('carbon', diffuserGeo, 0, -0.125, -2.26, 0.16, 0, 0);
    diffuserGeo.dispose();
    const diffStrakeGeo = new THREE.BoxGeometry(0.04, 0.18, 0.44);
    [-0.64, -0.24, 0.24, 0.64].forEach((sx) => addPart('carbon', diffStrakeGeo, sx, -0.09, -2.29));
    diffStrakeGeo.dispose();

    const tailBar = new THREE.BoxGeometry(1.56, 0.068, 0.075);
    addPart('tailLight', tailBar, 0, 0.2, -2.44);
    tailBar.dispose();
    const f1RainLight = new THREE.BoxGeometry(0.12, 0.11, 0.07);
    addPart('tailLight', f1RainLight, 0, 0.02, -2.45);
    f1RainLight.dispose();

    // Twin Wide Afterburners
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.17, 1.25, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.625);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.16, 1.2, 10));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.6);

    [-0.44, 0.44].forEach((tx) => addAfterburner(tx, 0.06, -2.38, 0.23, 0.38, 0.17, 1.25, flameGeo, coreFlameGeo));

    if (isUltraPlayer) {
      addUltraCockpitInterior(0.33, -0.02, 1.0);
      [
        [-1.08, 1.25, -0.68],
        [1.08, 1.25, 0.68],
        [-1.16, -1.35, -0.7],
        [1.16, -1.35, 0.7],
      ].forEach(([px, pz, edgeX]) => addUltraPodStruts(px, pz, -0.16, edgeX, -0.1));

      // Front splitter titanium tie-rods & hood NACA intake recess
      const tieRodGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6);
      [-0.36, 0.36].forEach((tx) => addPart('titanium', tieRodGeo, tx, -0.04, 2.48, -0.35, 0, 0));
      tieRodGeo.dispose();
      const hoodNacaGeo = new THREE.BoxGeometry(0.46, 0.04, 0.44);
      addPart('carbon', hoodNacaGeo, 0, 0.24, 1.56, 0.14, 0, 0);
      hoodNacaGeo.dispose();

      // Twin-tier front canard dive planes, fender extractor louvers & sidepod aero bargeboards
      const divePlaneGeo = new THREE.BoxGeometry(0.42, 0.028, 0.26);
      const fenderGillGeo = new THREE.BoxGeometry(0.24, 0.032, 0.075);
      const bargeboardGeo = new THREE.BoxGeometry(0.045, 0.22, 0.68);
      const sideExhaustSlit = new THREE.BoxGeometry(0.055, 0.04, 0.28);
      [-1, 1].forEach((side) => {
        addPart('carbon', divePlaneGeo, side * 1.24, 0.09, 1.48, 0.12, side * -0.25, side * 0.08);
        [0.54, 0.68, 0.82].forEach((lz) =>
          addPart('titanium', fenderGillGeo, side * 0.88, 0.24, lz, -0.12, 0, 0)
        );
        addPart('carbon', bargeboardGeo, side * 1.11, 0.01, 0.56, 0, side * 0.08, 0);
        addPart('accentGlow', sideExhaustSlit, side * 1.07, 0.11, -0.92);
      });
      divePlaneGeo.dispose();
      fenderGillGeo.dispose();
      bargeboardGeo.dispose();
      sideExhaustSlit.dispose();

      // Canopy A-pillar frames & roof scoop intake collar
      const vPillarGeo = new THREE.BoxGeometry(0.055, 0.05, 0.82);
      [-0.38, 0.38].forEach((px) =>
        addPart('titanium', vPillarGeo, px, 0.53, 0.46, 0.3, px > 0 ? -0.15 : 0.15, 0)
      );
      vPillarGeo.dispose();
      const scoopLipGeo = new THREE.BoxGeometry(0.26, 0.12, 0.08);
      addPart('titanium', scoopLipGeo, 0, 0.72, -0.25);
      scoopLipGeo.dispose();

      // Rear engine bay louver deck + exposed rear suspension pushrods
      const engineBayGeo = new THREE.BoxGeometry(0.66, 0.045, 0.78);
      addPart('carbon', engineBayGeo, 0, 0.37, -1.62, 0.14, 0, 0);
      engineBayGeo.dispose();
      const bayLouverGeo = new THREE.BoxGeometry(0.58, 0.03, 0.07);
      [-1.36, -1.5, -1.64, -1.78, -1.92].forEach((lz) =>
        addPart('titanium', bayLouverGeo, 0, 0.4 + (-1.36 - lz) * -0.12, lz, 0.24, 0, 0)
      );
      bayLouverGeo.dispose();

      const pushrodGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8);
      [-1, 1].forEach((side) =>
        addPart('titanium', pushrodGeo, side * 0.48, 0.29, -1.86, 0.25, 0, side * 0.52)
      );
      pushrodGeo.dispose();

      // Swan-neck machined titanium clevis brackets, center DRS actuator pod & rear nozzle shroud
      const clevisGeo = new THREE.BoxGeometry(0.11, 0.09, 0.36);
      [-0.62, 0.62].forEach((cx) => addPart('titanium', clevisGeo, cx, 0.89, -2.02));
      clevisGeo.dispose();
      const drsPodGeo = new THREE.BoxGeometry(0.16, 0.1, 0.28);
      addPart('titanium', drsPodGeo, 0, 0.88, -2.14);
      drsPodGeo.dispose();
      const drsPodGlow = new THREE.BoxGeometry(0.1, 0.04, 0.06);
      addPart('accentGlow', drsPodGlow, 0, 0.88, -2.29);
      drsPodGlow.dispose();

      const tailBezelGeo = new THREE.TorusGeometry(0.15, 0.026, 8, 18);
      [-0.62, 0.62].forEach((tx) => addPart('titanium', tailBezelGeo, tx, 0.2, -2.44));
      tailBezelGeo.dispose();
    }
  } else if (chassisStyle === 'solaris') {
    // =========================================================================
    // SOLARIS-7 (Ace Rival): Catamaran Solar Spear + Gull Wings + Halo Arch
    // =========================================================================
    // Central high-speed needle spine fuselage
    const centerHullGeo = makeCenteredExtrude(
      [
        [-2.48, -0.13],
        [1.92, -0.13],
        [2.78, 0.04],
        [1.52, 0.27],
        [0.18, 0.42],
        [-1.42, 0.43],
        [-2.48, 0.24],
      ],
      0.78,
      0.1,
      0.07,
      3
    );
    addPart('hull', centerHullGeo);
    centerHullGeo.dispose();

    // Solar-gold forward spear tip & dorsal solar collector spine
    const goldSpearGeo = makeCenteredExtrude(
      [
        [1.45, 0.0],
        [2.96, 0.01],
        [2.45, 0.15],
        [1.35, 0.25],
      ],
      0.26,
      0.03,
      0.025,
      2
    );
    addPart('secondary', goldSpearGeo);
    goldSpearGeo.dispose();

    const undertrayGeo = new THREE.BoxGeometry(1.78, 0.1, 4.35);
    addPart('carbon', undertrayGeo, 0, -0.15, -0.08);
    undertrayGeo.dispose();

    // Twin Catamaran Intake Sponsons flanking center nose
    const sponsonGeo = makeCenteredExtrude(
      [
        [-2.15, -0.12],
        [1.68, -0.11],
        [2.05, 0.02],
        [1.58, 0.18],
        [-2.05, 0.22],
      ],
      0.42,
      0.045,
      0.035,
      2
    );
    const intakeVoidGeo = new THREE.BoxGeometry(0.28, 0.16, 0.42);
    const intakeVaneGeo = new THREE.BoxGeometry(0.24, 0.025, 0.28);
    const sponsonDrlGeo = new THREE.BoxGeometry(0.26, 0.045, 0.14);
    const sponsonGlowRail = new THREE.BoxGeometry(0.055, 0.04, 2.55);

    [-0.78, 0.78].forEach((sx) => {
      addPart('hull', sponsonGeo, sx, 0, 0);
      addPart('carbon', intakeVoidGeo, sx, 0.04, 1.88);
      addPart('titanium', intakeVaneGeo, sx, 0.04, 1.94);
      addPart('headlight', sponsonDrlGeo, sx, 0.12, 1.98, 0.14, sx > 0 ? -0.24 : 0.24, 0);
      addPart('accentGlow', sponsonGlowRail, sx + (sx > 0 ? 0.19 : -0.19), 0.16, 0.18);
    });
    sponsonGeo.dispose();
    intakeVoidGeo.dispose();
    intakeVaneGeo.dispose();
    sponsonDrlGeo.dispose();
    sponsonGlowRail.dispose();

    // Streamlined Teardrop Cockpit + Solar Halo Spine Arch
    const tubGeo = new THREE.BoxGeometry(0.64, 0.15, 1.44);
    addPart('cockpitInterior', tubGeo, 0, 0.34, 0.04);
    tubGeo.dispose();

    const rollHoopGeo = new THREE.TorusGeometry(0.27, 0.034, 8, 16, Math.PI);
    addPart('titanium', rollHoopGeo, 0, 0.42, -0.36);
    rollHoopGeo.dispose();

    const hudBarGeo = new THREE.BoxGeometry(0.4, 0.03, 0.04);
    addPart('accentGlow', hudBarGeo, 0, 0.43, 0.58, -0.32, 0, 0);
    hudBarGeo.dispose();

    const canopyGeo = new THREE.CapsuleGeometry(0.36, 1.12, 8, 16);
    canopyGeo.rotateX(Math.PI / 2);
    canopyGeo.scale(1.0, 0.68, 1.0);
    addPart('canopy', canopyGeo, 0, 0.42, 0.05, 0, 0, 0, 1, 1, 1, 'box');
    canopyGeo.dispose();

    // Signature Solar Collector Halo Arch curving over engine deck
    const haloArchGeo = new THREE.TorusGeometry(0.56, 0.055, 8, 22, Math.PI);
    haloArchGeo.rotateY(Math.PI / 2);
    addPart('secondary', haloArchGeo, 0, 0.42, -1.05);
    haloArchGeo.dispose();

    const haloGlowCore = new THREE.TorusGeometry(0.56, 0.025, 6, 20, Math.PI * 0.72);
    haloGlowCore.rotateY(Math.PI / 2);
    addPart('accentGlow', haloGlowCore, 0, 0.43, -1.05, 0, 0, 0);
    haloGlowCore.dispose();

    // Swept Gull-Dihedral Main Wings + Vertical Solar Winglets
    const wingletGeo = makeCenteredExtrude(
      [
        [-1.92, 0.22],
        [-1.12, 0.26],
        [-1.48, 0.68],
        [-2.04, 0.62],
      ],
      0.06,
      0.015,
      0.015,
      1
    );
    const wingLeadGlow = new THREE.BoxGeometry(1.12, 0.035, 0.075);
    const wingCarbonFlap = new THREE.BoxGeometry(1.02, 0.035, 0.2);

    [-1, 1].forEach((side) => {
      const gullWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.96,
        tipX: 2.02,
        rootZFront: 0.15,
        rootZBack: -1.45,
        tipZFront: -0.92,
        tipZBack: -1.86,
        rootY: 0.08,
        tipY: 0.24,
        rootThick: 0.13,
        tipThick: 0.06,
      });
      addPart('hull', gullWingGeo);
      gullWingGeo.dispose();

      addPart('secondary', wingletGeo, side * 2.02, 0.02, 0, 0, 0, side * -0.14);
      addPart('accentGlow', wingLeadGlow, side * 1.5, 0.17, -0.38, 0, side * -0.78, side * 0.15);
      addPart('carbon', wingCarbonFlap, side * 1.48, 0.14, -1.68, 0, side * -0.36, side * 0.15);
    });
    wingletGeo.dispose();
    wingLeadGlow.dispose();
    wingCarbonFlap.dispose();

    // Inward-Canted Twin Tail Fins + High Bridge Spoiler
    const tailFinGeo = makeCenteredExtrude(
      [
        [-2.42, 0.24],
        [-1.38, 0.28],
        [-1.92, 0.92],
        [-2.48, 0.88],
      ],
      0.075,
      0.02,
      0.015,
      2
    );
    [-1, 1].forEach((side) => {
      addPart('secondary', tailFinGeo, side * 0.72, 0, 0, 0, 0, side * 0.26);
    });
    tailFinGeo.dispose();

    const bridgeWingGeo = new THREE.BoxGeometry(1.18, 0.055, 0.34);
    addPart('carbon', bridgeWingGeo, 0, 0.86, -2.18, 0.14, 0, 0);
    bridgeWingGeo.dispose();
    const bridgeGlow = new THREE.BoxGeometry(1.2, 0.03, 0.06);
    addPart('accentGlow', bridgeGlow, 0, 0.88, -2.33);
    bridgeGlow.dispose();

    // 4 Repulsor Turbine Pods
    [
      [-1.08, 1.32],
      [1.08, 1.32],
      [-1.26, -1.42],
      [1.26, -1.42],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.0));

    // Carbon Rear Diffuser + Segmented Taillights + Tri-Jet Solar Afterburners
    const diffuserGeo = new THREE.BoxGeometry(1.56, 0.08, 0.46);
    addPart('carbon', diffuserGeo, 0, -0.125, -2.38, 0.16, 0, 0);
    diffuserGeo.dispose();
    const strakeGeo = new THREE.BoxGeometry(0.04, 0.17, 0.44);
    [-0.58, -0.2, 0.2, 0.58].forEach((sx) => addPart('carbon', strakeGeo, sx, -0.09, -2.4));
    strakeGeo.dispose();

    const tailBarGeo = new THREE.BoxGeometry(0.54, 0.068, 0.08);
    [-0.52, 0.52].forEach((tx) => addPart('tailLight', tailBarGeo, tx, 0.23, -2.5));
    tailBarGeo.dispose();

    const flameGeo = trackGeo(new THREE.ConeGeometry(0.2, 1.45, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.725);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.18, 1.4, 10));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.7);

    [-0.54, 0.54].forEach((tx) => addAfterburner(tx, 0.05, -2.48, 0.24, 0.42, 0.2, 1.45, flameGeo, coreFlameGeo));
    addAfterburner(0, 0.22, -2.44, 0.18, 0.34, 0.16, 1.25, flameGeo, coreFlameGeo);
  } else if (chassisStyle === 'crimson') {
    // =========================================================================
    // CRIMSON-IX (Tactical Item Rival): Armored Gunship + Scythe Bi-Wings
    // =========================================================================
    const hullGeo = makeCenteredExtrude(
      [
        [-2.26, -0.14],
        [1.56, -0.14],
        [2.32, 0.02],
        [1.34, 0.32],
        [-0.22, 0.46],
        [-2.26, 0.28],
      ],
      1.36,
      0.11,
      0.08,
      3
    );
    addPart('hull', hullGeo);
    hullGeo.dispose();

    // Armored Crimson Ram-Nose Plow & Carbon Chin Dam
    const ramPlowGeo = makeCenteredExtrude(
      [
        [1.42, -0.12],
        [2.58, -0.08],
        [2.38, 0.12],
        [1.22, 0.24],
      ],
      0.78,
      0.04,
      0.03,
      2
    );
    addPart('secondary', ramPlowGeo);
    ramPlowGeo.dispose();

    const undertrayGeo = new THREE.BoxGeometry(1.74, 0.11, 4.1);
    addPart('carbon', undertrayGeo, 0, -0.15, -0.05);
    undertrayGeo.dispose();

    // Fierce Slanted Visor Headlights + Twin Recessed Nose Sensor Slits
    const eyeBladeGeo = new THREE.BoxGeometry(0.38, 0.045, 0.14);
    const noseIntakeGeo = new THREE.BoxGeometry(0.28, 0.12, 0.34);
    [-0.48, 0.48].forEach((nx) => {
      addPart('headlight', eyeBladeGeo, nx, 0.12, 2.1, 0.14, nx > 0 ? -0.32 : 0.32, nx > 0 ? -0.14 : 0.14);
      addPart('carbon', noseIntakeGeo, nx, 0.02, 2.08);
    });
    eyeBladeGeo.dispose();
    noseIntakeGeo.dispose();

    // Aggressive Forward-Raked Scythe Canards
    const canardGlowGeo = new THREE.BoxGeometry(0.66, 0.032, 0.075);
    [-1, 1].forEach((side) => {
      const scytheCanard = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.68,
        tipX: 1.46,
        rootZFront: 1.65,
        rootZBack: 1.05,
        tipZFront: 2.08,
        tipZBack: 1.56,
        rootY: 0.02,
        tipY: 0.08,
        rootThick: 0.08,
        tipThick: 0.04,
      });
      addPart('secondary', scytheCanard);
      scytheCanard.dispose();
      addPart('accentGlow', canardGlowGeo, side * 1.08, 0.05, 1.88, 0, side * 0.48, side * 0.06);
    });
    canardGlowGeo.dispose();

    // Faceted Combat Canopy + Cheek Armor Plates + Tactical HUD
    const tubGeo = new THREE.BoxGeometry(0.74, 0.15, 1.46);
    addPart('cockpitInterior', tubGeo, 0, 0.36, 0.08);
    tubGeo.dispose();

    const rollBarGeo = new THREE.TorusGeometry(0.3, 0.036, 8, 16, Math.PI);
    addPart('titanium', rollBarGeo, 0, 0.44, -0.34);
    rollBarGeo.dispose();

    const hudBarGeo = new THREE.BoxGeometry(0.44, 0.032, 0.04);
    addPart('accentGlow', hudBarGeo, 0, 0.46, 0.66, -0.32, 0, 0);
    hudBarGeo.dispose();

    const combatCanopyGeo = makeCenteredExtrude(
      [
        [-0.78, 0.32],
        [1.02, 0.32],
        [0.44, 0.62],
        [-0.42, 0.66],
      ],
      0.74,
      0.06,
      0.05,
      2
    );
    addPart('canopy', combatCanopyGeo, 0, 0, 0.04);
    combatCanopyGeo.dispose();

    const cheekArmorGeo = new THREE.BoxGeometry(0.16, 0.18, 1.18);
    [-0.5, 0.5].forEach((cx) => addPart('titanium', cheekArmorGeo, cx, 0.44, 0.05, 0, 0, cx > 0 ? -0.22 : 0.22));
    cheekArmorGeo.dispose();

    // Heavy Twin-Rail Dorsal Weapon & Countermeasure Launcher Array
    const launcherDeckGeo = new THREE.BoxGeometry(0.76, 0.22, 1.18);
    addPart('carbon', launcherDeckGeo, 0, 0.56, -1.16);
    launcherDeckGeo.dispose();

    const railBarrelGeo = new THREE.CylinderGeometry(0.065, 0.075, 1.05, 10);
    railBarrelGeo.rotateX(Math.PI / 2);
    const emitterTipGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10);
    emitterTipGeo.rotateX(Math.PI / 2);
    [-0.24, 0.24].forEach((rx) => {
      addPart('titanium', railBarrelGeo, rx, 0.68, -0.96, 0, 0, 0, 1, 1, 1, 'keep');
      addPart('accentGlow', emitterTipGeo, rx, 0.68, -0.41);
    });
    railBarrelGeo.dispose();
    emitterTipGeo.dispose();

    // Split-Plane X-Scythe Wings (Upper Crimson Swept Wing + Lower Carbon Wing + Tip Armor Pods)
    const tipBladePodGeo = makeCenteredExtrude(
      [
        [-1.62, -0.14],
        [0.48, -0.12],
        [0.72, 0.04],
        [0.36, 0.22],
        [-1.56, 0.24],
      ],
      0.14,
      0.025,
      0.02,
      2
    );
    const tipRailGlow = new THREE.BoxGeometry(0.045, 0.045, 1.92);

    [-1, 1].forEach((side) => {
      const upperWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.72,
        tipX: 1.94,
        rootZFront: 0.16,
        rootZBack: -0.98,
        tipZFront: -0.28,
        tipZBack: -1.32,
        rootY: 0.18,
        tipY: 0.34,
        rootThick: 0.11,
        tipThick: 0.055,
      });
      addPart('secondary', upperWingGeo);
      upperWingGeo.dispose();

      const lowerWingGeo = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.72,
        tipX: 1.94,
        rootZFront: 0.08,
        rootZBack: -1.04,
        tipZFront: -0.32,
        tipZBack: -1.36,
        rootY: -0.02,
        tipY: -0.14,
        rootThick: 0.09,
        tipThick: 0.05,
      });
      addPart('carbon', lowerWingGeo);
      lowerWingGeo.dispose();

      addPart('hull', tipBladePodGeo, side * 1.96, 0.08, -0.45);
      addPart('accentGlow', tipRailGlow, side * 2.04, 0.14, -0.52);
    });
    tipBladePodGeo.dispose();
    tipRailGlow.dispose();

    // Twin Outward-Slanted Combat Stabilizers
    const stabGeo = makeCenteredExtrude(
      [
        [-2.28, 0.24],
        [-1.46, 0.3],
        [-1.96, 0.86],
        [-2.34, 0.8],
      ],
      0.09,
      0.02,
      0.02,
      2
    );
    [-1, 1].forEach((side) => addPart('secondary', stabGeo, side * 0.64, 0, 0, 0, 0, side * -0.34));
    stabGeo.dispose();

    // 4 Repulsor Turbine Pods
    [
      [-1.12, 1.05],
      [1.12, 1.05],
      [-1.18, -1.45],
      [1.18, -1.45],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.02));

    // Heavy Diffuser + Dual Crimson Chevron Taillights + Twin Heavy Thrusters
    const diffuserGeo = new THREE.BoxGeometry(1.62, 0.08, 0.48);
    addPart('carbon', diffuserGeo, 0, -0.13, -2.18, 0.16, 0, 0);
    diffuserGeo.dispose();
    const strakeGeo = new THREE.BoxGeometry(0.04, 0.18, 0.44);
    [-0.6, -0.22, 0.22, 0.6].forEach((sx) => addPart('carbon', strakeGeo, sx, -0.09, -2.22));
    strakeGeo.dispose();

    const tailChevronGeo = new THREE.BoxGeometry(0.56, 0.075, 0.08);
    [-0.48, 0.48].forEach((tx) => addPart('tailLight', tailChevronGeo, tx, 0.24, -2.32, 0, 0, tx > 0 ? 0.14 : -0.14));
    tailChevronGeo.dispose();

    const flameGeo = trackGeo(new THREE.ConeGeometry(0.19, 1.32, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.66);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.18, 1.26, 10));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.63);

    [-0.44, 0.44].forEach((tx) => addAfterburner(tx, 0.05, -2.28, 0.24, 0.4, 0.19, 1.32, flameGeo, coreFlameGeo));
  } else {
    // =========================================================================
    // AERO-TITAN (Steady Endurance Cruiser): Wide Twin-Sponson + Box-Wing Tail
    // =========================================================================
    const centerHullGeo = makeCenteredExtrude(
      [
        [-2.38, -0.14],
        [1.74, -0.14],
        [2.42, 0.04],
        [1.46, 0.3],
        [0.18, 0.46],
        [-1.38, 0.48],
        [-2.38, 0.26],
      ],
      1.26,
      0.11,
      0.08,
      3
    );
    addPart('hull', centerHullGeo);
    centerHullGeo.dispose();

    // Heavy Full-Width Front Aero Dam + Carbon Undertray
    const undertrayGeo = new THREE.BoxGeometry(2.38, 0.12, 4.35);
    addPart('carbon', undertrayGeo, 0, -0.16, -0.05);
    undertrayGeo.dispose();

    const frontDamGeo = makeCenteredExtrude(
      [
        [1.42, -0.18],
        [2.52, -0.16],
        [2.54, -0.08],
        [1.42, -0.1],
      ],
      2.18,
      0.025,
      0.02,
      1
    );
    addPart('carbon', frontDamGeo);
    frontDamGeo.dispose();

    // Twin Wide Endurance Radiator Louvers & Broad Dual-Bar DRL Clusters
    const grilleGeo = new THREE.BoxGeometry(0.48, 0.13, 0.34);
    const grilleVane = new THREE.BoxGeometry(0.44, 0.025, 0.26);
    const drlUpper = new THREE.BoxGeometry(0.44, 0.045, 0.12);
    [-0.64, 0.64].forEach((nx) => {
      addPart('carbon', grilleGeo, nx, 0.03, 2.2);
      addPart('titanium', grilleVane, nx, 0.03, 2.24);
      addPart('headlight', drlUpper, nx, 0.14, 2.18, 0.15, nx > 0 ? -0.16 : 0.16, 0);
    });
    grilleGeo.dispose();
    grilleVane.dispose();
    drlUpper.dispose();

    // Massive Ground-Effect Endurance Side Sponsons (Mint-Pearl Deck + Carbon Venturi Skirts)
    const sideSponsonGeo = makeCenteredExtrude(
      [
        [-2.35, -0.08],
        [1.48, -0.08],
        [1.82, 0.06],
        [1.36, 0.26],
        [-2.28, 0.28],
      ],
      0.56,
      0.05,
      0.04,
      2
    );
    const sideDeckCapGeo = new THREE.BoxGeometry(0.48, 0.065, 3.25);
    const sideGillGlow = new THREE.BoxGeometry(0.055, 0.045, 2.25);
    const sideIntakeSlot = new THREE.BoxGeometry(0.36, 0.16, 0.34);

    [-0.94, 0.94].forEach((sx) => {
      addPart('hull', sideSponsonGeo, sx, 0, 0);
      addPart('secondary', sideDeckCapGeo, sx, 0.27, -0.38);
      addPart('carbon', sideIntakeSlot, sx, 0.1, 1.56);
      addPart('accentGlow', sideGillGlow, sx + (sx > 0 ? 0.28 : -0.28), 0.12, -0.22);
    });
    sideSponsonGeo.dispose();
    sideDeckCapGeo.dispose();
    sideGillGlow.dispose();
    sideIntakeSlot.dispose();

    // Broad LMP Endurance Canopy + Heavy Mint Roof Roll-Scoop + Cockpit Tub
    const tubGeo = new THREE.BoxGeometry(0.84, 0.16, 1.52);
    addPart('cockpitInterior', tubGeo, 0, 0.38, 0.02);
    tubGeo.dispose();

    const rollBarGeo = new THREE.TorusGeometry(0.34, 0.04, 8, 16, Math.PI);
    addPart('titanium', rollBarGeo, 0, 0.46, -0.4);
    rollBarGeo.dispose();

    const hudBarGeo = new THREE.BoxGeometry(0.52, 0.032, 0.045);
    addPart('accentGlow', hudBarGeo, 0, 0.47, 0.62, -0.28, 0, 0);
    hudBarGeo.dispose();

    const canopyGeo = makeCenteredExtrude(
      [
        [-1.08, 0.0],
        [1.04, 0.0],
        [0.48, 0.34],
        [-0.58, 0.36],
      ],
      0.94,
      0.075,
      0.06,
      3
    );
    addPart('canopy', canopyGeo, 0, 0.38, 0.0);
    canopyGeo.dispose();

    const airboxGeo = makeCenteredExtrude(
      [
        [-1.48, 0.44],
        [-0.2, 0.7],
        [-0.52, 0.82],
        [-1.52, 0.6],
      ],
      0.34,
      0.035,
      0.025,
      2
    );
    addPart('secondary', airboxGeo);
    airboxGeo.dispose();

    // Twin-Boom Endurance Tail Towers + Bi-Plane Box Rear Wing
    const boomTowerGeo = makeCenteredExtrude(
      [
        [-2.42, 0.24],
        [-1.48, 0.26],
        [-1.78, 0.94],
        [-2.48, 0.9],
      ],
      0.11,
      0.025,
      0.02,
      2
    );
    const boomTrimGlow = new THREE.BoxGeometry(0.045, 0.045, 0.62);
    [-1, 1].forEach((side) => {
      addPart('secondary', boomTowerGeo, side * 1.06, 0, 0);
      addPart('accentGlow', boomTrimGlow, side * 1.12, 0.84, -2.14);
    });
    boomTowerGeo.dispose();
    boomTrimGlow.dispose();

    // Wide high-downforce carbon main wing + lower beam wing
    [-1, 1].forEach((side) => {
      const upperMainWing = createSweptWingGeometry({
        side: side as -1 | 1,
        rootX: 0.0,
        tipX: 1.12,
        rootZFront: -1.86,
        rootZBack: -2.38,
        tipZFront: -1.86,
        tipZBack: -2.38,
        rootY: 0.86,
        tipY: 0.86,
        rootThick: 0.11,
        tipThick: 0.095,
      });
      addPart('carbon', upperMainWing);
      upperMainWing.dispose();
    });

    const beamWingGeo = new THREE.BoxGeometry(2.12, 0.06, 0.28);
    addPart('carbon', beamWingGeo, 0, 0.48, -2.28, 0.12, 0, 0);
    beamWingGeo.dispose();

    const wingRearGlow = new THREE.BoxGeometry(2.24, 0.036, 0.065);
    addPart('accentGlow', wingRearGlow, 0, 0.87, -2.41);
    wingRearGlow.dispose();

    // Oversized Quad Endurance Repulsor Pods (1.14x scale)
    [
      [-1.16, 1.32],
      [1.16, 1.32],
      [-1.24, -1.36],
      [1.24, -1.36],
    ].forEach(([px, pz]) => addTurbinePod(px, pz, -0.16, 1.14));

    // Broad Heavy Diffuser + Full-Width Endurance Taillight Array + Twin Crucible Thrusters
    const diffuserGeo = new THREE.BoxGeometry(2.04, 0.09, 0.5);
    addPart('carbon', diffuserGeo, 0, -0.13, -2.28, 0.16, 0, 0);
    diffuserGeo.dispose();
    const strakeGeo = new THREE.BoxGeometry(0.045, 0.2, 0.46);
    [-0.82, -0.42, 0, 0.42, 0.82].forEach((sx) => addPart('carbon', strakeGeo, sx, -0.09, -2.32));
    strakeGeo.dispose();

    const tailBarGeo = new THREE.BoxGeometry(1.92, 0.075, 0.08);
    addPart('tailLight', tailBarGeo, 0, 0.2, -2.44);
    tailBarGeo.dispose();

    const flameGeo = trackGeo(new THREE.ConeGeometry(0.21, 1.35, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.675);
    const coreFlameGeo = trackGeo(new THREE.ConeGeometry(0.2, 1.3, 10));
    coreFlameGeo.rotateX(-Math.PI / 2);
    coreFlameGeo.translate(0, 0, -0.65);

    [-0.5, 0.5].forEach((tx) => addAfterburner(tx, 0.06, -2.4, 0.27, 0.42, 0.21, 1.35, flameGeo, coreFlameGeo));
  }

  // Dispose shared pod templates before merging buckets
  podHousingGeo.dispose();
  podStatorRingGeo.dispose();
  podOuterCoilGeo.dispose();
  podInnerCoreGeo.dispose();

  // Merge each material bucket into a single optimized Mesh
  const bucketConfig: {
    key: BucketKey;
    mat: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
  }[] = [
    { key: 'hull', mat: hullMat, castShadow: effectiveCastShadow, receiveShadow: true },
    { key: 'secondary', mat: secondaryMat, castShadow: effectiveCastShadow, receiveShadow: true },
    { key: 'carbon', mat: carbonMat, castShadow: effectiveCastShadow, receiveShadow: true },
    { key: 'titanium', mat: brushedTitaniumMat, castShadow: effectiveCastShadow, receiveShadow: false },
    { key: 'cockpitInterior', mat: cockpitInteriorMat, castShadow: false, receiveShadow: false },
    { key: 'accentGlow', mat: accentGlowMat, castShadow: false, receiveShadow: false },
    { key: 'headlight', mat: headlightMat, castShadow: false, receiveShadow: false },
    { key: 'tailLight', mat: tailLightMat, castShadow: false, receiveShadow: false },
    { key: 'canopy', mat: canopyMat, castShadow: false, receiveShadow: false },
  ];

  for (const cfg of bucketConfig) {
    const parts = buckets[cfg.key];
    if (parts.length === 0) continue;
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) {
      parts.forEach((p) => p.dispose());
    }
    if (!merged) continue;
    trackGeo(merged);
    const mesh = new THREE.Mesh(merged, cfg.mat);
    mesh.castShadow = cfg.castShadow;
    mesh.receiveShadow = cfg.receiveShadow;
    chassisGroup.add(mesh);
  }

  // Grounded Contact Shadow Plane (sits flush at Y = 0.03 above track)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.2, 5.6));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: isGhost ? 0.18 : 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  // Aegis Shield Holographic Energy Dome (hidden unless shield sub-item is active)
  const shieldGeo = trackGeo(new THREE.IcosahedronGeometry(2.9, 1));
  shieldGeo.scale(0.76, 0.46, 1.08);
  const shieldMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
  shieldDome.position.set(0, 0.18, 0);
  const shieldRimGeo = trackGeo(new THREE.TorusGeometry(2.25, 0.06, 8, 32));
  shieldRimGeo.rotateX(Math.PI / 2);
  shieldRimGeo.scale(0.95, 1.35, 1.0);
  const shieldRim = new THREE.Mesh(
    shieldRimGeo,
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.85,
      })
    )
  );
  shieldDome.add(shieldRim);
  shieldDome.visible = false;
  chassisGroup.add(shieldDome);

  // Luminous Hyper-Glow Aura Rings (hidden unless glow_boost is active)
  const glowAura = new THREE.Group();
  const auraRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const auraOuterMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const auraRingA = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.35, 0.07, 8, 32)), auraRingMat);
  auraRingA.rotation.x = Math.PI / 2;
  auraRingA.scale.set(0.86, 1.25, 1.0);
  const auraRingB = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.95, 0.055, 8, 28)), auraRingMat);
  auraRingB.rotation.z = Math.PI / 6;
  const auraShellGeo = trackGeo(new THREE.SphereGeometry(2.4, 16, 12));
  auraShellGeo.scale(0.74, 0.42, 1.15);
  const auraShell = new THREE.Mesh(auraShellGeo, auraOuterMat);
  glowAura.add(auraRingA, auraRingB, auraShell);
  glowAura.position.set(0, 0.14, 0);
  glowAura.visible = false;
  chassisGroup.add(glowAura);

  // Anti-Grav Aero Float Underbody Vortex Ring (hidden unless hover_glide is active)
  const hoverHaloGeo = trackGeo(new THREE.TorusGeometry(1.85, 0.11, 10, 32));
  hoverHaloGeo.rotateX(Math.PI / 2);
  hoverHaloGeo.scale(0.88, 1.32, 1.0);
  const hoverHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const hoverHalo = new THREE.Mesh(hoverHaloGeo, hoverHaloMat);
  hoverHalo.position.set(0, -0.34, 0);
  hoverHalo.visible = false;
  chassisGroup.add(hoverHalo);

  // Damage / Spin Hazard Arcs (visible whenever hitSpinTimer > 0)
  const spinSparkRing = new THREE.Group();
  const spinRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const spinWarnMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const spinRingA = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.55, 0.11, 8, 28)), spinRingMat);
  spinRingA.rotation.x = Math.PI / 2;
  const spinRingB = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.15, 0.08, 8, 24)), spinWarnMat);
  spinRingB.rotation.x = Math.PI / 2.4;
  spinRingB.rotation.y = Math.PI / 4;
  const spinRingC = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.15, 0.08, 8, 24)), spinRingMat);
  spinRingC.rotation.x = -Math.PI / 2.4;
  spinRingC.rotation.y = -Math.PI / 4;
  spinSparkRing.add(spinRingA, spinRingB, spinRingC);
  spinSparkRing.position.set(0, 0.35, 0);
  spinSparkRing.visible = false;
  chassisGroup.add(spinSparkRing);

  // Supersonic Dash / Turbo Aura (Mach shock rings + wingtip plasma streaks, hidden unless boosting)
  const boostAura = new THREE.Group();
  const machRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const machHotMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const wingStreakGeo = trackGeo(new THREE.ConeGeometry(0.14, 3.8, 8));
  wingStreakGeo.rotateX(-Math.PI / 2);
  wingStreakGeo.translate(0, 0, -1.9);

  const machRingFront = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.55, 0.055, 8, 28)), machRingMat);
  machRingFront.position.set(0, 0.12, 1.35);
  const machRingMid = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.05, 0.07, 8, 32)), machHotMat);
  machRingMid.position.set(0, 0.14, -0.15);
  const machRingRear = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.45, 0.085, 8, 32)), machRingMat);
  machRingRear.position.set(0, 0.14, -1.75);

  const streakLeft = new THREE.Mesh(wingStreakGeo, machHotMat);
  streakLeft.position.set(-1.62, 0.04, -1.35);
  const streakRight = new THREE.Mesh(wingStreakGeo, machHotMat);
  streakRight.position.set(1.62, 0.04, -1.35);

  const coreJetGeo = trackGeo(new THREE.ConeGeometry(0.46, 3.6, 12));
  coreJetGeo.rotateX(-Math.PI / 2);
  coreJetGeo.translate(0, 0, -1.8);
  const coreJet = new THREE.Mesh(coreJetGeo, machRingMat);
  coreJet.position.set(0, 0.08, -2.55);

  boostAura.add(machRingFront, machRingMid, machRingRear, streakLeft, streakRight, coreJet);
  boostAura.visible = false;
  chassisGroup.add(boostAura);

  const updateBoosters =
    animatedBoosters.length > 0
      ? (dt: number, elapsed: number, speedRatio: number, boosting: boolean) => {
          const spinRate = boosting ? 24.0 : 2.3 + speedRatio * 14.5;
          const baseAperture = boosting ? 1.16 : 1.0 + speedRatio * 0.07;

          for (let i = 0; i < animatedBoosters.length; i++) {
            const b = animatedBoosters[i];
            b.rotor.rotation.z += dt * spinRate * b.sign;

            // Even at 0 km/h idle, vectoring petals subtly breathe & micro-trim
            const idleBreath = Math.sin(elapsed * 3.1 + b.phase) * (boosting ? 0.055 : 0.038);
            const sXY = baseAperture + idleBreath;
            b.iris.scale.set(sXY, sXY, 1);
            b.iris.rotation.z = Math.sin(elapsed * 2.2 + b.phase) * 0.12;

            // Floating plasma stabilizer ring glides gently aft/fore and shimmers
            const ringExtend = boosting ? -0.14 : -speedRatio * 0.06;
            const ringOsc = Math.sin(elapsed * 4.4 + b.phase) * (boosting ? 0.05 : 0.036);
            b.plasmaRing.position.z = b.baseRingZ + ringExtend + ringOsc;
            const ringScale = (boosting ? 1.18 : 0.96 + speedRatio * 0.1) + Math.cos(elapsed * 4.4 + b.phase) * 0.05;
            b.plasmaRing.scale.set(ringScale, ringScale, 1);
          }

          // Subtle living idle flame shimmer when parked / creeping
          if (!boosting) {
            const idleShimmer = 1 + Math.sin(elapsed * 9.5) * 0.11 + Math.cos(elapsed * 15.2) * 0.06;
            const radShimmer = 1 + Math.sin(elapsed * 8.1) * 0.06;
            for (let i = 0; i < thrusterFlames.length; i++) {
              const f = thrusterFlames[i];
              f.scale.x *= radShimmer;
              f.scale.y *= radShimmer;
              f.scale.z *= idleShimmer;
            }
          }
        }
      : undefined;

  return {
    root,
    chassisGroup,
    thrusterFlames,
    boostGlowMaterial: accentGlowMat,
    shadowPlane,
    shieldDome,
    glowAura,
    hoverHalo,
    spinSparkRing,
    boostAura,
    updateBoosters,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
