import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Lock, Search, Sparkles, X } from 'lucide-react';
import { quizCategories } from '../data/quizData';
import { CardCollectionMap, FlatTerm, Rarity } from '../types';
import { getAllFlatTerms, getUnlockedLoreCount, RARITY_META } from '../utils/cardCollection';
import { getTermEmoji, getTermIcon } from '../utils/termIcon';

interface CardCollectionModalProps {
  open: boolean;
  collection: CardCollectionMap;
  onClose: () => void;
}

type OwnershipFilter = 'all' | 'collected' | 'uncollected';
type RarityFilter = 'ALL' | Rarity;

const RARITY_CARD_SURFACE: Record<
  Rarity,
  { artBg: string; frameClass: string; barColor: string }
> = {
  C: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(148,163,184,0.18), rgba(15,23,42,0.92))',
    frameClass: 'border-slate-500/40 bg-[#0b1120] hover:border-slate-300/60',
    barColor: '#94A3B8',
  },
  R: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(34,211,238,0.24), rgba(8,22,36,0.94))',
    frameClass: 'border-cyan-400/50 bg-[#071322] hover:border-cyan-300',
    barColor: '#22D3EE',
  },
  SR: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(192,132,252,0.28), rgba(24,12,42,0.94))',
    frameClass: 'border-purple-400/55 bg-[#120b24] hover:border-purple-300',
    barColor: '#C084FC',
  },
  UR: {
    artBg: 'radial-gradient(circle at 50% 35%, rgba(251,191,36,0.3), rgba(32,20,6,0.94))',
    frameClass: 'border-amber-400/65 bg-[#171108] hover:border-amber-300',
    barColor: '#FBBF24',
  },
};

