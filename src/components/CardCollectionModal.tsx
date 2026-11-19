import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Cpu, Lock, Search, Sparkles, X } from 'lucide-react';
import { quizCategories } from '../data/quizData';
import { CardCollectionMap, FlatTerm, Rarity, TermStats } from '../types';
import {
  getAllFlatTerms,
  getCollectionProgress,
  getUnlockedLoreCount,
  RARITY_META,
} from '../utils/cardCollection';
import { getTermEmoji, getTermIcon } from '../utils/termIcon';

interface CardCollectionModalProps {
  open: boolean;
  collection: CardCollectionMap;
  termStats: TermStats;
  initialTermId?: number | null;
  onClose: () => void;
}

type OwnershipFilter = 'all' | 'collected' | 'uncollected' | 'weak';
type RarityFilter = 'ALL' | Rarity;

const RARITY_CARD_SURFACE: Record<
  Rarity,
  { artBg: string; frameClass: string; barColor: string; foilBg: string; glowShadow: string }
> = {
  C: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(148,163,184,0.20), rgba(15,23,42,0.94))',
    frameClass: 'border-slate-500/40 bg-[#0b1120] hover:border-slate-300/60',
    barColor: '#94A3B8',
    foilBg: 'linear-gradient(125deg, transparent 20%, rgba(226,232,240,0.08) 50%, transparent 80%)',
    glowShadow: '0 8px 22px rgba(148,163,184,0.12)',
  },
  R: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(34,211,238,0.28), rgba(8,22,38,0.95))',
    frameClass: 'border-cyan-400/50 bg-[#071322] hover:border-cyan-300',
    barColor: '#22D3EE',
    foilBg: 'linear-gradient(125deg, transparent 15%, rgba(34,211,238,0.16) 45%, rgba(56,189,248,0.12) 55%, transparent 85%)',
    glowShadow: '0 10px 26px rgba(34,211,238,0.18)',
  },
  SR: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(192,132,252,0.32), rgba(24,12,42,0.95))',
    frameClass: 'border-purple-400/55 bg-[#120b24] hover:border-purple-300',
    barColor: '#C084FC',
    foilBg: 'linear-gradient(125deg, transparent 10%, rgba(216,180,254,0.20) 42%, rgba(56,189,248,0.18) 58%, transparent 88%)',
    glowShadow: '0 10px 28px rgba(192,132,252,0.24)',
  },
  UR: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(251,191,36,0.36), rgba(32,20,6,0.95))',
    frameClass: 'border-amber-400/70 bg-[#171108] hover:border-amber-300',
    barColor: '#FBBF24',
    foilBg: 'linear-gradient(125deg, transparent 10%, rgba(253,224,71,0.24) 38%, rgba(251,146,60,0.20) 52%, rgba(34,211,238,0.18) 65%, transparent 90%)',
    glowShadow: '0 12px 32px rgba(251,191,36,0.28)',
  },
};

interface ShowcasePartCardProps {
  card: FlatTerm;
  unlockedLevel: number;
  count: number;
}

