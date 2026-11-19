import { useState } from 'react';
import {
  Car,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Flag,
  Layers,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Settings,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  COURSES,
  GameMode,
  getSubCoursesForBase,
  MACHINES,
  MachineId,
  RaceTelemetry,
  resolveSubCourse,
  SpeedClass,
} from '../game/types';
import { CardCollectionMap } from '../types';
import { getCollectionProgress, RARITY_META } from '../utils/cardCollection';
import { formatRaceTime } from '../utils/formatTime';
import { getTermEmoji } from '../utils/termIcon';

interface MenuOverlayProps {
  telemetry: RaceTelemetry;
  gameMode: GameMode;
  showBestGhost: boolean;
  showLastGhost: boolean;
  selectedCourseKey: string;
  selectedMachine: MachineId;
  speedClass: SpeedClass;
  collection: CardCollectionMap;
  bgmPreparing: boolean;
  soundMuted: boolean;
  onSelectMode: (mode: GameMode) => void;
  onToggleBestGhost: () => void;
  onToggleLastGhost: () => void;
  onSelectCourseKey: (courseKey: string) => void;
  onSelectMachine: (id: MachineId) => void;
  onSelectClass: (cls: SpeedClass) => void;
  onStartRace: () => void;
  onReturnMenu: () => void;
  onOpenCollection: () => void;
  onOpenCollectionTerm: (termId: number) => void;
  onOpenSettings: () => void;
  onToggleSound: () => void;
}

