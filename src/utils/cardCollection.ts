import { quizCategories } from '../data/quizData';
import { SpeedClass, SubItemType } from '../game/types';
import { CardCollectionMap, FlatTerm, Rarity, TermData, TermStats } from '../types';

const COLLECTION_STORAGE_KEY = 'hyperion_gp_card_collection_v1';
const TERM_STATS_STORAGE_KEY = 'hyperion_gp_term_stats_v1';

let cachedFlatTerms: FlatTerm[] | null = null;

export function getAllFlatTerms(): FlatTerm[] {
  if (cachedFlatTerms) return cachedFlatTerms;
  const list: FlatTerm[] = [];
  for (const cat of quizCategories) {
    for (const sub of cat.subcategories) {
      for (const term of sub.terms) {
        list.push({
          categoryId: cat.id,
          categoryTitle: cat.title,
          subcategoryId: sub.id,
          subcategoryTitle: sub.title,
          term,
        });
      }
    }
  }
  cachedFlatTerms = list;
  return list;
}

export function loadCardCollection(): CardCollectionMap {
  try {
    const raw = localStorage.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CardCollectionMap;
  } catch {
    return {};
  }
}

export function saveCardCollection(collection: CardCollectionMap): void {
  try {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
  } catch {
    // Ignore storage errors
  }
}