function ShowcasePartCard({ card, unlockedLevel, count }: ShowcasePartCardProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 35, active: false });
  const surface = RARITY_CARD_SURFACE[card.term.rarity];
  const meta = RARITY_META[card.term.rarity];

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setTilt({
      rx: (0.5 - py) * 14,
      ry: (px - 0.5) * 16,
      gx: px * 100,
      gy: py * 100,
      active: true,
    });
  };

  const resetTilt = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 35, active: false });
  };

  return (
    <div
      onPointerMove={handleMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      className="relative select-none rounded-2xl border p-3.5 transition-transform duration-150 ease-out"
      style={{
        borderColor: `${surface.barColor}99`,
        background: surface.artBg,
        boxShadow: surface.glowShadow,
        transform: `perspective(820px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
      }}
    >
      {/* Interactive Holographic Specular Sheen */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
        style={{
          opacity: tilt.active ? 0.9 : 0.45,
          background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.22), transparent 58%), ${surface.foilBg}`,
        }}
      />

      {/* Metallic Corner Brackets */}
      <span
        className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2"
        style={{ borderColor: surface.barColor }}
      />
      <span
        className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2"
        style={{ borderColor: surface.barColor }}
      />
      <span
        className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2"
        style={{ borderColor: surface.barColor }}
      />
      <span
        className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2"
        style={{ borderColor: surface.barColor }}
      />

      {/* Top Meta Strip */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-mono-num">
        <span className="font-bold" style={{ color: surface.barColor }}>
          PART #{String(card.term.id).padStart(3, '0')} · {meta.label}
        </span>
        <span className="font-semibold text-slate-200">×{count}</span>
      </div>

      {/* Central Emblem */}
      <div className="relative z-10 my-3 flex h-28 items-center justify-center">
        <div
          className="absolute h-24 w-24 rounded-full opacity-35 blur-md"
          style={{ backgroundColor: surface.barColor }}
        />
        <span className="relative text-6xl drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]">
          {getTermEmoji(card.term.name)}
        </span>
        <div
          className="absolute bottom-0 right-1 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-950/85 shadow-md"
          style={{ color: surface.barColor }}
        >
          {getTermIcon(card.term.name, 20)}
        </div>
      </div>

      {/* Bottom Unlock Tier Bar */}
      <div className="relative z-10 flex items-center gap-1.5 pt-2 border-t border-white/10">
        {[1, 2, 3].map((tier) => (
          <span
            key={tier}
            className="h-1.5 flex-1 rounded-sm"
            style={{
              backgroundColor:
                unlockedLevel >= tier
                  ? unlockedLevel >= 3
                    ? '#10B981'
                    : surface.barColor
                  : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
        <span className="ml-1 font-mono-num text-[10px] font-bold text-slate-200">
          Lv.{unlockedLevel}/3
        </span>
      </div>
    </div>
  );
}

export function CardCollectionModal({
  open,
  collection,
  termStats,
  initialTermId = null,
  onClose,
}: CardCollectionModalProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<FlatTerm | null>(null);

  const allFlatTerms = useMemo(() => getAllFlatTerms(), []);

  useEffect(() => {
    if (!open) {
      setSelectedCard(null);
      return;
    }
    if (initialTermId != null) {
      const target = allFlatTerms.find((item) => item.term.id === initialTermId) ?? null;
      if (target) {
        setSelectedCategoryId('all');
        setRarityFilter('ALL');
        setOwnershipFilter('all');
        setSearchQuery('');
        setSelectedCard(target);
      }
    }
  }, [open, initialTermId, allFlatTerms]);

  const summary = useMemo(() => {
    const total = allFlatTerms.length;
    let collected = 0;
    let mastered = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;
    let weakCount = 0;
    const byRarity: Record<Rarity, { total: number; collected: number }> = {
      C: { total: 0, collected: 0 },
      R: { total: 0, collected: 0 },
      SR: { total: 0, collected: 0 },
      UR: { total: 0, collected: 0 },
    };

    const byCategoryMap = new Map<
      string,
      {
        id: string;
        title: string;
        total: number;
        collected: number;
        attempts: number;
        correct: number;
        weakCount: number;
      }
    >();
    for (const cat of quizCategories) {
      byCategoryMap.set(cat.id, {
        id: cat.id,
        title: cat.title,
        total: 0,
        collected: 0,
        attempts: 0,
        correct: 0,
        weakCount: 0,
      });
    }

    for (const item of allFlatTerms) {
      byRarity[item.term.rarity].total += 1;
      const catAcc = byCategoryMap.get(item.categoryId);
      if (catAcc) catAcc.total += 1;

      const entry = collection[item.term.id];
      if (entry) {
        collected += 1;
        byRarity[item.term.rarity].collected += 1;
        if (catAcc) catAcc.collected += 1;
        if (entry.count >= 3) {
          mastered += 1;
        }
      }
      const stat = termStats[item.term.id];
      if (stat && stat.attempts > 0) {
        totalAttempts += stat.attempts;
        totalCorrect += stat.correct;
        if (catAcc) {
          catAcc.attempts += stat.attempts;
          catAcc.correct += stat.correct;
        }
        if (stat.correct / stat.attempts < 0.7) {
          weakCount += 1;
          if (catAcc) catAcc.weakCount += 1;
        }
      }
    }

    const byCategory = Array.from(byCategoryMap.values()).map((c) => ({
      ...c,
      accuracyPercent:
        c.attempts > 0 ? Math.round((c.correct / c.attempts) * 100) : null,
    }));

    const progress = getCollectionProgress(collection);
    const percent = progress.progressPercent;
    const accuracyPercent =
      totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
    return {
      total,
      collected,
      mastered,
      percent,
      unlockedStages: progress.unlockedStages,
      totalStages: progress.totalStages,
      byRarity,
      byCategory,
      totalAttempts,
      accuracyPercent,
      weakCount,
    };
  }, [allFlatTerms, collection, termStats]);

  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allFlatTerms.filter((item) => {
      if (selectedCategoryId !== 'all' && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (rarityFilter !== 'ALL' && item.term.rarity !== rarityFilter) {
        return false;
      }
      const entry = collection[item.term.id];
      const stat = termStats[item.term.id];
      const isOwned = Boolean(entry);
      const isWeak = Boolean(stat && stat.attempts > 0 && stat.correct / stat.attempts < 0.7);
      if (ownershipFilter === 'collected' && !isOwned) return false;
      if (ownershipFilter === 'uncollected' && isOwned) return false;
      if (ownershipFilter === 'weak' && !isWeak) return false;

      if (q) {
        if (!entry) {
          return (
            String(item.term.id).includes(q) ||
            item.subcategoryTitle.toLowerCase().includes(q)
          );
        }
        const unlockedDescs = item.term.descriptions.slice(
          0,
          getUnlockedLoreCount(entry.count, item.term.descriptions.length)
        );
        const hay = `${item.term.name} ${unlockedDescs.join(' ')} ${item.subcategoryTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allFlatTerms, collection, ownershipFilter, rarityFilter, searchQuery, selectedCategoryId, termStats]);

  if (!open) return null;

  const selectedEntry = selectedCard ? collection[selectedCard.term.id] : undefined;
  const selectedStat = selectedCard ? termStats[selectedCard.term.id] : undefined;
  const selectedUnlockedLevel = selectedEntry
    ? getUnlockedLoreCount(selectedEntry.count, 3)
    : 0;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#04060c]/94 sm:p-5"
    >
      <div className="flex h-[100dvh] sm:h-[90vh] w-full max-w-6xl flex-col overflow-hidden sm:rounded-2xl border-white/12 sm:border bg-[#070b14] shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-2xl font-bold tracking-wide text-white truncate">
                Parts Collection
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-400 font-mono-num">
                <span className="font-semibold text-cyan-300">
                  {summary.collected} / {summary.total} ({summary.percent}%)
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">全解放 {summary.mastered}</span>
                {summary.accuracyPercent !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-200">正答率 {summary.accuracyPercent}%</span>
                  </>
                )}
                {summary.weakCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300">要復習 {summary.weakCount}</span>
                  </>
                )}
                <span className="hidden lg:inline text-slate-600">|</span>
                <span className="hidden lg:inline">C {summary.byRarity.C.collected}/{summary.byRarity.C.total}</span>
                <span className="hidden lg:inline text-cyan-300">R {summary.byRarity.R.collected}/{summary.byRarity.R.total}</span>
                <span className="hidden lg:inline text-purple-300">SR {summary.byRarity.SR.collected}/{summary.byRarity.SR.total}</span>
                <span className="hidden lg:inline text-amber-300">UR {summary.byRarity.UR.collected}/{summary.byRarity.UR.total}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            閉じる
          </button>
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex flex-col gap-2.5 border-b border-white/10 bg-slate-950/60 px-4 py-3 sm:px-5">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              すべて ({summary.total})
            </button>
            {quizCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                {cat.title}
              </button>
            ))}
          </div>

          {/* Rarity + Ownership + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 shrink-0">
                {(['ALL', 'C', 'R', 'SR', 'UR'] as RarityFilter[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRarityFilter(r)}
                    className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      rarityFilter === r
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r === 'ALL' ? '全レア' : r}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 shrink-0">
                {(
                  [
                    { id: 'all', label: '全て' },
                    { id: 'collected', label: '取得' },
                    { id: 'uncollected', label: '未取得' },
                    { id: 'weak', label: `要復習 (${summary.weakCount})` },
                  ] as { id: OwnershipFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOwnershipFilter(opt.id)}
                    className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      ownershipFilter === opt.id
                        ? opt.id === 'weak'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-60 shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="用語を検索..."
                className="min-h-[38px] w-full rounded-lg border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Main Content: Responsive 2-col Mobile Grid + Slide-Over Detail Inspector */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            {/* Per-Category Accuracy Summary Strip */}
            <div className="mb-3.5 sm:mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {summary.byCategory.map((cat) => {
                const isCatActive = selectedCategoryId === cat.id;
                const acc = cat.accuracyPercent;
                const barWidth = acc !== null ? acc : 0;
                const accColor =
                  acc === null
                    ? 'text-slate-400'
                    : acc >= 80
                      ? 'text-emerald-300'
                      : acc >= 60
                        ? 'text-cyan-300'
                        : 'text-amber-300';
                const barFill =
                  acc === null
                    ? '#475569'
                    : acc >= 80
                      ? '#10B981'
                      : acc >= 60
                        ? '#22D3EE'
                        : '#F59E0B';

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategoryId((prev) => (prev === cat.id ? 'all' : cat.id))
                    }
                    className={`flex flex-col justify-between rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      isCatActive
                        ? 'border-cyan-400/70 bg-cyan-500/10'
                        : 'border-white/10 bg-slate-900/55 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {cat.title}
                      </span>
                      <span className={`font-mono-num text-xs font-bold shrink-0 ${accColor}`}>
                        {acc !== null ? `${acc}%` : '未挑戦'}
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                      <div
                        className="h-full transition-all duration-300"
                        style={{ width: `${barWidth}%`, backgroundColor: barFill }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2 font-mono-num text-[10px] text-slate-400">
                      <span>
                        収集 {cat.collected}/{cat.total}
                        {cat.attempts > 0 ? ` · ${cat.correct}/${cat.attempts}正解` : ''}
                      </span>
                      {cat.weakCount > 0 && (
                        <span className="font-semibold text-amber-300 shrink-0">
                          要復習 {cat.weakCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredTerms.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center text-slate-400 px-4">
                <p className="text-sm font-medium">一致するパーツがありません</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
                {filteredTerms.map((item) => {
                  const entry = collection[item.term.id];
                  const stat = termStats[item.term.id];
                  const accPct =
                    stat && stat.attempts > 0
                      ? Math.round((stat.correct / stat.attempts) * 100)
                      : null;
                  const isOwned = Boolean(entry);
                  const meta = RARITY_META[item.term.rarity];
                  const surface = RARITY_CARD_SURFACE[item.term.rarity];
                  const isSelected = selectedCard?.term.id === item.term.id;
                  const unlockedTier = entry ? getUnlockedLoreCount(entry.count, 3) : 0;

                  return (
                    <button
                      key={item.term.id}
                      type="button"
                      onClick={() => setSelectedCard(item)}
                      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-2.5 sm:p-3 text-left transition-all cursor-pointer ${
                        isOwned
                          ? `${surface.frameClass} hover:-translate-y-0.5 shadow-lg`
                          : 'border-white/8 bg-slate-900/40 opacity-75 hover:opacity-100'
                      } ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
                    >
                      {/* Subtle Foil Sheen for Owned Rare+ Cards */}
                      {isOwned && item.term.rarity !== 'C' && (
                        <div
                          className="pointer-events-none absolute inset-0 opacity-45 transition-opacity group-hover:opacity-80"
                          style={{ background: surface.foilBg }}
                        />
                      )}

                      <div className="relative z-10">
                        <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] font-mono-num">
                          <span className="text-slate-400">
                            #{String(item.term.id).padStart(3, '0')} ·{' '}
                            <span className={`font-bold ${meta.colorClass}`}>
                              {item.term.rarity}
                            </span>
                          </span>
                          {entry ? (
                            <span className="text-slate-300">×{entry.count}</span>
                          ) : (
                            <Lock className="h-3 w-3 text-slate-600" />
                          )}
                        </div>

                        {/* Emblem Stage */}
                        <div
                          className="relative mt-2 flex h-20 sm:h-24 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-950/60"
                          style={isOwned ? { background: surface.artBg } : undefined}
                        >
                          {isOwned ? (
                            <>
                              <span
                                className="select-none text-3xl sm:text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] transition-transform duration-200 group-hover:scale-110"
                                aria-hidden="true"
                              >
                                {getTermEmoji(item.term.name)}
                              </span>
                              <div
                                className="absolute bottom-1.5 right-1.5 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-md border border-white/15 bg-slate-950/85"
                                style={{ color: surface.barColor }}
                              >
                                {getTermIcon(item.term.name, 15)}
                              </div>
                            </>
                          ) : (
                            <Lock className="h-5 w-5 text-slate-600" />
                          )}
                        </div>

                        {/* Title & Subcategory */}
                        <h3 className="mt-2 font-display text-xs sm:text-sm font-bold text-white leading-snug line-clamp-1">
                          {isOwned ? item.term.name : '？？？'}
                        </h3>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 truncate">
                          {item.subcategoryTitle}
                        </p>
                      </div>

                      {/* Clean 1-line summary (only when owned) + 3-Step Bar */}
                      <div className="relative z-10 mt-2">
                        {isOwned && (
                          <p className="hidden sm:line-clamp-2 text-[11px] leading-relaxed text-slate-300 min-h-[2.1rem]">
                            {item.term.descriptions[0]}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-white/8">
                          <div className="flex flex-1 items-center gap-1">
                            {[1, 2, 3].map((tier) => (
                              <span
                                key={tier}
                                className="h-1.5 flex-1 rounded-sm transition-colors"
                                style={{
                                  backgroundColor:
                                    unlockedTier >= tier
                                      ? unlockedTier >= 3
                                        ? '#10B981'
                                        : surface.barColor
                                      : 'rgba(255,255,255,0.1)',
                                }}
                              />
                            ))}
                          </div>
                          <span className="font-mono-num text-[10px] font-semibold text-slate-400 shrink-0">
                            {accPct !== null && (
                              <span
                                className={`mr-1.5 ${
                                  accPct < 70 ? 'text-amber-300' : 'text-emerald-300'
                                }`}
                              >
                                {accPct}%
                              </span>
                            )}
                            {unlockedTier}/3
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Inspector Panel (Full-screen overlay on < sm, side panel on >= sm) */}
          {selectedCard && (
            <div className="fixed inset-0 z-50 sm:static sm:z-auto flex flex-col w-full sm:w-96 shrink-0 overflow-hidden sm:border-l border-white/10 bg-[#050811]">
              {/* Sticky Mobile-Friendly Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCard(null)}
                    className="sm:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-slate-900 text-slate-200 cursor-pointer"
                    aria-label="一覧に戻る"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono-num text-slate-400">
                      <span>#{String(selectedCard.term.id).padStart(3, '0')}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-bold ${RARITY_META[selectedCard.term.rarity].colorClass}`}>
                        {RARITY_META[selectedCard.term.rarity].label}
                      </span>
                    </div>
                    <h3 className="mt-0.5 font-display text-lg sm:text-xl font-bold text-white truncate">
                      {selectedEntry ? selectedCard.term.name : '未取得パーツ'}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      {selectedCard.categoryTitle} · {selectedCard.subcategoryTitle}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="詳細を閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {selectedEntry ? (
                  <div className="space-y-4">
                    {/* Interactive 3D Holographic Showcase Card */}
                    <ShowcasePartCard
                      card={selectedCard}
                      unlockedLevel={selectedUnlockedLevel}
                      count={selectedEntry.count}
                    />

                    {/* Compact Unlock & Accuracy Progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs">
                        <span className="text-slate-400">
                          正答クリア {selectedEntry.count} 回
                        </span>
                        <span className="flex items-center gap-1 font-mono-num font-bold text-cyan-300">
                          {selectedUnlockedLevel >= 3 && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          解放 {selectedUnlockedLevel} / 3
                        </span>
                      </div>

                      {selectedStat && selectedStat.attempts > 0 && (
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-xs font-mono-num">
                          <span className="text-slate-400">
                            学習正答率 ({selectedStat.correct}/{selectedStat.attempts})
                          </span>
                          <span
                            className={`font-bold ${
                              selectedStat.correct / selectedStat.attempts < 0.7
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                            }`}
                          >
                            {Math.round((selectedStat.correct / selectedStat.attempts) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Progressive Descriptions */}
                    <div>
                      <h4 className="text-xs font-semibold tracking-wider text-cyan-400">
                        用語解説
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {selectedCard.term.descriptions.map((desc, idx) => {
                          const unlocked =
                            idx <
                            getUnlockedLoreCount(
                              selectedEntry.count,
                              selectedCard.term.descriptions.length
                            );
                          return unlocked ? (
                            <li
                              key={idx}
                              className="rounded-lg border border-white/10 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-200"
                            >
                              <div className="mb-1 font-mono-num text-[10px] font-semibold text-cyan-400">
                                解説 #{idx + 1}
                              </div>
                              {desc}
                            </li>
                          ) : (
                            <li
                              key={idx}
                              className="flex items-center justify-between rounded-lg border border-white/6 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-500"
                            >
                              <span className="flex items-center gap-2">
                                <Lock className="h-3.5 w-3.5 shrink-0" />
                                <span>解説 #{idx + 1}</span>
                              </span>
                              <span className="font-mono-num text-[11px]">Lv.{idx + 1}で解放</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Progressive Flavor Texts */}
                    <div>
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-amber-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        豆知識・フレーバー
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {selectedCard.term.flavorTexts.map((fl, idx) => {
                          const unlocked =
                            idx <
                            getUnlockedLoreCount(
                              selectedEntry.count,
                              selectedCard.term.flavorTexts.length
                            );
                          return unlocked ? (
                            <li
                              key={idx}
                              className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-slate-300"
                            >
                              <div className="mb-1 font-mono-num text-[10px] font-semibold text-amber-400">
                                フレーバー #{idx + 1}
                              </div>
                              {fl}
                            </li>
                          ) : (
                            <li
                              key={idx}
                              className="flex items-center justify-between rounded-lg border border-white/6 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-500"
                            >
                              <span className="flex items-center gap-2">
                                <Lock className="h-3.5 w-3.5 shrink-0" />
                                <span>フレーバー #{idx + 1}</span>
                              </span>
                              <span className="font-mono-num text-[11px]">Lv.{idx + 1}で解放</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col items-center rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center">
                    <Lock className="h-8 w-8 text-slate-500" />
                    <p className="mt-3 text-sm font-semibold text-slate-200">
                      未取得パーツ
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      レース中の正答で入手でき、同じ用語を3回まで正答すると全解説が解放されます。
                    </p>
                    {selectedStat && selectedStat.attempts > 0 && (
                      <div className="mt-4 w-full rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-mono-num text-amber-200">
                        これまでの挑戦: {selectedStat.attempts}回 · 正解 {selectedStat.correct}回 (
                        {Math.round((selectedStat.correct / selectedStat.attempts) * 100)}%)
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
