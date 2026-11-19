import { GhostSummary, MachineId, SpeedClass } from '../game/types';

// [tMs, s, lateral, yaw, hoverLift, actionFlags]
export type GhostFrameTuple = [number, number, number, number, number, number];

export const GHOST_FLAG_BOOST = 1 << 0;
export const GHOST_FLAG_SUPER_TURBO = 1 << 1;
export const GHOST_FLAG_HOVER = 1 << 2;
export const GHOST_FLAG_HIT_SPIN = 1 << 3;
export const GHOST_FLAG_GLOW = 1 << 4;

export interface GhostRecording {
  courseKey: string;
  speedClass: SpeedClass;
  machineId: MachineId;
  machineName: string;
  totalTimeMs: number;
  lapTimesMs?: number[];
  bestLapMs?: number | null;
  createdAt: number;
  frames: GhostFrameTuple[];
}

export interface GhostSampleOut {
  s: number;
  lateral: number;
  yawAngle: number;
  hoverLift: number;
  flags: number;
  finished: boolean;
}

const BEST_GHOST_PREFIX = 'hyperion_gp_ta_ghost_best_v1_';
const LAST_GHOST_PREFIX = 'hyperion_gp_ta_ghost_last_v1_';

function getBucketSuffix(courseKey: string, speedClass: SpeedClass): string {
  return `${courseKey}_${speedClass}`;
}

function readGhost(storageKey: string): GhostRecording | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GhostRecording>;
    if (
      !parsed ||
      typeof parsed.totalTimeMs !== 'number' ||
      !Array.isArray(parsed.frames) ||
      parsed.frames.length < 2
    ) {
      return null;
    }
    return parsed as GhostRecording;
  } catch {
    return null;
  }
}

function pruneStaleGhosts(preserveKey: string, includeSubBest: boolean): boolean {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === preserveKey) continue;
      if (k.startsWith(LAST_GHOST_PREFIX)) {
        keysToRemove.push(k);
      } else if (includeSubBest && k.startsWith(BEST_GHOST_PREFIX) && k.includes('__')) {
        keysToRemove.push(k);
      }
    }
    if (keysToRemove.length === 0) return false;
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
    return true;
  } catch {
    return false;
  }
}

