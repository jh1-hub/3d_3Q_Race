import { quizCategories } from '../data/quizData';

export type MachineId = 'valkyrie' | 'tempest' | 'phantom';

export type ChassisStyle = 'valkyrie' | 'tempest' | 'phantom';

export type SpeedClass = 'normal' | 'hard';

export type GameMode = 'race' | 'time_attack';

export type CourseId = 'orbital' | 'oceanic' | 'lunar' | 'skycity';

export type GamePhase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finishing' | 'finished';

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
    subtitle: '全分野の知識を統べる、成層圏オービタルリングの頂点サーキット',
    categoryId: null,
    categoryLabel: '全カテゴリ出題',
    accentHex: '#06B6D4',
    accentColor: 0x06b6d4,
    skyHex: 0x05070e,
    fogDensity: 0.00084,
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
    name: 'POWER PLANT BAY',
    jpName: '発電施設群',
    subtitle: '海上の巨大融合・潮力発電プラント群を巡る高速ベイ',
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

export interface SubCourseSpec {
  courseKey: string;
  baseCourseId: CourseId;
  categoryId: string | null;
  subcategoryId: string | null;
  title: string;
  fullName: string;
  subtitle: string;
  termCount: number;
  variantIndex: number;
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

interface SubThemeTweak {
  accentHex: string;
  accentColor: number;
  skyHex: number;
  rimColor: number;
  railColor: number;
  railEmissive: number;
}

const SUB_THEME_TWEAKS: Record<string, SubThemeTweak> = {
  '1-a': {
    accentHex: '#06B6D4',
    accentColor: 0x06b6d4,
    skyHex: 0x041322,
    rimColor: 0x38bdf8,
    railColor: 0x22d3ee,
    railEmissive: 0x0891b2,
  },
  '1-b': {
    accentHex: '#10B981',
    accentColor: 0x10b981,
    skyHex: 0x04181e,
    rimColor: 0x34d399,
    railColor: 0x34d399,
    railEmissive: 0x059669,
  },
  '1-c': {
    accentHex: '#2DD4BF',
    accentColor: 0x2dd4bf,
    skyHex: 0x061420,
    rimColor: 0xfbbf24,
    railColor: 0x5eead4,
    railEmissive: 0x0f766e,
  },
  '2-a': {
    accentHex: '#FB923C',
    accentColor: 0xfb923c,
    skyHex: 0x05070e,
    rimColor: 0x38bdf8,
    railColor: 0xfdba74,
    railEmissive: 0xea580c,
  },
  '2-b': {
    accentHex: '#F59E0B',
    accentColor: 0xf59e0b,
    skyHex: 0x060811,
    rimColor: 0x60a5fa,
    railColor: 0xfbbf24,
    railEmissive: 0xd97706,
  },
  '2-c': {
    accentHex: '#38BDF8',
    accentColor: 0x38bdf8,
    skyHex: 0x040712,
    rimColor: 0xf97316,
    railColor: 0x7dd3fc,
    railEmissive: 0x0284c7,
  },
  '2-d': {
    accentHex: '#FB7185',
    accentColor: 0xfb7185,
    skyHex: 0x09060e,
    rimColor: 0xf59e0b,
    railColor: 0xfda4af,
    railEmissive: 0xe11d48,
  },
  '3-a': {
    accentHex: '#C084FC',
    accentColor: 0xc084fc,
    skyHex: 0x0d102a,
    rimColor: 0x22d3ee,
    railColor: 0xd8b4fe,
    railEmissive: 0x9333ea,
  },
  '3-b': {
    accentHex: '#818CF8',
    accentColor: 0x818cf8,
    skyHex: 0x0a102c,
    rimColor: 0x38bdf8,
    railColor: 0xa5b4fc,
    railEmissive: 0x4f46e5,
  },
  '3-c': {
    accentHex: '#E879F9',
    accentColor: 0xe879f9,
    skyHex: 0x110e2a,
    rimColor: 0x2dd4bf,
    railColor: 0xf0abfc,
    railEmissive: 0xc026d3,
  },
};

function buildSubCourses(): SubCourseSpec[] {
  const allTermCount = quizCategories.reduce(
    (sum, cat) => sum + cat.subcategories.reduce((s2, sub) => s2 + sub.terms.length, 0),
    0
  );
  const result: SubCourseSpec[] = [];

  for (const base of COURSES) {
    const matchedCat = base.categoryId
      ? quizCategories.find((cat) => cat.id === base.categoryId)
      : undefined;
    const catTermCount = matchedCat
      ? matchedCat.subcategories.reduce((sum, sub) => sum + sub.terms.length, 0)
      : allTermCount;

    result.push({
      courseKey: base.id,
      baseCourseId: base.id,
      categoryId: base.categoryId,
      subcategoryId: null,
      title: base.categoryId ? `全範囲（${base.categoryLabel}）` : base.categoryLabel,
      fullName: base.jpName,
      subtitle: base.subtitle,
      termCount: catTermCount,
      variantIndex: 0,
      accentHex: base.accentHex,
      accentColor: base.accentColor,
      skyHex: base.skyHex,
      fogDensity: base.fogDensity,
      hemiSky: base.hemiSky,
      hemiGround: base.hemiGround,
      keyColor: base.keyColor,
      rimColor: base.rimColor,
      dustColor: base.dustColor,
      railColor: base.railColor,
      railEmissive: base.railEmissive,
    });

    if (matchedCat) {
      matchedCat.subcategories.forEach((sub, idx) => {
        const tweak = SUB_THEME_TWEAKS[sub.id];
        result.push({
          courseKey: `${base.id}__${sub.id}`,
          baseCourseId: base.id,
          categoryId: base.categoryId,
          subcategoryId: sub.id,
          title: sub.title,
          fullName: `${base.jpName} · ${sub.title}`,
          subtitle: `${base.jpName}エリア専用コース（${sub.title}のみ出題）`,
          termCount: sub.terms.length,
          variantIndex: idx + 1,
          accentHex: tweak?.accentHex ?? base.accentHex,
          accentColor: tweak?.accentColor ?? base.accentColor,
          skyHex: tweak?.skyHex ?? base.skyHex,
          fogDensity: base.fogDensity,
          hemiSky: base.hemiSky,
          hemiGround: base.hemiGround,
          keyColor: base.keyColor,
          rimColor: tweak?.rimColor ?? base.rimColor,
          dustColor: base.dustColor,
          railColor: tweak?.railColor ?? base.railColor,
          railEmissive: tweak?.railEmissive ?? base.railEmissive,
        });
      });
    }
  }

  return result;
}

export const SUB_COURSES: SubCourseSpec[] = buildSubCourses();

export function getSubCoursesForBase(baseCourseId: CourseId): SubCourseSpec[] {
  return SUB_COURSES.filter((sc) => sc.baseCourseId === baseCourseId);
}

export function resolveSubCourse(courseKey: string): SubCourseSpec {
  return SUB_COURSES.find((sc) => sc.courseKey === courseKey) ?? SUB_COURSES[0];
}

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
  description: string;
}

