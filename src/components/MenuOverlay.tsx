import { useState } from 'react';
import {
  Car,
  CheckCircle2,
  Cpu,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Settings,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CourseId,
  COURSES,
  MACHINES,
  MachineId,
  RaceTelemetry,
  SpeedClass,
} from '../game/types';
import { CardCollectionMap } from '../types';
import { getAllFlatTerms, RARITY_META } from '../utils/cardCollection';
import { formatRaceTime } from '../utils/formatTime';
import { getTermEmoji } from '../utils/termIcon';

interface MenuOverlayProps {
  telemetry: RaceTelemetry;
  selectedCourse: CourseId;
  selectedMachine: MachineId;
  speedClass: SpeedClass;
  collection: CardCollectionMap;
  bgmPreparing: boolean;
  soundMuted: boolean;
  onSelectCourse: (id: CourseId) => void;
  onSelectMachine: (id: MachineId) => void;
  onSelectClass: (cls: SpeedClass) => void;
  onStartRace: () => void;
  onReturnMenu: () => void;
  onOpenCollection: () => void;
  onOpenSettings: () => void;
  onToggleSound: () => void;
}

export function MenuOverlay({
  telemetry,
  selectedCourse,
  selectedMachine,
  speedClass,
  collection,
  bgmPreparing,
  soundMuted,
  onSelectCourse,
  onSelectMachine,
  onSelectClass,
  onStartRace,
  onReturnMenu,
  onOpenCollection,
  onOpenSettings,
  onToggleSound,
}: MenuOverlayProps) {
  const [mobileTab, setMobileTab] = useState<'course' | 'machine'>('course');

  const totalTermCount = getAllFlatTerms().length;
  const collectedCount = Object.keys(collection).length;
  const activeCourse = COURSES.find((c) => c.id === selectedCourse) ?? COURSES[0];

  if (telemetry.phase === 'finished') {
    const finishedCourse = COURSES.find((c) => c.id === telemetry.courseId) ?? activeCourse;
    const minLapMs =
      telemetry.lapTimesMs.length > 0 ? Math.min(...telemetry.lapTimesMs) : null;
    return (
      <div className="pointer-events-auto fixed inset-0 z-20 flex items-start sm:items-center justify-center bg-[#05070e]/78 p-3 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#070b14]/96 p-4 sm:p-6 shadow-2xl my-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5 sm:pb-4">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wider text-cyan-400 truncate">
                RACE COMPLETE · {finishedCourse.jpName} · {telemetry.speedClass.toUpperCase()} · {telemetry.machineName}
              </p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {telemetry.rank === 1 ? '1ST PLACE · VICTORY' : `${telemetry.rank}位 フィニッシュ`}
                </h2>
                {telemetry.rankingPlacement !== null && (
                  <span className="font-mono-num text-xs font-bold text-amber-300">
                    自己ベスト {telemetry.rankingPlacement}位 ランクイン
                  </span>
                )}
              </div>
            </div>
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-400 shrink-0">
              <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="text-[10px] sm:text-[11px] text-slate-400">トータルタイム</div>
              <div className="mt-1 font-mono-num text-sm sm:text-xl font-bold text-white">
                {formatRaceTime(telemetry.totalRaceMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
                <span>ベストラップ</span>
                {telemetry.isNewRecord && (
                  <span className="font-bold text-amber-400">NEW</span>
                )}
              </div>
              <div className="mt-1 font-mono-num text-sm sm:text-xl font-bold text-cyan-400">
                {formatRaceTime(telemetry.bestLapMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-2.5 sm:p-3">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
                <span>クイズ正答</span>
                {telemetry.bestQuizStreak >= 2 && (
                  <span className="font-mono-num font-bold text-amber-300">
                    {telemetry.bestQuizStreak}連続
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
              <div className="mb-1.5 text-[11px] font-medium text-slate-400">
                各ラップタイム
              </div>
              <div className="grid grid-cols-3 gap-2">
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

          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-2">
            {/* Final Standings */}
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <div className="mb-2 text-[11px] font-medium text-slate-400">最終順位</div>
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
                  今回のレースではパーツを獲得できませんでした
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

          {/* Post-Race Wrong-Answer Review List */}
          {telemetry.missedQuestions.length > 0 ? (
            <div className="mt-3.5 rounded-xl border border-red-400/25 bg-[#12070b]/80 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-red-200">
                <span>間違い復習リスト ({telemetry.missedQuestions.length}問)</span>
                <span className="text-slate-400">次回のHARD対策に活用</span>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {telemetry.missedQuestions.map((miss, idx) => (
                  <div
                    key={`${miss.termId}-${idx}`}
                    className="rounded-lg border border-white/10 bg-slate-950/75 p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                      <span className="font-display font-bold text-amber-300">
                        正解: {miss.termName}
                      </span>
                      <span className="text-[11px] text-red-300">
                        選択: {miss.chosenTermName}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                      {miss.explanation}
                    </p>
                  </div>
                ))}
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
                  再レース
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
      {/* Top Header: Compact Title Lockup + Parts Collection + Course Best Record */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="pointer-events-auto min-w-0">
          <h1 className="font-display text-2xl sm:text-5xl font-bold tracking-tight text-white leading-none">
            HYPERION <span className="text-cyan-400">GP</span>
          </h1>
          <p className="mt-1 text-[11px] sm:text-sm text-slate-300 truncate">
            {activeCourse.jpName} · {activeCourse.categoryLabel}
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCollection}
            className="flex min-h-[44px] items-center gap-1.5 sm:gap-2 rounded-xl border border-amber-400/35 bg-[#070b14]/92 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-500/10 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Cpu className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] font-semibold tracking-wide text-amber-300 leading-tight">
                Parts Collection
              </div>
              <div className="font-mono-num text-xs sm:text-sm font-bold text-white leading-tight">
                {collectedCount} / {totalTermCount}
              </div>
            </div>
          </button>

          <div className="hidden sm:flex items-center gap-3 rounded-xl border border-white/10 bg-[#070b14]/90 px-3.5 py-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-400">コース最速ラップ</div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-amber-400">
                {formatRaceTime(telemetry.allTimeBestLapMs)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundMuted ? 'サウンドをオンにする' : 'サウンドをオフにする'}
            title={soundMuted ? 'サウンド OFF（タップでON）' : 'サウンド ON（タップでOFF）'}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors cursor-pointer shrink-0 ${
              soundMuted
                ? 'border-white/12 bg-[#070b14]/92 text-slate-500 hover:text-slate-300'
                : 'border-cyan-400/45 bg-[#070b14]/92 text-cyan-400 hover:border-cyan-300'
            }`}
          >
            {soundMuted ? (
              <VolumeX className="h-4.5 w-4.5" />
            ) : (
              <Volume2 className="h-4.5 w-4.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="設定"
            title="設定・ランキング"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-[#070b14]/92 text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-white cursor-pointer shrink-0"
          >
            <Settings className="h-4.5 w-4.5 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Mobile-Optimized Tabbed Hangar Dock (< md) */}
      <div className="pointer-events-auto md:hidden mx-auto w-full max-w-lg rounded-2xl border border-white/12 bg-[#070b14]/94 p-3 shadow-2xl">
        {/* Mobile Tab Switcher (Course / Machine) */}
        <div className="mb-2.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/90 p-1">
          <button
            type="button"
            onClick={() => setMobileTab('course')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              mobileTab === 'course'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">コース選択</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('machine')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              mobileTab === 'machine'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Car className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">マシン選択</span>
          </button>
        </div>

        {/* Mobile Tab Content */}
        {mobileTab === 'course' ? (
          <div className="grid grid-cols-2 gap-2">
            {COURSES.map((course) => {
              const isSelected = course.id === selectedCourse;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  className={`flex min-h-[58px] flex-col justify-between rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900'
                      : 'border-white/10 bg-slate-900/55 hover:border-white/25'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: course.accentHex,
                          boxShadow: `0 0 14px ${course.accentHex}2a`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-display text-xs font-bold text-white truncate">
                      {course.jpName}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: course.accentHex }}
                    />
                  </div>
                  <span
                    className="mt-1 truncate text-[10px] font-semibold"
                    style={{ color: isSelected ? course.accentHex : '#94a3b8' }}
                  >
                    {course.categoryLabel}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {MACHINES.map((m) => {
              const selected = m.id === selectedMachine;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMachine(m.id)}
                  className={`flex min-h-[60px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    selected
                      ? 'border-cyan-400 bg-cyan-500/14'
                      : 'border-white/10 bg-slate-900/65 hover:border-white/25'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-sm shrink-0"
                        style={{ backgroundColor: m.accentHex }}
                      />
                      <span className="font-display text-sm font-bold text-white truncate">
                        {m.name}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-300">{m.subtitle}</div>
                  </div>
                  <div className="flex flex-col gap-1 w-28 shrink-0 text-[10px] text-slate-300">
                    <div className="flex items-center justify-between gap-1.5">
                      <span>速度</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-cyan-400" style={{ width: `${m.stats.speed}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span>加速</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-amber-400" style={{ width: `${m.stats.accel}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span>道具</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-purple-400" style={{ width: `${m.stats.itemPower}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Mobile Thumb-Zone Class Toggle + Launch CTA */}
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-slate-400">
                {speedClass === 'hard' ? '未解答・低正答率を優先出題' : '標準クラス · 全問題対象'}
              </div>
              <div className="font-display text-xs font-bold text-white truncate">
                {activeSpec.name} · {activeCourse.jpName}
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1 shrink-0">
              <button
                type="button"
                onClick={() => onSelectClass('normal')}
                className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
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
                className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  speedClass === 'hard'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                HARD
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartRace}
            disabled={bgmPreparing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 font-display text-base font-bold tracking-wider text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-75 cursor-pointer whitespace-nowrap"
          >
            {bgmPreparing ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
                BGM準備中...
              </>
            ) : (
              <>
                <Play className="h-4.5 w-4.5 fill-current" />
                レース開始
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
            </span>
            <span className="truncate text-slate-400">{activeCourse.subtitle}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {COURSES.map((course) => {
              const isSelected = course.id === selectedCourse;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  className={`flex flex-col rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900/95'
                      : 'border-white/10 bg-slate-900/55 hover:border-white/25'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: course.accentHex,
                          boxShadow: `0 0 14px ${course.accentHex}2a`,
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
                      style={{ backgroundColor: course.accentHex }}
                    />
                  </div>
                  <span
                    className="mt-0.5 truncate text-[10px] font-semibold"
                    style={{ color: isSelected ? course.accentHex : '#94a3b8' }}
                  >
                    {course.categoryLabel}
                  </span>
                </button>
              );
            })}
          </div>
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
                  <div className="mt-2 space-y-1 text-[10px] text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span>最高速度</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-cyan-400" style={{ width: `${m.stats.speed}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>加速性能</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-amber-400" style={{ width: `${m.stats.accel}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>アイテム性能</span>
                      <div className="h-1.5 w-18 overflow-hidden rounded-sm bg-slate-800">
                        <div className="h-full bg-purple-400" style={{ width: `${m.stats.itemPower}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Action Zone: Normal/Hard Toggle + Start Race Button */}
          <div className="col-span-5 flex flex-col justify-between gap-2.5 border-l border-white/10 pl-4">
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

            <div className="text-[11px] text-slate-400 leading-relaxed">
              {speedClass === 'hard'
                ? 'HARD: 未解答の問題・正答率が低い問題を優先出題して弱点を重点攻略します。'
                : 'NORMAL: 未収集・未解放の用語パーツをバランスよく出題します。'}
            </div>

            <button
              type="button"
              onClick={onStartRace}
              disabled={bgmPreparing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 font-display text-base font-bold tracking-wider text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-75 cursor-pointer whitespace-nowrap"
            >
              {bgmPreparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  BGM準備中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  レース開始
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
