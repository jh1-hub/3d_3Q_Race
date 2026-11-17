import { useCallback, useEffect, useRef, useState } from 'react';
import { CardCollectionModal } from './components/CardCollectionModal';
import { MenuOverlay } from './components/MenuOverlay';
import { RaceHud, TouchDragIndicator } from './components/RaceHud';
import { RaceEngine } from './game/engine';
import { CourseId, MachineId, RaceTelemetry, SpeedClass } from './game/types';
import { CardCollectionMap } from './types';
import { loadCardCollection } from './utils/cardCollection';

const INITIAL_TELEMETRY: RaceTelemetry = {
  phase: 'menu',
  courseId: 'orbital',
  countdownValue: 3,
  speedKmh: 0,
  isAccelerating: false,
  rank: 4,
  totalRacers: 4,
  lap: 1,
  totalLaps: 3,
  currentLapMs: 0,
  bestLapMs: null,
  totalRaceMs: 0,
  allTimeBestLapMs: null,
  isNewRecord: false,
  markers: [],
  standings: [],
  wrongWay: false,
  heldItem: null,
  shieldActive: false,
  missileWarning: false,
  eventNotice: null,
  activeQuiz: null,
  quizFeedback: null,
  earnedCards: [],
  quizAttempts: 0,
  quizCorrectCount: 0,
};