export function loadTermStats(): TermStats {
  try {
    const raw = localStorage.getItem(TERM_STATS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TermStats;
  } catch {
    return {};
  }
}

export function saveTermStats(stats: TermStats): void {
  try {
    localStorage.setItem(TERM_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage errors
  }
}

export function recordTermAnswer(termId: number, isCorrect: boolean): TermStats {
  const stats = loadTermStats();
  const prev = stats[termId] ?? { correct: 0, attempts: 0 };
  stats[termId] = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (isCorrect ? 1 : 0),
  };
  saveTermStats(stats);
  return stats;
}

export function recordCollectedCard(termId: number): {
  collection: CardCollectionMap;
  isNew: boolean;
  count: number;
} {
  const collection = loadCardCollection();
  const now = Date.now();
  const existing = collection[termId];
  if (existing) {
    const nextCount = existing.count + 1;
    collection[termId] = {
      ...existing,
      count: nextCount,
      lastCollectedAt: now,
    };
    saveCardCollection(collection);
    return { collection, isNew: false, count: nextCount };
  }
  collection[termId] = {
    termId,
    count: 1,
    firstCollectedAt: now,
    lastCollectedAt: now,
  };
  saveCardCollection(collection);
  return { collection, isNew: true, count: 1 };
}

export function getUnlockedLoreCount(count: number, maxItems = 3): number {
  if (count <= 0) return 0;
  return Math.min(maxItems, count);
}

export interface GeneratedLaneChoice {
  term: TermData;
  itemKind: SubItemType;
  isCorrect: boolean;
}

export interface GeneratedQuiz {
  targetTerm: FlatTerm;
  questionText: string;
  choices: [GeneratedLaneChoice, GeneratedLaneChoice, GeneratedLaneChoice, GeneratedLaneChoice];
  correctLaneIndex: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function formatQuizQuestion(description: string): string {
  const trimmed = description.trim().replace(/。+$/, '');
  return `「${trimmed}」は、何を説明したもの？`;
}

export function generateQuizChallenge(
  usedTermIds: Set<number>,
  categoryId?: string | null,
  difficulty: SpeedClass = 'normal',
  subcategoryId?: string | null
): GeneratedQuiz {
  const allFlat = getAllFlatTerms();
  const collection = loadCardCollection();
  const termStats = loadTermStats();

  const categoryPool = subcategoryId
    ? allFlat.filter((ft) => ft.subcategoryId === subcategoryId)
    : categoryId
      ? allFlat.filter((ft) => ft.categoryId === categoryId)
      : allFlat;
  const scopedTerms = categoryPool.length >= 4 ? categoryPool : allFlat;

  let pool = scopedTerms.filter((ft) => !usedTermIds.has(ft.term.id));
  if (pool.length === 0) {
    pool = scopedTerms;
  }

  let target: FlatTerm;

  if (difficulty === 'hard') {
    // Hard mode: prioritize unanswered terms first; otherwise lowest accuracy terms (weakness drill)
    const unanswered = pool.filter((ft) => (termStats[ft.term.id]?.attempts ?? 0) === 0);
    if (unanswered.length > 0) {
      target = unanswered[Math.floor(Math.random() * unanswered.length)];
    } else {
      const scored = shuffleArray(pool).sort((a, b) => {
        const sa = termStats[a.term.id] ?? { correct: 0, attempts: 1 };
        const sb = termStats[b.term.id] ?? { correct: 0, attempts: 1 };
        const rateA = sa.attempts > 0 ? sa.correct / sa.attempts : 0;
        const rateB = sb.attempts > 0 ? sb.correct / sb.attempts : 0;
        if (Math.abs(rateA - rateB) > 0.001) return rateA - rateB;
        return sa.attempts - sb.attempts;
      });
      const weakSlice = scored.slice(0, Math.min(5, scored.length));
      target = weakSlice[Math.floor(Math.random() * weakSlice.length)];
    }
  } else {
    // Normal mode: prioritize uncollected (~65%) or partially unlocked < 3 clears (~25%)
    const uncollectedPool = pool.filter((ft) => !collection[ft.term.id]);
    const partialPool = pool.filter((ft) => {
      const entry = collection[ft.term.id];
      return entry && entry.count < 3;
    });

    const roll = Math.random();
    let pickPool = pool;
    if (uncollectedPool.length > 0 && roll < 0.65) {
      pickPool = uncollectedPool;
    } else if (partialPool.length > 0 && roll < 0.9) {
      pickPool = partialPool;
    } else if (uncollectedPool.length > 0) {
      pickPool = uncollectedPool;
    }
    target = pickPool[Math.floor(Math.random() * pickPool.length)];
  }

  const descList = target.term.descriptions;
  const rawDesc = descList[Math.floor(Math.random() * descList.length)] ?? target.term.name;

  // Pick 3 dummy terms, preferring same subcategory first, then same category, then global
  const sameSub = allFlat.filter(
    (ft) => ft.term.id !== target.term.id && ft.subcategoryId === target.subcategoryId
  );
  const sameCat = allFlat.filter(
    (ft) =>
      ft.term.id !== target.term.id &&
      ft.categoryId === target.categoryId &&
      ft.subcategoryId !== target.subcategoryId
  );
  const others = allFlat.filter(
    (ft) => ft.term.id !== target.term.id && ft.categoryId !== target.categoryId
  );

  const distractorCandidates = [
    ...shuffleArray(sameSub),
    ...shuffleArray(sameCat),
    ...shuffleArray(others),
  ];

  const dummies: TermData[] = [];
  const pickedIds = new Set<number>([target.term.id]);
  for (const cand of distractorCandidates) {
    if (pickedIds.has(cand.term.id)) continue;
    pickedIds.add(cand.term.id);
    dummies.push(cand.term);
    if (dummies.length === 3) break;
  }

  // Assign 4 items across the 4 lanes from our 9 flashy items
  const specialPool: SubItemType[] = shuffleArray([
    'laser',
    'spread_missile',
    'leader_bomb',
    'mine',
    'glow_boost',
    'hover_glide',
    'shield',
    'emp',
  ]);
  const laneItemsPool: SubItemType[] = shuffleArray([
    Math.random() < 0.55 ? 'boost' : specialPool[3],
    specialPool[0],
    specialPool[1],
    specialPool[2],
  ]);

  const termsShuffled = shuffleArray([
    { term: target.term, isCorrect: true },
    { term: dummies[0], isCorrect: false },
    { term: dummies[1], isCorrect: false },
    { term: dummies[2], isCorrect: false },
  ]);

  const choices = termsShuffled.map((entry, idx) => ({
    term: entry.term,
    itemKind: laneItemsPool[idx],
    isCorrect: entry.isCorrect,
  })) as [GeneratedLaneChoice, GeneratedLaneChoice, GeneratedLaneChoice, GeneratedLaneChoice];

  const correctLaneIndex = choices.findIndex((c) => c.isCorrect);

  return {
    targetTerm: target,
    questionText: formatQuizQuestion(rawDesc),
    choices,
    correctLaneIndex,
  };
}

export const RARITY_META: Record<
  Rarity,
  { label: string; colorClass: string; borderClass: string; bgClass: string; hex: string }
> = {
  C: {
    label: 'COMMON',
    colorClass: 'text-slate-300',
    borderClass: 'border-slate-500/40',
    bgClass: 'bg-slate-800/70',
    hex: '#94A3B8',
  },
  R: {
    label: 'RARE',
    colorClass: 'text-cyan-300',
    borderClass: 'border-cyan-400/50',
    bgClass: 'bg-cyan-950/50',
    hex: '#22D3EE',
  },
  SR: {
    label: 'SUPER RARE',
    colorClass: 'text-purple-300',
    borderClass: 'border-purple-400/55',
    bgClass: 'bg-purple-950/45',
    hex: '#C084FC',
  },
  UR: {
    label: 'ULTRA RARE',
    colorClass: 'text-amber-300',
    borderClass: 'border-amber-400/65',
    bgClass: 'bg-amber-950/40',
    hex: '#FBBF24',
  },
};
