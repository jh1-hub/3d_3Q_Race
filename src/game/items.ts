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

export interface ActiveMine {
  ownerId: string;
  s: number;
  lateral: number;
  stunDuration: number;
  ttl: number;
  graceTimer: number;
  mesh: THREE.Group;
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
  public mines: ActiveMine[] = [];

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  private missileBodyGeo: THREE.BufferGeometry;
  private missileMat: THREE.MeshStandardMaterial;
  private mineCoreGeo: THREE.BufferGeometry;
  private mineRingGeo: THREE.BufferGeometry;
  private mineMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, track: TrackData, maxAnisotropy = 4) {
    this.scene = scene;
    this.track = track;

    // Distinct 3D pickup geometries & materials for the 5 items (oversized so players clearly see & hit them)
    const boostCoreGeo = this.trackGeo(new THREE.ConeGeometry(0.82, 1.65, 6));
    boostCoreGeo.rotateX(Math.PI / 2);
    const boostRingGeo = this.trackGeo(new THREE.TorusGeometry(1.12, 0.12, 8, 22));
    const boostMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.3,
        metalness: 0.4,
        roughness: 0.2,
      })
    );

    const missilePickGeo = this.trackGeo(new THREE.ConeGeometry(0.62, 1.9, 10));
    missilePickGeo.rotateX(Math.PI / 2);
    const missilePickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.05, 0.1, 8, 20));
    const missilePickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf87171,
        emissive: 0xef4444,
        emissiveIntensity: 2.2,
        metalness: 0.4,
        roughness: 0.2,
      })
    );

    const shieldGeo = this.trackGeo(new THREE.IcosahedronGeometry(0.96, 1));
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
        emissiveIntensity: 2.0,
        metalness: 0.3,
        roughness: 0.2,
      })
    );

    const minePickCoreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.76, 0));
    const minePickRingGeo = this.trackGeo(new THREE.TorusGeometry(1.12, 0.11, 8, 20));
    minePickRingGeo.rotateX(Math.PI / 2);
    const minePickMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0xa855f7,
        emissiveIntensity: 2.2,
        metalness: 0.35,
        roughness: 0.2,
      })
    );

    const empSphereGeo = this.trackGeo(new THREE.SphereGeometry(0.54, 12, 12));
    const empRingGeoA = this.trackGeo(new THREE.TorusGeometry(1.04, 0.08, 8, 22));
    const empRingGeoB = this.trackGeo(new THREE.TorusGeometry(1.04, 0.08, 8, 22));
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

    // Wide holographic floor gate pad + 32m approach runway guide for each of the 4 lanes
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
    this.missileBodyGeo = this.trackGeo(new THREE.ConeGeometry(0.42, 1.85, 10));
    this.missileBodyGeo.rotateX(Math.PI / 2);
    this.missileMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xff2a2a,
        emissiveIntensity: 2.6,
        roughness: 0.2,
      })
    );

    this.mineCoreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.75, 0));
    this.mineRingGeo = this.trackGeo(new THREE.TorusGeometry(1.1, 0.1, 8, 20));
    this.mineRingGeo.rotateX(Math.PI / 2);
    this.mineMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0xc084fc,
        emissiveIntensity: 2.2,
        roughness: 0.25,
      })
    );

    const allKinds: SubItemType[] = ['boost', 'missile', 'shield', 'mine', 'emp'];

    QUIZ_ROW_S.forEach((rowS, rowIndex) => {
      this.track.sampleAtS(rowS, _sample);
      const rowLeft = _sample.right.clone().negate();
      const rowBasis = new THREE.Matrix4().makeBasis(rowLeft, _sample.up, _sample.tangent);

      const lanes: QuizLaneSlot[] = [];

      LANE_LATERALS.forEach((lat, laneIdx) => {
        const group = new THREE.Group();
        const spinner = new THREE.Group();
        spinner.position.y = 1.95;
        spinner.scale.setScalar(2.05); // Large & unmistakable 3D pickup
        group.add(spinner);

        const kindMeshes = {} as Record<SubItemType, THREE.Group>;
        for (const k of allKinds) {
          const subGroup = new THREE.Group();
          if (k === 'boost') {
            subGroup.add(new THREE.Mesh(boostCoreGeo, boostMat));
            subGroup.add(new THREE.Mesh(boostRingGeo, boostMat));
          } else if (k === 'missile') {
            subGroup.add(new THREE.Mesh(missilePickGeo, missilePickMat));
            subGroup.add(new THREE.Mesh(missilePickRingGeo, missilePickMat));
          } else if (k === 'shield') {
            subGroup.add(new THREE.Mesh(shieldCoreGeo, shieldMat));
            subGroup.add(new THREE.Mesh(shieldGeo, shieldWireMat));
          } else if (k === 'mine') {
            subGroup.add(new THREE.Mesh(minePickCoreGeo, minePickMat));
            subGroup.add(new THREE.Mesh(minePickRingGeo, minePickMat));
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
        // Rotate 180 deg around Y so front face points toward -tangent (approaching racer) and text reads L->R
        signMesh.rotation.y = Math.PI;
        group.add(signMesh);

        // Sleek left/right gate struts supporting signboard
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

    // Dark obsidian holographic card backing
    ctx.fillStyle = 'rgba(7, 11, 20, 0.92)';
    ctx.fillRect(4, 4, w - 8, h - 8);

    const accent = revealed && choice ? SUB_ITEMS[choice.itemKind].accentHex : '#06B6D4';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(7, 7, w - 14, h - 14);

    // Top bar: Lane number + Item type
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
      revealed && choice ? SUB_ITEMS[choice.itemKind].shortLabel : 'QUIZ GATE';
    ctx.fillText(itemLabel, w - 24, 32);

    // Center term text
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

  public setRowQuizDisplay(
    rowIndex: number,
    choices: GeneratedLaneChoice[] | null,
    revealed: boolean
  ): void {
    const row = this.rows[rowIndex];
    if (!row) return;

    row.lanes.forEach((slot, idx) => {
      const choice = choices ? choices[idx] : null;
      if (choice) {
        slot.kind = choice.itemKind;
        for (const k of Object.keys(slot.kindMeshes) as SubItemType[]) {
          slot.kindMeshes[k].visible = k === choice.itemKind;
        }
        const hex = SUB_ITEMS[choice.itemKind].accentHex;
        slot.padMat.color.set(hex);
      } else {
        slot.padMat.color.set('#06B6D4');
      }
      this.drawSignboard(slot, choice, revealed);
    });
  }

  public setRowVisible(rowIndex: number, active: boolean): void {
    const row = this.rows[rowIndex];
    if (!row) return;
    row.active = active;
    row.respawnTimer = active ? 0 : 4.0;
    for (const lane of row.lanes) {
      lane.spinner.visible = active;
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
    itemPower = 1.0
  ): void {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.missileBodyGeo, this.missileMat);
    const halo = new THREE.Mesh(this.mineRingGeo, this.missileMat);
    halo.scale.setScalar(0.55);
    group.add(body);
    group.add(halo);
    this.scene.add(group);

    this.missiles.push({
      ownerId,
      targetId,
      s,
      lateral,
      speed: Math.max(155, baseSpeed + 55) * (0.92 + 0.14 * itemPower),
      homingStrength: 5.2 * itemPower,
      stunDuration: 1.45 * itemPower,
      ttl: 6.0 + itemPower * 0.7,
      mesh: group,
    });
  }

  public spawnMine(ownerId: string, s: number, lateral: number, itemPower = 1.0): void {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.mineCoreGeo, this.mineMat);
    const ring = new THREE.Mesh(this.mineRingGeo, this.mineMat);
    group.add(core);
    group.add(ring);

    this.track.sampleAtS(s, _sample);
    group.position
      .copy(_sample.position)
      .addScaledVector(_sample.right, lateral)
      .addScaledVector(_sample.up, 0.85);
    this.scene.add(group);

    this.mines.push({
      ownerId,
      s,
      lateral,
      stunDuration: 1.45 * itemPower,
      ttl: 24.0 * Math.max(0.9, itemPower),
      graceTimer: 0.45,
      mesh: group,
    });
  }

  public update(dt: number, elapsed: number): void {
    for (const row of this.rows) {
      if (!row.active) {
        row.respawnTimer -= dt;
        if (row.respawnTimer <= 0) {
          this.setRowVisible(row.rowIndex, true);
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
      m.mesh.rotation.y += dt * 3.5;
      const pulse = 0.92 + Math.sin(elapsed * 8) * 0.14;
      m.mesh.scale.setScalar(pulse);

      if (m.ttl <= 0) {
        this.scene.remove(m.mesh);
        this.mines.splice(i, 1);
      }
    }
  }

  public positionMissile(m: ActiveMissile): void {
    this.track.sampleAtS(m.s, _sample);
    m.mesh.position
      .copy(_sample.position)
      .addScaledVector(_sample.right, m.lateral)
      .addScaledVector(_sample.up, 0.95);
    _left.copy(_sample.right).negate();
    _m4.makeBasis(_left, _sample.up, _sample.tangent);
    m.mesh.quaternion.setFromRotationMatrix(_m4);
  }

  public removeMissile(index: number): void {
    const m = this.missiles[index];
    if (m) {
      this.scene.remove(m.mesh);
      this.missiles.splice(index, 1);
    }
  }

  public removeMine(index: number): void {
    const m = this.mines[index];
    if (m) {
      this.scene.remove(m.mesh);
      this.mines.splice(index, 1);
    }
  }

  public resetDynamicHazards(): void {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const mine of this.mines) this.scene.remove(mine.mesh);
    this.missiles = [];
    this.mines = [];
    for (const row of this.rows) {
      this.setRowVisible(row.rowIndex, true);
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
