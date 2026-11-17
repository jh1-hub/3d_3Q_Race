import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RaceAudioEngine } from './audio';
import { createHypercarMesh, HypercarModel } from './hypercar';
import { LANE_LATERALS, TrackItemSystem } from './items';
import { createProceduralTextures, ProceduralTextures } from './textures';
import { createTrack, TrackData, TrackSample } from './track';
import {
  ActiveQuizTelemetry,
  ChassisStyle,
  CourseId,
  COURSES,
  CourseSpec,
  EarnedRaceCard,
  GamePhase,
  MACHINES,
  MachineId,
  MachineSpec,
  MinimapMarker,
  QuizFeedbackTelemetry,
  RacerStanding,
  RaceTelemetry,
  SpeedClass,
  SUB_ITEMS,
  SubItemType,
} from './types';
import {
  GeneratedQuiz,
  generateQuizChallenge,
  recordCollectedCard,
} from '../utils/cardCollection';

interface RacerState {
  id: string;
  name: string;
  isPlayer: boolean;
  accentHex: string;
  model: HypercarModel;
  pos: THREE.Vector3;
  headingQuat: THREE.Quaternion;
  yawAngle: number; // local yaw relative to track tangent (radians)
  speed: number; // m/s (visual km/h = speed * 3.6)
  s: number; // 0..1 track spline progress
  prevS: number;
  lateral: number; // signed distance from centerline
  lateralVel: number;
  lap: number; // 1..totalLaps
  finished: boolean;
  finishTimeMs: number;
  lapStartMs: number;
  bestLapMs: number | null;
  sectorFlags: number; // bitmask 1 | 2 | 4
  rollVisual: number;
  pitchVisual: number;
  hoverPhase: number;
  accelSurgeTimer: number;
  superTurboTimer: number;
  heldItem: SubItemType | null;
  heldItemHoldTime: number;
  shieldTimer: number;
  hitSpinTimer: number;
  itemPower: number;
  aiItemCooldown: number;
  aiTargetOffset: number;
  aiBaseSpeedFactor: number;
}

export interface TouchInputState {
  brake: boolean;
  steerAnalog: number; // -1 (right) .. +1 (left)
}

const BEST_LAP_STORAGE_KEY = 'hyperion_gp_best_lap_ms';
const TOTAL_LAPS = 3;

// Pre-allocated math scratchpads (Zero GC in render loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vD = new THREE.Vector3();
const _vLeft = new THREE.Vector3();
const _vFwd = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _sample: TrackSample = {
  s: 0,
  arcLength: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};
const _sampleLook: TrackSample = {
  s: 0,
  arcLength: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};
const _sampleRear: TrackSample = {
  s: 0,
  arcLength: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};
const _sampleFront: TrackSample = {
  s: 0,
  arcLength: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  bankAngle: 0,
};

