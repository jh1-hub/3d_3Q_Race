import { GameMode, RankingEntry, SpeedClass } from '../game/types';

export type { RankingEntry };

type RankingsMap = Record<string, RankingEntry[]>;

const RANKINGS_STORAGE_KEY = 'hyperion_gp_total_rankings_v1';
const MAX_RANKINGS_PER_CATEGORY = 5;

function getBucketKey(courseId: string, speedClass: SpeedClass, mode: GameMode = 'race'): string {
  return mode === 'time_attack'
    ? `${courseId}_${speedClass}_ta`
    : `${courseId}_${speedClass}`;
}

export function loadAllRankings(): RankingsMap {
  try {
    const raw = localStorage.getItem(RANKINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RankingsMap;
  } catch {
    return {};
  }
}

function saveAllRankings(map: RankingsMap): void {
  try {
    localStorage.setItem(RANKINGS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getCourseRankings(
  courseId: string,
  speedClass: SpeedClass,
  mode: GameMode = 'race'
): RankingEntry[] {
  const all = loadAllRankings();
  const list = all[getBucketKey(courseId, speedClass, mode)];
  if (!Array.isArray(list)) return [];
  return [...list]
    .filter((e) => e && typeof e.totalTimeMs === 'number' && Number.isFinite(e.totalTimeMs))
    .sort((a, b) => a.totalTimeMs - b.totalTimeMs)
    .slice(0, MAX_RANKINGS_PER_CATEGORY);
}

export function recordTotalTimeRanking(
  input: Omit<RankingEntry, 'id' | 'createdAt'>
): { entries: RankingEntry[]; placedRank: number | null } {
  const all = loadAllRankings();
  const mode: GameMode = input.mode ?? 'race';
  const key = getBucketKey(input.courseId, input.speedClass, mode);
  const current = Array.isArray(all[key]) ? [...all[key]] : [];

  const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: RankingEntry = {
    ...input,
    mode,
    id: entryId,
    createdAt: Date.now(),
  };

  const next = [...current, entry]
    .sort((a, b) => a.totalTimeMs - b.totalTimeMs)
    .slice(0, MAX_RANKINGS_PER_CATEGORY);

  all[key] = next;
  saveAllRankings(all);

  const idx = next.findIndex((e) => e.id === entryId);
  return {
    entries: next,
    placedRank: idx >= 0 ? idx + 1 : null,
  };
}
