import * as THREE from 'three';
import { GeneratedLaneChoice } from '../utils/cardCollection';
import { TrackData, TrackSample } from './track';
import { SUB_ITEMS, SubItemType } from './types';

export const QUIZ_ROW_S: readonly number[] = [0.48, 0.95];
export const LANE_LATERALS: readonly number[] = [-10.5, -3.5, 3.5, 10.5];

export interface QuizLaneSlot {
  laneIndex: number;
  lateral: number;
  kind: SubItemType;
  group: THREE.Group;
  spinner: THREE.Group;
  kindMeshes: Record<SubItemType, THREE.Group>;
  padMat: THREE.MeshBasicMaterial;
  signCanvas: HTMLCanvasElement;
  signCtx: CanvasRenderingContext2D;
  signTexture: THREE.CanvasTexture;
  basePhase: number;
}

export interface QuizGateRow {
  rowIndex: number;
  s: number;
  active: boolean;
  respawnTimer: number;
  lanes: QuizLaneSlot[];
}

export interface ActiveMissile {
  ownerId: string;
  targetId: string | null;
  s: number;
  lateral: number;
  speed: number;
  homingStrength: number;
  stunDuration: number;
  ttl: number;
  mesh: THREE.Group;
}

export interface ActiveLaser {
  ownerId: string;
  s: number;
  lateral: number;
  speed: number;
  beamWidth: number;
  stunDuration: number;
  ttl: number;
  mesh: THREE.Group;
}

export interface ActiveMine {
  ownerId: string;
  s: number;
  lateral: number;
  hitRadius: number;
  stunDuration: number;
  ttl: number;
  graceTimer: number;
  baseScale: number;
  mesh: THREE.Group;
}

export interface ActiveBombStrike {
  ownerId: string;
  targetId: string;
  s: number;
  lateral: number;
  lockTimer: number;
  blastTimer: number;
  detonated: boolean;
  damageApplied: boolean;
  blastRadius: number;
  stunDuration: number;
  group: THREE.Group;
  reticleMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  beamMesh: THREE.Mesh;
  coreBeamMesh: THREE.Mesh;
  domeMesh: THREE.Mesh;
}

export interface ActiveShockwave {
  elapsed: number;
  duration: number;
  maxRadius: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export interface ActiveHitBurst {
  elapsed: number;
  duration: number;
  maxScale: number;
  group: THREE.Group;
  sphereMat: THREE.MeshBasicMaterial;
  pillarMat: THREE.MeshBasicMaterial;
}

export interface ActiveDashRing {
  elapsed: number;
  duration: number;
  maxRadius: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

const _sample: TrackSample = {
  s: 0,
  arcLength: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};
const _left = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

function wrapJapaneseText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length === 2) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < 2) {
    lines.push(current);
  }
  if (lines.length === 2 && chars.join('').length > (lines[0] + lines[1]).length) {
    lines[1] = lines[1].slice(0, Math.max(1, lines[1].length - 1)) + '…';
  }
  return lines;
}

export class TrackItemSystem {
  private scene: THREE.Scene;
  private track: TrackData;
  public rows: QuizGateRow[] = [];
  public missiles: ActiveMissile[] = [];
  public lasers: ActiveLaser[] = [];
  public mines: ActiveMine[] = [];
  public bombStrikes: ActiveBombStrike[] = [];
  public shockwaves: ActiveShockwave[] = [];
  public hitBursts: ActiveHitBurst[] = [];
  public dashRings: ActiveDashRing[] = [];
  private showItems = true;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  // Shared hazard geometries & materials
  private missileBodyGeo: THREE.BufferGeometry;
  private missileTailGeo: THREE.BufferGeometry;
  private missileMat: THREE.MeshStandardMaterial;
  private missileGlowMat: THREE.MeshBasicMaterial;

  private laserCoreGeo: THREE.BufferGeometry;
  private laserOuterGeo: THREE.BufferGeometry;
  private laserCoreMat: THREE.MeshBasicMaterial;
  private laserOuterMat: THREE.MeshBasicMaterial;

  private mineCoreGeo: THREE.BufferGeometry;
  private mineSpikeRingGeo: THREE.BufferGeometry;
  private mineOuterRingGeo: THREE.BufferGeometry;
  private mineBeaconGeo: THREE.BufferGeometry;
  private mineMat: THREE.MeshStandardMaterial;
  private mineBeaconMat: THREE.MeshBasicMaterial;