function detectSoftwareWebGL(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class RaceEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envMap: THREE.Texture;
  private textures: ProceduralTextures;
  private track: TrackData;
  private itemSystem: TrackItemSystem;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private dustPoints: THREE.Points;
  private dustGeo: THREE.BufferGeometry;
  private dustMat: THREE.PointsMaterial;
  private audio = new RaceAudioEngine();
  private maxAnisotropy: number;

  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private phase: GamePhase = 'menu';
  private courseId: CourseId = 'orbital';
  private machineId: MachineId = 'valkyrie';
  private speedClass: SpeedClass = 'vector';

  private racers: RacerState[] = [];
  private playerRacer!: RacerState;

  private keys: Record<string, boolean> = {};
  private touchInput: TouchInputState = {
    brake: false,
    steerAnalog: 0,
  };

  private countdownTimer = 0;
  private lastBeepStep = 4;
  private raceElapsedMs = 0;
  private totalElapsedSec = 0;
  private eventNotice: string | null = null;
  private eventNoticeTimer = 0;
  private allTimeBestLapMs: number | null = null;
  private isNewRecord = false;
  private lastWallSoundTime = 0;
  private menuOrbitAngle = 0.6;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camFov = 64;
  private camInitialized = false;
  private hudEmitAccum = 0;

  private nextQuizRowIndex = 0;
  private activeQuiz: GeneratedQuiz | null = null;
  private quizLanesRevealed = false;
  private usedTermIds = new Set<number>();
  private earnedCards: EarnedRaceCard[] = [];
  private quizAttempts = 0;
  private quizCorrectCount = 0;
  private quizFeedback: QuizFeedbackTelemetry | null = null;
  private quizFeedbackTimer = 0;
  private assistedLaneIndex: number | null = null;

  private onTelemetry: (telemetry: RaceTelemetry) => void;
  private onContextLostCb: (lost: boolean) => void;
  private onCollectionChange?: () => void;

  constructor(
    container: HTMLElement,
    onTelemetry: (telemetry: RaceTelemetry) => void,
    onContextLost: (lost: boolean) => void,
    onCollectionChange?: () => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onContextLostCb = onContextLost;
    this.onCollectionChange = onCollectionChange;

    this.loadBestLapForCourse(this.courseId);

    this.isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    const courseSpec = this.getCourseSpec();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(courseSpec.skyHex);
    scene.fog = new THREE.FogExp2(courseSpec.skyHex, courseSpec.fogDensity);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMap;
    pmrem.dispose();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(64, width / height, 0.25, 2600);

    // 3-Point Warm/Cool Studio + Horizon Lighting Rig
    const hemi = new THREE.HemisphereLight(courseSpec.hemiSky, courseSpec.hemiGround, 0.95);
    scene.add(hemi);
    this.hemiLight = hemi;

    const keyLight = new THREE.DirectionalLight(courseSpec.keyColor, 2.3);
    keyLight.position.set(45, 75, 40);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 180;
    const d = 32;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);
    this.keyLight = keyLight;

    const rimLight = new THREE.DirectionalLight(courseSpec.rimColor, 1.35);
    rimLight.position.set(-55, 35, -60);
    scene.add(rimLight);
    this.rimLight = rimLight;

    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(this.maxAnisotropy);
    this.track = createTrack(this.courseId, this.textures, this.isSoftwareGl);
    scene.add(this.track.group);
    this.itemSystem = new TrackItemSystem(scene, this.track, this.maxAnisotropy);

    // Speed-dust starfield particle box around track
    const dustCount = 340;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 90;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 35;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: this.textures.particleGlow,
      color: 0x7dd3fc,
      size: 0.75,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    this.dustPoints.frustumCulled = false;
    scene.add(this.dustPoints);

    this.buildRacers();
    this.resetGridPositions();

    if (!this.isSoftwareGl) {
      renderer.compile(scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    this.emitTelemetry();
    this.clock.start();
    this.tick();
  }

  public getMinimapPoints(): { x: number; y: number }[] {
    return this.track.minimapPoints;
  }

  private getCourseSpec(): CourseSpec {
    return COURSES.find((c) => c.id === this.courseId) ?? COURSES[0];
  }

  private getBestLapKey(courseId: CourseId): string {
    return courseId === 'orbital'
      ? BEST_LAP_STORAGE_KEY
      : `${BEST_LAP_STORAGE_KEY}_${courseId}`;
  }

  private loadBestLapForCourse(courseId: CourseId): void {
    this.allTimeBestLapMs = null;
    try {
      const saved = localStorage.getItem(this.getBestLapKey(courseId));
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0) this.allTimeBestLapMs = parsed;
      }
    } catch {
      // Ignore storage failures
    }
  }

  public setCourse(courseId: CourseId): void {
    if (this.courseId === courseId) return;
    this.courseId = courseId;
    this.loadBestLapForCourse(courseId);

    const spec = this.getCourseSpec();
    this.scene.background = new THREE.Color(spec.skyHex);
    this.scene.fog = new THREE.FogExp2(spec.skyHex, spec.fogDensity);
    this.hemiLight.color.setHex(spec.hemiSky);
    this.hemiLight.groundColor.setHex(spec.hemiGround);
    this.keyLight.color.setHex(spec.keyColor);
    this.rimLight.color.setHex(spec.rimColor);
    this.dustMat.color.setHex(spec.dustColor);

    this.itemSystem.dispose();
    this.scene.remove(this.track.group);
    this.track.dispose();

    this.track = createTrack(this.courseId, this.textures, this.isSoftwareGl);
    this.scene.add(this.track.group);
    this.itemSystem = new TrackItemSystem(this.scene, this.track, this.maxAnisotropy);

    this.camInitialized = false;
    this.resetGridPositions();
    this.emitTelemetry();
  }

  public setMachine(id: MachineId): void {
    if (this.machineId === id) return;
    this.machineId = id;
    if (this.phase === 'menu') {
      this.buildRacers();
      this.resetGridPositions();
      this.emitTelemetry();
    }
  }

  public setSpeedClass(cls: SpeedClass): void {
    this.speedClass = cls;
    if (this.phase === 'menu') {
      this.emitTelemetry();
    }
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setTouchInput(partial: Partial<TouchInputState>): void {
    Object.assign(this.touchInput, partial);
  }

  public usePlayerSubItem(): void {
    if (this.phase !== 'racing' || this.playerRacer.finished) return;
    this.activateSubItem(this.playerRacer);
  }

  public selectQuizLane(laneIndex: number): void {
    if (this.phase !== 'racing' || this.playerRacer.finished || !this.activeQuiz) return;
    this.assistedLaneIndex = THREE.MathUtils.clamp(laneIndex, 0, LANE_LATERALS.length - 1);
  }

  public startRace(): void {
    this.audio.init();
    this.itemSystem.resetDynamicHazards();
    this.buildRacers();
    this.resetGridPositions();
    this.phase = 'countdown';
    this.countdownTimer = 3.2;
    this.lastBeepStep = 4;
    this.raceElapsedMs = 0;
    this.eventNotice = null;
    this.eventNoticeTimer = 0;
    this.isNewRecord = false;
    this.camInitialized = false;

    this.nextQuizRowIndex = 0;
    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.usedTermIds.clear();
    this.earnedCards = [];
    this.quizAttempts = 0;
    this.quizCorrectCount = 0;
    this.quizFeedback = null;
    this.quizFeedbackTimer = 0;
    this.assistedLaneIndex = null;

    this.emitTelemetry();
  }

  public togglePause(): void {
    if (this.phase === 'racing') {
      this.phase = 'paused';
      this.audio.updateEngine(0, false, false);
      this.emitTelemetry();
    } else if (this.phase === 'paused') {
      this.phase = 'racing';
      this.emitTelemetry();
    }
  }

  public returnToMenu(): void {
    this.phase = 'menu';
    this.audio.updateEngine(0, false, false);
    this.itemSystem.resetDynamicHazards();
    this.buildRacers();
    this.resetGridPositions();
    this.camInitialized = false;
    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.quizFeedback = null;
    this.quizFeedbackTimer = 0;
    this.assistedLaneIndex = null;
    this.emitTelemetry();
  }

  private getSelectedSpec(): MachineSpec {
    return MACHINES.find((m) => m.id === this.machineId) ?? MACHINES[0];
  }

  private buildRacers(): void {
    for (const r of this.racers) {
      this.scene.remove(r.model.root);
      r.model.dispose();
    }
    this.racers = [];

    const playerSpec = this.getSelectedSpec();
    const castShadow = !this.isSoftwareGl;

    const rivalConfigs: {
      id: string;
      name: string;
      chassisStyle: ChassisStyle;
      body: number;
      secondary: number;
      accent: number;
      hex: string;
      speedFactor: number;
      offset: number;
      itemPower: number;
    }[] = [
      {
        id: 'ai-1',
        name: 'SOLARIS-7',
        chassisStyle: 'tempest',
        body: 0x312e81,
        secondary: 0xf59e0b,
        accent: 0xfbbf24,
        hex: '#F59E0B',
        speedFactor: 0.96,
        offset: -4.2,
        itemPower: 1.0,
      },
      {
        id: 'ai-2',
        name: 'CRIMSON-IX',
        chassisStyle: 'phantom',
        body: 0x1e293b,
        secondary: 0xef4444,
        accent: 0xf43f5e,
        hex: '#F43F5E',
        speedFactor: 0.92,
        offset: 4.2,
        itemPower: 1.05,
      },
      {
        id: 'ai-3',
        name: 'AERO-TITAN',
        chassisStyle: 'valkyrie',
        body: 0x064e3b,
        secondary: 0xd1fae5,
        accent: 0x10b981,
        hex: '#10B981',
        speedFactor: 0.88,
        offset: -1.8,
        itemPower: 0.95,
      },
    ];

    const playerModel = createHypercarMesh(
      playerSpec.bodyColor,
      playerSpec.secondaryColor,
      playerSpec.accentColor,
      this.textures.contactShadow,
      castShadow,
      playerSpec.chassisStyle
    );
    this.scene.add(playerModel.root);

    const player: RacerState = {
      id: 'player',
      name: playerSpec.name,
      isPlayer: true,
      accentHex: playerSpec.accentHex,
      model: playerModel,
      pos: new THREE.Vector3(),
      headingQuat: new THREE.Quaternion(),
      yawAngle: 0,
      speed: 0,
      s: 0.985,
      prevS: 0.985,
      lateral: 2.8,
      lateralVel: 0,
      lap: 1,
      finished: false,
      finishTimeMs: 0,
      lapStartMs: 0,
      bestLapMs: null,
      sectorFlags: 0,
      rollVisual: 0,
      pitchVisual: 0,
      hoverPhase: 0,
      accelSurgeTimer: 0,
      superTurboTimer: 0,
      heldItem: null,
      heldItemHoldTime: 0,
      shieldTimer: 0,
      hitSpinTimer: 0,
      itemPower: playerSpec.itemPower,
      aiItemCooldown: 2,
      aiTargetOffset: 0,
      aiBaseSpeedFactor: 1,
    };
    this.racers.push(player);
    this.playerRacer = player;

    rivalConfigs.forEach((cfg, idx) => {
      const model = createHypercarMesh(
        cfg.body,
        cfg.secondary,
        cfg.accent,
        this.textures.contactShadow,
        castShadow,
        cfg.chassisStyle
      );
      this.scene.add(model.root);
      this.racers.push({
        id: cfg.id,
        name: cfg.name,
        isPlayer: false,
        accentHex: cfg.hex,
        model,
        pos: new THREE.Vector3(),
        headingQuat: new THREE.Quaternion(),
        yawAngle: 0,
        speed: 0,
        s: 0.997 - idx * 0.0015,
        prevS: 0.997 - idx * 0.0015,
        lateral: cfg.offset,
        lateralVel: 0,
        lap: 1,
        finished: false,
        finishTimeMs: 0,
        lapStartMs: 0,
        bestLapMs: null,
        sectorFlags: 0,
        rollVisual: 0,
        pitchVisual: 0,
        hoverPhase: idx * 1.4,
        accelSurgeTimer: 0,
        superTurboTimer: 0,
        heldItem: null,
        heldItemHoldTime: 0,
        shieldTimer: 0,
        hitSpinTimer: 0,
        itemPower: cfg.itemPower,
        aiItemCooldown: 2.5 + idx * 0.8,
        aiTargetOffset: cfg.offset,
        aiBaseSpeedFactor: cfg.speedFactor,
      });
    });
  }

  private resetGridPositions(): void {
    const gridSlots = [
      { s: 0.9925, lat: 3.2 },  // Player starts P4
      { s: 0.997, lat: -3.2 },  // AI 1
      { s: 0.9955, lat: 3.2 },  // AI 2
      { s: 0.994, lat: -3.2 },  // AI 3
    ];

    this.racers.forEach((r, idx) => {
      const slot = gridSlots[idx] ?? { s: 0.992, lat: 0 };
      r.s = slot.s;
      r.prevS = slot.s;
      r.lateral = slot.lat;
      r.lateralVel = 0;
      r.yawAngle = 0;
      r.speed = 0;
      r.lap = 1;
      r.finished = false;
      r.finishTimeMs = 0;
      r.lapStartMs = 0;
      r.bestLapMs = null;
      r.sectorFlags = 0;
      r.accelSurgeTimer = 0;
      r.superTurboTimer = 0;
      r.heldItem = null;
      r.heldItemHoldTime = 0;
      r.shieldTimer = 0;
      r.hitSpinTimer = 0;
      r.rollVisual = 0;
      r.pitchVisual = 0;

      this.computeRoadPose(r.s, r.lateral, 0, r.pos, r.headingQuat);

      this.syncRacerVisual(r, 0, false);
    });
  }

  private computeRoadPose(
    s: number,
    lateral: number,
    yawAngle: number,
    outPos: THREE.Vector3,
    outQuat: THREE.Quaternion
  ): void {
    const halfWheelbaseS = 2.0 / this.track.totalLength;
    this.track.sampleAtS(s, _sample);
    this.track.sampleAtS(s - halfWheelbaseS, _sampleRear);
    this.track.sampleAtS(s + halfWheelbaseS, _sampleFront);

    outPos.copy(_sample.position).addScaledVector(_sample.right, lateral);

    // Chord vector from rear axle to front axle at the racer's lateral lane so chassis hugs hills & dips naturally
    _vC.copy(_sampleRear.position).addScaledVector(_sampleRear.right, lateral);
    _vD.copy(_sampleFront.position).addScaledVector(_sampleFront.right, lateral);
    _vFwd.subVectors(_vD, _vC).normalize();

    // Right-handed orthonormal basis (X = left, Y = up, Z = forward -> det = +1)
    _vUp.copy(_sample.up);
    _vLeft.crossVectors(_vUp, _vFwd).normalize();
    _vUp.crossVectors(_vFwd, _vLeft).normalize();

    _m4.makeBasis(_vLeft, _vUp, _vFwd);
    _qA.setFromRotationMatrix(_m4);
    _qB.setFromAxisAngle(_vUp, yawAngle);
    outQuat.multiplyQuaternions(_qB, _qA);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    if ((e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      this.usePlayerSubItem();
    }
    if (!e.repeat && this.activeQuiz && this.quizLanesRevealed) {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.selectQuizLane(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.selectQuizLane(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.selectQuizLane(2);
      else if (e.code === 'Digit4' || e.code === 'Numpad4') this.selectQuizLane(3);
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      if (this.phase === 'racing' || this.phase === 'paused') {
        this.togglePause();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.onContextLostCb(true);
  };

  private handleContextRestored = (): void => {
    this.onContextLostCb(false);
  };

  private tick = (): void => {
    if (this.disposed) return;
    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);

    this.step(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private step(dt: number): void {
    this.totalElapsedSec += dt;
    this.itemSystem.update(dt, this.totalElapsedSec);

    if (this.eventNoticeTimer > 0) {
      this.eventNoticeTimer -= dt;
      if (this.eventNoticeTimer <= 0) {
        this.eventNotice = null;
      }
    }

    if (this.quizFeedbackTimer > 0) {
      this.quizFeedbackTimer -= dt;
      if (this.quizFeedbackTimer <= 0) {
        this.quizFeedback = null;
      }
    }

    if (this.phase === 'menu') {
      this.menuOrbitAngle += dt * 0.28;
      this.racers.forEach((r) => {
        r.hoverPhase += dt * 2.6;
        this.syncRacerVisual(r, dt, false);
      });
      this.updateMenuCamera(dt);
      this.audio.updateEngine(0, false, false);
      return;
    }

    if (this.phase === 'paused') {
      return;
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const stepVal = Math.ceil(this.countdownTimer);
      if (stepVal < this.lastBeepStep && stepVal >= 1) {
        this.lastBeepStep = stepVal;
        this.audio.playCountdownBeep(false);
        this.emitTelemetry();
      }
      if (this.countdownTimer <= 0) {
        this.phase = 'racing';
        this.audio.playCountdownBeep(true);
        this.emitTelemetry();
      }
      this.racers.forEach((r) => {
        r.hoverPhase += dt * 3.0;
        this.syncRacerVisual(r, dt, false);
      });
      this.updateRaceCamera(dt, false);
      return;
    }

    // Active Racing or Finished (auto-pilot cooldown)
    if (this.phase === 'racing') {
      this.raceElapsedMs += dt * 1000;
      this.updateQuizSchedule();
    }

    const classMultiplier = this.speedClass === 'hyper' ? 1.16 : 1.0;
    const spec = this.getSelectedSpec();

    let playerAccelerating = false;

    for (const r of this.racers) {
      r.hoverPhase += dt * (3.2 + r.speed * 0.04);
      if (r.accelSurgeTimer > 0) {
        r.accelSurgeTimer = Math.max(0, r.accelSurgeTimer - dt);
      }
      if (r.superTurboTimer > 0) {
        r.superTurboTimer = Math.max(0, r.superTurboTimer - dt);
      }
      if (r.shieldTimer > 0) {
        r.shieldTimer = Math.max(0, r.shieldTimer - dt);
      }
      if (r.hitSpinTimer > 0) {
        r.hitSpinTimer = Math.max(0, r.hitSpinTimer - dt);
      }
      if (this.phase === 'racing' && !r.finished && r.heldItem !== null) {
        r.heldItemHoldTime += dt;
        if (r.heldItemHoldTime >= 8.0) {
          const expiredName = SUB_ITEMS[r.heldItem].name;
          this.activateSubItem(r);
          if (r.isPlayer) {
            this.pushEventNotice(`自動使用: ${expiredName}`);
          }
        }
      }

      if (r.isPlayer && !r.finished && this.phase === 'racing') {
        playerAccelerating = this.updatePlayerRacer(r, dt, spec, classMultiplier);
      } else {
        this.updateAiRacer(r, dt, spec, classMultiplier);
      }

      this.checkSpeedPads(r);
      this.checkTrackPickups(r);
      this.updateLapProgress(r);
      this.syncRacerVisual(r, dt, r.isPlayer ? playerAccelerating : r.accelSurgeTimer > 0);
    }

    this.updateHazards(dt);

    // Car-to-car separation (non-blocking near quiz item gates)
    this.resolveCarCollisions();

    // Update shadow keyLight target around player
    this.keyLight.position.set(
      this.playerRacer.pos.x + 42,
      this.playerRacer.pos.y + 68,
      this.playerRacer.pos.z + 36
    );
    this.keyLight.target.position.copy(this.playerRacer.pos);

    // Stream speed dust particles relative to camera
    this.updateSpeedDust();

    // Camera & Audio
    this.updateRaceCamera(dt, playerAccelerating);
    const speedNorm = this.playerRacer.speed / ((spec.maxSpeedKmh / 3.6) * classMultiplier);
    this.audio.updateEngine(speedNorm, playerAccelerating, this.phase === 'racing');

    // Emit HUD state at ~20Hz for crisp React UI without frame drops
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitTelemetry(playerAccelerating);
    }
  }

  private updatePlayerRacer(
    r: RacerState,
    dt: number,
    spec: MachineSpec,
    classMultiplier: number
  ): boolean {
    // Auto-throttle unless braking
    const brakeInput =
      this.keys['KeyS'] || this.keys['ArrowDown'] || this.touchInput.brake ? 1 : 0;
    const accelInput = brakeInput > 0 ? 0 : 1;

    const keySteer =
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) -
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0);
    const steer = THREE.MathUtils.clamp(keySteer + this.touchInput.steerAnalog, -1, 1);

    const superTurbo = r.superTurboTimer > 0;
    const accelerating = r.accelSurgeTimer > 0 || superTurbo;

    const baseMaxSpeed = (spec.maxSpeedKmh / 3.6) * classMultiplier;
    const hitPenalty = r.hitSpinTimer > 0 ? 0.48 : 1.0;
    const shieldBonus = r.shieldTimer > 0 ? 1.04 + 0.04 * r.itemPower : 1.0;
    const turboSpeedMult = superTurbo ? 1.44 : accelerating ? 1.28 : 1.0;
    const turboAccelMult = superTurbo ? 2.2 : accelerating ? 1.7 : 1.0;
    const activeMaxSpeed = baseMaxSpeed * hitPenalty * shieldBonus * turboSpeedMult;
    const accelRate = 48 * spec.accel * classMultiplier * turboAccelMult;
    const brakeRate = 68;

    if (accelInput > 0) {
      r.speed += accelRate * dt;
    } else if (brakeInput > 0) {
      r.speed -= brakeRate * dt;
    } else {
      r.speed = THREE.MathUtils.damp(r.speed, 0, 0.75, dt);
    }

    r.speed = THREE.MathUtils.clamp(r.speed, -15, activeMaxSpeed);
    if (r.speed > activeMaxSpeed) {
      r.speed = THREE.MathUtils.damp(r.speed, activeMaxSpeed, 3.2, dt);
    }

    // Manual steering clears lane-assist override immediately
    if (Math.abs(steer) >= 0.08) {
      this.assistedLaneIndex = null;
    }

    // Steering physics relative to track tangent (smooth lateral control so Lanes 2 & 3 hold steady)
    const speedRatio = THREE.MathUtils.clamp(Math.abs(r.speed) / 40, 0.18, 1.0);
    const turnRate = 1.38 * speedRatio;
    r.yawAngle += steer * turnRate * dt;
    r.yawAngle = THREE.MathUtils.damp(r.yawAngle, 0, Math.abs(steer) < 0.05 ? 7.2 : 4.8, dt);
    r.yawAngle = THREE.MathUtils.clamp(r.yawAngle, -0.20, 0.20);

    // Move along track tangent + lateral offset
    this.track.sampleAtS(r.s, _sample);
    const forwardSpeed = Math.cos(r.yawAngle) * r.speed;
    const targetLatVel = -Math.sin(r.yawAngle) * r.speed * 0.92;
    r.lateralVel = THREE.MathUtils.damp(r.lateralVel, targetLatVel, 11.5, dt);

    r.prevS = r.s;
    r.s = (((r.s + (forwardSpeed * dt) / this.track.totalLength) % 1) + 1) % 1;
    r.lateral += r.lateralVel * dt;

    // Magnetic lane-centering assist near quiz gates so targeted lanes (including L2 & L3) lock steadily
    const nearGate = this.isNearItemLine(r.s, 260, 14);
    if (this.assistedLaneIndex !== null && this.activeQuiz && this.quizLanesRevealed) {
      const targetLat = LANE_LATERALS[this.assistedLaneIndex];
      r.lateral = THREE.MathUtils.damp(r.lateral, targetLat, 5.2, dt);
      r.lateralVel = THREE.MathUtils.damp(r.lateralVel, 0, 8.0, dt);
    } else if (nearGate && Math.abs(steer) < 0.08 && Math.abs(r.yawAngle) < 0.08) {
      const currentLaneLat = LANE_LATERALS[this.getLaneIndexFromLateral(r.lateral)];
      r.lateral = THREE.MathUtils.damp(r.lateral, currentLaneLat, 4.4, dt);
      r.lateralVel = THREE.MathUtils.damp(r.lateralVel, 0, 7.0, dt);
    }

    // Barrier rail collision: near quiz gates, glide smoothly along outer rail without bounce or slowdown
    const maxLat = this.track.halfWidth - 1.55;
    if (Math.abs(r.lateral) > maxLat) {
      const sign = Math.sign(r.lateral);
      r.lateral = sign * maxLat;
      if (nearGate) {
        r.lateralVel = 0;
        r.yawAngle *= 0.2;
      } else {
        r.lateralVel = -sign * Math.max(4, Math.abs(r.lateralVel) * 0.35);
        r.yawAngle *= 0.35;
        r.speed *= 0.91;
        const now = performance.now();
        if (now - this.lastWallSoundTime > 260) {
          this.lastWallSoundTime = now;
          this.audio.playWallHit();
        }
      }
    }

    // Recompute 3D world pose aligned smoothly to road slope & banking
    this.computeRoadPose(r.s, r.lateral, r.yawAngle, r.pos, r.headingQuat);

    // Visual roll & pitch damping (bounded so wing/pods stay well above track)
    const targetRoll = -steer * 0.16 * speedRatio;
    const targetPitch = (accelInput > 0 || accelerating ? -0.04 : brakeInput > 0 ? 0.05 : 0);
    r.rollVisual = THREE.MathUtils.damp(r.rollVisual, targetRoll, 9, dt);
    r.pitchVisual = THREE.MathUtils.damp(r.pitchVisual, targetPitch, 8, dt);

    return accelerating;
  }

  private updateAiRacer(
    r: RacerState,
    dt: number,
    playerSpec: MachineSpec,
    classMultiplier: number
  ): void {
    // Gentle rubber-banding so races stay competitive without feeling rigged
    const playerProgress = this.getTotalProgress(this.playerRacer);
    const aiProgress = this.getTotalProgress(r);
    const gap = playerProgress - aiProgress;
    const rubberBand = THREE.MathUtils.clamp(1 + gap * 0.45, 0.9, 1.12);

    const targetMax =
      (playerSpec.maxSpeedKmh / 3.6) *
      classMultiplier *
      r.aiBaseSpeedFactor *
      (r.hitSpinTimer > 0 ? 0.48 : 1.0) *
      (this.phase === 'finished' && r.isPlayer ? 0.72 : rubberBand) *
      (r.accelSurgeTimer > 0 ? 1.22 : 1.0);

    r.speed = THREE.MathUtils.damp(r.speed, targetMax, 1.8, dt);

    if (r.heldItem && this.phase === 'racing') {
      r.aiItemCooldown -= dt;
      if (r.aiItemCooldown <= 0) {
        this.activateSubItem(r);
        r.aiItemCooldown = 4.0 + Math.random() * 3.0;
      }
    }

    // Look ahead slightly to anticipate curves & adjust racing line
    this.track.sampleAtS(r.s + 0.018, _sampleLook);
    let desiredOffset = THREE.MathUtils.clamp(
      r.aiTargetOffset + Math.sin(this.raceElapsedMs * 0.0007 + r.hoverPhase) * 1.4,
      -(this.track.halfWidth - 2.4),
      this.track.halfWidth - 2.4
    );

    // Near item gates, AI racers yield clear lanes and never block the player or the correct item lane
    if (this.isNearItemLine(r.s, 220, 50)) {
      let dsPlayer = Math.abs(r.s - this.playerRacer.s);
      if (dsPlayer > 0.5) dsPlayer = 1 - dsPlayer;
      if (dsPlayer * this.track.totalLength < 150) {
        const playerLat = this.playerRacer.lateral;
        const correctLat = this.activeQuiz
          ? LANE_LATERALS[this.activeQuiz.correctLaneIndex]
          : playerLat;
        const avoidCenter = Math.abs(desiredOffset - correctLat) < 4.8 ? correctLat : playerLat;
        if (Math.abs(desiredOffset - avoidCenter) < 5.0) {
          const pushDir = desiredOffset >= avoidCenter ? 1 : -1;
          const candidate = avoidCenter + pushDir * 6.5;
          const altCandidate = avoidCenter - pushDir * 6.5;
          const maxAiLat = this.track.halfWidth - 2.2;
          desiredOffset =
            Math.abs(candidate) <= maxAiLat
              ? candidate
              : THREE.MathUtils.clamp(altCandidate, -maxAiLat, maxAiLat);
        }
      }
    }

    const latDiff = desiredOffset - r.lateral;
    r.lateralVel = THREE.MathUtils.damp(r.lateralVel, THREE.MathUtils.clamp(latDiff * 2.5, -14, 14), 5, dt);
    r.lateral += r.lateralVel * dt;

    r.prevS = r.s;
    r.s = (((r.s + (r.speed * dt) / this.track.totalLength) % 1) + 1) % 1;

    r.yawAngle = THREE.MathUtils.damp(r.yawAngle, -r.lateralVel * 0.015, 6, dt);
    this.computeRoadPose(r.s, r.lateral, r.yawAngle, r.pos, r.headingQuat);

    r.rollVisual = THREE.MathUtils.damp(r.rollVisual, r.lateralVel * 0.015, 6, dt);
    r.pitchVisual = THREE.MathUtils.damp(r.pitchVisual, -0.025, 6, dt);
  }

  private isNearItemLine(s: number, beforeMeters: number, afterMeters: number): boolean {
    for (const row of this.itemSystem.rows) {
      // Forward distance from s to row.s
      let dsToRow = row.s - s;
      if (dsToRow < 0) dsToRow += 1;
      const distBefore = dsToRow * this.track.totalLength;
      if (distBefore <= beforeMeters) return true;

      // Distance passed after row.s
      let dsAfterRow = s - row.s;
      if (dsAfterRow < 0) dsAfterRow += 1;
      const distAfter = dsAfterRow * this.track.totalLength;
      if (distAfter <= afterMeters) return true;
    }
    return false;
  }

  private getRowEtaInfo(rowS: number): { distToRow: number; etaSeconds: number } {
    let ds = rowS - this.playerRacer.s;
    if (ds < 0) ds += 1;
    const distToRow = ds * this.track.totalLength;
    const refSpeed = Math.max(this.playerRacer.speed, 108);
    return {
      distToRow,
      etaSeconds: distToRow / refSpeed,
    };
  }

  private getLaneIndexFromLateral(lateral: number): number {
    let bestIdx = 0;
    let bestDiff = Infinity;
    LANE_LATERALS.forEach((lat, idx) => {
      const diff = Math.abs(lateral - lat);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  private updateQuizSchedule(): void {
    if (this.playerRacer.finished) {
      if (this.activeQuiz) {
        this.activeQuiz = null;
        this.quizLanesRevealed = false;
      }
      return;
    }

    const row = this.itemSystem.rows[this.nextQuizRowIndex];
    if (!row) return;

    const { etaSeconds } = this.getRowEtaInfo(row.s);

    // ~20 seconds before the item line: show the question at top of screen
    if (!this.activeQuiz && etaSeconds <= 20.5) {
      const catId = this.getCourseSpec().categoryId;
      this.activeQuiz = generateQuizChallenge(this.usedTermIds, catId);
      this.usedTermIds.add(this.activeQuiz.targetTerm.term.id);
      this.quizLanesRevealed = false;
      this.itemSystem.setRowQuizDisplay(this.nextQuizRowIndex, this.activeQuiz.choices, false);
      this.emitTelemetry();
    }

    // ~15 seconds before the item line: reveal the 4 term choices across the 4 lanes
    if (this.activeQuiz && !this.quizLanesRevealed && etaSeconds <= 15.5) {
      this.quizLanesRevealed = true;
      this.itemSystem.setRowQuizDisplay(this.nextQuizRowIndex, this.activeQuiz.choices, true);
      this.emitTelemetry();
    }
  }

  private pushEventNotice(text: string): void {
    this.eventNotice = text;
    this.eventNoticeTimer = 2.4;
  }

  private getRacerRank(racer: RacerState): number {
    let rank = 1;
    const p = this.getTotalProgress(racer);
    for (const other of this.racers) {
      if (other.id !== racer.id && this.getTotalProgress(other) > p) {
        rank++;
      }
    }
    return rank;
  }

  private didCrossS(prevS: number, currS: number, targetS: number): boolean {
    if (prevS <= currS) {
      return prevS <= targetS && currS >= targetS;
    }
    // Wrapped around 1.0 -> 0.0
    return targetS >= prevS || targetS <= currS;
  }

  private checkTrackPickups(r: RacerState): void {
    // Only the player triggers & acquires quiz gate items; CPU racers never pick up items
    if (this.phase !== 'racing' || !r.isPlayer || r.finished) return;

    const row = this.itemSystem.rows[this.nextQuizRowIndex];
    if (!row || !row.active) return;

    let ds = Math.abs(r.s - row.s);
    if (ds > 0.5) ds = 1 - ds;
    const distAlong = ds * this.track.totalLength;
    const crossed = this.didCrossS(r.prevS, r.s, row.s);

    if (!crossed && distAlong >= 4.5) return;

    const laneIdx = this.getLaneIndexFromLateral(r.lateral);
    this.itemSystem.setRowVisible(row.rowIndex, false);
    this.itemSystem.setRowQuizDisplay(row.rowIndex, null, false);

    const quiz =
      this.activeQuiz ?? generateQuizChallenge(this.usedTermIds, this.getCourseSpec().categoryId);
    const choice = quiz.choices[laneIdx];
    const correctChoice = quiz.choices[quiz.correctLaneIndex];
    this.quizAttempts += 1;

    if (choice.isCorrect) {
      this.quizCorrectCount += 1;
      const targetMeta = quiz.targetTerm;
      const { isNew, count } = recordCollectedCard(targetMeta.term.id);
      this.earnedCards.push({
        termId: targetMeta.term.id,
        name: targetMeta.term.name,
        rarity: targetMeta.term.rarity,
        categoryTitle: targetMeta.categoryTitle,
        subcategoryTitle: targetMeta.subcategoryTitle,
        isNew,
        unlockedCount: count,
      });
      this.onCollectionChange?.();

      // Correct answer: grant Turbo boost AND the lane's item
      r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 2.4 * r.itemPower);

      if (choice.itemKind === 'boost') {
        // Extra acceleration when the obtained item itself is Turbo
        const classMultiplier = this.speedClass === 'hyper' ? 1.16 : 1.0;
        const baseMax = (this.getSelectedSpec().maxSpeedKmh / 3.6) * classMultiplier;
        r.superTurboTimer = Math.max(r.superTurboTimer, 3.2 * r.itemPower);
        r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 3.6 * r.itemPower);
        r.speed = Math.max(r.speed, baseMax * 1.38);
      }

      if (r.heldItem) {
        this.activateSubItem(r);
      }
      r.heldItem = choice.itemKind;
      r.heldItemHoldTime = 0;

      this.audio.playItemPickup();
      this.audio.playBoostPad();

      if (choice.itemKind === 'boost') {
        this.quizFeedback = {
          correct: true,
          termName: choice.term.name,
          message: `正解！「${choice.term.name}」獲得 · HYPER TURBO発動！`,
        };
        this.pushEventNotice(`正解！「${choice.term.name}」カード獲得 + HYPER TURBO!`);
      } else {
        this.quizFeedback = {
          correct: true,
          termName: choice.term.name,
          message: `正解！ターボ加速 + ${SUB_ITEMS[choice.itemKind].name}獲得`,
        };
        this.pushEventNotice(`正解！「${choice.term.name}」カード獲得 + ${SUB_ITEMS[choice.itemKind].name}`);
      }
    } else {
      // Wrong answer: spin out and cannot obtain item
      r.hitSpinTimer = 1.65;
      r.speed *= 0.48;
      r.accelSurgeTimer = 0;
      r.superTurboTimer = 0;
      this.audio.playHitImpact();

      this.quizFeedback = {
        correct: false,
        termName: correctChoice.term.name,
        message: `誤答スピン！ 正解は「${correctChoice.term.name}」`,
      };
      this.pushEventNotice(`不正解スピン… 正解: ${correctChoice.term.name}`);
    }

    this.quizFeedbackTimer = 2.8;
    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.assistedLaneIndex = null;
    this.nextQuizRowIndex = (this.nextQuizRowIndex + 1) % this.itemSystem.rows.length;
    this.emitTelemetry();
  }

  private activateSubItem(r: RacerState): void {
    const item = r.heldItem;
    if (!item) return;
    r.heldItem = null;
    r.heldItemHoldTime = 0;

    if (r.isPlayer && item !== 'boost') {
      this.audio.playItemUse();
    }

    if (item === 'boost') {
      const dur = Number((2.4 * r.itemPower).toFixed(1));
      r.accelSurgeTimer = Math.max(r.accelSurgeTimer, dur);
      if (r.isPlayer) {
        this.audio.playBoostPad();
        this.pushEventNotice(`ブースト加速発動 (${dur}s)`);
      }
    } else if (item === 'shield') {
      const dur = Number((5.0 * r.itemPower).toFixed(1));
      r.shieldTimer = dur;
      if (r.isPlayer) {
        this.pushEventNotice(`イージスシールド展開 (${dur}s)`);
      }
    } else if (item === 'mine') {
      const dropS = (((r.s - 3.5 / this.track.totalLength) % 1) + 1) % 1;
      this.itemSystem.spawnMine(r.id, dropS, r.lateral, r.itemPower);
      if (r.isPlayer) {
        this.pushEventNotice('ショックマイン設置');
      }
    } else if (item === 'missile') {
      const myProg = this.getTotalProgress(r);
      let target: RacerState | null = null;
      let bestAhead = Infinity;
      for (const other of this.racers) {
        if (other.id === r.id) continue;
        const diff = this.getTotalProgress(other) - myProg;
        if (diff > 0 && diff < bestAhead) {
          bestAhead = diff;
          target = other;
        }
      }
      if (!target) {
        target = this.racers.find((o) => o.id !== r.id) ?? null;
      }
      const spawnS = (((r.s + 3.0 / this.track.totalLength) % 1) + 1) % 1;
      this.itemSystem.spawnMissile(
        r.id,
        target ? target.id : null,
        spawnS,
        r.lateral,
        r.speed,
        r.itemPower
      );
      if (r.isPlayer) {
        this.pushEventNotice(target ? `プラズマミサイル発射 → ${target.name}` : 'プラズマミサイル発射');
      }
    } else if (item === 'emp') {
      const myProg = this.getTotalProgress(r);
      const stunSec = 1.45 * r.itemPower;
      const slowMult = Math.max(0.45, 0.65 - (r.itemPower - 1) * 0.15);
      let hitCount = 0;
      for (const other of this.racers) {
        if (other.id === r.id) continue;
        if (this.getTotalProgress(other) > myProg) {
          if (other.shieldTimer > 0) {
            other.shieldTimer = 0;
          } else {
            other.hitSpinTimer = stunSec;
            other.speed *= slowMult;
            hitCount++;
          }
        }
      }
      if (r.isPlayer) {
        this.audio.playHitImpact();
        this.pushEventNotice(hitCount > 0 ? `EMPパルス命中 (${hitCount}機)` : 'EMPパルス発動');
      }
    }
  }

  private applyHitToRacer(r: RacerState, sourceLabel: string, stunDuration = 1.5): void {
    if (r.shieldTimer > 0) {
      r.shieldTimer = 0;
      if (r.isPlayer) {
        this.audio.playEnergyRestore();
        this.pushEventNotice('シールドで攻撃を防御！');
      }
      return;
    }
    r.hitSpinTimer = stunDuration;
    r.speed *= 0.55;
    r.accelSurgeTimer = 0;
    if (r.isPlayer) {
      this.audio.playHitImpact();
      this.pushEventNotice(`${sourceLabel} 被弾！`);
    }
  }

  private updateHazards(dt: number): void {
    // Update homing missiles
    for (let i = this.itemSystem.missiles.length - 1; i >= 0; i--) {
      const m = this.itemSystem.missiles[i];
      m.ttl -= dt;
      m.s = (((m.s + (m.speed * dt) / this.track.totalLength) % 1) + 1) % 1;

      if (m.targetId) {
        const target = this.racers.find((r) => r.id === m.targetId);
        if (target) {
          m.lateral = THREE.MathUtils.damp(m.lateral, target.lateral, m.homingStrength, dt);
        }
      }
      this.itemSystem.positionMissile(m);

      let hit = false;
      for (const r of this.racers) {
        if (r.id === m.ownerId) continue;
        let ds = Math.abs(r.s - m.s);
        if (ds > 0.5) ds = 1 - ds;
        if (ds * this.track.totalLength < 3.4 && Math.abs(r.lateral - m.lateral) < 2.6) {
          this.applyHitToRacer(r, 'ミサイル', m.stunDuration);
          if (m.ownerId === this.playerRacer.id) {
            this.audio.playHitImpact();
            this.pushEventNotice(`HIT! ${r.name} にミサイル命中`);
          }
          hit = true;
          break;
        }
      }

      if (hit || m.ttl <= 0) {
        this.itemSystem.removeMissile(i);
      }
    }

    // Check shock mines
    for (let i = this.itemSystem.mines.length - 1; i >= 0; i--) {
      const mine = this.itemSystem.mines[i];
      if (mine.graceTimer > 0) continue;

      for (const r of this.racers) {
        let ds = Math.abs(r.s - mine.s);
        if (ds > 0.5) ds = 1 - ds;
        if (ds * this.track.totalLength < 2.4 && Math.abs(r.lateral - mine.lateral) < 2.3) {
          this.applyHitToRacer(r, 'ショックマイン', mine.stunDuration);
          if (mine.ownerId === this.playerRacer.id && !r.isPlayer) {
            this.audio.playHitImpact();
            this.pushEventNotice(`HIT! ${r.name} がマインに接触`);
          }
          this.itemSystem.removeMine(i);
          break;
        }
      }
    }
  }

  private checkSpeedPads(r: RacerState): void {
    for (const pad of this.track.boostPads) {
      let ds = Math.abs(r.s - pad.s);
      if (ds > 0.5) ds = 1 - ds;
      const distAlong = ds * this.track.totalLength;
      if (distAlong < pad.length * 0.55 && Math.abs(r.lateral - pad.lateral) < pad.width * 0.65) {
        if (r.accelSurgeTimer <= 0.1) {
          r.accelSurgeTimer = 1.25;
          if (r.isPlayer) {
            this.audio.playBoostPad();
          }
        }
      }
    }
  }

  private updateLapProgress(r: RacerState): void {
    if (r.finished) return;

    // Anti-cheat 3-sector check
    if (r.s > 0.2 && r.s < 0.45) r.sectorFlags |= 1;
    if (r.s >= 0.45 && r.s < 0.72) r.sectorFlags |= 2;
    if (r.s >= 0.72 && r.s < 0.96) r.sectorFlags |= 4;

    // Crossed finish line forward (prevS > 0.88 and s < 0.12)
    if (r.prevS > 0.88 && r.s < 0.12 && r.sectorFlags === 7) {
      const lapTime = this.raceElapsedMs - r.lapStartMs;
      r.lapStartMs = this.raceElapsedMs;
      r.sectorFlags = 0;

      if (r.bestLapMs === null || lapTime < r.bestLapMs) {
        r.bestLapMs = lapTime;
      }

      if (r.isPlayer && (this.allTimeBestLapMs === null || lapTime < this.allTimeBestLapMs)) {
        this.allTimeBestLapMs = lapTime;
        this.isNewRecord = true;
        try {
          localStorage.setItem(this.getBestLapKey(this.courseId), String(Math.round(lapTime)));
        } catch {
          // Ignore storage error
        }
      }

      if (r.lap >= TOTAL_LAPS) {
        r.finished = true;
        r.finishTimeMs = this.raceElapsedMs;
        if (r.isPlayer) {
          this.phase = 'finished';
          this.audio.playLapComplete(true);
          this.emitTelemetry();
        }
      } else {
        r.lap += 1;
        if (r.isPlayer) {
          this.audio.playLapComplete(false);
        }
      }
    }
  }

  private resolveCarCollisions(): void {
    const minDist = 3.2;
    const playerProtected = this.isNearItemLine(this.playerRacer.s, 190, 50);

    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const distSq = a.pos.distanceToSquared(b.pos);
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const push = (minDist - dist) * 0.5;
          const latSign = a.lateral >= b.lateral ? 1 : -1;

          // Near item lines, other cars never push or block the player
          if (playerProtected && (a.isPlayer || b.isPlayer)) {
            if (a.isPlayer) {
              b.lateral -= latSign * push * 2;
              b.lateralVel -= latSign * 6;
            } else {
              a.lateral += latSign * push * 2;
              a.lateralVel += latSign * 6;
            }
            continue;
          }

          a.lateral += latSign * push;
          b.lateral -= latSign * push;
          a.lateralVel += latSign * 4;
          b.lateralVel -= latSign * 4;
        }
      }
    }
  }

  private syncRacerVisual(r: RacerState, _dt: number, boosting: boolean): void {
    r.model.root.position.copy(r.pos);
    r.model.root.quaternion.copy(r.headingQuat);

    // Anti-grav gentle vertical hover oscillation + dynamic roll/pitch/hit-spin on chassis only
    const hoverBob = Math.sin(r.hoverPhase) * 0.045;
    r.model.chassisGroup.position.y = 0.80 + hoverBob;
    const spinY = r.hitSpinTimer > 0 ? r.hitSpinTimer * Math.PI * 4.5 : 0;
    r.model.chassisGroup.rotation.set(r.pitchVisual, spinY, r.rollVisual);

    r.model.shieldDome.visible = r.shieldTimer > 0;
    if (r.shieldTimer > 0) {
      r.model.shieldDome.rotation.y += 0.04;
    }

    const flameScale = boosting ? 1.9 + Math.sin(r.hoverPhase * 5) * 0.35 : 0.45 + Math.min(1, r.speed / 95) * 0.75;
    const flameRadius = boosting ? 1.25 : 0.85;
    for (const flame of r.model.thrusterFlames) {
      flame.scale.set(flameRadius, flameRadius, flameScale);
    }
    r.model.boostGlowMaterial.emissiveIntensity = boosting ? 3.5 : 2.0;
  }

  private updateMenuCamera(dt: number): void {
    const r = this.playerRacer;
    const radius = 8.4;
    _vA.set(
      r.pos.x + Math.cos(this.menuOrbitAngle) * radius,
      r.pos.y + 2.75,
      r.pos.z + Math.sin(this.menuOrbitAngle) * radius
    );
    _vB.set(r.pos.x, r.pos.y + 0.85, r.pos.z);

    if (!this.camInitialized) {
      this.camPos.copy(_vA);
      this.camLook.copy(_vB);
      this.camInitialized = true;
    } else {
      this.camPos.lerp(_vA, 1 - Math.exp(-5 * dt));
      this.camLook.lerp(_vB, 1 - Math.exp(-6 * dt));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  private updateRaceCamera(dt: number, accelerating: boolean): void {
    const r = this.playerRacer;
    this.track.sampleAtS(r.s, _sample);
    // Forward vector of car (+Z local -> world), blended slightly with track tangent so camera stays cleanly behind rear
    _vA.set(0, 0, 1).applyQuaternion(r.headingQuat).lerp(_sample.tangent, 0.35).normalize();
    // Up vector of track/car (+Y local -> world)
    _vB.set(0, 1, 0).applyQuaternion(r.headingQuat).normalize();

    const backDist = 9.4;
    const heightDist = 3.85;
    const lookAhead = 18;

    _vC.copy(r.pos).addScaledVector(_vA, -backDist).addScaledVector(_vB, heightDist);
    _vD.copy(r.pos).addScaledVector(_vA, lookAhead).addScaledVector(_vB, 1.25);

    if (!this.camInitialized) {
      this.camPos.copy(_vC);
      this.camLook.copy(_vD);
      this.camInitialized = true;
    } else {
      this.camPos.lerp(_vC, 1 - Math.exp(-12 * dt));
      this.camLook.lerp(_vD, 1 - Math.exp(-14 * dt));
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Dynamic FOV widening with speed & boost acceleration item
    const speedRatio = THREE.MathUtils.clamp(r.speed / 120, 0, 1.2);
    const targetFov = 62 + speedRatio * 12 + (accelerating ? 9 : 0);
    this.camFov = THREE.MathUtils.damp(this.camFov, targetFov, 7, dt);
    this.camera.fov = this.camFov;
    this.camera.updateProjectionMatrix();
  }

  private updateSpeedDust(): void {
    const posAttr = this.dustGeo.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const cx = this.camera.position.x;
    const cy = this.camera.position.y;
    const cz = this.camera.position.z;
    const box = 45;

    for (let i = 0; i < arr.length; i += 3) {
      if (arr[i] - cx > box) arr[i] -= box * 2;
      else if (arr[i] - cx < -box) arr[i] += box * 2;

      if (arr[i + 1] - cy > 20) arr[i + 1] -= 40;
      else if (arr[i + 1] - cy < -20) arr[i + 1] += 40;

      if (arr[i + 2] - cz > box) arr[i + 2] -= box * 2;
      else if (arr[i + 2] - cz < -box) arr[i + 2] += box * 2;
    }
    posAttr.needsUpdate = true;
    this.dustMat.opacity = THREE.MathUtils.clamp(0.18 + (this.playerRacer.speed / 110) * 0.6, 0.15, 0.85);
  }

  private getTotalProgress(r: RacerState): number {
    if (r.finished) {
      return TOTAL_LAPS + 10 - r.finishTimeMs * 0.00001;
    }
    // Note: on grid before crossing line, s is ~0.985 with sectorFlags === 0
    const effectiveS = r.lap === 1 && r.sectorFlags === 0 && r.s > 0.8 ? r.s - 1.0 : r.s;
    return (r.lap - 1) + effectiveS;
  }

  private emitTelemetry(accelerating = false): void {
    const sorted = [...this.racers].sort((a, b) => this.getTotalProgress(b) - this.getTotalProgress(a));
    const standings: RacerStanding[] = sorted.map((r, i) => ({
      id: r.id,
      name: r.name,
      isPlayer: r.isPlayer,
      rank: i + 1,
      lap: Math.min(r.lap, TOTAL_LAPS),
      totalTimeMs: r.finished ? r.finishTimeMs : this.raceElapsedMs,
      bestLapMs: r.bestLapMs,
      accentHex: r.accentHex,
    }));

    const playerRank = (standings.find((s) => s.isPlayer)?.rank) ?? 1;

    const markers: MinimapMarker[] = this.racers.map((r) => {
      const m = this.track.worldToMinimap(r.pos.x, r.pos.z);
      return {
        id: r.id,
        x: m.x,
        y: m.y,
        isPlayer: r.isPlayer,
        color: r.accentHex,
      };
    });

    const missileWarning = this.itemSystem.missiles.some(
      (m) => m.targetId === this.playerRacer.id
    );

    let activeQuizTelemetry: ActiveQuizTelemetry | null = null;
    if (this.phase === 'racing' && this.activeQuiz) {
      const row = this.itemSystem.rows[this.nextQuizRowIndex];
      const eta = row ? this.getRowEtaInfo(row.s).etaSeconds : 0;
      activeQuizTelemetry = {
        questionText: this.activeQuiz.questionText,
        etaSeconds: eta,
        showLanes: this.quizLanesRevealed,
        lanes: this.activeQuiz.choices.map((c, idx) => ({
          laneIndex: idx,
          termId: c.term.id,
          termName: c.term.name,
          itemKind: c.itemKind,
        })),
        playerLaneIndex: this.getLaneIndexFromLateral(this.playerRacer.lateral),
      };
    }

    this.onTelemetry({
      phase: this.phase,
      courseId: this.courseId,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      speedKmh: Math.round(Math.abs(this.playerRacer.speed) * 3.6),
      isAccelerating: accelerating,
      rank: playerRank,
      totalRacers: this.racers.length,
      lap: Math.min(this.playerRacer.lap, TOTAL_LAPS),
      totalLaps: TOTAL_LAPS,
      currentLapMs: Math.max(0, this.raceElapsedMs - this.playerRacer.lapStartMs),
      bestLapMs: this.playerRacer.bestLapMs,
      totalRaceMs: this.playerRacer.finished ? this.playerRacer.finishTimeMs : this.raceElapsedMs,
      allTimeBestLapMs: this.allTimeBestLapMs,
      isNewRecord: this.isNewRecord,
      markers,
      standings,
      wrongWay: this.playerRacer.speed < -5,
      heldItem: this.playerRacer.heldItem,
      shieldActive: this.playerRacer.shieldTimer > 0,
      missileWarning,
      eventNotice: this.eventNotice,
      activeQuiz: activeQuizTelemetry,
      quizFeedback: this.quizFeedback,
      earnedCards: [...this.earnedCards],
      quizAttempts: this.quizAttempts,
      quizCorrectCount: this.quizCorrectCount,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    for (const r of this.racers) {
      r.model.dispose();
    }
    this.itemSystem.dispose();
    this.track.dispose();
    this.textures.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.envMap.dispose();
    this.audio.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