export function CardCollectionModal({
  open,
  collection,
  onClose,
}: CardCollectionModalProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<FlatTerm | null>(null);

  const allFlatTerms = useMemo(() => getAllFlatTerms(), []);

  const summary = useMemo(() => {
    const total = allFlatTerms.length;
    let collected = 0;
    let mastered = 0;
    const byRarity: Record<Rarity, { total: number; collected: number }> = {
      C: { total: 0, collected: 0 },
      R: { total: 0, collected: 0 },
      SR: { total: 0, collected: 0 },
      UR: { total: 0, collected: 0 },
    };

    for (const item of allFlatTerms) {
      byRarity[item.term.rarity].total += 1;
      const entry = collection[item.term.id];
      if (entry) {
        collected += 1;
        byRarity[item.term.rarity].collected += 1;
        if (entry.count >= 3) {
          mastered += 1;
        }
      }
    }

    const percent = total > 0 ? Math.round((collected / total) * 1000) / 10 : 0;
    return { total, collected, mastered, percent, byRarity };
  }, [allFlatTerms, collection]);

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
      const isOwned = Boolean(entry);
      if (ownershipFilter === 'collected' && !isOwned) return false;
      if (ownershipFilter === 'uncollected' && isOwned) return false;

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
  }, [allFlatTerms, collection, ownershipFilter, rarityFilter, searchQuery, selectedCategoryId]);

  if (!open) return null;

  const selectedEntry = selectedCard ? collection[selectedCard.term.id] : undefined;
  const selectedUnlockedLevel = selectedEntry
    ? getUnlockedLoreCount(selectedEntry.count, 3)
    : 0;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#04060c]/92 p-3 sm:p-6"
    >
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#070b14] shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-400">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wide text-white">
                Card Collection
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-num">
                <span className="font-semibold text-cyan-300">
                  収集 {summary.collected} / {summary.total} ({summary.percent}%)
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">全解放 {summary.mastered} 枚</span>
                <span aria-hidden="true">·</span>
                <span>C {summary.byRarity.C.collected}/{summary.byRarity.C.total}</span>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-300">R {summary.byRarity.R.collected}/{summary.byRarity.R.total}</span>
                <span aria-hidden="true">·</span>
                <span className="text-purple-300">SR {summary.byRarity.SR.collected}/{summary.byRarity.SR.total}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300">UR {summary.byRarity.UR.collected}/{summary.byRarity.UR.total}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            閉じる
          </button>
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-950/60 px-5 py-3.5">
          {/* Category Segmented Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                {(['ALL', 'C', 'R', 'SR', 'UR'] as RarityFilter[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRarityFilter(r)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      rarityFilter === r
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r === 'ALL' ? '全レア度' : r}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                {(
                  [
                    { id: 'all', label: 'すべて' },
                    { id: 'collected', label: '取得済み' },
                    { id: 'uncollected', label: '未取得' },
                  ] as { id: OwnershipFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOwnershipFilter(opt.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      ownershipFilter === opt.id
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="取得済み用語・解説を検索..."
                className="w-full rounded-lg border border-white/10 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Main Content: Card Grid + Detail Inspector */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {filteredTerms.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                <p className="text-sm font-medium">条件に一致するカードがありません</p>
                <p className="mt-1 text-xs text-slate-500">
                  レース中のクイズゲートで正答するとカードが登録されます
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredTerms.map((item) => {
                  const entry = collection[item.term.id];
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
                      className={`group flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer ${
                        isOwned
                          ? `${surface.frameClass} hover:-translate-y-0.5 shadow-lg`
                          : 'border-white/8 bg-slate-900/45 opacity-75 hover:opacity-100'
                      } ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
                    >
                      {/* Top Header */}
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono-num">
                          <span className="text-slate-400">
                            #{String(item.term.id).padStart(3, '0')} ·{' '}
                            <span className={`font-bold ${meta.colorClass}`}>
                              {item.term.rarity}
                            </span>
                          </span>
                          {entry ? (
                            <span className="text-slate-300">×{entry.count}</span>
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </div>

                        {/* Card Emblem Stage */}
                        <div
                          className="relative mt-2 flex h-24 items-center justify-center overflow-hidden rounded-lg border border-white/10"
                          style={isOwned ? { background: surface.artBg } : undefined}
                        >
                          {isOwned ? (
                            <>
                              <span
                                className="select-none text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] transition-transform duration-200 group-hover:scale-110"
                                aria-hidden="true"
                              >
                                {getTermEmoji(item.term.name)}
                              </span>
                              <div
                                className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-slate-950/80"
                                style={{ color: surface.barColor }}
                              >
                                {getTermIcon(item.term.name, 16)}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-600">
                              <Lock className="h-6 w-6" />
                              <span className="text-[10px] font-mono-num tracking-wider">LOCKED</span>
                            </div>
                          )}
                        </div>

                        {/* Title & Subcategory */}
                        <h3 className="mt-2.5 font-display text-sm sm:text-base font-bold text-white leading-snug line-clamp-1">
                          {isOwned ? item.term.name : '？？？'}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                          {item.subcategoryTitle}
                        </p>
                      </div>

                      {/* 1st Description Snippet + 3-Step Unlock Progress */}
                      <div className="mt-2">
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-300 min-h-[2.25rem]">
                          {isOwned
                            ? item.term.descriptions[0]
                            : 'レースのクイズゲートで正解するとアンロック'}
                        </p>

                        <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-white/8">
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
                            {isOwned ? `解放 ${unlockedTier}/3` : '0/3'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Inspector Panel */}
          {selectedCard && (
            <div className="w-full sm:w-96 shrink-0 overflow-y-auto border-l border-white/10 bg-[#050811] p-5">
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono-num text-slate-400">
                    <span>#{String(selectedCard.term.id).padStart(3, '0')}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-bold ${RARITY_META[selectedCard.term.rarity].colorClass}`}>
                      {RARITY_META[selectedCard.term.rarity].label}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-xl font-bold text-white">
                    {selectedEntry ? selectedCard.term.name : '未取得カード'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedCard.categoryTitle} · {selectedCard.subcategoryTitle}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="詳細を閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selectedEntry ? (
                <div className="mt-4 space-y-4">
                  {/* Showcase Card Visual in Inspector */}
                  <div
                    className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl border border-white/12"
                    style={{ background: RARITY_CARD_SURFACE[selectedCard.term.rarity].artBg }}
                  >
                    <span className="select-none text-6xl drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
                      {getTermEmoji(selectedCard.term.name)}
                    </span>
                    <div
                      className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-slate-950/85"
                      style={{ color: RARITY_CARD_SURFACE[selectedCard.term.rarity].barColor }}
                    >
                      {getTermIcon(selectedCard.term.name, 20)}
                    </div>
                  </div>

                  {/* Stats & Progressive Unlock Status */}
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-xs">
                    <span className="text-slate-400">
                      正答クリア {selectedEntry.count} 回
                    </span>
                    <span className="flex items-center gap-1 font-mono-num font-bold text-cyan-300">
                      {selectedUnlockedLevel >= 3 && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      解放段階 {selectedUnlockedLevel} / 3
                    </span>
                  </div>

                  {/* Progressive Descriptions */}
                  <div>
                    <h4 className="text-xs font-semibold tracking-wider text-cyan-400">
                      用語解説（クリア回数で段階解放）
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {selectedCard.term.descriptions.map((desc, idx) => {
                        const unlocked = idx < getUnlockedLoreCount(selectedEntry.count, selectedCard.term.descriptions.length);
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
                            className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-slate-950/60 p-3 text-xs text-slate-500"
                          >
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            <span>同じ用語を {idx + 1} 回目クリアで解説 #{idx + 1} 解放</span>
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
                        const unlocked = idx < getUnlockedLoreCount(selectedEntry.count, selectedCard.term.flavorTexts.length);
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
                            className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-slate-950/60 p-3 text-xs text-slate-500"
                          >
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            <span>同じ用語を {idx + 1} 回目クリアでフレーバー #{idx + 1} 解放</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-8 flex flex-col items-center rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center">
                  <Lock className="h-8 w-8 text-slate-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-200">
                    この用語カードはまだ未取得です
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    レース中のアイテムゲートで出題される問題に正解するとコレクションに追加され、同じ用語をクリアするごとに解説とフレーバーテキストが最大3段階まで解放されます。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
