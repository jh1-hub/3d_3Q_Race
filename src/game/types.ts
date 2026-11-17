export type MachineId = 'valkyrie' | 'tempest' | 'phantom';

export type ChassisStyle = 'valkyrie' | 'tempest' | 'phantom';

export type SpeedClass = 'normal' | 'hard';

export type CourseId = 'orbital' | 'oceanic' | 'lunar' | 'skycity';

export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export interface CourseSpec {
  id: CourseId;
  name: string;
  jpName: string;
  subtitle: string;
  categoryId: string | null;
  categoryLabel: string;
  accentHex: string;
  accentColor: number;
  skyHex: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  keyColor: number;
  rimColor: number;
  dustColor: number;
  railColor: number;
  railEmissive: number;
}

export const COURSES: CourseSpec[] = [
  {
    id: 'orbital',
    name: 'ORBITAL NEXUS',
    jpName: '軌道メトロポリス',
    subtitle: '全カテゴリの用語が出題される総合サーキット',
    categoryId: null,
    categoryLabel: '全カテゴリ出題',
    accentHex: '#06B6D4',
    accentColor: 0x06b6d4,
    skyHex: 0x05070e,
    fogDensity: 0.00088,
    hemiSky: 0x38bdf8,
    hemiGround: 0x0b1220,
    keyColor: 0xffedd5,
    rimColor: 0x06b6d4,
    dustColor: 0x7dd3fc,
    railColor: 0x22d3ee,
    railEmissive: 0x06b6d4,
  },
  {
    id: 'oceanic',
    name: 'AQUA GENERATOR BAY',
    jpName: '海洋都市＆発電施設群',
    subtitle: '未来の海上都市と潮力・融合発電プラントを巡る高速ベイ',
    categoryId: '1',
    categoryLabel: '企業活動と情報処理',
    accentHex: '#14B8A6',
    accentColor: 0x14b8a6,
    skyHex: 0x04121f,
    fogDensity: 0.00082,
    hemiSky: 0x2dd4bf,
    hemiGround: 0x062133,
    keyColor: 0xe0f7fa,
    rimColor: 0xf59e0b,
    dustColor: 0x5eead4,
    railColor: 0x2dd4bf,
    railEmissive: 0x0d9488,
  },
  {
    id: 'lunar',
    name: 'LUNAR FRONTIER BASE',
    jpName: '月面探索基地',
    subtitle: 'クレーターとバイオスフィア・通信基地を結ぶ月面軌道',
    categoryId: '2',
    categoryLabel: 'コンピュータシステムと通信ネットワーク',
    accentHex: '#F97316',
    accentColor: 0xf97316,
    skyHex: 0x05070d,
    fogDensity: 0.00058,
    hemiSky: 0x94a3b8,
    hemiGround: 0x1e2430,
    keyColor: 0xfff7ed,
    rimColor: 0x38bdf8,
    dustColor: 0xfdba74,
    railColor: 0xfb923c,
    railEmissive: 0xea580c,
  },
  {
    id: 'skycity',
    name: 'AETHER SKY CITADEL',
    jpName: '空中都市',
    subtitle: '雲海の上に浮かぶ浮遊タワー群とオーロラのスカイウェイ',
    categoryId: '3',
    categoryLabel: '情報の集計と分析',
    accentHex: '#A855F7',
    accentColor: 0xa855f7,
    skyHex: 0x0d1028,
    fogDensity: 0.00072,
    hemiSky: 0xc084fc,
    hemiGround: 0x1e1b4b,
    keyColor: 0xfef3c7,
    rimColor: 0x22d3ee,
    dustColor: 0xe9d5ff,
    railColor: 0xc084fc,
    railEmissive: 0x9333ea,
  },
];

export type SubItemType =
  | 'boost'
  | 'laser'
  | 'spread_missile'
  | 'leader_bomb'
  | 'mine'
  | 'glow_boost'
  | 'hover_glide'
  | 'shield'
  | 'emp';

export interface SubItemMeta {
  type: SubItemType;
  name: string;
  shortLabel: string;
  accentHex: string;
}

export const SUB_ITEMS: Record<SubItemType, SubItemMeta> = {
  boost: {
    type: 'boost',
    name: 'Turbo Boost',
    shortLabel: 'TURBO',
    accentHex: '#F59E0B',
  },
  laser: {
    type: 'laser',
    name: 'Plasma Laser',
    shortLabel: 'LASER',
    accentHex: '#EF4444',
  },
  spread_missile: {
    type: 'spread_missile',
    name: 'Spread Missile',
    shortLabel: 'SPREAD',
    accentHex: '#FB7185',
  },
  leader_bomb: {
    type: 'leader_bomb',
    name: 'SatelliteLaser',
    shortLabel: 'SAT-LASER',
    accentHex: '#F97316',
  },
  mine: {
    type: 'mine',
    name: 'Mega Mine',
    shortLabel: 'MINE',
    accentHex: '#A855F7',
  },
  glow_boost: {
    type: 'glow_boost',
    name: 'Hyper Glow',
    shortLabel: 'GLOW',
    accentHex: '#FDE047',
  },
  hover_glide: {
    type: 'hover_glide',
    name: 'Aero Float',
    shortLabel: 'FLOAT',
    accentHex: '#2DD4BF',
  },
  shield: {
    type: 'shield',
    name: 'Aegis Shield',
    shortLabel: 'SHIELD',
    accentHex: '#06B6D4',
  },
  emp: {
    type: 'emp',
    name: 'EMP Wave',
    shortLabel: 'EMP',
    accentHex: '#38BDF8',
  },
};