const INITIAL_TOUCH_DRAG: TouchDragIndicator = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  steerAnalog: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const activePointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    startTime: number;
    movedHorizontally: boolean;
    itemFired: boolean;
  } | null>(null);

  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [minimapPoints, setMinimapPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseId>('orbital');
  const [selectedMachine, setSelectedMachine] = useState<MachineId>('valkyrie');
  const [speedClass, setSpeedClass] = useState<SpeedClass>('vector');
  const [muted, setMuted] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [touchDrag, setTouchDrag] = useState<TouchDragIndicator>(INITIAL_TOUCH_DRAG);
  const [collection, setCollection] = useState<CardCollectionMap>(() => loadCardCollection());
  const [collectionOpen, setCollectionOpen] = useState(false);

  const refreshCollection = useCallback(() => {
    setCollection(loadCardCollection());
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new RaceEngine(
      mountEl,
      (next) => setTelemetry(next),
      (lost) => setContextLost(lost),
      () => setCollection(loadCardCollection())
    );
    engineRef.current = engine;
    setMinimapPoints(engine.getMinimapPoints());

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !e.repeat) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset drag input if race is paused or ended
  useEffect(() => {
    if (telemetry.phase !== 'racing' && telemetry.phase !== 'countdown') {
      activePointerRef.current = null;
      setTouchDrag(INITIAL_TOUCH_DRAG);
      engineRef.current?.setTouchInput({
        brake: false,
        steerAnalog: 0,
      });
    }
  }, [telemetry.phase]);

  const handleSurfacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (telemetry.phase !== 'racing' && telemetry.phase !== 'countdown') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (activePointerRef.current !== null) return;

      activePointerRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        movedHorizontally: false,
        itemFired: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable
      }
      setTouchDrag({
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        steerAnalog: 0,
      });
      engineRef.current?.setTouchInput({ steerAnalog: 0 });
    },
    [telemetry.phase]
  );

  const handleSurfacePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== e.pointerId) return;

    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;

    if (Math.abs(dx) > 10) {
      active.movedHorizontally = true;
    }

    // Upward or downward vertical flick activates held item
    if (!active.itemFired && Math.abs(dy) >= 42) {
      active.itemFired = true;
      engineRef.current?.usePlayerSubItem();
    }

    const deadzone = 6;
    const maxDrag = 64;
    let steerAnalog = 0;
    if (Math.abs(dx) > deadzone) {
      const effective = dx - Math.sign(dx) * deadzone;
      steerAnalog = Math.max(-1, Math.min(1, -effective / maxDrag));
    }

    setTouchDrag({
      active: true,
      startX: active.startX,
      startY: active.startY,
      currentX: e.clientX,
      steerAnalog,
    });
    engineRef.current?.setTouchInput({ steerAnalog });
  }, []);

  const handleSurfacePointerEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== e.pointerId) return;

    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    const elapsed = performance.now() - active.startTime;

    // Quick vertical flick OR quick direct click/tap without dragging activates held item
    if (!active.itemFired) {
      const isQuickFlick = Math.abs(dy) >= 34 && elapsed < 380;
      const isQuickClickOrTap = !active.movedHorizontally && Math.hypot(dx, dy) < 12 && elapsed < 260;
      if (isQuickFlick || isQuickClickOrTap) {
        active.itemFired = true;
        engineRef.current?.usePlayerSubItem();
      }
    }

    activePointerRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    setTouchDrag(INITIAL_TOUCH_DRAG);
    engineRef.current?.setTouchInput({ steerAnalog: 0 });
  }, []);

  const handleSelectCourse = useCallback((id: CourseId) => {
    setSelectedCourse(id);
    if (engineRef.current) {
      engineRef.current.setCourse(id);
      setMinimapPoints(engineRef.current.getMinimapPoints());
    }
  }, []);

  const handleSelectMachine = useCallback((id: MachineId) => {
    setSelectedMachine(id);
    engineRef.current?.setMachine(id);
  }, []);

  const handleSelectClass = useCallback((cls: SpeedClass) => {
    setSpeedClass(cls);
    engineRef.current?.setSpeedClass(cls);
  }, []);

  const handleStartRace = useCallback(() => {
    engineRef.current?.startRace();
  }, []);

  const handleReturnMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleUseSubItem = useCallback(() => {
    engineRef.current?.usePlayerSubItem();
  }, []);

  return (
    <main
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handleSurfacePointerMove}
      onPointerUp={handleSurfacePointerEnd}
      onPointerCancel={handleSurfacePointerEnd}
      className="relative h-screen w-screen overflow-hidden bg-[#05070e] touch-none"
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#05070e]/95 p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-white/15 bg-slate-950 p-6">
            <h2 className="font-display text-xl font-bold text-white">グラフィックコンテキストが中断されました</h2>
            <p className="mt-2 text-xs text-slate-400">
              WebGLコンテキストの復元を待機しています。戻らない場合はページを再読み込みしてください。
            </p>
          </div>
        </div>
      )}

      {/* Menu / Hangar & Podium Finish Overlay */}
      <MenuOverlay
        telemetry={telemetry}
        selectedCourse={selectedCourse}
        selectedMachine={selectedMachine}
        speedClass={speedClass}
        collection={collection}
        onSelectCourse={handleSelectCourse}
        onSelectMachine={handleSelectMachine}
        onSelectClass={handleSelectClass}
        onStartRace={handleStartRace}
        onReturnMenu={handleReturnMenu}
        onOpenCollection={() => {
          refreshCollection();
          setCollectionOpen(true);
        }}
      />

      {/* Card Collection Modal */}
      <CardCollectionModal
        open={collectionOpen}
        collection={collection}
        onClose={() => setCollectionOpen(false)}
      />

      {/* In-Race Unobtrusive HUD */}
      {telemetry.phase !== 'menu' && telemetry.phase !== 'finished' && (
        <RaceHud
          telemetry={telemetry}
          minimapPoints={minimapPoints}
          muted={muted}
          dockCollapsed={dockCollapsed}
          touchDrag={touchDrag}
          onToggleDock={() => setDockCollapsed((v) => !v)}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onRestart={handleStartRace}
          onReturnMenu={handleReturnMenu}
          onUseSubItem={handleUseSubItem}
          onSelectQuizLane={(idx) => engineRef.current?.selectQuizLane(idx)}
        />
      )}
    </main>
  );
}
