import { useCallback, useEffect, useRef, useState } from 'react';
import { CardCollectionModal } from './components/CardCollectionModal';
import { MenuOverlay } from './components/MenuOverlay';
import { RaceHud, TouchDragIndicator } from './components/RaceHud';
import { SettingsModal } from './components/SettingsModal';
import { BgmManager } from './game/bgm';
import { RaceEngine } from './game/engine';
import { GameMode, isMachineUnlocked, MachineId, PlayerModelDetail, RaceTelemetry, resolveSubCourse, SpeedClass } from './game/types';
import { CardCollectionMap, TermStats } from './types';
import { getCollectionProgress, loadCardCollection, loadTermStats } from './utils/cardCollection';
import { useOnlineStatus } from './utils/pwa';
import {
  GameSettings,
  loadGameSettings,
  saveGameSettings,
} from './utils/settings';

const INITIAL_TELEMETRY: RaceTelemetry = {
  phase: 'menu',
  gameMode: 'race',
  courseId: 'orbital',
  courseKey: 'orbital',
  subcategoryId: null,
  speedClass: 'normal',
  machineId: 'phantom',
  machineName: 'PHANTOM-V',
  countdownValue: 3,
  speedKmh: 0,
  isAccelerating: false,
  manualGauge: 0,
  hasBestGhost: false,
  hasLastGhost: false,
  bestGhostProgressNorm: null,
  rank: 4,
  totalRacers: 4,
  lap: 1,
  totalLaps: 3,
  currentLapMs: 0,
  lapTimesMs: [],
  bestLapMs: null,
  totalRaceMs: 0,
  allTimeBestLapMs: null,
  allTimeBestTotalMs: null,
  previousBestLapMs: null,
  previousBestTotalMs: null,
  bestGhostDeltaMs: null,
  isNewRecord: false,
  isNewBestTotal: false,
  isNewBestGhost: false,
  bestGhostSummary: null,
  topRankings: [],
  rankingPlacement: null,
  markers: [],
  standings: [],
  wrongWay: false,
  heldItem: null,
  heldItemRemainingSec: 0,
  shieldActive: false,
  glowActive: false,
  hoverActive: false,
  missileWarning: false,
  incomingThreat: null,
  hitAlert: null,
  eventNotice: null,
  activeQuiz: null,
  quizFeedback: null,
  earnedCards: [],
  newlyUnlockedMachines: [],
  missedQuestions: [],
  quizAttempts: 0,
  quizCorrectCount: 0,
  quizStreak: 0,
  bestQuizStreak: 0,
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
  const bgmRef = useRef<BgmManager | null>(null);
  const activePointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    startTime: number;
    movedHorizontally: boolean;
    itemFired: boolean;
  } | null>(null);

  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const settingsRef = useRef<GameSettings>(settings);
  settingsRef.current = settings;

  const [bgmPreparing, setBgmPreparing] = useState(false);

  const [telemetry, setTelemetry] = useState<RaceTelemetry>(INITIAL_TELEMETRY);
  const [minimapPoints, setMinimapPoints] = useState<{ x: number; y: number }[]>([]);
  const [gameMode, setGameMode] = useState<GameMode>('race');
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>('orbital');
  const [selectedMachine, setSelectedMachine] = useState<MachineId>('phantom');
  const [speedClass, setSpeedClass] = useState<SpeedClass>('normal');
  const muted = settings.masterMuted;
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [touchDrag, setTouchDrag] = useState<TouchDragIndicator>(INITIAL_TOUCH_DRAG);
  const [collection, setCollection] = useState<CardCollectionMap>(() => loadCardCollection());
  const [termStats, setTermStats] = useState<TermStats>(() => loadTermStats());
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionInitialTermId, setCollectionInitialTermId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isOnline = useOnlineStatus();

  const refreshCollection = useCallback(() => {
    setCollection(loadCardCollection());
    setTermStats(loadTermStats());
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const initialSettings = settingsRef.current;
    const bgm = new BgmManager();
    bgmRef.current = bgm;
    bgm.setMasterMuted(initialSettings.masterMuted);
    bgm.setBgmEnabled(initialSettings.bgmEnabled, initialSettings.raceBgm);
    bgm.enterMenu(initialSettings.raceBgm);

    const engine = new RaceEngine(
      mountEl,
      (next) => setTelemetry(next),
      (lost) => setContextLost(lost),
      () => {
        setCollection(loadCardCollection());
        setTermStats(loadTermStats());
      }
    );
    engine.setMuted(initialSettings.masterMuted);
    engine.setSfxEnabled(initialSettings.sfxEnabled);
    engine.setGhostVisibility(initialSettings.showBestGhost, initialSettings.showLastGhost);
    engine.setPlayerModelDetail(initialSettings.playerModelDetail);
    engineRef.current = engine;
    setMinimapPoints(engine.getMinimapPoints());

    return () => {
      bgm.dispose();
      bgmRef.current = null;
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

  // Reset drag input if race is paused or ended, or if window loses focus
  useEffect(() => {
    const resetPointer = () => {
      activePointerRef.current = null;
      setTouchDrag(INITIAL_TOUCH_DRAG);
      engineRef.current?.setTouchInput({
        steerAnalog: 0,
        pointerHeld: false,
      });
    };
    if (telemetry.phase !== 'racing' && telemetry.phase !== 'countdown') {
      resetPointer();
    }
    window.addEventListener('blur', resetPointer);
    return () => window.removeEventListener('blur', resetPointer);
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
      engineRef.current?.setTouchInput({ steerAnalog: 0, pointerHeld: true });
    },
    [telemetry.phase]
  );

  const handleSurfacePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== e.pointerId) return;

    // Safety check: if left mouse button was released without a pointerup reaching us, release immediately
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      activePointerRef.current = null;
      setTouchDrag(INITIAL_TOUCH_DRAG);
      engineRef.current?.setTouchInput({ steerAnalog: 0, pointerHeld: false });
      return;
    }

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
    engineRef.current?.setTouchInput({ steerAnalog, pointerHeld: true });
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
    engineRef.current?.setTouchInput({ steerAnalog: 0, pointerHeld: false });
  }, []);

  const handleSelectMode = useCallback((mode: GameMode) => {
    setGameMode(mode);
    engineRef.current?.setGameMode(mode);
  }, []);

  const handleToggleBestGhost = useCallback(() => {
    setSettings((prev) => {
      const next: GameSettings = { ...prev, showBestGhost: !prev.showBestGhost };
      saveGameSettings(next);
      engineRef.current?.setGhostVisibility(next.showBestGhost, next.showLastGhost);
      return next;
    });
  }, []);

  const handleToggleLastGhost = useCallback(() => {
    setSettings((prev) => {
      const next: GameSettings = { ...prev, showLastGhost: !prev.showLastGhost };
      saveGameSettings(next);
      engineRef.current?.setGhostVisibility(next.showBestGhost, next.showLastGhost);
      return next;
    });
  }, []);

  const handleSelectCourseKey = useCallback((courseKey: string) => {
    const resolved = resolveSubCourse(courseKey);
    setSelectedCourseKey(resolved.courseKey);
    if (engineRef.current) {
      engineRef.current.setCourse(resolved.courseKey);
      setMinimapPoints(engineRef.current.getMinimapPoints());
    }
  }, []);

  useEffect(() => {
    const collectedCount = getCollectionProgress(collection).collectedTerms;
    if (!isMachineUnlocked(selectedMachine, collectedCount)) {
      setSelectedMachine('phantom');
      engineRef.current?.setMachine('phantom');
    }
  }, [collection, selectedMachine]);

  const handleSelectMachine = useCallback((id: MachineId) => {
    const collectedCount = getCollectionProgress(loadCardCollection()).collectedTerms;
    if (!isMachineUnlocked(id, collectedCount)) return;
    setSelectedMachine(id);
    engineRef.current?.setMachine(id);
  }, []);

  const handleSelectClass = useCallback((cls: SpeedClass) => {
    setSpeedClass(cls);
    engineRef.current?.setSpeedClass(cls);
  }, []);

  const handleStartRace = useCallback(async () => {
    if (bgmPreparing) return;
    setBgmPreparing(true);
    try {
      await bgmRef.current?.prepareAndStartRace(settingsRef.current.raceBgm);
      engineRef.current?.startRace();
    } finally {
      setBgmPreparing(false);
    }
  }, [bgmPreparing]);

  const handleReturnMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
    bgmRef.current?.enterMenu(settingsRef.current.raceBgm);
  }, []);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const nextMuted = !prev.masterMuted;
      const next: GameSettings = { ...prev, masterMuted: nextMuted };
      saveGameSettings(next);
      engineRef.current?.setMuted(nextMuted);
      bgmRef.current?.setMasterMuted(nextMuted);
      if (!nextMuted && telemetry.phase === 'menu' && next.bgmEnabled) {
        bgmRef.current?.enterMenu(next.raceBgm);
      }
      return next;
    });
  }, [telemetry.phase]);

  const handleToggleBgm = useCallback(() => {
    setSettings((prev) => {
      const next: GameSettings = { ...prev, bgmEnabled: !prev.bgmEnabled };
      saveGameSettings(next);
      bgmRef.current?.setBgmEnabled(next.bgmEnabled, next.raceBgm);
      return next;
    });
  }, []);

  const handleToggleSfx = useCallback(() => {
    setSettings((prev) => {
      const next: GameSettings = { ...prev, sfxEnabled: !prev.sfxEnabled };
      saveGameSettings(next);
      engineRef.current?.setSfxEnabled(next.sfxEnabled);
      return next;
    });
  }, []);

  const handleSelectPlayerModelDetail = useCallback((detail: PlayerModelDetail) => {
    setSettings((prev) => {
      if (prev.playerModelDetail === detail) return prev;
      const next: GameSettings = { ...prev, playerModelDetail: detail };
      saveGameSettings(next);
      engineRef.current?.setPlayerModelDetail(detail);
      return next;
    });
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    bgmRef.current?.stopPreviewAndResumeMenu(settingsRef.current.raceBgm);
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
        gameMode={gameMode}
        showBestGhost={settings.showBestGhost}
        showLastGhost={settings.showLastGhost}
        selectedCourseKey={selectedCourseKey}
        selectedMachine={selectedMachine}
        speedClass={speedClass}
        collection={collection}
        bgmPreparing={bgmPreparing}
        soundMuted={muted}
        onSelectMode={handleSelectMode}
        onToggleBestGhost={handleToggleBestGhost}
        onToggleLastGhost={handleToggleLastGhost}
        onSelectCourseKey={handleSelectCourseKey}
        onSelectMachine={handleSelectMachine}
        onSelectClass={handleSelectClass}
        onStartRace={handleStartRace}
        onReturnMenu={handleReturnMenu}
        onOpenCollection={() => {
          refreshCollection();
          setCollectionInitialTermId(null);
          setCollectionOpen(true);
        }}
        onOpenCollectionTerm={(termId) => {
          refreshCollection();
          setCollectionInitialTermId(termId);
          setCollectionOpen(true);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSound={handleToggleMute}
      />

      {!isOnline && telemetry.phase === 'menu' && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-30 rounded-lg border border-amber-400/35 bg-[#120d04]/90 px-3 py-1.5 text-[11px] font-medium text-amber-200 shadow-lg">
          オフラインモード（キャッシュ再生）
        </div>
      )}

      {/* Card Collection Modal */}
      <CardCollectionModal
        open={collectionOpen}
        collection={collection}
        termStats={termStats}
        initialTermId={collectionInitialTermId}
        onClose={() => {
          setCollectionOpen(false);
          setCollectionInitialTermId(null);
        }}
      />

      {/* Settings & Rankings Modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        initialCourseKey={selectedCourseKey}
        initialSpeedClass={speedClass}
        initialGameMode={gameMode}
        onClose={handleCloseSettings}
        onToggleBgm={handleToggleBgm}
        onToggleSfx={handleToggleSfx}
        onSelectPlayerModelDetail={handleSelectPlayerModelDetail}
      />

      {/* In-Race Unobtrusive HUD */}
      {telemetry.phase !== 'menu' && telemetry.phase !== 'finished' && (
        <RaceHud
          telemetry={telemetry}
          minimapPoints={minimapPoints}
          muted={muted}
          dockCollapsed={dockCollapsed}
          touchDrag={touchDrag}
          showBestGhost={settings.showBestGhost}
          showLastGhost={settings.showLastGhost}
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