export interface MachineSpec {
  id: MachineId;
  chassisStyle: ChassisStyle;
  name: string;
  subtitle: string;
  bodyColor: number;
  secondaryColor: number;
  accentColor: number;
  accentHex: string;
  maxSpeedKmh: number;
  accel: number;
  itemPower: number; // Multiplier for item duration, boost acceleration, and attack power
  stats: {
    speed: number; // 1-100
    accel: number;
    itemPower: number;
  };
}

export const MACHINES: MachineSpec[] = [
  {
    id: 'valkyrie',
    chassisStyle: 'valkyrie',
    name: 'VALKYRIE-X',
    subtitle: 'バランス型',
    bodyColor: 0xf1f5f9,
    secondaryColor: 0x1e3a8a,
    accentColor: 0x06b6d4,
    accentHex: '#06B6D4',
    maxSpeedKmh: 432,
    accel: 1.0,
    itemPower: 1.1,
    stats: { speed: 84, accel: 85, itemPower: 84 },
  },
  {
    id: 'tempest',
    chassisStyle: 'tempest',
    name: 'TEMPEST-R',
    subtitle: '最高速度特化',
    bodyColor: 0x18181b,
    secondaryColor: 0xb45309,
    accentColor: 0xf59e0b,
    accentHex: '#F59E0B',
    maxSpeedKmh: 468,
    accel: 0.92,
    itemPower: 0.9,
    stats: { speed: 98, accel: 78, itemPower: 72 },
  },
  {
    id: 'phantom',
    chassisStyle: 'phantom',
    name: 'PHANTOM-V',
    subtitle: 'アイテム性能特化',
    bodyColor: 0x991b1b,
    secondaryColor: 0xf8fafc,
    accentColor: 0x38bdf8,
    accentHex: '#EF4444',
    maxSpeedKmh: 420,
    accel: 1.12,
    itemPower: 1.38,
    stats: { speed: 80, accel: 94, itemPower: 98 },
  },
];

export interface MinimapMarker {
  id: string;
  x: number;
  y: number;
  isPlayer: boolean;
  color: string;
}

export interface RacerStanding {
  id: string;
  name: string;
  isPlayer: boolean;
  rank: number;
  lap: number;
  totalTimeMs: number;
  bestLapMs: number | null;
  accentHex: string;
}

export interface QuizLaneOption {
  laneIndex: number;
  termId: number;
  termName: string;
  itemKind: SubItemType;
}

export interface ActiveQuizTelemetry {
  questionText: string;
  etaSeconds: number;
  showLanes: boolean;
  lanes: QuizLaneOption[];
  playerLaneIndex: number;
}

export interface QuizFeedbackTelemetry {
  correct: boolean;
  termName: string;
  message: string;
}

export interface EarnedRaceCard {
  termId: number;
  name: string;
  rarity: 'C' | 'R' | 'SR' | 'UR';
  categoryTitle: string;
  subcategoryTitle: string;
  isNew: boolean;
  unlockedCount: number;
}

export type IncomingThreatType = 'missile' | 'laser' | 'satellite' | null;

export interface HitAlertTelemetry {
  source: string;
  accentHex: string;
  remainingSec: number;
}

export interface RaceTelemetry {
  phase: GamePhase;
  courseId: CourseId;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  speedKmh: number;
  isAccelerating: boolean;
  rank: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  currentLapMs: number;
  bestLapMs: number | null;
  totalRaceMs: number;
  allTimeBestLapMs: number | null;
  isNewRecord: boolean;
  markers: MinimapMarker[];
  standings: RacerStanding[];
  wrongWay: boolean;
  heldItem: SubItemType | null;
  shieldActive: boolean;
  glowActive?: boolean;
  hoverActive?: boolean;
  missileWarning: boolean;
  incomingThreat: IncomingThreatType;
  hitAlert: HitAlertTelemetry | null;
  eventNotice: string | null;
  activeQuiz: ActiveQuizTelemetry | null;
  quizFeedback: QuizFeedbackTelemetry | null;
  earnedCards: EarnedRaceCard[];
  quizAttempts: number;
  quizCorrectCount: number;
}
