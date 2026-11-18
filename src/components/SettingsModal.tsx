import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Music,
  Settings,
  Shuffle,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BgmSnapshot } from '../game/bgm';
import { COURSES, CourseId, MACHINES, SpeedClass } from '../game/types';
import { formatRaceTime } from '../utils/formatTime';
import { getCourseRankings } from '../utils/rankings';
import {
  GameSettings,
  MENU_MIDI_TITLE,
  RACE_BGM_TRACKS,
  RaceBgmSelection,
} from '../utils/settings';

interface SettingsModalProps {
  open: boolean;
  settings: GameSettings;
  bgmSnapshot: BgmSnapshot;
  initialCourse: CourseId;
  initialSpeedClass: SpeedClass;
  onClose: () => void;
  onToggleBgm: () => void;
  onToggleSfx: () => void;
  onSelectRaceBgm: (selection: RaceBgmSelection) => void;
}

type SettingsTab = 'audio' | 'rankings';

export function SettingsModal({
  open,
  settings,
  bgmSnapshot,
  initialCourse,
  initialSpeedClass,
  onClose,
  onToggleBgm,
  onToggleSfx,
  onSelectRaceBgm,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('audio');
  const [rankingCourse, setRankingCourse] = useState<CourseId>(initialCourse);
  const [rankingClass, setRankingClass] = useState<SpeedClass>(initialSpeedClass);

  useEffect(() => {
    if (open) {
      setRankingCourse(initialCourse);
      setRankingClass(initialSpeedClass);
    }
  }, [open, initialCourse, initialSpeedClass]);

  const rankings = useMemo(
    () => (open ? getCourseRankings(rankingCourse, rankingClass) : []),
    [open, rankingCourse, rankingClass]
  );

  if (!open) return null;

  const upcomingTrack = RACE_BGM_TRACKS.find(
    (t) => t.id === bgmSnapshot.upcomingRandomTrackId
  );
  const upcomingStatus = bgmSnapshot.statuses[bgmSnapshot.upcomingRandomTrackId];

  const renderTrackStatus = (status: 'idle' | 'loading' | 'ready' | 'error') => {
    if (status === 'ready') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 whitespace-nowrap shrink-0">
          <Check className="h-3.5 w-3.5" />
          準備完了
        </span>
      );
    }
    if (status === 'loading') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-cyan-300 whitespace-nowrap shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          読込中
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="text-[11px] font-medium text-red-400 whitespace-nowrap shrink-0">
          読込失敗
        </span>
      );
    }
    return (
      <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">未読込</span>
    );
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#04060c]/92 sm:p-5"
    >
      <div className="flex h-[100dvh] sm:h-auto sm:max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden sm:rounded-2xl border-white/12 sm:border bg-[#070b14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-400">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                システム設定・ランキング
              </h2>
              <p className="text-xs text-slate-400 truncate">
                サウンド・レースBGM・コース別自己ベスト記録
              </p>
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
        <div className="grid grid-cols-2 gap-1.5 border-b border-white/10 bg-slate-950/60 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'audio'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4 shrink-0" />
            <span>サウンド・BGM</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('rankings')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'rankings'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            <Trophy className="h-4 w-4 shrink-0" />
            <span>コース別ランキング</span>
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
                  className={`flex min-h-[60px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
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
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">BGM</div>
                      <div className="text-[11px] text-slate-400">トップ・レース中の音楽</div>
                    </div>
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
                  className={`flex min-h-[60px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
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
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">効果音 (SFX)</div>
                      <div className="text-[11px] text-slate-400">エンジン・ブースト・被弾音</div>
                    </div>
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

              {/* Race BGM Track Selector */}
              <div className="border-t border-white/10 pt-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold tracking-wider text-slate-300">
                    レースBGM設定
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    選択するとバックグラウンドで先読みします
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Random Mode (Default) */}
                  <button
                    type="button"
                    onClick={() => onSelectRaceBgm('random')}
                    className={`flex min-h-[54px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors cursor-pointer ${
                      settings.raceBgm === 'random'
                        ? 'border-cyan-400 bg-cyan-500/12'
                        : 'border-white/10 bg-slate-900/60 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Shuffle
                        className={`h-4 w-4 shrink-0 ${
                          settings.raceBgm === 'random' ? 'text-cyan-400' : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">
                          ランダム再生（デフォルト）
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          次回予定: {upcomingTrack?.title ?? '選択中'}
                        </div>
                      </div>
                    </div>
                    {renderTrackStatus(upcomingStatus)}
                  </button>

                  {/* Fixed MP3 Tracks */}
                  {RACE_BGM_TRACKS.map((track) => {
                    const selected = settings.raceBgm === track.id;
                    const status = bgmSnapshot.statuses[track.id];
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => onSelectRaceBgm(track.id)}
                        className={`flex min-h-[50px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? 'border-cyan-400 bg-cyan-500/12'
                            : 'border-white/10 bg-slate-900/50 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`h-2.5 w-2.5 rounded-sm shrink-0 ${
                              selected ? 'bg-cyan-400' : 'bg-slate-600'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {track.title}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {track.fileName}
                            </div>
                          </div>
                        </div>
                        {renderTrackStatus(status)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Menu MIDI Playback Info */}
              <div className="rounded-xl border border-white/10 bg-slate-900/45 px-4 py-3 text-xs text-slate-300 leading-relaxed">
                <div className="font-semibold text-white">トップ画面BGMについて</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  トップ画面では {MENU_MIDI_TITLE} を内蔵Web Audioシンセサイザーでループ再生します
                  {bgmSnapshot.midiError ? `（読込エラー: ${bgmSnapshot.midiError}）` : ''}
                  。ブラウザの自動再生制限により、初回アクセス時は画面を1回タップまたはキー操作したタイミングで再生が始まります。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Course + Difficulty Filter */}
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {COURSES.map((c) => {
                    const active = rankingCourse === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setRankingCourse(c.id)}
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

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    トータルタイム 自己ベスト TOP 5
                  </span>
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
              </div>

              {/* Rankings List */}
              {rankings.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-900/40 px-4 py-10 text-center">
                  <Trophy className="h-7 w-7 text-slate-600" />
                  <p className="mt-2.5 text-sm font-semibold text-slate-300">
                    まだ記録がありません
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    このコース・難易度で3ラップ完走するとTOP 5に記録されます。
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
                              <span className="text-[11px] text-slate-400 font-mono-num">
                                {entry.rankFinished}位完走
                              </span>
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
          )}
        </div>
      </div>
    </div>
  );
}