export const SUB_ITEMS: Record<SubItemType, SubItemMeta> = {
  boost: {
    type: 'boost',
    name: 'Turbo Boost',
    shortLabel: 'TURBO',
    accentHex: '#F59E0B',
    description: '超高速ターボで一気に加速。',
  },
  laser: {
    type: 'laser',
    name: 'Plasma Laser',
    shortLabel: 'LASER',
    accentHex: '#EF4444',
    description: '前方へ直進する高速レーザーでライバルを撃墜。',
  },
  spread_missile: {
    type: 'spread_missile',
    name: 'Spread Missile',
    shortLabel: 'SPREAD',
    accentHex: '#FB7185',
    description: '前方へ3発の拡散ミサイルを一斉発射。',
  },
  leader_bomb: {
    type: 'leader_bomb',
    name: 'SatelliteLaser',
    shortLabel: 'SAT-LASER',
    accentHex: '#F97316',
    description: '先頭（自分が1位なら後続）へ上空から衛星レーザーを爆撃。',
  },
  mine: {
    type: 'mine',
    name: 'Mega Mine',
    shortLabel: 'MINE',
    accentHex: '#A855F7',
    description: '後方に高威力マインを設置し、踏んだ敵をスピンさせる。',
  },
  glow_boost: {
    type: 'glow_boost',
    name: 'Hyper Glow',
    shortLabel: 'GLOW',
    accentHex: '#FDE047',
    description: '光のオーラを纏って加速し、体当たりした相手を弾き飛ばす。',
  },
  hover_glide: {
    type: 'hover_glide',
    name: 'Aero Float',
    shortLabel: 'FLOAT',
    accentHex: '#2DD4BF',
    description: '機体を浮上させて高速滑空し、地雷や地上障害物を回避。',
  },
  shield: {
    type: 'shield',
    name: 'Aegis Shield',
    shortLabel: 'SHIELD',
    accentHex: '#06B6D4',
    description: '攻撃を防ぐ防御バリアを展開し、最高速もわずかに上昇。',
  },
  emp: {
    type: 'emp',
    name: 'EMP Wave',
    shortLabel: 'EMP',
    accentHex: '#38BDF8',
    description: '周囲一帯に電磁波を放ち、近くのライバルをまとめてスピン。',
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
    id: 'phantom',
    chassisStyle: 'phantom',
    name: 'PHANTOM-V',
    subtitle: '安定性・アイテム性能特化',
    bodyColor: 0x991b1b,
    secondaryColor: 0xf8fafc,
    accentColor: 0x38bdf8,
    accentHex: '#EF4444',
    maxSpeedKmh: 420,
    accel: 1.12,
    itemPower: 1.38,
    stats: { speed: 80, accel: 94, itemPower: 98 },
  },
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
  progressNorm: number;
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

export interface MissedQuizReview {
  termId: number;
  termName: string;
  chosenTermName: string;
  questionText: string;
  explanation: string;
  subcategoryTitle: string;
  rarity: 'C' | 'R' | 'SR' | 'UR';
}

export interface RaceTelemetry {
  phase: GamePhase;
  gameMode: GameMode;
  courseId: CourseId;
  courseKey: string;
  subcategoryId: string | null;
  speedClass: SpeedClass;
  machineId: MachineId;
  machineName: string;
  countdownValue: number; // 3, 2, 1, 0 (GO)
  speedKmh: number;
  isAccelerating: boolean;
  manualGauge: number; // 0..1 manual steering gauge
  hasBestGhost: boolean;
  hasLastGhost: boolean;
  rank: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  currentLapMs: number;
  lapTimesMs: number[];
  bestLapMs: number | null;
  totalRaceMs: number;
  allTimeBestLapMs: number | null;
  allTimeBestTotalMs: number | null;
  bestGhostDeltaMs: number | null;
  isNewRecord: boolean;
  rankingPlacement: number | null;
  markers: MinimapMarker[];
  standings: RacerStanding[];
  wrongWay: boolean;
  heldItem: SubItemType | null;
  heldItemRemainingSec: number;
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
  missedQuestions: MissedQuizReview[];
  quizAttempts: number;
  quizCorrectCount: number;
  quizStreak: number;
  bestQuizStreak: number;
}
