import { BookOpen, MapPin, Play, RotateCcw, Trophy } from 'lucide-react';
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
  onSelectCourse: (id: CourseId) => void;
  onSelectMachine: (id: MachineId) => void;
  onSelectClass: (cls: SpeedClass) => void;
  onStartRace: () => void;
  onReturnMenu: () => void;
  onOpenCollection: () => void;
}

export function MenuOverlay({
  telemetry,
  selectedCourse,
  selectedMachine,
  speedClass,
  collection,
  onSelectCourse,
  onSelectMachine,
  onSelectClass,
  onStartRace,
  onReturnMenu,
  onOpenCollection,
}: MenuOverlayProps) {
  const totalTermCount = getAllFlatTerms().length;
  const collectedCount = Object.keys(collection).length;
  const activeCourse = COURSES.find((c) => c.id === selectedCourse) ?? COURSES[0];

  if (telemetry.phase === 'finished') {
    const finishedCourse = COURSES.find((c) => c.id === telemetry.courseId) ?? activeCourse;
    return (
      <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-[#05070e]/78 p-4 overflow-y-auto">
        <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#070b14]/96 p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-medium tracking-wider text-cyan-400">
                RACE COMPLETE · {finishedCourse.name}
              </p>
              <h2 className="font-display text-3xl font-bold text-white">
                {telemetry.rank === 1 ? '1ST PLACE · VICTORY' : `${telemetry.rank}位 フィニッシュ`}
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-400">
              <Trophy className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <div className="text-[11px] text-slate-400">トータルタイム</div>
              <div className="mt-1 font-mono-num text-lg sm:text-xl font-bold text-white">
                {formatRaceTime(telemetry.totalRaceMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>ベストラップ</span>
                {telemetry.isNewRecord && (
                  <span className="font-bold text-amber-400">NEW</span>
                )}
              </div>
              <div className="mt-1 font-mono-num text-lg sm:text-xl font-bold text-cyan-400">
                {formatRaceTime(telemetry.bestLapMs)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
              <div className="text-[11px] text-slate-400">クイズ正答</div>
              <div className="mt-1 font-mono-num text-lg sm:text-xl font-bold text-emerald-400">
                {telemetry.quizCorrectCount} / {telemetry.quizAttempts}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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

            {/* Earned Learning Cards */}
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>今回獲得した用語カード</span>
                <span className="font-mono-num text-cyan-300">
                  図鑑 {collectedCount} / {totalTermCount}
                </span>
              </div>

              {telemetry.earnedCards.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-center text-xs text-slate-500">
                  今回のレースではカードを獲得できませんでした
                </div>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
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

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartRace}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" />
              再レース
            </button>
            <button
              type="button"
              onClick={onOpenCollection}
              className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="h-4 w-4" />
              Card Collection
            </button>
            <button
              type="button"
              onClick={onReturnMenu}
              className="rounded-lg border border-white/15 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer whitespace-nowrap"
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
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
      {/* Top Header: Clean Title Lockup + Card Collection + Course Best Record */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto">
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
            HYPERION <span className="text-cyan-400">GP</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-300">
            {activeCourse.jpName} · {activeCourse.categoryLabel}
          </p>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenCollection}
            className="flex items-center gap-2.5 rounded-xl border border-amber-400/35 bg-[#070b14]/90 px-3.5 py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-500/10 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4.5 w-4.5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] font-semibold tracking-wide text-amber-300">
                Card Collection
              </div>
              <div className="font-mono-num text-sm font-bold text-white">
                {collectedCount} / {totalTermCount} 枚
              </div>
            </div>
          </button>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#070b14]/88 px-3.5 py-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-400">コース最速ラップ</div>
              <div className="font-mono-num text-sm sm:text-base font-bold text-amber-400">
                {formatRaceTime(telemetry.allTimeBestLapMs)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Hangar Dock: Course Selector + Machine Selector + Speed Class + Launch CTA */}
      <div className="pointer-events-auto mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-white/12 bg-[#070b14]/92 p-3.5 sm:p-4 shadow-2xl">
        {/* Course Selector Row */}
        <div className="mb-3 border-b border-white/10 pb-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <MapPin className="h-3.5 w-3.5 text-cyan-400" />
              コース＆出題カテゴリ選択
            </span>
            <span className="hidden sm:inline truncate text-slate-400">
              {activeCourse.subtitle}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 lg:items-center">
          {/* 3 Machine Cards */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:col-span-7">
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

          {/* Right Action Zone: Class Toggle + Controls Summary + Start Race Button */}
          <div className="flex flex-col justify-between gap-2.5 lg:col-span-5 lg:border-l lg:border-white/10 lg:pl-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs">
                <div className="text-slate-400">クラス選択</div>
                <div className="font-display text-sm font-bold text-white">
                  {activeSpec.name} · {speedClass === 'hyper' ? 'MAX ~535 KM/H' : `MAX ~${activeSpec.maxSpeedKmh} KM/H`}
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => onSelectClass('vector')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    speedClass === 'vector'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  VECTOR
                </button>
                <button
                  type="button"
                  onClick={() => onSelectClass('hyper')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    speedClass === 'hyper'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  HYPER
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed">
              正答レーン通過でターボ＋カード獲得！同じ用語を2・3回クリアすると解説＆フレーバーが順次解放されます。
            </div>

            <button
              type="button"
              onClick={onStartRace}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 font-display text-base font-bold tracking-wider text-slate-950 transition-colors hover:bg-cyan-400 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              レース開始
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