  private bombReticleGeo: THREE.BufferGeometry;
  private bombHaloGeo: THREE.BufferGeometry;
  private bombBeamGeo: THREE.BufferGeometry;
  private bombCoreBeamGeo: THREE.BufferGeometry;
  private bombDomeGeo: THREE.BufferGeometry;
  private bombReticleMat: THREE.MeshBasicMaterial;
  private bombBeamMat: THREE.MeshBasicMaterial;
  private bombCoreBeamMat: THREE.MeshBasicMaterial;
  private bombDomeMat: THREE.MeshBasicMaterial;

  private shockwaveGeo: THREE.BufferGeometry;
  private dashRingGeo: THREE.BufferGeometry;
  private burstSphereGeo: THREE.BufferGeometry;
  private burstPillarGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, track: TrackData, maxAnisotropy = 4) {
    this.scene = scene;
    this.track = track;

    // 1. Boost pickup
    const boostCoreGeo = this.trackGeo(new THREE.ConeGeometry(0.84, 1.7, 6));
    boostCoreGeo.rotateX(Math.PI / 2);
    const boostRingGeo = this.trackGeo(new THREE.TorusGeometry(1.14, 0.13, 8, 22));
    const boostMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.4,
        metalness: 0.4,
        roughness: 0.2,
      })
    );

    // 2. Laser pickup
    const laserPickBarGeo = this.trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 2.1, 10));
    laserPickBarGeo.rotateX(Math.PI / 2);
    const laserPickRingGeo = this.trackGeo(new THREE.TorusGeometry(0.95, 0.1, 8, 20));
    const laserPickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf87171,
        emissive: 0xef4444,
        emissiveIntensity: 2.5,
        metalness: 0.35,
        roughness: 0.18,
      })
    );

    // 3. Spread Missile pickup
    const spreadPickConeGeo = this.trackGeo(new THREE.ConeGeometry(0.32, 1.35, 8));
    spreadPickConeGeo.rotateX(Math.PI / 2);
    const spreadPickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfda4af,
        emissive: 0xfb7185,
        emissiveIntensity: 2.3,
        metalness: 0.35,
        roughness: 0.2,
      })
    );

    // 4. Leader Bomb pickup
    const bombPickSphereGeo = this.trackGeo(new THREE.SphereGeometry(0.72, 14, 12));
    const bombPickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.12, 0.11, 8, 22));
    bombPickRingGeo.rotateX(Math.PI / 2);
    const bombPickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: 0xf97316,
        emissiveIntensity: 2.4,
        metalness: 0.4,
        roughness: 0.2,
      })
    );

    // 5. Mega Mine pickup
    const minePickCoreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.84, 0));
    const minePickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.18, 0.13, 8, 22));
    minePickRingGeo.rotateX(Math.PI / 2);
    const minePickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8b4fe,
        emissive: 0xa855f7,
        emissiveIntensity: 2.4,
        metalness: 0.35,
        roughness: 0.2,
      })
    );

    // 6. Glow Boost pickup
    const glowPickStarGeo = this.trackGeo(new THREE.OctahedronGeometry(0.78, 1));
    const glowPickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.16, 0.1, 8, 24));
    const glowPickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfde047,
        emissiveIntensity: 2.6,
        metalness: 0.2,
        roughness: 0.15,
      })
    );

    // 7. Hover Glide pickup
    const hoverPickWingGeo = this.trackGeo(new THREE.BoxGeometry(2.1, 0.18, 0.72));
    const hoverPickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.05, 0.11, 8, 22));
    hoverPickRingGeo.rotateX(Math.PI / 2);
    const hoverPickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5eead4,
        emissive: 0x14b8a6,
        emissiveIntensity: 2.3,
        metalness: 0.3,
        roughness: 0.2,
      })
    );

    // 8. Shield pickup
    const shieldGeo = this.trackGeo(new THREE.IcosahedronGeometry(0.98, 1));
    const shieldWireMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        wireframe: true,
      })
    );
    const shieldCoreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.58, 0));
    const shieldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x06b6d4,
        emissiveIntensity: 2.1,
        metalness: 0.3,
        roughness: 0.2,
      })
    );

    // 9. EMP pickup
    const empSphereGeo = this.trackGeo(new THREE.SphereGeometry(0.54, 12, 12));
    const empRingGeoA = this.trackGeo(new THREE.TorusGeometry(1.06, 0.09, 8, 22));
    const empRingGeoB = this.trackGeo(new THREE.TorusGeometry(1.06, 0.09, 8, 22));
    empRingGeoB.rotateY(Math.PI / 2);
    const empMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.3,
        metalness: 0.3,
        roughness: 0.18,
      })
    );

    // Wide holographic floor gate pad + 34m approach runway guide for each of the 4 lanes
    const floorPadGeo = this.trackGeo(new THREE.PlaneGeometry(6.5, 6.4));
    floorPadGeo.rotateX(-Math.PI / 2);
    const approachStripGeo = this.trackGeo(new THREE.PlaneGeometry(6.1, 34));
    approachStripGeo.rotateX(-Math.PI / 2);

    // Overhead signboard plane + side holographic struts
    const signGeo = this.trackGeo(new THREE.PlaneGeometry(6.4, 2.5));
    const strutGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 4.8, 0.14));
    const strutMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.75,
        metalness: 0.7,
        roughness: 0.3,
      })
    );

    // Active hazard shared geometries/materials
    this.missileBodyGeo = this.trackGeo(new THREE.ConeGeometry(0.48, 2.2, 10));
    this.missileBodyGeo.rotateX(Math.PI / 2);
    this.missileTailGeo = this.trackGeo(new THREE.ConeGeometry(0.38, 1.8, 10));
    this.missileTailGeo.rotateX(-Math.PI / 2);
    this.missileMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfb7185,
        emissive: 0xff1f4b,
        emissiveIntensity: 2.9,
        roughness: 0.18,
      })
    );
    this.missileGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    this.laserCoreGeo = this.trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 24, 12));
    this.laserCoreGeo.rotateX(Math.PI / 2);
    this.laserOuterGeo = this.trackGeo(new THREE.CylinderGeometry(0.85, 0.85, 24, 12));
    this.laserOuterGeo.rotateX(Math.PI / 2);
    this.laserCoreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      })
    );
    this.laserOuterMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.56,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    // Oversized, bright, unmistakable Mega Shock Mine
    this.mineCoreGeo = this.trackGeo(new THREE.IcosahedronGeometry(1.15, 0));
    this.mineSpikeRingGeo = this.trackGeo(new THREE.TorusGeometry(1.65, 0.18, 10, 24));
    this.mineSpikeRingGeo.rotateX(Math.PI / 2);
    this.mineOuterRingGeo = this.trackGeo(new THREE.TorusGeometry(2.1, 0.11, 8, 28));
    this.mineOuterRingGeo.rotateX(Math.PI / 2);
    this.mineBeaconGeo = this.trackGeo(new THREE.CylinderGeometry(0.16, 1.2, 4.6, 14, 1, true));
    this.mineMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0xa855f7,
        emissiveIntensity: 2.8,
        roughness: 0.2,
      })
    );
    this.mineBeaconMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe879f9,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );

    // Orbital 1st-Place SatelliteLaser geometries/materials
    this.bombReticleGeo = this.trackGeo(new THREE.RingGeometry(1.9, 2.75, 32));
    this.bombReticleGeo.rotateX(-Math.PI / 2);
    this.bombHaloGeo = this.trackGeo(new THREE.TorusGeometry(2.6, 0.14, 10, 32));
    this.bombHaloGeo.rotateX(Math.PI / 2);
    this.bombBeamGeo = this.trackGeo(new THREE.CylinderGeometry(0.85, 2.4, 85, 18, 1, true));
    this.bombCoreBeamGeo = this.trackGeo(new THREE.CylinderGeometry(0.35, 0.72, 85, 14, 1, true));
    this.bombDomeGeo = this.trackGeo(new THREE.SphereGeometry(1, 20, 14));
    this.bombReticleMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bombBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bombCoreBeamMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bombDomeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffedd5,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    this.shockwaveGeo = this.trackGeo(new THREE.TorusGeometry(1, 0.16, 10, 32));
    this.shockwaveGeo.rotateX(Math.PI / 2);
    this.dashRingGeo = this.trackGeo(new THREE.TorusGeometry(1, 0.085, 8, 28));
    this.burstSphereGeo = this.trackGeo(new THREE.SphereGeometry(1, 16, 12));
    this.burstPillarGeo = this.trackGeo(new THREE.CylinderGeometry(0.35, 1.35, 14, 14, 1, true));

    const allKinds: SubItemType[] = [
      'boost',
      'laser',
      'spread_missile',
      'leader_bomb',
      'mine',
      'glow_boost',
      'hover_glide',
      'shield',
      'emp',
    ];

    QUIZ_ROW_S.forEach((rowS, rowIndex) => {
      this.track.sampleAtS(rowS, _sample);
      const rowLeft = _sample.right.clone().negate();
      const rowBasis = new THREE.Matrix4().makeBasis(rowLeft, _sample.up, _sample.tangent);

      const lanes: QuizLaneSlot[] = [];

      LANE_LATERALS.forEach((lat, laneIdx) => {
        const group = new THREE.Group();
        const spinner = new THREE.Group();
        spinner.position.y = 1.95;
        spinner.scale.setScalar(2.05);
        group.add(spinner);

        const kindMeshes = {} as Record<SubItemType, THREE.Group>;
        for (const k of allKinds) {
          const subGroup = new THREE.Group();
          if (k === 'boost') {
            subGroup.add(new THREE.Mesh(boostCoreGeo, boostMat));
            subGroup.add(new THREE.Mesh(boostRingGeo, boostMat));
          } else if (k === 'laser') {
            subGroup.add(new THREE.Mesh(laserPickBarGeo, laserPickMat));
            const r1 = new THREE.Mesh(laserPickRingGeo, laserPickMat);
            r1.position.z = 0.45;
            const r2 = new THREE.Mesh(laserPickRingGeo, laserPickMat);
            r2.position.z = -0.45;
            subGroup.add(r1, r2);
          } else if (k === 'spread_missile') {
            [-0.55, 0, 0.55].forEach((ox, idx) => {
              const c = new THREE.Mesh(spreadPickConeGeo, spreadPickMat);
              c.position.set(ox, 0, idx === 1 ? 0.2 : -0.1);
              c.rotation.y = -ox * 0.35;
              subGroup.add(c);
            });
          } else if (k === 'leader_bomb') {
            subGroup.add(new THREE.Mesh(bombPickSphereGeo, bombPickMat));
            subGroup.add(new THREE.Mesh(bombPickRingGeo, bombPickMat));
          } else if (k === 'mine') {
            subGroup.add(new THREE.Mesh(minePickCoreGeo, minePickMat));
            subGroup.add(new THREE.Mesh(minePickRingGeo, minePickMat));
          } else if (k === 'glow_boost') {
            subGroup.add(new THREE.Mesh(glowPickStarGeo, glowPickMat));
            const r1 = new THREE.Mesh(glowPickRingGeo, glowPickMat);
            r1.rotation.x = Math.PI / 3;
            const r2 = new THREE.Mesh(glowPickRingGeo, glowPickMat);
            r2.rotation.y = Math.PI / 3;
            subGroup.add(r1, r2);
          } else if (k === 'hover_glide') {
            subGroup.add(new THREE.Mesh(hoverPickWingGeo, hoverPickMat));
            const r = new THREE.Mesh(hoverPickRingGeo, hoverPickMat);
            r.position.y = -0.35;
            subGroup.add(r);
          } else if (k === 'shield') {
            subGroup.add(new THREE.Mesh(shieldCoreGeo, shieldMat));
            subGroup.add(new THREE.Mesh(shieldGeo, shieldWireMat));
          } else {
            subGroup.add(new THREE.Mesh(empSphereGeo, empMat));
            subGroup.add(new THREE.Mesh(empRingGeoA, empMat));
            subGroup.add(new THREE.Mesh(empRingGeoB, empMat));
          }
          subGroup.visible = k === 'boost';
          spinner.add(subGroup);
          kindMeshes[k] = subGroup;
        }

        const padMat = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          })
        );
        const padMesh = new THREE.Mesh(floorPadGeo, padMat);
        padMesh.position.y = 0.05;
        group.add(padMesh);

        const approachMat = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: 0x0ea5e9,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          })
        );
        const approachMesh = new THREE.Mesh(approachStripGeo, approachMat);
        approachMesh.position.set(0, 0.04, -20);
        group.add(approachMesh);

        // Overhead holographic lane signboard facing approaching player (-tangent)
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 512;
        signCanvas.height = 224;
        const signCtx = signCanvas.getContext('2d')!;
        const signTexture = new THREE.CanvasTexture(signCanvas);
        signTexture.colorSpace = THREE.SRGBColorSpace;
        signTexture.anisotropy = maxAnisotropy;
        this.textures.push(signTexture);

        const signMat = this.trackMat(
          new THREE.MeshBasicMaterial({
            map: signTexture,
            transparent: true,
            side: THREE.DoubleSide,
          })
        );
        const signMesh = new THREE.Mesh(signGeo, signMat);
        signMesh.position.set(0, 5.25, 0);
        signMesh.rotation.y = Math.PI;
        group.add(signMesh);

        const leftStrut = new THREE.Mesh(strutGeo, strutMat);
        leftStrut.position.set(3.2, 2.4, 0);
        const rightStrut = new THREE.Mesh(strutGeo, strutMat);
        rightStrut.position.set(-3.2, 2.4, 0);
        group.add(leftStrut);
        group.add(rightStrut);

        group.quaternion.setFromRotationMatrix(rowBasis);
        group.position.copy(_sample.position).addScaledVector(_sample.right, lat);
        this.scene.add(group);

        const slot: QuizLaneSlot = {
          laneIndex: laneIdx,
          lateral: lat,
          kind: 'boost',
          group,
          spinner,
          kindMeshes,
          padMat,
          signCanvas,
          signCtx,
          signTexture,
          basePhase: rowIndex * 2.1 + laneIdx * 0.7,
        };

        this.drawSignboard(slot, null, false);
        lanes.push(slot);
      });

      this.rows.push({
        rowIndex,
        s: rowS,
        active: true,
        respawnTimer: 0,
        lanes,
      });
    });
  }

  private drawSignboard(
    slot: QuizLaneSlot,
    choice: GeneratedLaneChoice | null,
    revealed: boolean
  ): void {
    const ctx = slot.signCtx;
    const w = slot.signCanvas.width;
    const h = slot.signCanvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(7, 11, 20, 0.92)';
    ctx.fillRect(4, 4, w - 8, h - 8);

    const accent =
      this.showItems && revealed && choice ? SUB_ITEMS[choice.itemKind].accentHex : '#06B6D4';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(7, 7, w - 14, h - 14);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(10, 10, w - 20, 44);

    ctx.font = 'bold 26px "Chakra Petch", "Noto Sans JP", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`LANE ${slot.laneIndex + 1}`, 24, 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    const itemLabel =
      this.showItems && revealed && choice ? SUB_ITEMS[choice.itemKind].shortLabel : 'QUIZ GATE';
    ctx.fillText(itemLabel, w - 24, 32);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';

    if (!revealed || !choice) {
      ctx.font = 'bold 40px "Chakra Petch", "Noto Sans JP", sans-serif';
      ctx.fillText('問題出題中…', w / 2, h / 2 + 18);
    } else {
      const termName = choice.term.name;
      const fontSize = termName.length <= 7 ? 46 : termName.length <= 12 ? 36 : 29;
      ctx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
      const lines = wrapJapaneseText(ctx, termName, w - 48);
      if (lines.length === 1) {
        ctx.fillText(lines[0], w / 2, h / 2 + 18);
      } else {
        ctx.fillText(lines[0], w / 2, h / 2 - 4);
        ctx.fillText(lines[1], w / 2, h / 2 + 42);
      }
    }

    slot.signTexture.needsUpdate = true;
  }

  public setShowItems(show: boolean): void {
    this.showItems = show;
    for (const row of this.rows) {
      for (const lane of row.lanes) {
        lane.spinner.visible = show && row.active;
        if (!show) {
          lane.padMat.color.set('#06B6D4');
        }
      }
    }
  }

  public setRowQuizDisplay(
    rowIndex: number,
    choices: GeneratedLaneChoice[] | null,
    revealed: boolean
  ): void {
    const row = this.rows[rowIndex];
    if (!row) return;

    row.lanes.forEach((slot, idx) => {
      const choice = choices ? choices[idx] : null;
      if (choice && this.showItems) {
        slot.kind = choice.itemKind;
        for (const k of Object.keys(slot.kindMeshes) as SubItemType[]) {
          slot.kindMeshes[k].visible = k === choice.itemKind;
        }
        const hex = SUB_ITEMS[choice.itemKind].accentHex;
        slot.padMat.color.set(hex);
      } else {
        slot.padMat.color.set('#06B6D4');
      }
      slot.spinner.visible = this.showItems && row.active;
      this.drawSignboard(slot, choice, revealed);
    });
  }

  public setRowVisible(rowIndex: number, active: boolean, autoRespawn = true): void {
    const row = this.rows[rowIndex];
    if (!row) return;
    row.active = active;
    row.respawnTimer = active ? 0 : autoRespawn ? 4.0 : 9999;
    for (const lane of row.lanes) {
      lane.spinner.visible = this.showItems && active;
      lane.group.visible = active || autoRespawn;
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  public spawnMissile(
    ownerId: string,
    targetId: string | null,
    s: number,
    lateral: number,
    baseSpeed: number,
    itemPower = 1.0,
    scaleMult = 1.0,
    homingMult = 1.0
  ): void {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.missileBodyGeo, this.missileMat);
    const tail = new THREE.Mesh(this.missileTailGeo, this.missileGlowMat);
    tail.position.z = -1.6;
    const halo = new THREE.Mesh(this.mineSpikeRingGeo, this.missileGlowMat);
    halo.scale.setScalar(0.65);
    group.add(body, tail, halo);
    group.scale.setScalar(scaleMult * (itemPower >= 1.3 ? 1.3 : 1.08));
    this.scene.add(group);

    this.missiles.push({
      ownerId,
      targetId,
      s,
      lateral,
      speed: Math.max(165, baseSpeed + 62) * (0.95 + 0.14 * itemPower),
      homingStrength: 5.2 * itemPower * homingMult,
      stunDuration: 1.35 * Math.min(1.35, itemPower),
      ttl: 4.8 + itemPower * 0.5,
      mesh: group,
    });
  }

  public spawnLaser(
    ownerId: string,
    s: number,
    lateral: number,
    baseSpeed: number,
    itemPower = 1.0
  ): void {
    const enhanced = itemPower >= 1.3;
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.laserCoreGeo, this.laserCoreMat);
    const outer = new THREE.Mesh(this.laserOuterGeo, this.laserOuterMat);
    group.add(core, outer);

    if (enhanced) {
      const twinL = new THREE.Mesh(this.laserCoreGeo, this.laserOuterMat);
      twinL.position.x = 1.15;
      const twinR = new THREE.Mesh(this.laserCoreGeo, this.laserOuterMat);
      twinR.position.x = -1.15;
      group.add(twinL, twinR);
      group.scale.set(1.5, 1.35, 1.45);
    }

    this.scene.add(group);
    const laser: ActiveLaser = {
      ownerId,
      s,
      lateral,
      speed: Math.max(300, baseSpeed + 200) * (enhanced ? 1.18 : 1.0),
      beamWidth: enhanced ? 4.6 : 3.2,
      stunDuration: 1.4 * Math.min(1.35, itemPower),
      ttl: 1.25,
      mesh: group,
    };
    this.positionLaser(laser);
    this.lasers.push(laser);
  }

  public spawnMine(ownerId: string, s: number, lateral: number, itemPower = 1.0): void {
    const enhanced = itemPower >= 1.3;
    const baseScale = enhanced ? 1.35 : 1.12;

    const group = new THREE.Group();
    const core = new THREE.Mesh(this.mineCoreGeo, this.mineMat);
    const ringA = new THREE.Mesh(this.mineSpikeRingGeo, this.mineMat);
    const ringB = new THREE.Mesh(this.mineOuterRingGeo, this.mineBeaconMat);
    const beacon = new THREE.Mesh(this.mineBeaconGeo, this.mineBeaconMat);
    beacon.position.y = 2.3;
    group.add(core, ringA, ringB, beacon);
    group.scale.setScalar(baseScale);

    this.track.sampleAtS(s, _sample);
    group.position
      .copy(_sample.position)
      .addScaledVector(_sample.right, lateral)
      .addScaledVector(_sample.up, 1.05);
    this.scene.add(group);

    this.mines.push({
      ownerId,
      s,
      lateral,
      hitRadius: enhanced ? 3.5 : 2.9,
      stunDuration: 1.4 * Math.min(1.3, itemPower),
      ttl: 26.0,
      graceTimer: 0.45,
      baseScale,
      mesh: group,
    });
  }

  public spawnBombStrike(
    ownerId: string,
    targetId: string,
    s: number,
    lateral: number,
    itemPower = 1.0
  ): void {
    const enhanced = itemPower >= 1.3;
    const group = new THREE.Group();

    const reticleMesh = new THREE.Mesh(this.bombReticleGeo, this.bombReticleMat);
    reticleMesh.position.y = 0.25;

    const haloMesh = new THREE.Mesh(this.bombHaloGeo, this.bombReticleMat);
    haloMesh.position.y = 2.6;

    const beamMesh = new THREE.Mesh(this.bombBeamGeo, this.bombBeamMat);
    beamMesh.position.y = 42.5;

    const coreBeamMesh = new THREE.Mesh(this.bombCoreBeamGeo, this.bombCoreBeamMat);
    coreBeamMesh.position.y = 42.5;
    coreBeamMesh.visible = false;

    const domeMesh = new THREE.Mesh(this.bombDomeGeo, this.bombDomeMat);
    domeMesh.position.y = 0.8;
    domeMesh.visible = false;

    group.add(reticleMesh, haloMesh, beamMesh, coreBeamMesh, domeMesh);
    this.scene.add(group);

    this.bombStrikes.push({
      ownerId,
      targetId,
      s,
      lateral,
      lockTimer: 1.2,
      blastTimer: 0.85,
      detonated: false,
      damageApplied: false,
      blastRadius: enhanced ? 14.5 : 12.5,
      stunDuration: 1.45 * Math.min(1.3, itemPower),
      group,
      reticleMesh,
      haloMesh,
      beamMesh,
      coreBeamMesh,
      domeMesh,
    });
  }

  public spawnShockwave(
    pos: THREE.Vector3,
    up: THREE.Vector3,
    colorHex: number,
    maxRadius = 12,
    duration = 0.55
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.shockwaveGeo, mat);
    mesh.position.copy(pos).addScaledVector(up, 0.9);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    mesh.quaternion.copy(q);
    this.scene.add(mesh);

    this.shockwaves.push({
      elapsed: 0,
      duration,
      maxRadius,
      mesh,
      material: mat,
    });
  }

  public spawnHitBurst(
    pos: THREE.Vector3,
    up: THREE.Vector3,
    colorHex: number,
    scale = 1.0
  ): void {
    const group = new THREE.Group();
    group.position.copy(pos).addScaledVector(up, 0.8);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    group.quaternion.copy(q);

    const sphereMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const sphereMesh = new THREE.Mesh(this.burstSphereGeo, sphereMat);
    const pillarMesh = new THREE.Mesh(this.burstPillarGeo, pillarMat);
    pillarMesh.position.y = 6.5;
    group.add(sphereMesh, pillarMesh);
    this.scene.add(group);

    this.hitBursts.push({
      elapsed: 0,
      duration: 0.52,
      maxScale: 5.2 * scale,
      group,
      sphereMat,
      pillarMat,
    });

    this.spawnShockwave(pos, up, colorHex, 11 * scale, 0.48);
    this.spawnShockwave(pos, up, 0xffffff, 7 * scale, 0.34);
  }

  public spawnDashRings(
    pos: THREE.Vector3,
    tangent: THREE.Vector3,
    up: THREE.Vector3,
    colorHex: number,
    isSuper = false
  ): void {
    const right = _left.crossVectors(up, tangent).normalize();
    const orthoUp = new THREE.Vector3().crossVectors(tangent, right).normalize();
    _m4.makeBasis(right, orthoUp, tangent);
    const basisQuat = new THREE.Quaternion().setFromRotationMatrix(_m4);

    const count = isSuper ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? colorHex : 0xffffff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.dashRingGeo, mat);
      mesh.position.copy(pos).addScaledVector(up, 0.85).addScaledVector(tangent, i * 2.2);
      mesh.quaternion.copy(basisQuat);
      this.scene.add(mesh);

      this.dashRings.push({
        elapsed: -i * 0.04,
        duration: isSuper ? 0.52 : 0.40,
        maxRadius: (isSuper ? 6.5 : 4.8) - i * 0.7,
        mesh,
        material: mat,
      });
    }
    this.spawnShockwave(pos, up, colorHex, isSuper ? 16 : 11, 0.45);
  }

  public update(dt: number, elapsed: number): void {
    for (const row of this.rows) {
      if (!row.active) {
        if (row.respawnTimer < 500) {
          row.respawnTimer -= dt;
          if (row.respawnTimer <= 0) {
            this.setRowVisible(row.rowIndex, true);
          }
        }
      } else {
        for (const lane of row.lanes) {
          lane.spinner.rotation.y += dt * 2.1;
          lane.spinner.position.y = 1.85 + Math.sin(elapsed * 2.5 + lane.basePhase) * 0.22;
        }
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.ttl -= dt;
      if (m.graceTimer > 0) m.graceTimer -= dt;
      m.mesh.rotation.y += dt * 4.2;
      const pulse = m.baseScale * (0.94 + Math.sin(elapsed * 10) * 0.16);
      m.mesh.scale.setScalar(pulse);

      if (m.ttl <= 0) {
        this.scene.remove(m.mesh);
        this.mines.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.elapsed += dt;
      const t = Math.min(1, sw.elapsed / sw.duration);
      const radius = 0.8 + sw.maxRadius * (1 - Math.pow(1 - t, 2.2));
      sw.mesh.scale.set(radius, 1, radius);
      sw.material.opacity = (1 - t) * 0.88;
      if (t >= 1) {
        this.scene.remove(sw.mesh);
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.hitBursts.length - 1; i >= 0; i--) {
      const hb = this.hitBursts[i];
      hb.elapsed += dt;
      const t = Math.min(1, hb.elapsed / hb.duration);
      const s = 0.7 + hb.maxScale * (1 - Math.pow(1 - t, 2.6));
      hb.group.scale.set(s * 0.75, 0.7 + s * 0.55, s * 0.75);
      hb.sphereMat.opacity = (1 - t) * 0.85;
      hb.pillarMat.opacity = (1 - t) * 0.8;
      if (t >= 1) {
        this.scene.remove(hb.group);
        hb.sphereMat.dispose();
        hb.pillarMat.dispose();
        this.hitBursts.splice(i, 1);
      }
    }

    for (let i = this.dashRings.length - 1; i >= 0; i--) {
      const dr = this.dashRings[i];
      dr.elapsed += dt;
      if (dr.elapsed < 0) {
        dr.mesh.visible = false;
        continue;
      }
      dr.mesh.visible = true;
      const t = Math.min(1, dr.elapsed / dr.duration);
      const r = 1.1 + dr.maxRadius * (1 - Math.pow(1 - t, 2.0));
      dr.mesh.scale.setScalar(r);
      dr.material.opacity = (1 - t) * 0.9;
      if (t >= 1) {
        this.scene.remove(dr.mesh);
        dr.material.dispose();
        this.dashRings.splice(i, 1);
      }
    }
  }

  public positionMissile(m: ActiveMissile): void {
    this.track.sampleAtS(m.s, _sample);
    m.mesh.position
      .copy(_sample.position)
      .addScaledVector(_sample.right, m.lateral)
      .addScaledVector(_sample.up, 1.0);
    _left.copy(_sample.right).negate();
    _m4.makeBasis(_left, _sample.up, _sample.tangent);
    m.mesh.quaternion.setFromRotationMatrix(_m4);
  }

  public positionLaser(l: ActiveLaser): void {
    this.track.sampleAtS(l.s, _sample);
    l.mesh.position
      .copy(_sample.position)
      .addScaledVector(_sample.right, l.lateral)
      .addScaledVector(_sample.up, 1.05);
    _left.copy(_sample.right).negate();
    _m4.makeBasis(_left, _sample.up, _sample.tangent);
    l.mesh.quaternion.setFromRotationMatrix(_m4);
  }

  public positionBombStrike(b: ActiveBombStrike, targetPos: THREE.Vector3, targetUp: THREE.Vector3): void {
    b.group.position.copy(targetPos);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetUp);
    b.group.quaternion.copy(q);

    if (!b.detonated) {
      const pulse = 0.85 + Math.sin(b.lockTimer * 22) * 0.3;
      b.reticleMesh.scale.setScalar(pulse * 1.5);
      b.reticleMesh.rotation.z += 0.16;
      b.haloMesh.scale.setScalar(0.95 + (1 - pulse) * 0.45);
      b.beamMesh.scale.set(0.42, 1, 0.42);
      b.coreBeamMesh.visible = false;
    } else {
      const p = 1 - Math.max(0, b.blastTimer / 0.85);
      const domeRadius = b.blastRadius * Math.sin(Math.min(1, p * 1.35) * (Math.PI / 2));
      b.domeMesh.visible = true;
      b.domeMesh.scale.setScalar(Math.max(0.5, domeRadius));
      b.reticleMesh.visible = false;
      b.haloMesh.visible = false;
      b.coreBeamMesh.visible = true;
      const beamRadius = 2.2 * (1 - p * 0.55);
      b.beamMesh.scale.set(beamRadius, 1, beamRadius);
      b.coreBeamMesh.scale.set(beamRadius * 1.35, 1, beamRadius * 1.35);
    }
  }

  public removeMissile(index: number): void {
    const m = this.missiles[index];
    if (m) {
      this.scene.remove(m.mesh);
      this.missiles.splice(index, 1);
    }
  }

  public removeLaser(index: number): void {
    const l = this.lasers[index];
    if (l) {
      this.scene.remove(l.mesh);
      this.lasers.splice(index, 1);
    }
  }

  public removeMine(index: number): void {
    const m = this.mines[index];
    if (m) {
      this.scene.remove(m.mesh);
      this.mines.splice(index, 1);
    }
  }

  public removeBombStrike(index: number): void {
    const b = this.bombStrikes[index];
    if (b) {
      this.scene.remove(b.group);
      this.bombStrikes.splice(index, 1);
    }
  }

  public resetDynamicHazards(): void {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const l of this.lasers) this.scene.remove(l.mesh);
    for (const mine of this.mines) this.scene.remove(mine.mesh);
    for (const b of this.bombStrikes) this.scene.remove(b.group);
    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.material.dispose();
    }
    for (const hb of this.hitBursts) {
      this.scene.remove(hb.group);
      hb.sphereMat.dispose();
      hb.pillarMat.dispose();
    }
    for (const dr of this.dashRings) {
      this.scene.remove(dr.mesh);
      dr.material.dispose();
    }
    this.missiles = [];
    this.lasers = [];
    this.mines = [];
    this.bombStrikes = [];
    this.shockwaves = [];
    this.hitBursts = [];
    this.dashRings = [];
    for (const row of this.rows) {
      this.setRowVisible(row.rowIndex, true, true);
      this.setRowQuizDisplay(row.rowIndex, null, false);
    }
  }

  public dispose(): void {
    this.resetDynamicHazards();
    for (const row of this.rows) {
      for (const lane of row.lanes) {
        this.scene.remove(lane.group);
      }
    }
    this.rows = [];
    this.textures.forEach((t) => t.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