function writeGhost(storageKey: string, recording: GhostRecording, isBest: boolean): boolean {
  const serialized = JSON.stringify(recording);
  try {
    localStorage.setItem(storageKey, serialized);
    return true;
  } catch {
    // Quota recovery: evict LAST ghosts first (and subcategory BEST ghosts only if saving a BEST ghost)
    if (pruneStaleGhosts(storageKey, false)) {
      try {
        localStorage.setItem(storageKey, serialized);
        return true;
      } catch {
        // Fall through
      }
    }
    if (isBest && pruneStaleGhosts(storageKey, true)) {
      try {
        localStorage.setItem(storageKey, serialized);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function loadBestGhost(courseKey: string, speedClass: SpeedClass): GhostRecording | null {
  return readGhost(`${BEST_GHOST_PREFIX}${getBucketSuffix(courseKey, speedClass)}`);
}

export function loadLastGhost(courseKey: string, speedClass: SpeedClass): GhostRecording | null {
  return readGhost(`${LAST_GHOST_PREFIX}${getBucketSuffix(courseKey, speedClass)}`);
}

export function toGhostSummary(rec: GhostRecording | null): GhostSummary | null {
  if (!rec) return null;
  return {
    totalTimeMs: rec.totalTimeMs,
    machineId: rec.machineId,
    machineName: rec.machineName,
    lapTimesMs: Array.isArray(rec.lapTimesMs) ? [...rec.lapTimesMs] : [],
    bestLapMs: typeof rec.bestLapMs === 'number' ? rec.bestLapMs : null,
    createdAt: rec.createdAt,
  };
}

export function isSameGhostRecording(
  a: GhostRecording | null,
  b: GhostRecording | null
): boolean {
  if (!a || !b) return false;
  return a.createdAt === b.createdAt && Math.abs(a.totalTimeMs - b.totalTimeMs) < 0.5;
}

export function saveTimeAttackGhosts(recording: GhostRecording): {
  isNewBestGhost: boolean;
  savedBest: boolean;
  bestGhost: GhostRecording | null;
} {
  const suffix = getBucketSuffix(recording.courseKey, recording.speedClass);
  const bestKey = `${BEST_GHOST_PREFIX}${suffix}`;
  const lastKey = `${LAST_GHOST_PREFIX}${suffix}`;

  const existingBest = readGhost(bestKey);
  const isFaster = !existingBest || recording.totalTimeMs < existingBest.totalTimeMs;

  if (isFaster) {
    // Write BEST ghost first so it gets storage priority over LAST ghost
    const savedBest = writeGhost(bestKey, recording, true);
    writeGhost(lastKey, recording, false);
    return {
      isNewBestGhost: savedBest,
      savedBest,
      bestGhost: savedBest ? recording : existingBest,
    };
  }

  writeGhost(lastKey, recording, false);
  return {
    isNewBestGhost: false,
    savedBest: true,
    bestGhost: existingBest,
  };
}

export function packGhostFrame(
  tMs: number,
  s: number,
  lateral: number,
  yawAngle: number,
  hoverLift: number,
  flags: number
): GhostFrameTuple {
  return [
    Math.round(tMs),
    Math.round(s * 100000) / 100000,
    Math.round(lateral * 100) / 100,
    Math.round(yawAngle * 1000) / 1000,
    Math.round(hoverLift * 100) / 100,
    flags | 0,
  ];
}

export function sampleGhostAtTime(
  recording: GhostRecording,
  timeMs: number,
  out: GhostSampleOut
): void {
  const frames = recording.frames;
  const len = frames.length;
  if (len === 0) {
    out.finished = true;
    return;
  }

  if (timeMs <= frames[0][0]) {
    const f = frames[0];
    out.s = f[1];
    out.lateral = f[2];
    out.yawAngle = f[3];
    out.hoverLift = f[4];
    out.flags = f[5];
    out.finished = false;
    return;
  }

  const last = frames[len - 1];
  if (timeMs >= last[0]) {
    out.s = last[1];
    out.lateral = last[2];
    out.yawAngle = last[3];
    out.hoverLift = last[4];
    out.flags = last[5];
    out.finished = true;
    return;
  }

  // Binary search for frame index
  let lo = 0;
  let hi = len - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid][0] <= timeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = frames[lo];
  const b = frames[hi];
  const span = Math.max(1, b[0] - a[0]);
  const alpha = Math.max(0, Math.min(1, (timeMs - a[0]) / span));

  // Shortest-path interpolation for cyclic s in [0, 1)
  let ds = b[1] - a[1];
  if (ds < -0.5) ds += 1;
  else if (ds > 0.5) ds -= 1;

  out.s = (((a[1] + ds * alpha) % 1) + 1) % 1;
  out.lateral = a[2] + (b[2] - a[2]) * alpha;
  out.yawAngle = a[3] + (b[3] - a[3]) * alpha;
  out.hoverLift = a[4] + (b[4] - a[4]) * alpha;
  out.flags = alpha < 0.5 ? a[5] : b[5];
  out.finished = false;
}

export interface GhostProgressCurve {
  progresses: Float64Array;
  timesMs: Float64Array;
  maxProgress: number;
}

export function buildGhostProgressCurve(recording: GhostRecording): GhostProgressCurve | null {
  const frames = recording.frames;
  const len = frames.length;
  if (len < 2) return null;

  const progresses = new Float64Array(len);
  const timesMs = new Float64Array(len);

  let lapOffset = frames[0][1] > 0.8 ? -1 : 0;
  let prevS = frames[0][1];
  let prevProg = lapOffset + prevS;

  progresses[0] = prevProg;
  timesMs[0] = frames[0][0];

  for (let i = 1; i < len; i++) {
    const curS = frames[i][1];
    if (prevS > 0.85 && curS < 0.15) {
      lapOffset += 1;
    }
    const rawProg = lapOffset + curS;
    const monoProg = rawProg >= prevProg ? rawProg : prevProg;
    progresses[i] = monoProg;
    timesMs[i] = frames[i][0];
    prevS = curS;
    prevProg = monoProg;
  }

  return {
    progresses,
    timesMs,
    maxProgress: prevProg,
  };
}

export function sampleGhostTimeAtProgress(
  curve: GhostProgressCurve,
  targetProgress: number
): number | null {
  const len = curve.progresses.length;
  if (len < 2 || targetProgress <= curve.progresses[0]) {
    return null;
  }
  if (targetProgress >= curve.maxProgress) {
    return curve.timesMs[len - 1];
  }

  let lo = 0;
  let hi = len - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve.progresses[mid] <= targetProgress) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const pA = curve.progresses[lo];
  const pB = curve.progresses[hi];
  const span = pB - pA;
  const alpha = span > 1e-7 ? Math.max(0, Math.min(1, (targetProgress - pA) / span)) : 0;
  return curve.timesMs[lo] + (curve.timesMs[hi] - curve.timesMs[lo]) * alpha;
}

export function sampleGhostProgressAtTime(
  curve: GhostProgressCurve,
  timeMs: number
): number {
  const len = curve.timesMs.length;
  if (len < 2 || timeMs <= curve.timesMs[0]) {
    return curve.progresses[0] ?? 0;
  }
  if (timeMs >= curve.timesMs[len - 1]) {
    return curve.maxProgress;
  }

  let lo = 0;
  let hi = len - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve.timesMs[mid] <= timeMs) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const tA = curve.timesMs[lo];
  const tB = curve.timesMs[hi];
  const span = tB - tA;
  const alpha = span > 1e-3 ? Math.max(0, Math.min(1, (timeMs - tA) / span)) : 0;
  return curve.progresses[lo] + (curve.progresses[hi] - curve.progresses[lo]) * alpha;
}

