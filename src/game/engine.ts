import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RaceAudioEngine } from './audio';
import { createHypercarMesh, HypercarModel } from './hypercar';
import { LANE_LATERALS, QUIZ_ROW_S, TrackItemSystem } from './items';
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
  HitAlertTelemetry,
  IncomingThreatType,
  MACHINES,
  MachineId,
  MachineSpec,
  MinimapMarker,
  MissedQuizReview,
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
  recordTermAnswer,
} from '../utils/cardCollection';
import { recordTotalTimeRanking } from '../utils/rankings';

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
  lapTimesMs: number[];
  bestLapMs: number | null;
  sectorFlags: number; // bitmask 1 | 2 | 4
  rollVisual: number;
  pitchVisual: number;
  hoverPhase: number;
  accelSurgeTimer: number;
  superTurboTimer: number;
  glowBoostTimer: number;
  hoverGlideTimer: number;
  hoverGlideDuration: number;
  hoverLift: number;
  heldItem: SubItemType | null;
  heldItemHoldTime: number;
  shieldTimer: number;
  hitSpinTimer: number;
  quizPenaltyTimer: number;
  postHitGraceTimer: number;
  itemPower: number;
  aiItemCooldown: number;
  aiLastGateKey: string;
  aiTargetOffset: number;
  aiBaseSpeedFactor: number;
}

export interface TouchInputState {
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
  private speedClass: SpeedClass = 'normal';

  private racers: RacerState[] = [];
  private playerRacer!: RacerState;

  private keys: Record<string, boolean> = {};
  private touchInput: TouchInputState = {
    steerAnalog: 0,
  };

  private countdownTimer = 0;
  private finishCelebrationTimer = 0;
  private lastBeepStep = 4;
  private raceElapsedMs = 0;
  private totalElapsedSec = 0;
  private eventNotice: string | null = null;
  private eventNoticeTimer = 0;
  private hitAlertSource: string | null = null;
  private hitAlertHex = '#EF4444';
  private hitAlertTimer = 0;
  private allTimeBestLapMs: number | null = null;
  private isNewRecord = false;
  private rankingPlacement: number | null = null;
  private lastWallSoundTime = 0;
  private menuOrbitAngle = 0.6;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camFov = 64;
  private camInitialized = false;
  private hudEmitAccum = 0;

  private nextQuizRowIndex = 0;
  private quizGatesCleared = 0;
  private activeQuiz: GeneratedQuiz | null = null;
  private quizLanesRevealed = false;
  private usedTermIds = new Set<number>();
  private earnedCards: EarnedRaceCard[] = [];
  private missedQuestions: MissedQuizReview[] = [];
  private quizAttempts = 0;
  private quizCorrectCount = 0;
  private quizStreak = 0;
  private bestQuizStreak = 0;
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

