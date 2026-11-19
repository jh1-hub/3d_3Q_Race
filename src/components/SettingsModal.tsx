import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Flag,
  Loader2,
  Music,
  Settings,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CourseId,
  COURSES,
  GameMode,
  MACHINES,
  resolveSubCourse,
  SpeedClass,
  SUB_ITEMS,
} from '../game/types';
import { formatRaceTime } from '../utils/formatTime';
import { loadBestGhost } from '../utils/ghosts';
import {
  checkAllBgmCached,
  downloadAllOfflineAssets,
  usePWAInstall,
} from '../utils/pwa';
import { getCourseRankings } from '../utils/rankings';
import { GameSettings } from '../utils/settings';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  initialCourseKey: string;
  initialSpeedClass: SpeedClass;
  initialGameMode: GameMode;
  onClose: () => void;
  onToggleBgm: () => void;
  onToggleSfx: () => void;
}

type SettingsTab = 'audio' | 'rankings' | 'guide';

export function SettingsModal({
  open,
  settings,
  initialCourseKey,
  initialSpeedClass,
  initialGameMode,
  onClose,
  onToggleBgm,
  onToggleSfx,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('audio');
  const [rankingCourseId, setRankingCourseId] = useState<CourseId>(() =>
    resolveSubCourse(initialCourseKey).baseCourseId
  );
  const [rankingClass, setRankingClass] = useState<SpeedClass>(initialSpeedClass);
  const [rankingMode, setRankingMode] = useState<GameMode>(initialGameMode);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [offlineCaching, setOfflineCaching] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<{ done: number; total: number } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (open) {
      setRankingCourseId(resolveSubCourse(initialCourseKey).baseCourseId);
      setRankingClass(initialSpeedClass);
      setRankingMode(initialGameMode);
      void checkAllBgmCached().then((ok) => setOfflineReady(ok));
    } else {
      setShowInstallModal(false);
    }
  }, [open, initialCourseKey, initialSpeedClass, initialGameMode]);

  const rankings = useMemo(
    () => (open ? getCourseRankings(rankingCourseId, rankingClass, rankingMode) : []),
    [open, rankingCourseId, rankingClass, rankingMode]
  );

  const bestGhost = useMemo(
    () =>
      open && rankingMode === 'time_attack'
        ? loadBestGhost(rankingCourseId, rankingClass)
        : null,
    [open, rankingCourseId, rankingClass, rankingMode]
  );

  if (!open) return null;

  const handleDownloadClick = async () => {
    setShowInstallModal(true);

    if (!offlineCaching) {
      setOfflineCaching(true);
      try {
        const ok = await downloadAllOfflineAssets((done, total) => {
          setOfflineProgress({ done, total });
        });
        setOfflineReady(ok);
      } finally {
        setOfflineCaching(false);
      }
    }

    if (isInstallable) {
      await install();
    }
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#04060c]/92 sm:p-5"
    >
      <div className="relative flex h-[100dvh] sm:h-auto sm:max-h-[88vh] w-full max-w-xl flex-col overflow-hidden sm:rounded-2xl border-white/12 sm:border bg-[#070b14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-400">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                設定・ランキング
              </h2>
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

        {/* Tab Bar */}
        <div className="grid grid-cols-3 gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'audio'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4 shrink-0" />
            <span>サウンド</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('rankings')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'rankings'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <Trophy className="h-4 w-4 shrink-0" />
            <span>ランキング</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('guide')}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'guide'
                ? 'bg-emerald-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>操作・ガイド</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {tab === 'audio' ? (
            <div className="space-y-5">
              {/* BGM & SFX Master Toggles */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onToggleBgm}
                  className={`flex min-h-[58px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                    settings.bgmEnabled
                      ? 'border-cyan-400/50 bg-cyan-500/10'
                      : 'border-white/10 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Music
                      className={`h-5 w-5 shrink-0 ${
                        settings.bgmEnabled ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-sm font-bold text-white">BGM</span>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold font-mono-num shrink-0 ${
                      settings.bgmEnabled
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {settings.bgmEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleSfx}
                  className={`flex min-h-[58px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                    settings.sfxEnabled
                      ? 'border-amber-400/50 bg-amber-500/10'
                      : 'border-white/10 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {settings.sfxEnabled ? (
                      <Volume2 className="h-5 w-5 shrink-0 text-amber-400" />
                    ) : (
                      <VolumeX className="h-5 w-5 shrink-0 text-slate-500" />
                    )}
                    <span className="text-sm font-bold text-white">効果音 (SFX)</span>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold font-mono-num shrink-0 ${
                      settings.sfxEnabled
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {settings.sfxEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Clean Single PWA Download Button (No upfront clutter) */}
              <div className="border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/12 px-5 py-3 text-sm font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
                >
                  {offlineCaching ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      <span>
                        ダウンロード中
                        {offlineProgress ? ` (${offlineProgress.done}/${offlineProgress.total})` : '...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4.5 w-4.5" />
                      <span>
                        {isInstalled && offlineReady
                          ? 'オフラインデータを更新'
                          : 'アプリをダウンロード'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : tab === 'rankings' ? (
            <div className="space-y-4">
              {/* Course + Mode + Difficulty Filter */}
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {COURSES.map((c) => {
                    const active = rankingCourseId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setRankingCourseId(c.id)}
                        className={`min-h-[44px] rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors cursor-pointer truncate ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'border-white/10 bg-slate-900/50 text-slate-400 hover:text-white'
                        }`}
                        style={active ? { borderColor: c.accentHex } : undefined}
                      >
                        {c.jpName}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Race vs Time Attack Mode Filter */}
                  <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                    <button
                      type="button"
                      onClick={() => setRankingMode('race')}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                        rankingMode === 'race'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Flag className="h-3 w-3" />
                      <span>RACE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingMode('time_attack')}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 font-display text-xs font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                        rankingMode === 'time_attack'
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Timer className="h-3 w-3" />
                      <span>TIME ATTACK</span>
                    </button>
                  </div>

                  {/* Normal vs Hard Filter */}
                  <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-1">
                    <button
                      type="button"
                      onClick={() => setRankingClass('normal')}
                      className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        rankingClass === 'normal'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      NORMAL
                    </button>
                    <button
                      type="button"
                      onClick={() => setRankingClass('hard')}
                      className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        rankingClass === 'hard'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      HARD
                    </button>
                  </div>
                </div>

                <div className="font-display text-[11px] tracking-wider text-slate-400">
                  TOTAL TIME TOP 5（通常3LAPのみ記録）
                </div>
              </div>

              {/* Rankings List */}
              {rankings.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-900/40 px-4 py-10 text-center">
                  <Trophy className="h-7 w-7 text-slate-600" />
                  <p className="mt-2.5 text-sm font-semibold text-slate-300">
                    まだ記録がありません
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    このコース・モード・難易度で3ラップ完走するとTOP 5に記録されます。
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/8 overflow-hidden rounded-xl border border-white/10 bg-slate-900/55">
                  {rankings.map((entry, idx) => {
                    const machineSpec = MACHINES.find((m) => m.id === entry.machineId);
                    const rankColor =
                      idx === 0
                        ? 'text-amber-300'
                        : idx === 1
                          ? 'text-slate-200'
                          : idx === 2
                            ? 'text-orange-300'
                            : 'text-slate-400';

                    return (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`font-mono-num w-7 text-base font-bold shrink-0 ${rankColor}`}
                          >
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-sm shrink-0"
                                style={{
                                  backgroundColor: machineSpec?.accentHex ?? '#06B6D4',
                                }}
                              />
                              <span className="font-display text-sm font-bold text-white truncate">
                                {entry.machineName}
                              </span>
                              {idx === 0 &&
                                rankingMode === 'time_attack' &&
                                bestGhost &&
                                Math.abs(bestGhost.totalTimeMs - entry.totalTimeMs) < 10 && (
                                  <span className="rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-wider text-amber-300">
                                    BEST GHOST
                                  </span>
                                )}
                              {rankingMode === 'race' && (
                                <span className="text-[11px] text-slate-400 font-mono-num">
                                  {entry.rankFinished}位完走
                                </span>
                              )}
                            </div>
                            {entry.lapTimesMs.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400 font-mono-num">
                                {entry.lapTimesMs.map((lt, li) => (
                                  <span key={li}>
                                    L{li + 1} {formatRaceTime(lt)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pl-10 sm:pl-0 sm:text-right shrink-0">
                          <div className="font-mono-num text-base sm:text-lg font-bold text-cyan-300">
                            {formatRaceTime(entry.totalTimeMs)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Controls & Steering Gauge */}
              <div className="rounded-xl border border-cyan-400/25 bg-slate-900/65 p-3.5">
                <h3 className="text-xs font-bold tracking-wider text-cyan-300">
                  基本操作 ＆ クイズゲート加速
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                  <li>
                    <span className="font-semibold text-white">ステアリング：</span>
                    マウスの左クリック長押し／画面タッチ長押しで左右ドラッグ、または{' '}
                    <span className="font-mono-num text-cyan-200">← → / A・D</span> キーで操作（自動アクセル）。
                  </li>
                  <li>
                    <span className="font-semibold text-white">選択肢タップ移動：</span>
                    クイズカードの L1〜L4 をタップ／クリックすると該当レーンへ自動移動します。
                  </li>
                  <li>
                    <span className="font-semibold text-white">下部ゲージの活用：</span>
                    ゲート間をすべて左クリック長押し／タッチ長押しで操作すると下部ゲージがフルまで溜まります（途中の選択肢タップによる自動移動や別操作を挟むとフルになりません）。クイズゲート正解通過時は溜まった分量に応じて加速ボーナスが発動し 0 に戻ります（誤答スピン時はゲージが維持され次のゲートへ持ち越されます）。
                  </li>
                  <li>
                    <span className="font-semibold text-white">アイテム発動：</span>
                    左上のアイテムスロットをタップ、画面クリック／上下フリック、または{' '}
                    <span className="font-mono-num text-cyan-200">Space / E / ↑ / ↓</span>。
                  </li>
                </ul>
              </div>

              {/* Track Gimmicks & Modes */}
              <div className="rounded-xl border border-amber-400/25 bg-slate-900/65 p-3.5">
                <h3 className="text-xs font-bold tracking-wider text-amber-300">
                  コースギミック ＆ モード
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                  <li>
                    <span className="font-semibold text-white">加速床 ＆ エアロフロート床：</span>
                    中央だけでなく左右の外側ラインにも配置。乗ると高速ダッシュや地雷回避の宙浮き滑空が発生します。
                  </li>
                  <li>
                    <span className="font-semibold text-white">TIME ATTACK：</span>
                    敵マシン・アイテムなしのタイムアタック専用モード。<span className="text-amber-300">BEST GHOST</span> や{' '}
                    <span className="text-sky-300">LAST GHOST</span> との並走・リアルタイム差分（VS BEST）を確認できます。
                  </li>
                  <li>
                    <span className="font-semibold text-white">HARD ＆ サブカテゴリ：</span>
                    HARDクラスでは過去に間違えた用語・未解答の用語を優先出題（全カテゴリ出題で弱点集中対策が可能）。サブカテゴリ選択時は2周練習となりランキングには記録されません。
                  </li>
                </ul>
              </div>

              {/* Sub-Items Reference */}
              <div className="rounded-xl border border-white/12 bg-slate-900/65 p-3.5">
                <h3 className="text-xs font-bold tracking-wider text-emerald-300">
                  全9種 サブアイテム効果（レースモード）
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.values(SUB_ITEMS).map((item) => (
                    <div
                      key={item.type}
                      className="rounded-lg border border-white/10 bg-slate-950/75 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-bold text-white">
                          {item.name}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-slate-950"
                          style={{ backgroundColor: item.accentHex }}
                        >
                          {item.shortLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Install Instructions Sub-Modal (Shown only after clicking Download button) */}
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#080d18] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  アプリのインストール方法
                </h3>
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  aria-label="閉じる"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Offline Cache Progress / Status */}
              <div className="mt-3.5 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3.5 py-2.5 text-xs">
                <span className="text-slate-300">オフライン用データ（BGM・ゲーム本体）</span>
                {offlineCaching ? (
                  <span className="flex items-center gap-1.5 font-mono-num font-bold text-cyan-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {offlineProgress ? `${offlineProgress.done}/${offlineProgress.total}` : '保存中'}
                  </span>
                ) : offlineReady ? (
                  <span className="flex items-center gap-1 font-bold text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    保存完了
                  </span>
                ) : (
                  <span className="text-slate-400">準備完了</span>
                )}
              </div>

              {/* Device-Specific Install Steps */}
              <div className="mt-3.5 space-y-2.5 text-xs leading-relaxed text-slate-300">
                {isInstalled ? (
                  <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-200">
                    すでにアプリとしてインストール済みです。全アセットが保存されているため、オフラインでもそのままプレイできます。
                  </p>
                ) : (
                  <>
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                      <div className="font-bold text-white">iPhone / iPad (Safari)</div>
                      <p className="mt-1 text-slate-400">
                        1. Safari下部の「共有」アイコンをタップ
                        <br />
                        2.「ホーム画面に追加」を選択して「追加」をタップ
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
                      <div className="font-bold text-white">Android / PC (Chrome・Edge)</div>
                      <p className="mt-1 text-slate-400">
                        {isIOS
                          ? 'ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選択してください。'
                          : '自動でインストール確認ダイアログが表示されない場合は、ブラウザ右上のメニュー（またはアドレスバー右端のインストールアイコン）から「アプリをインストール」を選択してください。'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                {isInstallable && !isInstalled && (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    インストールを実行
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