export function MenuOverlay({
  telemetry,
  gameMode,
  showBestGhost,
  showLastGhost,
  selectedCourseKey,
  selectedMachine,
  speedClass,
  collection,
  bgmPreparing,
  soundMuted,
  onSelectMode,
  onToggleBestGhost,
  onToggleLastGhost,
  onSelectCourseKey,
  onSelectMachine,
  onSelectClass,
  onStartRace,
  onReturnMenu,
  onOpenCollection,
  onOpenCollectionTerm,
  onOpenSettings,
  onToggleSound,
}: MenuOverlayProps) {
  const collectionProgress = getCollectionProgress(collection);
  const totalTermCount = collectionProgress.totalTerms;
  const collectedCount = collectionProgress.collectedTerms;
  const activeSubCourse = resolveSubCourse(selectedCourseKey);
  const selectedCourse = activeSubCourse.baseCourseId;
  const activeCourse = COURSES.find((c) => c.id === selectedCourse) ?? COURSES[0];
  const subCourses = getSubCoursesForBase(selectedCourse);
  const isTimeAttack = gameMode === 'time_attack';

  if (telemetry.phase === 'finished') {
    const finishedSubCourse = resolveSubCourse(telemetry.courseKey || telemetry.courseId);
    const isFinishedTA = telemetry.gameMode === 'time_attack';
    const isSubcategory = telemetry.subcategoryId !== null;
    const minLapMs =
      telemetry.lapTimesMs.length > 0 ? Math.min(...telemetry.lapTimesMs) : null;
    return (
      <div className="pointer-events-auto fixed inset-0 z-20 flex items-start sm:items-center justify-center bg-[#05070e]/78 p-3 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#070b14]/96 p-4 sm:p-6 shadow-2xl my-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5 sm:pb-4">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wider text-cyan-400 truncate">
                {isFinishedTA ? 'TIME ATTACK COMPLETE' : 'RACE COMPLETE'} · {finishedSubCourse.fullName} ·{' '}
                {telemetry.speedClass.toUpperCase()} · {telemetry.machineName}
              </p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {isFinishedTA
                    ? 'TIME ATTACK FINISH'
                    : telemetry.rank === 1
                      ? '1ST PLACE · VICTORY'
                      : telemetry.rank === 2
                        ? '2ND PLACE'
                        : telemetry.rank === 3
                          ? '3RD PLACE'
                          : `${telemetry.rank}TH PLACE`}
                </h2>
                {telemetry.rankingPlacement !== null && (
                  <span className="font-display font-mono-num text-xs font-bold tracking-wider text-amber-300">
                    NEW TOP 5 (#{telemetry.rankingPlacement})
                  </span>
                )}
                {isSubcategory && (
                  <span className="font-mono-num text-xs font-semibold text-slate-400">
                    2LAP サブカテゴリ練習（ランキング記録なし）
                  </span>
                )}
              </div>
            </div>
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-400 shrink-0">
              {isFinishedTA ? (
                <Timer className="h-5 w-5 sm:h-6 sm:w-6" />
              ) : (
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="font-display text-[10px] sm:text-[11px] tracking-wider text-slate-400">
                TOTAL TIME
              </div>
              <div className="mt-1 font-mono-num text-sm sm:text-xl font-bold text-white">
                {formatRaceTime(telemetry.totalRaceMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="flex items-center justify-between font-display text-[10px] sm:text-[11px] tracking-wider text-slate-400">
                <span>BEST LAP</span>
                {telemetry.isNewRecord && (
                  <span className="font-bold text-amber-400">NEW</span>
                )}
              </div>
              <div className="mt-1 font-mono-num text-sm sm:text-xl font-bold text-cyan-400">
                {formatRaceTime(telemetry.bestLapMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="flex items-center justify-between font-display text-[10px] sm:text-[11px] tracking-wider text-slate-400">
                <span>QUIZ SCORE</span>
                {telemetry.bestQuizStreak >= 2 && (
                  <span className="font-mono-num font-bold text-amber-300">
                    {telemetry.bestQuizStreak} STREAK
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono-num text-sm sm:text-xl font-bold text-emerald-400">
                {telemetry.quizCorrectCount} / {telemetry.quizAttempts}
              </div>
            </div>
          </div>

          {/* All Individual Lap Times */}
          {telemetry.lapTimesMs.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/50 p-2.5 sm:p-3">
              <div className="mb-1.5 font-display text-[11px] font-medium tracking-wider text-slate-400">
                LAP TIMES
              </div>
              <div
                className={`grid gap-2 ${
                  telemetry.lapTimesMs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                }`}
              >
                {telemetry.lapTimesMs.map((lt, idx) => {
                  const isBest = minLapMs !== null && lt === minLapMs;
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border px-2.5 py-1.5 ${
                        isBest
                          ? 'border-cyan-400/45 bg-cyan-500/10'
                          : 'border-white/8 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-num">
                        <span className="text-slate-400">LAP {idx + 1}</span>
                        {isBest && <span className="font-bold text-cyan-300">BEST</span>}
                      </div>
                      <div className="mt-0.5 font-mono-num text-xs sm:text-sm font-bold text-white">
                        {formatRaceTime(lt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={`mt-4 grid grid-cols-1 gap-3.5 sm:gap-4 ${
              !isFinishedTA && telemetry.standings.length > 1 ? 'md:grid-cols-2' : ''
            }`}
          >
            {/* Final Standings (Race Mode only) */}
            {!isFinishedTA && telemetry.standings.length > 1 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <div className="mb-2 font-display text-[11px] font-medium tracking-wider text-slate-400">
                  STANDINGS
                </div>
                <div className="divide-y divide-white/5">
                  {telemetry.standings.map((row) => (
                    <div
                      key={row.id}
                      className={`flex items-center justify-between py-2 text-xs ${
                        row.isPlayer ? 'font-bold text-cyan-300' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num w-4 text-slate-400">{row.rank}.</span>
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: row.accentHex }}
                        />
                        <span className="font-display tracking-wide">{row.name}</span>
                      </div>
                      <span className="font-mono-num text-slate-400">
                        {row.isPlayer ? formatRaceTime(row.totalTimeMs) : `LAP ${row.lap}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Earned Learning Parts */}
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>今回獲得したパーツ</span>
                <span className="font-mono-num text-cyan-300">
                  図鑑 {collectedCount} / {totalTermCount}
                </span>
              </div>

              {telemetry.earnedCards.length === 0 ? (
                <div className="flex h-24 sm:h-28 items-center justify-center text-center text-xs text-slate-500">
                  今回の走行ではパーツを獲得できませんでした
                </div>
              ) : (
                <div className="max-h-36 sm:max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {telemetry.earnedCards.map((card, idx) => {
                    const meta = RARITY_META[card.rarity];
                    const tier = Math.min(3, card.unlockedCount);
                    return (
                      <div
                        key={`${card.termId}-${idx}`}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${meta.borderClass} ${meta.bgClass}`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-lg shrink-0" aria-hidden="true">
                            {getTermEmoji(card.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono-num text-[10px]">
                              <span className={`font-bold ${meta.colorClass}`}>{card.rarity}</span>
                              <span className="text-slate-400">·</span>
                              <span className="truncate text-slate-400">{card.subcategoryTitle}</span>
                            </div>
                            <div className="truncate font-display text-sm font-bold text-white">
                              {card.name}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono-num text-[10px]">
                          <div
                            className={`font-bold ${
                              card.isNew
                                ? 'text-amber-300'
                                : card.unlockedCount <= 3
                                  ? 'text-emerald-300'
                                  : 'text-slate-400'
                            }`}
                          >
                            {card.isNew ? 'NEW!' : card.unlockedCount <= 3 ? '解説解放' : 'GET'}
                          </div>
                          <div className="text-slate-400">Lv.{tier}/3</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {isFinishedTA && (
            <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/8 px-3.5 py-2 text-[11px] text-cyan-200">
              今回の走行軌跡を「LAST GHOST」として保存しました（自己最速タイム更新時は「BEST GHOST」も更新）。
            </div>
          )}

          {/* Post-Race Wrong-Answer Review List */}
          {telemetry.missedQuestions.length > 0 ? (
            <div className="mt-3.5 rounded-xl border border-red-400/25 bg-[#12070b]/80 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-red-200">
                <span>間違い復習リスト ({telemetry.missedQuestions.length}問)</span>
                <span className="text-slate-400">
                  {telemetry.missedQuestions.some((m) => Boolean(collection[m.termId]))
                    ? '取得済み用語はタップで図鑑へ · HARDで優先出題'
                    : 'HARDで優先出題'}
                </span>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {telemetry.missedQuestions.map((miss, idx) => {
                  const isOwned = Boolean(collection[miss.termId]);
                  const content = (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span className="font-display font-bold text-amber-300">
                          正解: {miss.termName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-red-300">
                            選択: {miss.chosenTermName}
                          </span>
                          {isOwned && (
                            <span className="text-[10px] font-semibold text-cyan-300">
                              図鑑 →
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                        {miss.explanation}
                      </p>
                    </>
                  );

                  return isOwned ? (
                    <button
                      key={`${miss.termId}-${idx}`}
                      type="button"
                      onClick={() => onOpenCollectionTerm(miss.termId)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/75 p-2.5 text-left text-xs transition-colors hover:border-amber-400/50 hover:bg-slate-900 cursor-pointer"
                    >
                      {content}
                    </button>
                  ) : (
                    <div
                      key={`${miss.termId}-${idx}`}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/75 p-2.5 text-left text-xs"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            telemetry.quizAttempts > 0 && (
              <div className="mt-3.5 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>ミスなし！出題された全問に正解しました</span>
              </div>
            )
          )}

          <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onStartRace}
              disabled={bgmPreparing}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-70 cursor-pointer whitespace-nowrap"
            >
              {bgmPreparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  BGM準備中...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span className="font-display tracking-wider">
                    {isFinishedTA ? 'RETRY' : 'RACE AGAIN'}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenCollection}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer whitespace-nowrap"
            >
              <Cpu className="h-4 w-4" />
              Parts Collection
            </button>
            <button
              type="button"
              onClick={onReturnMenu}
              className="min-h-[44px] w-full sm:w-auto rounded-lg border border-white/15 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              コース・マシン選択
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (telemetry.phase !== 'menu') {
    return null;
  }

  const activeSpec = MACHINES.find((m) => m.id === selectedMachine) ?? MACHINES[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-6 overflow-hidden">
      {/* Top Header: Title + Top Mode Switcher + Parts Collection + Settings */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto min-w-0">
            <div className="flex items-baseline gap-2 sm:gap-3.5">
              <h1 className="font-display text-xl sm:text-5xl font-bold tracking-tight text-white leading-none shrink-0">
                HYPERION <span className="text-cyan-400">GP</span>
              </h1>
              <div
                className="flex items-baseline gap-1.5 font-mono-num leading-none shrink-0"
                title={`学習進捗（3パターン解放状況）: ${collectionProgress.unlockedStages} / ${collectionProgress.totalStages}`}
              >
                <span className="hidden sm:inline font-display text-[10px] font-semibold tracking-wider text-slate-400">
                  PROGRESS
                </span>
                <span className="text-xs sm:text-xl font-bold text-emerald-400">
                  {collectionProgress.progressPercent.toFixed(1)}%
                </span>
              </div>
            </div>
            <p className="mt-1 hidden md:block text-sm text-slate-300 truncate">
              {activeSubCourse.fullName} · {activeCourse.categoryLabel}
              {activeSubCourse.subcategoryId ? ' · 2 LAPS' : ''}
            </p>
          </div>

          {/* Desktop Top-Center Mode Switcher */}
          <div className="pointer-events-auto hidden md:flex items-center gap-1 rounded-xl border border-white/12 bg-[#070b14]/92 p-1 shadow-lg shrink-0">
            <button
              type="button"
              onClick={() => onSelectMode('race')}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                gameMode === 'race'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Flag className="h-3.5 w-3.5 shrink-0" />
              <span>RACE</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectMode('time_attack')}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                gameMode === 'time_attack'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Timer className="h-3.5 w-3.5 shrink-0" />
              <span>TIME ATTACK</span>
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenCollection}
              className="flex min-h-[40px] sm:min-h-[44px] items-center gap-1.5 sm:gap-2 rounded-xl border border-amber-400/35 bg-[#070b14]/92 px-2 py-1 sm:px-3.5 sm:py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-500/10 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Cpu className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[9px] sm:text-[10px] font-semibold tracking-wide text-amber-300 leading-tight">
                  Parts Collection
                </div>
                <div className="font-mono-num text-[11px] sm:text-sm font-bold text-white leading-tight">
                  {collectedCount} / {totalTermCount}
                </div>
              </div>
            </button>

            <div className="hidden sm:flex items-center gap-3 rounded-xl border border-white/10 bg-[#070b14]/90 px-3.5 py-2 text-xs">
              <div>
                <div className="font-display text-[10px] tracking-wider text-slate-400">
                  {isTimeAttack ? 'TA BEST LAP' : 'BEST LAP'}
                </div>
                <div className="font-mono-num text-sm sm:text-base font-bold text-amber-400">
                  {formatRaceTime(telemetry.allTimeBestLapMs)}
                </div>
              </div>
              {isTimeAttack && (
                <div className="border-l border-white/10 pl-3">
                  <div className="font-display text-[10px] tracking-wider text-slate-400">
                    BEST TOTAL TIME
                  </div>
                  <div className="font-mono-num text-sm sm:text-base font-bold text-cyan-300">
                    {formatRaceTime(telemetry.allTimeBestTotalMs)}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundMuted ? 'サウンドをオンにする' : 'サウンドをオフにする'}
              title={soundMuted ? 'サウンド OFF（タップでON）' : 'サウンド ON（タップでOFF）'}
              className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
                soundMuted
                  ? 'border-white/12 bg-[#070b14]/92 text-slate-500 hover:text-slate-300'
                  : 'border-cyan-400/45 bg-[#070b14]/92 text-cyan-400 hover:border-cyan-300'
              }`}
            >
              {soundMuted ? (
                <VolumeX className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              ) : (
                <Volume2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="設定"
              title="設定・ランキング"
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border border-white/15 bg-[#070b14]/92 text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-white cursor-pointer shrink-0"
            >
              <Settings className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-cyan-400" />
            </button>
          </div>
        </div>

        {/* Mobile Top Mode Switcher Bar */}
        <div className="pointer-events-auto grid md:hidden grid-cols-2 gap-1.5 rounded-xl border border-white/12 bg-[#070b14]/92 p-1 shadow-lg">
          <button
            type="button"
            onClick={() => onSelectMode('race')}
            className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
              gameMode === 'race'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Flag className="h-3.5 w-3.5 shrink-0" />
            <span>RACE</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectMode('time_attack')}
            className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
              gameMode === 'time_attack'
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>TIME ATTACK</span>
          </button>
        </div>
      </div>

      {/* Mobile-Optimized Slim List Dock (< md): Clean dropdown selectors, no clutter */}
      <div className="pointer-events-auto md:hidden mx-auto w-full max-w-lg rounded-2xl border border-white/12 bg-[#070b14]/92 p-3 shadow-2xl space-y-2">
        {/* Course Dropdown */}
        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: activeSubCourse.accentHex }}
          />
          <select
            aria-label="コース選択"
            value={selectedCourse}
            onChange={(e) => onSelectCourseKey(e.target.value)}
            className="min-h-[42px] w-full appearance-none rounded-xl border border-white/15 bg-slate-950/90 pl-9 pr-9 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
          >
            {COURSES.map((course) => (
              <option key={course.id} value={course.id}>
                {course.jpName} · {course.categoryLabel}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>

        {/* Subcategory Dropdown (only when non-orbital course has subcategories) */}
        {selectedCourse !== 'orbital' && subCourses.length > 1 && (
          <div className="relative">
            <Layers
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: activeSubCourse.accentHex }}
            />
            <select
              aria-label="サブカテゴリコース選択"
              value={activeSubCourse.courseKey}
              onChange={(e) => onSelectCourseKey(e.target.value)}
              className="min-h-[42px] w-full appearance-none rounded-xl border border-white/15 bg-slate-950/90 pl-9 pr-9 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              {subCourses.map((sc) => (
                <option key={sc.courseKey} value={sc.courseKey}>
                  {sc.subcategoryId ? `${sc.title} (2 LAPS)` : sc.title}（{sc.termCount}語）
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        )}

        {/* Machine Dropdown + NORMAL/HARD Class Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Car
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: activeSpec.accentHex }}
            />
            <select
              aria-label="マシン選択"
              value={selectedMachine}
              onChange={(e) => onSelectMachine(e.target.value as MachineId)}
              className="min-h-[42px] w-full appearance-none rounded-xl border border-white/15 bg-slate-950/90 pl-9 pr-8 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none cursor-pointer truncate"
            >
              {MACHINES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.subtitle}）
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelectClass('normal')}
              className={`min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                speedClass === 'normal'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              NORMAL
            </button>
            <button
              type="button"
              onClick={() => onSelectClass('hard')}
              className={`min-h-[34px] rounded-lg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                speedClass === 'hard'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              HARD
            </button>
          </div>
        </div>

        {/* Mobile Time Attack Ghost Toggles & Best Total (Compact 1-Row) */}
        {isTimeAttack && (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col rounded-lg border border-white/10 bg-slate-900/75 px-2.5 py-1 shrink-0">
              <span className="font-display text-[9px] tracking-wider text-slate-400 leading-none">
                BEST TOTAL
              </span>
              <span className="mt-0.5 font-mono-num text-[11px] font-bold text-cyan-300 leading-none">
                {formatRaceTime(telemetry.allTimeBestTotalMs)}
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleBestGhost}
              className={`flex min-h-[36px] flex-1 items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                showBestGhost
                  ? 'border-amber-400/55 bg-amber-500/15 text-amber-200'
                  : 'border-white/10 bg-slate-900/60 text-slate-400'
              }`}
            >
              <span className="truncate font-display tracking-wider">BEST</span>
              {showBestGhost ? <Eye className="h-3.5 w-3.5 shrink-0" /> : <EyeOff className="h-3.5 w-3.5 shrink-0" />}
            </button>
            <button
              type="button"
              onClick={onToggleLastGhost}
              className={`flex min-h-[36px] flex-1 items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                showLastGhost
                  ? 'border-sky-400/55 bg-sky-500/15 text-sky-200'
                  : 'border-white/10 bg-slate-900/60 text-slate-400'
              }`}
            >
              <span className="truncate font-display tracking-wider">LAST</span>
              {showLastGhost ? <Eye className="h-3.5 w-3.5 shrink-0" /> : <EyeOff className="h-3.5 w-3.5 shrink-0" />}
            </button>
          </div>
        )}

        {/* Mobile Launch CTA */}
        <div>

          <button
            type="button"
            onClick={onStartRace}
            disabled={bgmPreparing}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 font-display text-base font-bold tracking-wider text-slate-950 transition-colors disabled:opacity-75 cursor-pointer whitespace-nowrap ${
              isTimeAttack ? 'bg-amber-400 hover:bg-amber-300' : 'bg-cyan-500 hover:bg-cyan-400'
            }`}
          >
            {bgmPreparing ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
                BGM準備中...
              </>
            ) : (
              <>
                <Play className="h-4.5 w-4.5 fill-current" />
                {isTimeAttack ? 'START TIME ATTACK' : 'START RACE'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Desktop Hangar Dock (>= md): Full Course + Machine + Difficulty + Launch View */}
      <div className="pointer-events-auto hidden md:block mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-white/12 bg-[#070b14]/92 p-4 shadow-2xl">
        {/* Course Selector Row */}
        <div className="mb-3 border-b border-white/10 pb-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <MapPin className="h-3.5 w-3.5 text-cyan-400" />
              コース＆出題カテゴリ選択
              {activeSubCourse.subcategoryId && (
                <span className="ml-1 font-mono-num text-[10px] text-amber-300">
                  （2周 · ランキング対象外）
                </span>
              )}
            </span>
            <span className="truncate text-slate-300">{activeSubCourse.subtitle}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {COURSES.map((course) => {
              const isSelected = course.id === selectedCourse;
              const displayAccent = isSelected ? activeSubCourse.accentHex : course.accentHex;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => {
                    if (!isSelected) onSelectCourseKey(course.id);
                  }}
                  className={`flex flex-col rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900/95'
                      : 'border-white/10 bg-slate-900/55 hover:border-white/25'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: displayAccent,
                          boxShadow: `0 0 14px ${displayAccent}2a`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-display text-xs font-bold tracking-wide text-white truncate">
                      {course.jpName}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: displayAccent }}
                    />
                  </div>
                  <span
                    className="mt-0.5 truncate text-[10px] font-semibold"
                    style={{ color: isSelected ? displayAccent : '#94a3b8' }}
                  >
                    {course.categoryLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedCourse !== 'orbital' && subCourses.length > 1 && (
            <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/75 px-3 py-1.5">
              <label
                htmlFor="desktop-subcourse-select"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
              >
                <Layers className="h-3.5 w-3.5" style={{ color: activeSubCourse.accentHex }} />
                別コース（サブカテゴリ）
              </label>
              <div className="relative flex-1 min-w-0">
                <select
                  id="desktop-subcourse-select"
                  value={activeSubCourse.courseKey}
                  onChange={(e) => onSelectCourseKey(e.target.value)}
                  className="min-h-[38px] w-full appearance-none rounded-lg border border-white/15 bg-slate-950 px-3 py-1.5 pr-9 text-xs font-bold text-white transition-colors hover:border-white/30 focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  {subCourses.map((sc) => (
                    <option key={sc.courseKey} value={sc.courseKey}>
                      {sc.subcategoryId ? `別コース：${sc.title} (2周)` : sc.title}（{sc.termCount}問）
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <span
                className="font-mono-num text-[11px] font-bold whitespace-nowrap shrink-0"
                style={{ color: activeSubCourse.accentHex }}
              >
                収録 {activeSubCourse.termCount}語
              </span>
            </div>
          )}
        </div>

        {/* Machines & Launch Row */}
        <div className="grid grid-cols-12 items-center gap-3.5">
          {/* 3 Machine Cards */}
          <div className="col-span-7 grid grid-cols-3 gap-2">
            {MACHINES.map((m) => {
              const selected = m.id === selectedMachine;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMachine(m.id)}
                  className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    selected
                      ? 'border-cyan-400 bg-cyan-500/12'
                      : 'border-white/10 bg-slate-900/70 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold tracking-wide text-white">
                      {m.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="h-2.5 w-2.5 rounded-sm border border-white/25"
                        style={{ backgroundColor: `#${m.bodyColor.toString(16).padStart(6, '0')}` }}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-sm border border-white/25"
                        style={{ backgroundColor: `#${m.secondaryColor.toString(16).padStart(6, '0')}` }}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: m.accentHex }}
                      />
                    </div>
                  </div>
                  <span className="mt-0.5 text-[11px] text-slate-400">{m.subtitle}</span>
                  <div className="mt-2 space-y-1 font-display text-[10px] tracking-wider text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span>TOP SPEED</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-cyan-400" style={{ width: `${m.stats.speed}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>ACCEL</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-amber-400" style={{ width: `${m.stats.accel}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>ITEM POWER</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-purple-400" style={{ width: `${m.stats.itemPower}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Action Zone: Normal/Hard Toggle + Time Attack Ghost Toggles + Start Button */}
          <div className="col-span-5 flex flex-col justify-between gap-2 border-l border-white/10 pl-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs">
                <div className="text-slate-400">出題＆速度クラス</div>
                <div className="font-display text-sm font-bold text-white">
                  {activeSpec.name} ·{' '}
                  {speedClass === 'hard'
                    ? `MAX ~${Math.round(activeSpec.maxSpeedKmh * 1.1)} KM/H`
                    : `MAX ~${activeSpec.maxSpeedKmh} KM/H`}
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => onSelectClass('normal')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    speedClass === 'normal'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  NORMAL
                </button>
                <button
                  type="button"
                  onClick={() => onSelectClass('hard')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    speedClass === 'hard'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  HARD
                </button>
              </div>
            </div>

            {isTimeAttack ? (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onToggleBestGhost}
                  className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    showBestGhost
                      ? 'border-amber-400/55 bg-amber-500/14 text-amber-200'
                      : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate font-display tracking-wider">
                    BEST GHOST{telemetry.hasBestGhost ? '' : ' (NONE)'}
                  </span>
                  {showBestGhost ? (
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onToggleLastGhost}
                  className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    showLastGhost
                      ? 'border-sky-400/55 bg-sky-500/14 text-sky-200'
                      : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate font-display tracking-wider">
                    LAST GHOST{telemetry.hasLastGhost ? '' : ' (NONE)'}
                  </span>
                  {showLastGhost ? (
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 leading-relaxed">
                {speedClass === 'hard'
                  ? 'HARD: 過去に間違えた問題・未解答の問題を優先出題して弱点を重点攻略します。'
                  : 'NORMAL: 未収集・未解放の用語パーツをバランスよく出題します。'}
              </div>
            )}

            <button
              type="button"
              onClick={onStartRace}
              disabled={bgmPreparing}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 font-display text-base font-bold tracking-wider text-slate-950 transition-colors disabled:opacity-75 cursor-pointer whitespace-nowrap ${
                isTimeAttack ? 'bg-amber-400 hover:bg-amber-300' : 'bg-cyan-500 hover:bg-cyan-400'
              }`}
            >
              {bgmPreparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  BGM準備中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  {isTimeAttack ? 'START TIME ATTACK' : 'START RACE'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
