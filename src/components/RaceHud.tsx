import { useMemo } from 'react';
import {
  Bomb,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Pause,
  Play,
  Radio,
  Rocket,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { RaceTelemetry, SUB_ITEMS, SubItemType } from '../game/types';
import { formatRaceTime } from '../utils/formatTime';

export interface TouchDragIndicator {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  steerAnalog: number;
}

interface RaceHudProps {
  telemetry: RaceTelemetry;
  minimapPoints: { x: number; y: number }[];
  muted: boolean;
  dockCollapsed: boolean;
  touchDrag: TouchDragIndicator;
  onToggleDock: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onReturnMenu: () => void;
  onUseSubItem: () => void;
  onSelectQuizLane: (laneIndex: number) => void;
}

function SubItemIcon({ type, className = 'h-6 w-6' }: { type: SubItemType; className?: string }) {
  switch (type) {
    case 'boost':
      return <Flame className={`${className} text-amber-400`} />;
    case 'missile':
      return <Rocket className={`${className} text-red-400`} />;
    case 'shield':
      return <Shield className={`${className} text-cyan-400`} />;
    case 'mine':
      return <Bomb className={`${className} text-purple-400`} />;
    case 'emp':
      return <Radio className={`${className} text-sky-400`} />;
  }
}

export function RaceHud({
  telemetry,
  minimapPoints,
  muted,
  dockCollapsed,
  touchDrag,
  onToggleDock,
  onToggleMute,
  onTogglePause,
  onRestart,
  onReturnMenu,
  onUseSubItem,
  onSelectQuizLane,
}: RaceHudProps) {
  const pathD = useMemo(() => {
    if (minimapPoints.length === 0) return '';
    return (
      minimapPoints
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${(p.x * 100).toFixed(1)} ${(p.y * 100).toFixed(1)}`)
        .join(' ') + ' Z'
    );
  }, [minimapPoints]);

  const isActiveRace = telemetry.phase === 'racing' || telemetry.phase === 'countdown';
  const stopProp = (e: React.PointerEvent) => e.stopPropagation();
  const heldMeta = telemetry.heldItem ? SUB_ITEMS[telemetry.heldItem] : null;
  const activeQuiz = telemetry.activeQuiz;
  const quizFeedback = telemetry.quizFeedback;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Subtle Horizontal Drag Steering Indicator (only while dragging) */}
      {touchDrag.active && isActiveRace && Math.abs(touchDrag.steerAnalog) > 0.04 && (
        <div
          className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: touchDrag.startX, top: touchDrag.startY }}
        >
          <div className="relative flex h-9 w-32 items-center justify-center rounded-full border border-cyan-400/35 bg-[#070b14]/60">
            <div className="h-0.5 w-22 bg-white/15" />
            <div
              className="absolute h-4 w-4 rounded-full border border-cyan-300 bg-cyan-400/40"
              style={{
                transform: `translateX(${Math.max(-48, Math.min(48, touchDrag.currentX - touchDrag.startX))}px)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Top Row: Left Telemetry + Item Slot | Top-Right Minimap */}
      <div className="flex items-start justify-between gap-2.5 sm:gap-4">
        {/* Top-Left Telemetry & Held Item Slot */}
        <div className="flex flex-wrap sm:flex-col items-start gap-2 shrink-0">
          <div
            onPointerDown={stopProp}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-[#070b14]/88 px-3.5 py-2 text-slate-100 shadow-lg"
          >
            <div className="flex items-baseline gap-1 pr-2.5 border-r border-white/10">
              <span className="text-[10px] font-medium tracking-wider text-slate-400">POS</span>
              <span className="font-display text-xl sm:text-2xl font-bold text-cyan-400 font-mono-num">
                {telemetry.rank}
              </span>
              <span className="text-[11px] text-slate-400 font-mono-num">/{telemetry.totalRacers}</span>
            </div>

            <div className="flex items-baseline gap-1 sm:pr-2.5 sm:border-r sm:border-white/10">
              <span className="text-[10px] font-medium tracking-wider text-slate-400">LAP</span>
              <span className="font-display text-xl sm:text-2xl font-bold text-white font-mono-num">
                {telemetry.lap}
              </span>
              <span className="text-[11px] text-slate-400 font-mono-num">/{telemetry.totalLaps}</span>
            </div>

            <div className="hidden md:flex flex-col text-[11px]">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-slate-400">TIME</span>
                <span className="font-mono-num font-semibold text-white">
                  {formatRaceTime(telemetry.currentLapMs)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-slate-400">BEST</span>
                <span className="font-mono-num font-medium text-amber-400">
                  {formatRaceTime(telemetry.bestLapMs ?? telemetry.allTimeBestLapMs)}
                </span>
              </div>
            </div>
          </div>

          {/* Held Item Button */}
          <button
            type="button"
            onPointerDown={stopProp}
            onClick={onUseSubItem}
            disabled={!heldMeta}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-3 py-1.5 sm:py-2 text-left shadow-lg transition-transform ${
              heldMeta
                ? 'bg-[#081020]/95 hover:scale-[1.03] active:scale-95 cursor-pointer'
                : 'border-white/10 bg-[#070b14]/82 opacity-80 cursor-default'
            }`}
            style={
              heldMeta
                ? {
                    borderColor: heldMeta.accentHex,
                    boxShadow: `0 0 18px ${heldMeta.accentHex}33`,
                  }
                : undefined
            }
            title="アイテムを使用 (タップ / クリック / E / Space / 上下フリック)"
          >
            <div
              className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg border bg-slate-950/90"
              style={{ borderColor: heldMeta ? `${heldMeta.accentHex}66` : 'rgba(255,255,255,0.1)' }}
            >
              {heldMeta ? (
                <SubItemIcon type={heldMeta.type} className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              ) : (
                <span className="text-xs font-medium text-slate-500">—</span>
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 whitespace-nowrap">
                {heldMeta ? 'ITEM · タップで使用' : telemetry.shieldActive ? 'SHIELD ACTIVE' : 'ITEM SLOT'}
              </span>
              <span className="font-display text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                {heldMeta ? heldMeta.name : telemetry.shieldActive ? 'シールド展開中' : 'アイテムなし'}
              </span>
            </div>
          </button>
        </div>

        {/* Top-Right SVG Circuit Minimap */}
        <div
          onPointerDown={stopProp}
          className="hidden sm:flex flex-col items-center rounded-xl border border-white/10 bg-[#070b14]/88 p-2.5 shadow-lg shrink-0"
        >
          <svg viewBox="0 0 100 100" className="h-24 w-24">
            {pathD && (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="5.5"
                  strokeLinejoin="round"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeOpacity="0.65"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </>
            )}
            {telemetry.markers.map((m) => (
              <circle
                key={m.id}
                cx={m.x * 100}
                cy={m.y * 100}
                r={m.isPlayer ? 4.2 : 3.0}
                fill={m.isPlayer ? '#22d3ee' : m.color}
                stroke="#05070e"
                strokeWidth="1.2"
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Horizontally Dead-Center & Upper-Center Quiz / Feedback Overlay */}
      <div className="pointer-events-none fixed left-1/2 top-18 sm:top-[16%] z-20 flex w-[min(94vw,42rem)] -translate-x-1/2 flex-col items-center gap-2">
        {activeQuiz && (
          <div className="w-full rounded-2xl border border-cyan-400/45 bg-[#070b14]/92 px-4 py-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 text-[11px] font-mono-num">
              <span className="font-semibold tracking-wider text-cyan-400">
                QUIZ GATE · あと {Math.max(1, Math.ceil(activeQuiz.etaSeconds))}秒
              </span>
              <span className="text-slate-400">
                正答 {telemetry.quizCorrectCount} · 獲得カード {telemetry.earnedCards.length}枚
              </span>
            </div>

            <p className="mt-1.5 text-center text-sm sm:text-base font-bold leading-snug text-white">
              {activeQuiz.questionText}
            </p>

            {activeQuiz.showLanes ? (
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:gap-2">
                {activeQuiz.lanes.map((lane) => {
                  const isPlayerLane = activeQuiz.playerLaneIndex === lane.laneIndex;
                  const itemMeta = SUB_ITEMS[lane.itemKind];
                  return (
                    <button
                      key={lane.laneIndex}
                      type="button"
                      onPointerDown={stopProp}
                      onClick={() => onSelectQuizLane(lane.laneIndex)}
                      className={`pointer-events-auto flex flex-col justify-between rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer ${
                        isPlayerLane
                          ? 'border-cyan-300 bg-cyan-500/24 ring-1 ring-cyan-300/60'
                          : 'border-white/15 bg-slate-900/85 hover:border-white/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num">
                        <span className={isPlayerLane ? 'font-bold text-cyan-200' : 'text-slate-400'}>
                          L{lane.laneIndex + 1}
                        </span>
                        <span className="flex items-center gap-0.5 font-bold" style={{ color: itemMeta.accentHex }}>
                          <SubItemIcon type={lane.itemKind} className="h-3 w-3" />
                          <span className="hidden sm:inline">{itemMeta.shortLabel}</span>
                        </span>
                      </div>
                      <div className="mt-1 text-center text-[11px] sm:text-xs font-bold leading-tight text-white line-clamp-2">
                        {lane.termName}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1.5 text-center text-[11px] text-slate-400">
                まもなく4レーンに選択肢が表示されます…
              </div>
            )}
          </div>
        )}

        {!activeQuiz && quizFeedback && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-bold shadow-xl ${
              quizFeedback.correct
                ? 'border-emerald-400/50 bg-[#051a14]/92 text-emerald-300'
                : 'border-red-400/50 bg-[#1a060a]/92 text-red-300'
            }`}
          >
            {quizFeedback.correct ? (
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
            ) : (
              <XCircle className="h-4.5 w-4.5 shrink-0" />
            )}
            <span>{quizFeedback.message}</span>
          </div>
        )}

        {telemetry.missileWarning && (
          <div className="rounded-lg border border-red-500/50 bg-[#1a060a]/90 px-3.5 py-1 text-xs font-bold tracking-wider text-red-300">
            ミサイル接近中 · INCOMING
          </div>
        )}

        {!quizFeedback && telemetry.eventNotice && (
          <div className="rounded-lg border border-cyan-400/35 bg-[#070b14]/90 px-3.5 py-1 text-xs font-semibold text-cyan-200">
            {telemetry.eventNotice}
          </div>
        )}
      </div>

      {/* Center Status Prompts (Countdown or Pause Modal) */}
      <div className="flex flex-1 items-center justify-center">
        {telemetry.phase === 'countdown' && (
          <div className="text-center">
            <div className="font-display text-7xl sm:text-8xl font-bold tracking-tight text-cyan-400 drop-shadow-[0_4px_24px_rgba(6,182,212,0.55)] font-mono-num">
              {telemetry.countdownValue > 0 ? telemetry.countdownValue : 'GO'}
            </div>
            <p className="mt-2 text-xs tracking-widest text-slate-300">
              自動アクセル · ← → / ドラッグでハンドル · 正答レーンでターボ＆カード獲得
            </p>
          </div>
        )}

        {telemetry.phase === 'racing' && telemetry.wrongWay && (
          <div className="rounded-lg border border-red-500/40 bg-[#0f060a]/90 px-4 py-2 text-sm font-bold tracking-wider text-red-400">
            逆走警告 · REVERSE
          </div>
        )}

        {telemetry.phase === 'paused' && (
          <div
            onPointerDown={stopProp}
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/15 bg-[#070b14]/95 p-6 text-center shadow-2xl"
          >
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">
              RACE PAUSED
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              レースを一時停止しています
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 cursor-pointer"
              >
                <Play className="h-4 w-4" />
                レースを再開
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                最初からやり直す
              </button>
              <button
                type="button"
                onClick={onReturnMenu}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-slate-400 transition-colors hover:text-white cursor-pointer"
              >
                マシン選択に戻る
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Minimal Bottom Speed & Utility Dock */}
      <div className="flex flex-col items-center">
        <div onPointerDown={stopProp} className="pointer-events-auto flex flex-col items-center">
          <button
            type="button"
            onClick={onToggleDock}
            className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/10 bg-[#070b14]/90 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
            title="HUDの表示/非表示 (H)"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>HUDを表示</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>HUDを格納</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="flex items-center justify-center gap-4 rounded-xl border border-white/10 bg-[#070b14]/90 px-5 py-2.5 shadow-xl">
              {/* Speedometer */}
              <div className="flex items-baseline gap-1.5 pr-4 border-r border-white/10 min-w-[116px]">
                <span
                  className={`font-display text-3xl font-bold tracking-tight font-mono-num ${
                    telemetry.isAccelerating ? 'text-amber-400' : 'text-white'
                  }`}
                >
                  {telemetry.speedKmh}
                </span>
                <span className="text-[11px] font-semibold text-cyan-400">KM/H</span>
              </div>

              {/* Active Status Readout */}
              <div className="flex items-center gap-2 pr-4 border-r border-white/10 text-xs">
                {telemetry.isAccelerating ? (
                  <span className="font-semibold text-amber-400">TURBO BOOST</span>
                ) : telemetry.shieldActive ? (
                  <span className="font-semibold text-cyan-400">AEGIS SHIELD</span>
                ) : (
                  <span className="text-slate-400">AUTO DRIVE</span>
                )}
              </div>

              {/* Utility Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
                  aria-label={muted ? 'ミュート解除' : 'ミュート'}
                  title={muted ? 'サウンドON' : 'ミュート'}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={onTogglePause}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
                  aria-label="一時停止"
                  title="一時停止 (Esc)"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