  public setSfxEnabled(enabled: boolean): void {
    this.audio.setSfxEnabled(enabled);
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
    this.finishCelebrationTimer = 0;
    this.lastBeepStep = 4;
    this.raceElapsedMs = 0;
    this.eventNotice = null;
    this.eventNoticeTimer = 0;
    this.hitAlertSource = null;
    this.hitAlertTimer = 0;
    this.isNewRecord = false;
    this.rankingPlacement = null;
    this.camInitialized = false;

    this.nextQuizRowIndex = 0;
    this.quizGatesCleared = 0;
    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.usedTermIds.clear();
    this.earnedCards = [];
    this.missedQuestions = [];
    this.quizAttempts = 0;
    this.quizCorrectCount = 0;
    this.quizStreak = 0;
    this.bestQuizStreak = 0;
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
    this.finishCelebrationTimer = 0;
    this.audio.updateEngine(0, false, false);
    this.itemSystem.resetDynamicHazards();
    this.buildRacers();
    this.resetGridPositions();
    this.camInitialized = false;
    this.hitAlertSource = null;
    this.hitAlertTimer = 0;
    this.rankingPlacement = null;
    this.quizGatesCleared = 0;
    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.missedQuestions = [];
    this.quizStreak = 0;
    this.bestQuizStreak = 0;
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
        speedFactor: 0.98,
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
        speedFactor: 0.95,
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
        speedFactor: 0.92,
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
      lapTimesMs: [],
      bestLapMs: null,
      sectorFlags: 0,
      rollVisual: 0,
      pitchVisual: 0,
      hoverPhase: 0,
      accelSurgeTimer: 0,
      superTurboTimer: 0,
      glowBoostTimer: 0,
      hoverGlideTimer: 0,
      hoverGlideDuration: 1,
      hoverLift: 0,
      heldItem: null,
      heldItemHoldTime: 0,
      shieldTimer: 0,
      hitSpinTimer: 0,
      quizPenaltyTimer: 0,
      postHitGraceTimer: 0,
      itemPower: playerSpec.itemPower,
      aiItemCooldown: 2,
      aiLastGateKey: '',
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
        lapTimesMs: [],
        bestLapMs: null,
        sectorFlags: 0,
        rollVisual: 0,
        pitchVisual: 0,
        hoverPhase: idx * 1.4,
        accelSurgeTimer: 0,
        superTurboTimer: 0,
        glowBoostTimer: 0,
        hoverGlideTimer: 0,
        hoverGlideDuration: 1,
        hoverLift: 0,
        heldItem: null,
        heldItemHoldTime: 0,
        shieldTimer: 0,
        hitSpinTimer: 0,
        quizPenaltyTimer: 0,
        postHitGraceTimer: 0,
        itemPower: cfg.itemPower,
        aiItemCooldown: 2.0 + idx * 0.8,
        aiLastGateKey: '',
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
      r.lapTimesMs = [];
      r.bestLapMs = null;
      r.sectorFlags = 0;
      r.accelSurgeTimer = 0;
      r.superTurboTimer = 0;
      r.glowBoostTimer = 0;
      r.hoverGlideTimer = 0;
      r.hoverGlideDuration = 1;
      r.hoverLift = 0;
      r.heldItem = null;
      r.heldItemHoldTime = 0;
      r.shieldTimer = 0;
      r.hitSpinTimer = 0;
      r.quizPenaltyTimer = 0;
      r.postHitGraceTimer = 0;
      r.aiLastGateKey = '';
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
    if (
      (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') &&
      (this.phase === 'racing' || this.phase === 'countdown')
    ) {
      e.preventDefault();
    }
    if (
      (e.code === 'KeyE' ||
        e.code === 'KeyF' ||
        e.code === 'Space' ||
        e.code === 'Enter' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown') &&
      !e.repeat
    ) {
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

    if (this.hitAlertTimer > 0) {
      this.hitAlertTimer -= dt;
      if (this.hitAlertTimer <= 0) {
        this.hitAlertSource = null;
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

    // Active Racing, Post-Finish Celebration, or Finished (auto-pilot cooldown)
    if (this.phase === 'racing') {
      this.raceElapsedMs += dt * 1000;
      this.updateQuizSchedule();
    } else if (this.phase === 'finishing') {
      this.finishCelebrationTimer -= dt;
      if (this.finishCelebrationTimer <= 0) {
        this.finishCelebrationTimer = 0;
        this.phase = 'finished';
        this.audio.updateEngine(0, false, false);
        this.emitTelemetry();
      }
    }

    const classMultiplier = this.speedClass === 'hard' ? 1.10 : 1.0;
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
      if (r.glowBoostTimer > 0) {
        r.glowBoostTimer = Math.max(0, r.glowBoostTimer - dt);
      }
      if (r.hoverGlideTimer > 0) {
        r.hoverGlideTimer = Math.max(0, r.hoverGlideTimer - dt);
      }
      if (r.shieldTimer > 0) {
        r.shieldTimer = Math.max(0, r.shieldTimer - dt);
      }
      if (r.hitSpinTimer > 0) {
        r.hitSpinTimer = Math.max(0, r.hitSpinTimer - dt);
      }
      if (r.quizPenaltyTimer > 0) {
        r.quizPenaltyTimer = Math.max(0, r.quizPenaltyTimer - dt);
      }
      if (r.postHitGraceTimer > 0) {
        r.postHitGraceTimer = Math.max(0, r.postHitGraceTimer - dt);
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
      this.syncRacerVisual(
        r,
        dt,
        r.isPlayer ? playerAccelerating || this.phase === 'finishing' : r.accelSurgeTimer > 0 || r.glowBoostTimer > 0
      );
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
    this.dustMat.size = playerAccelerating || this.phase === 'finishing' ? 1.18 : 0.75;
    this.updateSpeedDust();

    // Camera & Audio
    this.updateRaceCamera(dt, playerAccelerating || this.phase === 'finishing');
    const speedNorm = this.playerRacer.speed / ((spec.maxSpeedKmh / 3.6) * classMultiplier);
    this.audio.updateEngine(
      this.phase === 'finishing' ? speedNorm * 0.55 : speedNorm,
      playerAccelerating,
      this.phase === 'racing' || this.phase === 'finishing'
    );

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
    const keySteer =
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) -
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0);
    const steer = THREE.MathUtils.clamp(keySteer + this.touchInput.steerAnalog, -1, 1);

    const superTurbo = r.superTurboTimer > 0;
    const glowActive = r.glowBoostTimer > 0;
    const hoverActive = r.hoverGlideTimer > 0;
    const accelerating = r.accelSurgeTimer > 0 || superTurbo || glowActive;

    const baseMaxSpeed = (spec.maxSpeedKmh / 3.6) * classMultiplier;
    const hitPenalty = r.hitSpinTimer > 0 ? 0.40 : r.quizPenaltyTimer > 0 ? 0.76 : 1.0;
    const penaltyAccelMult = r.hitSpinTimer > 0 ? 0.38 : r.quizPenaltyTimer > 0 ? 0.65 : 1.0;
    const shieldBonus = r.shieldTimer > 0 ? 1.04 + 0.04 * r.itemPower : 1.0;
    const glowBonus = glowActive ? (r.itemPower >= 1.3 ? 1.24 : 1.16) : 1.0;
    const hoverBonus = hoverActive ? (r.itemPower >= 1.3 ? 1.16 : 1.10) : 1.0;
    const turboSpeedMult = superTurbo ? 1.46 : r.accelSurgeTimer > 0 ? 1.32 : 1.0;
    const turboAccelMult = superTurbo ? 2.4 : r.accelSurgeTimer > 0 ? 1.85 : glowActive ? 1.45 : 1.0;
    const activeMaxSpeed =
      baseMaxSpeed * hitPenalty * shieldBonus * Math.max(turboSpeedMult, glowBonus) * hoverBonus;
    const accelRate = 48 * spec.accel * classMultiplier * turboAccelMult * penaltyAccelMult;

    // Pure auto-throttle racing (no brake)
    r.speed += accelRate * dt;
    r.speed = THREE.MathUtils.clamp(r.speed, 0, activeMaxSpeed);
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
    const targetPitch = accelerating ? -0.045 : -0.015;
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
    const playerProgress = this.getTotalProgress(this.playerRacer);
    const aiProgress = this.getTotalProgress(r);
    const gap = playerProgress - aiProgress;
    // Behave identically to normal laps until the player passes the final lap's first item gate
    const isFinalStretch =
      this.playerRacer.lap >= TOTAL_LAPS &&
      this.playerRacer.s >= QUIZ_ROW_S[0] &&
      this.playerRacer.s < 0.995;

    let rubberBand: number;
    const isHard = this.speedClass === 'hard';
    if (!isFinalStretch && !this.playerRacer.finished) {
      if (isHard) {
        // Hard class: aggressive pack tension without slowing down to wait when player misses quizzes
        if (gap > 0.06) {
          rubberBand = 1.62;
        } else if (gap > 0.015) {
          rubberBand = THREE.MathUtils.clamp(1.08 + gap * 7.5, 1.08, 1.54);
        } else if (gap < -0.025) {
          rubberBand = THREE.MathUtils.clamp(1.0 + gap * 0.20, 0.95, 1.01);
        } else {
          rubberBand = 1.06;
        }
      } else {
        // Normal class: honest pace — steady if player falls behind, competitive if player answers cleanly
        if (gap > 0.08) {
          rubberBand = 1.12;
        } else if (gap > 0.02) {
          rubberBand = THREE.MathUtils.clamp(0.99 + gap * 2.2, 0.99, 1.10);
        } else if (gap < -0.02) {
          rubberBand = THREE.MathUtils.clamp(0.97 + gap * 0.25, 0.92, 0.97);
        } else {
          rubberBand = 0.97;
        }
      }
    } else {
      // Final sprint after Gate 1: stay naturally fast without sudden deceleration
      rubberBand = isHard
        ? THREE.MathUtils.clamp(1.01 + gap * 0.20, 0.96, 1.04)
        : THREE.MathUtils.clamp(0.96 + gap * 0.20, 0.91, 0.98);
    }

    const baseAiSpeed = (playerSpec.maxSpeedKmh / 3.6) * classMultiplier;
    const playerFollowCap =
      isHard && !isFinalStretch && gap > 0.012
        ? Math.max(baseAiSpeed, this.playerRacer.speed * 1.18)
        : baseAiSpeed;

    const finalLapEase = isFinalStretch ? (isHard ? 0.97 : 0.94) : 1.0;
    const glowMult = r.glowBoostTimer > 0 ? 1.16 : 1.0;
    const hoverMult = r.hoverGlideTimer > 0 ? 1.10 : 1.0;

    const targetMax =
      playerFollowCap *
      r.aiBaseSpeedFactor *
      finalLapEase *
      (r.hitSpinTimer > 0 ? 0.50 : 1.0) *
      (r.isPlayer && this.phase === 'finishing'
        ? 0.94
        : r.isPlayer && this.phase === 'finished'
          ? 0.72
          : rubberBand) *
      (r.accelSurgeTimer > 0 ? 1.2 : 1.0) *
      glowMult *
      hoverMult;

    const speedDamp = !isFinalStretch && gap > 0.025 ? 3.2 : 1.8;
    r.speed = THREE.MathUtils.damp(r.speed, targetMax, speedDamp, dt);

    // AI can only use an item it picked up when crossing an item gate (max 1 stock, never before Gate 1)
    if (this.phase === 'racing' && !r.finished && r.heldItem !== null) {
      const playerNearQuizGate = this.isNearItemLine(this.playerRacer.s, 175, 28);
      r.aiItemCooldown -= dt;
      if (r.aiItemCooldown <= 0 && !playerNearQuizGate) {
        this.activateSubItem(r);
      }
    }

    // Look ahead slightly to anticipate curves & adjust racing line
    this.track.sampleAtS(r.s + 0.018, _sampleLook);
    let desiredOffset = THREE.MathUtils.clamp(
      r.aiTargetOffset + Math.sin(this.raceElapsedMs * 0.0007 + r.hoverPhase) * 1.4,
      -(this.track.halfWidth - 2.4),
      this.track.halfWidth - 2.4
    );

    // Near item gates, AI racers deliberately steer away from the player and the correct answer lane
    const aiNearGate = this.isNearItemLine(r.s, 280, 65);
    const playerNearGate = this.isNearItemLine(this.playerRacer.s, 260, 55);
    let avoidingPlayer = false;
    if (aiNearGate || playerNearGate) {
      let dsPlayer = Math.abs(r.s - this.playerRacer.s);
      if (dsPlayer > 0.5) dsPlayer = 1 - dsPlayer;
      if (dsPlayer * this.track.totalLength < 220 || aiNearGate) {
        avoidingPlayer = true;
        const playerLat = this.playerRacer.lateral;
        const correctLat = this.activeQuiz
          ? LANE_LATERALS[this.activeQuiz.correctLaneIndex]
          : playerLat;
        const maxAiLat = this.track.halfWidth - 1.9;
        const candidateLats = [-maxAiLat, -10.5, -3.5, 3.5, 10.5, maxAiLat];
        let bestLat = desiredOffset;
        let bestScore = -Infinity;
        for (const cand of candidateLats) {
          const dPlayer = Math.abs(cand - playerLat);
          const dCorrect = Math.abs(cand - correctLat);
          const minClear = Math.min(dPlayer, dCorrect * 0.92);
          const tieBreak = -Math.abs(cand - r.aiTargetOffset) * 0.04;
          const score = minClear + tieBreak;
          if (score > bestScore) {
            bestScore = score;
            bestLat = cand;
          }
        }
        desiredOffset = THREE.MathUtils.clamp(bestLat, -maxAiLat, maxAiLat);
      }
    }

    const latDiff = desiredOffset - r.lateral;
    const maxLatVel = avoidingPlayer ? 22 : 14;
    const latGain = avoidingPlayer ? 3.8 : 2.5;
    const latDamp = avoidingPlayer ? 8.5 : 5;
    r.lateralVel = THREE.MathUtils.damp(
      r.lateralVel,
      THREE.MathUtils.clamp(latDiff * latGain, -maxLatVel, maxLatVel),
      latDamp,
      dt
    );
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
    const totalRaceGates = TOTAL_LAPS * this.itemSystem.rows.length;
    if (this.playerRacer.finished || this.quizGatesCleared >= totalRaceGates) {
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
      this.activeQuiz = generateQuizChallenge(this.usedTermIds, catId, this.speedClass);
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
    this.eventNoticeTimer = 2.6;
  }

  private triggerHitAlert(source: string, accentHex: string, duration = 1.9): void {
    this.hitAlertSource = source;
    this.hitAlertHex = accentHex;
    this.hitAlertTimer = duration;
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
    if (this.phase !== 'racing' || r.finished) return;

    // AI racers pick up at most 1 item strictly when passing through an item gate
    if (!r.isPlayer) {
      for (const row of this.itemSystem.rows) {
        if (this.didCrossS(r.prevS, r.s, row.s)) {
          const gateKey = `${r.lap}-${row.rowIndex}`;
          if (r.aiLastGateKey !== gateKey) {
            r.aiLastGateKey = gateKey;
            const isFinalLapLate = r.lap >= TOTAL_LAPS && row.rowIndex >= 0;
            const pool: SubItemType[] = isFinalLapLate
              ? ['boost', 'glow_boost', 'hover_glide', 'shield', 'spread_missile']
              : ['glow_boost', 'hover_glide', 'spread_missile', 'laser', 'leader_bomb', 'mine', 'emp'];
            // Stock limit = 1 (overwrites any unused previous item)
            r.heldItem = pool[Math.floor(Math.random() * pool.length)];
            r.heldItemHoldTime = 0;
            r.aiItemCooldown = 1.6 + Math.random() * 3.0;
          }
        }
      }
      return;
    }

    const row = this.itemSystem.rows[this.nextQuizRowIndex];
    if (!row || !row.active) return;

    let ds = Math.abs(r.s - row.s);
    if (ds > 0.5) ds = 1 - ds;
    const distAlong = ds * this.track.totalLength;
    const crossed = this.didCrossS(r.prevS, r.s, row.s);

    if (!crossed && distAlong >= 4.5) return;

    const laneIdx = this.getLaneIndexFromLateral(r.lateral);
    this.itemSystem.setRowVisible(row.rowIndex, false, true);
    this.itemSystem.setRowQuizDisplay(row.rowIndex, null, false);

    const quiz =
      this.activeQuiz ??
      generateQuizChallenge(this.usedTermIds, this.getCourseSpec().categoryId, this.speedClass);
    const choice = quiz.choices[laneIdx];
    const correctChoice = quiz.choices[quiz.correctLaneIndex];
    this.quizAttempts += 1;

    // Silently record attempts & correct count for Hard-mode weakness tracking
    recordTermAnswer(quiz.targetTerm.term.id, choice.isCorrect);

    if (choice.isCorrect) {
      this.quizCorrectCount += 1;
      this.quizStreak += 1;
      if (this.quizStreak > this.bestQuizStreak) {
        this.bestQuizStreak = this.quizStreak;
      }

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

      // Correct answer: clear any lingering quiz drag, grant stronger Turbo boost + streak bonus AND the lane's item
      r.quizPenaltyTimer = 0;
      const classMultiplier = this.speedClass === 'hard' ? 1.10 : 1.0;
      const baseMax = (this.getSelectedSpec().maxSpeedKmh / 3.6) * classMultiplier;
      const streakExtraSec = Math.min(1.4, Math.max(0, (this.quizStreak - 1) * 0.35));
      r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 3.2 * r.itemPower + streakExtraSec);
      r.speed = Math.max(
        r.speed,
        baseMax * (choice.itemKind === 'boost' ? 1.42 : this.quizStreak >= 3 ? 1.32 : 1.24)
      );

      if (choice.itemKind === 'boost' || this.quizStreak >= 3) {
        const streakTurbo = this.quizStreak >= 3 ? 1.5 + Math.min(1.2, (this.quizStreak - 3) * 0.4) : 0;
        r.superTurboTimer = Math.max(
          r.superTurboTimer,
          choice.itemKind === 'boost' ? 3.6 * r.itemPower : streakTurbo
        );
        r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 4.0 * r.itemPower);
      }

      if (r.heldItem) {
        this.activateSubItem(r);
      }
      r.heldItem = choice.itemKind;
      r.heldItemHoldTime = 0;

      this.audio.playItemPickup();
      this.audio.playBoostPad();
      this.track.sampleAtS(r.s, _sample);
      this.itemSystem.spawnDashRings(
        r.pos,
        _sample.tangent,
        _sample.up,
        choice.itemKind === 'boost' || this.quizStreak >= 3 ? 0xf59e0b : 0x22d3ee,
        choice.itemKind === 'boost' || this.quizStreak >= 3
      );

      const streakTag = this.quizStreak >= 2 ? ` · ${this.quizStreak}連続正解!` : '';
      if (choice.itemKind === 'boost') {
        this.quizFeedback = {
          correct: true,
          termName: choice.term.name,
          message: `正解！「${choice.term.name}」獲得 · HYPER TURBO発動！${streakTag}`,
        };
        this.pushEventNotice(`正解！「${choice.term.name}」パーツ獲得 + HYPER TURBO!${streakTag}`);
      } else {
        this.quizFeedback = {
          correct: true,
          termName: choice.term.name,
          message: `正解！ターボ加速 + ${SUB_ITEMS[choice.itemKind].name}獲得${streakTag}`,
        };
        this.pushEventNotice(`正解！「${choice.term.name}」パーツ獲得 + ${SUB_ITEMS[choice.itemKind].name}${streakTag}`);
      }
      this.quizFeedbackTimer = 3.2;
    } else {
      // Wrong answer: reset streak, record review entry, stronger spin out + lingering engine stall
      this.quizStreak = 0;
      this.missedQuestions.push({
        termId: quiz.targetTerm.term.id,
        termName: correctChoice.term.name,
        chosenTermName: choice.term.name,
        questionText: quiz.questionText,
        explanation: quiz.targetTerm.term.descriptions[0] ?? '',
        subcategoryTitle: quiz.targetTerm.subcategoryTitle,
        rarity: quiz.targetTerm.term.rarity,
      });

      r.hitSpinTimer = 2.2;
      r.quizPenaltyTimer = 4.5;
      r.speed *= 0.28;
      r.accelSurgeTimer = 0;
      r.superTurboTimer = 0;
      r.glowBoostTimer = 0;
      this.track.sampleAtS(r.s, _sample);
      this.itemSystem.spawnHitBurst(r.pos, _sample.up, 0xef4444, 1.3);
      this.audio.playHitImpact();

      this.quizFeedback = {
        correct: false,
        termName: correctChoice.term.name,
        message: `誤答スピン！ 正解は「${correctChoice.term.name}」`,
      };
      this.triggerHitAlert('誤答スピン', '#EF4444', 2.2);
      this.pushEventNotice(`不正解スピン… 正解: ${correctChoice.term.name}`);
      this.quizFeedbackTimer = 18.0;
    }

    this.activeQuiz = null;
    this.quizLanesRevealed = false;
    this.assistedLaneIndex = null;
    this.quizGatesCleared += 1;
    this.nextQuizRowIndex = (this.nextQuizRowIndex + 1) % this.itemSystem.rows.length;
    this.emitTelemetry();
  }

  private activateSubItem(r: RacerState): void {
    const item = r.heldItem;
    if (!item) return;
    r.heldItem = null;
    r.heldItemHoldTime = 0;

    const enhanced = r.itemPower >= 1.3;
    this.track.sampleAtS(r.s, _sample);
    const maxLat = this.track.halfWidth - 2.0;

    if (item === 'boost') {
      const dur = Number((2.5 * r.itemPower).toFixed(1));
      r.accelSurgeTimer = Math.max(r.accelSurgeTimer, dur);
      if (enhanced) {
        r.superTurboTimer = Math.max(r.superTurboTimer, 1.8);
      }
      this.itemSystem.spawnDashRings(r.pos, _sample.tangent, _sample.up, 0xf59e0b, true);
      if (r.isPlayer) {
        this.audio.playBoostPad();
        this.pushEventNotice(enhanced ? `Turbo Boost+ (${dur}s)` : `Turbo Boost (${dur}s)`);
      }
    } else if (item === 'shield') {
      const dur = Number((5.2 * r.itemPower).toFixed(1));
      r.shieldTimer = dur;
      if (enhanced) {
        r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 1.6);
      }
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0x22d3ee, enhanced ? 15 : 10, 0.5);
      if (r.isPlayer) {
        this.audio.playEnergyRestore();
        this.pushEventNotice(enhanced ? `Aegis Shield+ (${dur}s)` : `Aegis Shield (${dur}s)`);
      }
    } else if (item === 'mine') {
      const dropS = (((r.s - 3.8 / this.track.totalLength) % 1) + 1) % 1;
      if (enhanced) {
        [-4.6, 0, 4.6].forEach((offset) => {
          const lat = THREE.MathUtils.clamp(r.lateral + offset, -maxLat, maxLat);
          this.itemSystem.spawnMine(r.id, dropS, lat, r.itemPower);
        });
      } else {
        this.itemSystem.spawnMine(r.id, dropS, r.lateral, r.itemPower);
      }
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xa855f7, enhanced ? 14 : 9, 0.42);
      if (r.isPlayer) {
        this.audio.playItemUse();
        this.pushEventNotice(enhanced ? 'Triple Mega Mine 設置！' : 'Mega Mine 設置！');
      }
    } else if (item === 'laser') {
      const spawnS = (((r.s + 4.5 / this.track.totalLength) % 1) + 1) % 1;
      this.itemSystem.spawnLaser(r.id, spawnS, r.lateral, r.speed, r.itemPower);
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xef4444, enhanced ? 16 : 11, 0.4);
      if (r.isPlayer) {
        this.audio.playLaserShot(enhanced);
        this.pushEventNotice(enhanced ? 'Twin Plasma Laser 発射！' : 'Plasma Laser 発射！');
      }
    } else if (item === 'spread_missile') {
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
      const spawnS = (((r.s + 3.2 / this.track.totalLength) % 1) + 1) % 1;
      const spreadOffsets = enhanced ? [-7.2, -3.6, 0, 3.6, 7.2] : [-4.4, 0, 4.4];
      spreadOffsets.forEach((offset, idx) => {
        const lat = THREE.MathUtils.clamp(r.lateral + offset, -maxLat, maxLat);
        const sOffset = (((spawnS + (idx === Math.floor(spreadOffsets.length / 2) ? 0.002 : 0)) % 1) + 1) % 1;
        const homingMult = offset === 0 ? 1.0 : 0.45;
        this.itemSystem.spawnMissile(
          r.id,
          target ? target.id : null,
          sOffset,
          lat,
          r.speed,
          r.itemPower,
          enhanced ? 1.12 : 0.95,
          homingMult
        );
      });
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xfb7185, enhanced ? 16 : 11, 0.45);
      if (r.isPlayer) {
        this.audio.playItemUse();
        this.pushEventNotice(enhanced ? '5-Way Spread Missile 発射！' : 'Spread Missile 発射！');
      }
    } else if (item === 'leader_bomb') {
      const sorted = [...this.racers].sort((a, b) => this.getTotalProgress(b) - this.getTotalProgress(a));
      const target = sorted.find((o) => o.id !== r.id) ?? sorted[0];
      if (target) {
        this.itemSystem.spawnBombStrike(r.id, target.id, target.s, target.lateral, r.itemPower);
      }
      if (enhanced) {
        r.accelSurgeTimer = Math.max(r.accelSurgeTimer, 1.5);
      }
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xf97316, 12, 0.45);
      if (r.isPlayer) {
        this.audio.playItemUse();
        this.pushEventNotice(target ? `SatelliteLaser Lock-On → ${target.name}` : 'SatelliteLaser 発動！');
      }
    } else if (item === 'glow_boost') {
      const dur = Number(((enhanced ? 6.6 : 5.0) * Math.max(1.0, r.itemPower * 0.9)).toFixed(1));
      r.glowBoostTimer = Math.max(r.glowBoostTimer, dur);
      r.accelSurgeTimer = Math.max(r.accelSurgeTimer, enhanced ? 2.4 : 1.5);
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xfde047, enhanced ? 18 : 13, 0.55);
      if (r.isPlayer) {
        this.audio.playBoostPad();
        this.pushEventNotice(enhanced ? `Hyper Glow+ (${dur}s)` : `Hyper Glow (${dur}s)`);
      }
    } else if (item === 'hover_glide') {
      const dur = Number(((enhanced ? 6.0 : 4.8) * Math.max(1.0, r.itemPower * 0.9)).toFixed(1));
      r.hoverGlideTimer = Math.max(r.hoverGlideTimer, dur);
      r.hoverGlideDuration = Math.max(r.hoverGlideDuration, dur);
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0x2dd4bf, enhanced ? 17 : 12, 0.55);
      if (r.isPlayer) {
        this.audio.playHoverGlide();
        this.pushEventNotice(enhanced ? `Aero Float+ (${dur}s)` : `Aero Float (${dur}s)`);
      }
    } else if (item === 'emp') {
      const myProg = this.getTotalProgress(r);
      const stunSec = 1.45 * Math.min(1.4, r.itemPower);
      let hitCount = 0;
      for (const other of this.racers) {
        if (other.id === r.id) continue;
        const progDiff = this.getTotalProgress(other) - myProg;
        // Strike racers within visible ahead pack (~360m) with clear visual/audio hit feedback
        if (progDiff > 0 && progDiff <= 0.075) {
          const prevGrace = other.postHitGraceTimer;
          this.applyHitToRacer(other, 'EMP Wave', stunSec);
          if (other.postHitGraceTimer > prevGrace) {
            hitCount++;
          }
        }
      }
      this.itemSystem.spawnShockwave(r.pos, _sample.up, 0x38bdf8, enhanced ? 26 : 18, 0.65);
      if (r.isPlayer) {
        this.audio.playHitImpact();
        this.pushEventNotice(hitCount > 0 ? `EMP Wave Hit (${hitCount})` : 'EMP Wave 発動！');
      }
    }
  }

  private getAttackStyle(sourceLabel: string): { color: number; hex: string } {
    if (sourceLabel === 'SatelliteLaser') return { color: 0xf97316, hex: '#F97316' };
    if (sourceLabel === 'Plasma Laser') return { color: 0xef4444, hex: '#EF4444' };
    if (sourceLabel === 'Spread Missile') return { color: 0xfb7185, hex: '#FB7185' };
    if (sourceLabel === 'Mega Mine') return { color: 0xa855f7, hex: '#A855F7' };
    if (sourceLabel === 'EMP Wave') return { color: 0x38bdf8, hex: '#38BDF8' };
    if (sourceLabel === 'Hyper Glow') return { color: 0xfde047, hex: '#FDE047' };
    return { color: 0xff4444, hex: '#EF4444' };
  }

  private applyHitToRacer(r: RacerState, sourceLabel: string, stunDuration = 1.4): void {
    if (r.shieldTimer > 0) {
      r.shieldTimer = 0;
      this.track.sampleAtS(r.s, _sample);
      this.itemSystem.spawnHitBurst(r.pos, _sample.up, 0x22d3ee, 1.0);
      if (r.isPlayer) {
        this.audio.playEnergyRestore();
        this.pushEventNotice(`Aegis Shield 防御！ (${sourceLabel})`);
      }
      return;
    }
    if (r.postHitGraceTimer > 0) return;

    const { color, hex } = this.getAttackStyle(sourceLabel);
    r.hitSpinTimer = r.isPlayer ? Math.min(1.25, stunDuration) : stunDuration;
    r.postHitGraceTimer = r.isPlayer ? 2.6 : 1.5;
    r.speed *= r.isPlayer ? 0.62 : 0.54;
    r.accelSurgeTimer = 0;
    this.track.sampleAtS(r.s, _sample);
    this.itemSystem.spawnHitBurst(r.pos, _sample.up, color, r.isPlayer ? 1.35 : 1.15);
    if (r.isPlayer) {
      this.audio.playHitImpact();
      this.triggerHitAlert(`${sourceLabel} 被弾！`, hex, 1.9);
      this.pushEventNotice(`${sourceLabel} Hit!`);
    }
  }

  private updateHazards(dt: number): void {
    // 1. Homing & Spread Missiles
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
        if (ds * this.track.totalLength < 3.6 && Math.abs(r.lateral - m.lateral) < 2.8) {
          this.applyHitToRacer(r, 'Spread Missile', m.stunDuration);
          if (m.ownerId === this.playerRacer.id) {
            this.audio.playHitImpact();
            this.pushEventNotice(`HIT! ${r.name} ← Spread Missile`);
          }
          hit = true;
          break;
        }
      }

      if (hit || m.ttl <= 0) {
        this.itemSystem.removeMissile(i);
      }
    }

    // 2. Blazing Plasma Lasers
    for (let i = this.itemSystem.lasers.length - 1; i >= 0; i--) {
      const l = this.itemSystem.lasers[i];
      l.ttl -= dt;
      l.s = (((l.s + (l.speed * dt) / this.track.totalLength) % 1) + 1) % 1;
      this.itemSystem.positionLaser(l);

      let hit = false;
      for (const r of this.racers) {
        if (r.id === l.ownerId) continue;
        let ds = Math.abs(r.s - l.s);
        if (ds > 0.5) ds = 1 - ds;
        if (ds * this.track.totalLength < 13.5 && Math.abs(r.lateral - l.lateral) < l.beamWidth) {
          this.applyHitToRacer(r, 'Plasma Laser', l.stunDuration);
          if (l.ownerId === this.playerRacer.id) {
            this.audio.playHitImpact();
            this.pushEventNotice(`HIT! ${r.name} ← Plasma Laser`);
          }
          hit = true;
          break;
        }
      }

      if (hit || l.ttl <= 0) {
        this.itemSystem.removeLaser(i);
      }
    }

    // 3. Orbital 1st-Place Strike (SatelliteLaser) — nearly guaranteed unless shielded or timed boost dodge
    for (let i = this.itemSystem.bombStrikes.length - 1; i >= 0; i--) {
      const b = this.itemSystem.bombStrikes[i];
      const target = this.racers.find((r) => r.id === b.targetId);

      if (!b.detonated) {
        b.lockTimer -= dt;
        const targetBoosting = Boolean(
          target && (target.superTurboTimer > 0 || target.accelSurgeTimer > 0.25)
        );
        const lockCutoff = targetBoosting ? 0.16 : 0.04;
        if (target && b.lockTimer > lockCutoff) {
          b.s = target.s;
          b.lateral = target.lateral;
        }
        this.track.sampleAtS(b.s, _sample);
        const strikePos = _vA.copy(_sample.position).addScaledVector(_sample.right, b.lateral);
        this.itemSystem.positionBombStrike(b, strikePos, _sample.up);

        if (b.lockTimer <= 0) {
          b.detonated = true;
          b.damageApplied = true;
          this.itemSystem.spawnHitBurst(strikePos, _sample.up, 0xf97316, 1.75);
          if (b.ownerId === this.playerRacer.id || b.targetId === this.playerRacer.id) {
            this.audio.playOrbitalExplosion();
          }
          let playerHitOrBlocked = false;
          for (const r of this.racers) {
            if (r.id === b.ownerId) continue;
            if (r.pos.distanceTo(strikePos) <= b.blastRadius) {
              if (r.isPlayer) playerHitOrBlocked = true;
              this.applyHitToRacer(r, 'SatelliteLaser', b.stunDuration);
              if (b.ownerId === this.playerRacer.id && !r.isPlayer) {
                this.pushEventNotice(`SATELLITE LASER! ${r.name}`);
              }
            }
          }
          if (b.targetId === this.playerRacer.id && !playerHitOrBlocked) {
            this.pushEventNotice('ブーストで SatelliteLaser 回避！');
          }
          this.itemSystem.positionBombStrike(b, strikePos, _sample.up);
        }
      } else {
        b.blastTimer -= dt;
        this.track.sampleAtS(b.s, _sample);
        const strikePos = _vA.copy(_sample.position).addScaledVector(_sample.right, b.lateral);
        this.itemSystem.positionBombStrike(b, strikePos, _sample.up);

        if (b.blastTimer <= 0) {
          this.itemSystem.removeBombStrike(i);
        }
      }
    }

    // 4. Mega Mines (Airborne Aero Float cars glide safely over mines!)
    for (let i = this.itemSystem.mines.length - 1; i >= 0; i--) {
      const mine = this.itemSystem.mines[i];
      if (mine.graceTimer > 0) continue;

      for (const r of this.racers) {
        if (r.hoverGlideTimer > 0) continue;
        let ds = Math.abs(r.s - mine.s);
        if (ds > 0.5) ds = 1 - ds;
        if (ds * this.track.totalLength < mine.hitRadius && Math.abs(r.lateral - mine.lateral) < mine.hitRadius) {
          this.applyHitToRacer(r, 'Mega Mine', mine.stunDuration);
          if (mine.ownerId === this.playerRacer.id && !r.isPlayer) {
            this.audio.playHitImpact();
            this.pushEventNotice(`HIT! ${r.name} ← Mega Mine`);
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
          this.track.sampleAtS(r.s, _sample);
          this.itemSystem.spawnDashRings(r.pos, _sample.tangent, _sample.up, 0x38bdf8, false);
          if (r.isPlayer) {
            this.audio.playBoostPad();
          }
        }
      }
    }

    for (const fpad of this.track.floatPads) {
      let ds = Math.abs(r.s - fpad.s);
      if (ds > 0.5) ds = 1 - ds;
      const distAlong = ds * this.track.totalLength;
      if (distAlong < fpad.length * 0.55 && Math.abs(r.lateral - fpad.lateral) < fpad.width * 0.7) {
        if (r.hoverGlideTimer <= 0.45) {
          const padFloatDur = 3.0;
          r.hoverGlideTimer = padFloatDur;
          r.hoverGlideDuration = padFloatDur;
          this.track.sampleAtS(r.s, _sample);
          this.itemSystem.spawnShockwave(r.pos, _sample.up, 0x2dd4bf, 10, 0.45);
          if (r.isPlayer) {
            this.audio.playHoverGlide();
            this.pushEventNotice('AERO FLOAT PAD!');
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
      r.lapTimesMs.push(lapTime);

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
          this.phase = 'finishing';
          this.finishCelebrationTimer = 1.25;
          this.activeQuiz = null;
          this.quizLanesRevealed = false;
          this.hitAlertSource = null;
          this.hitAlertTimer = 0;

          this.track.sampleAtS(r.s, _sample);
          this.itemSystem.spawnDashRings(r.pos, _sample.tangent, _sample.up, 0x22d3ee, true);
          this.itemSystem.spawnShockwave(r.pos, _sample.up, 0xfbbf24, 18, 0.7);

          const playerRank = this.getRacerRank(r);
          const { placedRank } = recordTotalTimeRanking({
            courseId: this.courseId,
            speedClass: this.speedClass,
            totalTimeMs: r.finishTimeMs,
            lapTimesMs: [...r.lapTimesMs],
            bestLapMs: r.bestLapMs,
            machineId: this.machineId,
            machineName: this.getSelectedSpec().name,
            rankFinished: playerRank,
          });
          this.rankingPlacement = placedRank;
          this.audio.playLapComplete(true);
          this.emitTelemetry(true);
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
    const playerProtected = this.isNearItemLine(this.playerRacer.s, 260, 60);

    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i];
        const b = this.racers[j];
        const hasGlow = a.glowBoostTimer > 0 || b.glowBoostTimer > 0;
        const baseDist = playerProtected && (a.isPlayer || b.isPlayer) ? 5.6 : 3.2;
        const checkDist = hasGlow ? Math.max(baseDist, 4.4) : baseDist;
        const distSq = a.pos.distanceToSquared(b.pos);

        if (distSq < checkDist * checkDist && distSq > 0.0001) {
          // Hyper Glow contact spin against rival machines
          if (distSq < 4.4 * 4.4) {
            if (a.glowBoostTimer > 0 && b.glowBoostTimer <= 0 && (a.isPlayer || !b.isPlayer)) {
              const prevGrace = b.postHitGraceTimer;
              this.applyHitToRacer(b, 'Hyper Glow', 1.35 * Math.min(1.3, a.itemPower));
              if (a.isPlayer && b.postHitGraceTimer > prevGrace) {
                this.audio.playHitImpact();
                this.pushEventNotice(`HYPER GLOW! ${b.name} をスピン！`);
              }
            } else if (b.glowBoostTimer > 0 && a.glowBoostTimer <= 0 && (b.isPlayer || !a.isPlayer)) {
              const prevGrace = a.postHitGraceTimer;
              this.applyHitToRacer(a, 'Hyper Glow', 1.35 * Math.min(1.3, b.itemPower));
              if (b.isPlayer && a.postHitGraceTimer > prevGrace) {
                this.audio.playHitImpact();
                this.pushEventNotice(`HYPER GLOW! ${a.name} をスピン！`);
              }
            }
          }

          if (distSq < baseDist * baseDist) {
            const dist = Math.sqrt(distSq);
            const push = (baseDist - dist) * 0.5;
            const latSign = a.lateral >= b.lateral ? 1 : -1;

            // Near item lines, other cars always yield wide clearance away from the player
            if (playerProtected && (a.isPlayer || b.isPlayer)) {
              if (a.isPlayer) {
                b.lateral -= latSign * push * 2.2;
                b.lateralVel -= latSign * 10;
              } else {
                a.lateral += latSign * push * 2.2;
                a.lateralVel += latSign * 10;
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
  }

  private syncRacerVisual(r: RacerState, dt: number, boosting: boolean): void {
    r.model.root.position.copy(r.pos);
    r.model.root.quaternion.copy(r.headingQuat);

    // Smooth gentle float & touchdown curve when hover_glide / Aero Float Pad is active
    const hoverActive = r.hoverGlideTimer > 0;
    const maxLift = r.itemPower >= 1.3 ? 4.4 : 3.5;
    let targetLift = 0;
    if (hoverActive) {
      if (r.hoverGlideTimer < 0.85) {
        const t = Math.max(0, r.hoverGlideTimer / 0.85);
        targetLift = maxLift * (t * t * (3 - 2 * t));
      } else {
        targetLift = maxLift;
      }
    }
    const safeDt = dt > 0 ? dt : 0.016;
    r.hoverLift = THREE.MathUtils.damp(
      r.hoverLift,
      targetLift,
      targetLift > r.hoverLift ? 6.2 : 5.4,
      safeDt
    );
    const hoverLift =
      r.hoverLift + (r.hoverLift > 0.1 ? Math.sin(r.hoverPhase * 1.4) * 0.14 * (r.hoverLift / maxLift) : 0);

    const hoverBob = Math.sin(r.hoverPhase) * 0.045;
    r.model.chassisGroup.position.y = 0.80 + hoverBob + hoverLift;
    const spinY = r.hitSpinTimer > 0 ? r.hitSpinTimer * Math.PI * 4.5 : 0;
    r.model.chassisGroup.rotation.set(r.pitchVisual, spinY, r.rollVisual);

    const shadowScale = 1 + hoverLift * 0.08;
    r.model.shadowPlane.scale.setScalar(shadowScale);

    r.model.shieldDome.visible = r.shieldTimer > 0;
    if (r.shieldTimer > 0) {
      r.model.shieldDome.rotation.y += 0.04;
    }

    const glowActive = r.glowBoostTimer > 0;
    r.model.glowAura.visible = glowActive;
    if (glowActive) {
      r.model.glowAura.rotation.y += 0.09;
      r.model.glowAura.rotation.z = Math.sin(r.hoverPhase * 2) * 0.14;
      const glowPulse = 0.96 + Math.sin(r.hoverPhase * 4) * 0.09;
      r.model.glowAura.scale.setScalar(glowPulse);
    }

    r.model.hoverHalo.visible = hoverActive || r.hoverLift > 0.2;
    if (r.model.hoverHalo.visible) {
      const haloPulse = 0.9 + Math.sin(r.hoverPhase * 5) * 0.16;
      r.model.hoverHalo.scale.set(haloPulse, haloPulse, 1);
    }

    const spinning = r.hitSpinTimer > 0;
    r.model.spinSparkRing.visible = spinning;
    if (spinning) {
      r.model.spinSparkRing.rotation.y -= 0.24;
      const sp = 0.92 + Math.sin(r.hoverPhase * 8) * 0.18;
      r.model.spinSparkRing.scale.setScalar(sp);
    }

    const dashActive = r.accelSurgeTimer > 0 || r.superTurboTimer > 0;
    r.model.boostAura.visible = dashActive;
    if (dashActive) {
      const superMult = r.superTurboTimer > 0 ? 1.24 : 1.0;
      const pulse = (0.94 + Math.sin(r.hoverPhase * 9) * 0.1) * superMult;
      r.model.boostAura.scale.set(pulse, pulse, 1.0 + Math.sin(r.hoverPhase * 7) * 0.14);
      r.model.boostAura.rotation.z = Math.sin(r.hoverPhase * 4) * 0.08;
    }

    const flameScale = boosting ? 2.4 + Math.sin(r.hoverPhase * 6) * 0.45 : 0.45 + Math.min(1, r.speed / 95) * 0.75;
    const flameRadius = boosting ? 1.55 : 0.85;
    for (const flame of r.model.thrusterFlames) {
      flame.scale.set(flameRadius, flameRadius, flameScale);
    }
    r.model.boostGlowMaterial.emissiveIntensity = glowActive ? 4.4 : boosting ? 3.9 : 2.0;
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

    const isFinishSweep = this.phase === 'finishing' || this.phase === 'finished';
    const backDist = isFinishSweep ? 11.4 : 9.4;
    const heightDist = isFinishSweep ? 4.4 : 3.85;
    const lookAhead = 18;

    _vC.copy(r.pos).addScaledVector(_vA, -backDist).addScaledVector(_vB, heightDist);
    if (isFinishSweep) {
      // Gentle cinematic lateral offset on finish victory lap
      _vLeft.crossVectors(_vB, _vA).normalize();
      _vC.addScaledVector(_vLeft, 3.6);
    }
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
      progressNorm: r.finished
        ? 1
        : THREE.MathUtils.clamp(this.getTotalProgress(r) / TOTAL_LAPS, 0, 0.999),
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

    let incomingThreat: IncomingThreatType = null;
    if (this.itemSystem.bombStrikes.some((b) => !b.detonated && b.targetId === this.playerRacer.id)) {
      incomingThreat = 'satellite';
    } else if (this.itemSystem.missiles.some((m) => m.targetId === this.playerRacer.id)) {
      incomingThreat = 'missile';
    } else {
      const laserApproaching = this.itemSystem.lasers.some((l) => {
        if (l.ownerId === this.playerRacer.id) return false;
        let ds = this.playerRacer.s - l.s;
        if (ds < 0) ds += 1;
        return (
          ds * this.track.totalLength < 250 &&
          Math.abs(l.lateral - this.playerRacer.lateral) < l.beamWidth + 3.5
        );
      });
      if (laserApproaching) incomingThreat = 'laser';
    }

    const hitAlert: HitAlertTelemetry | null =
      this.hitAlertTimer > 0 && this.hitAlertSource
        ? {
            source: this.hitAlertSource,
            accentHex: this.hitAlertHex,
            remainingSec: this.hitAlertTimer,
          }
        : null;

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
      speedClass: this.speedClass,
      machineId: this.machineId,
      machineName: this.getSelectedSpec().name,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      speedKmh: Math.round(Math.abs(this.playerRacer.speed) * 3.6),
      isAccelerating: accelerating,
      rank: playerRank,
      totalRacers: this.racers.length,
      lap: Math.min(this.playerRacer.lap, TOTAL_LAPS),
      totalLaps: TOTAL_LAPS,
      currentLapMs: Math.max(0, this.raceElapsedMs - this.playerRacer.lapStartMs),
      lapTimesMs: [...this.playerRacer.lapTimesMs],
      bestLapMs: this.playerRacer.bestLapMs,
      totalRaceMs: this.playerRacer.finished ? this.playerRacer.finishTimeMs : this.raceElapsedMs,
      allTimeBestLapMs: this.allTimeBestLapMs,
      isNewRecord: this.isNewRecord,
      rankingPlacement: this.rankingPlacement,
      markers,
      standings,
      wrongWay: false,
      heldItem: this.playerRacer.heldItem,
      heldItemRemainingSec: this.playerRacer.heldItem
        ? Math.max(0, 8.0 - this.playerRacer.heldItemHoldTime)
        : 0,
      shieldActive: this.playerRacer.shieldTimer > 0,
      glowActive: this.playerRacer.glowBoostTimer > 0,
      hoverActive: this.playerRacer.hoverGlideTimer > 0,
      missileWarning: incomingThreat !== null,
      incomingThreat,
      hitAlert,
      eventNotice: this.eventNotice,
      activeQuiz: activeQuizTelemetry,
      quizFeedback: this.quizFeedback,
      earnedCards: [...this.earnedCards],
      missedQuestions: [...this.missedQuestions],
      quizAttempts: this.quizAttempts,
      quizCorrectCount: this.quizCorrectCount,
      quizStreak: this.quizStreak,
      bestQuizStreak: this.bestQuizStreak,
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
