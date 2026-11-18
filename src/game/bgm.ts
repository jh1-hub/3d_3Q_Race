import {
  MENU_MIDI_URL,
  RACE_BGM_TRACKS,
  RaceBgmId,
  RaceBgmSelection,
} from '../utils/settings';
import { ChiptuneMidiPlayer, ParsedMidi, parseStandardMidi } from './midiPlayer';

export type TrackLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BgmSnapshot {
  statuses: Record<RaceBgmId, TrackLoadStatus>;
  upcomingRandomTrackId: RaceBgmId;
  activeRaceTrackId: RaceBgmId | null;
  midiReady: boolean;
  midiError: string | null;
}

export class BgmManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private bgmEnabled = true;
  private masterMuted = false;
  private currentMode: 'menu' | 'race' | 'idle' = 'idle';

  private midiParsed: ParsedMidi | null = null;
  private midiLoadPromise: Promise<ParsedMidi | null> | null = null;
  private midiPlayer: ChiptuneMidiPlayer | null = null;
  private midiError: string | null = null;

  private decodedCache = new Map<RaceBgmId, AudioBuffer>();
  private loadingPromises = new Map<RaceBgmId, Promise<AudioBuffer | null>>();
  private trackStatuses: Record<RaceBgmId, TrackLoadStatus> = {
    'hyper-cyber-drive': 'idle',
    'neo-tokyo-sprint': 'idle',
    'neon-overdrive': 'idle',
    'velocity-peak': 'idle',
    'kokuyouryou-no-uta': 'idle',
  };

  private raceSource: AudioBufferSourceNode | null = null;
  private activeRaceTrackId: RaceBgmId | null = null;
  private lastPlayedTrackId: RaceBgmId | null = null;
  private upcomingRandomTrackId: RaceBgmId;
  private listeners = new Set<(snap: BgmSnapshot) => void>();
  private unlockAttached = false;

  constructor() {
    this.upcomingRandomTrackId = this.chooseRandomTrack(null);
    this.attachAutoplayUnlock();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = this.isAudible() ? 0.34 : 0;
      gain.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = gain;
      this.midiPlayer = new ChiptuneMidiPlayer(ctx, gain);
      if (this.midiParsed) {
        this.midiPlayer.setMidi(this.midiParsed);
      }
      return ctx;
    } catch {
      return null;
    }
  }

  private isAudible(): boolean {
    return this.bgmEnabled && !this.masterMuted;
  }

  private updateGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.isAudible() ? 0.34 : 0;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  private attachAutoplayUnlock(): void {
    if (this.unlockAttached || typeof window === 'undefined') return;
    this.unlockAttached = true;

    const unlock = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => {
          if (this.currentMode === 'menu' && this.isAudible()) {
            this.startMenuMidiPlayback();
          }
        });
      } else if (this.currentMode === 'menu' && this.isAudible() && !this.midiPlayer?.isPlaying()) {
        this.startMenuMidiPlayback();
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public subscribe(fn: (snap: BgmSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  public getSnapshot(): BgmSnapshot {
    return {
      statuses: { ...this.trackStatuses },
      upcomingRandomTrackId: this.upcomingRandomTrackId,
      activeRaceTrackId: this.activeRaceTrackId,
      midiReady: Boolean(this.midiParsed),
      midiError: this.midiError,
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  private chooseRandomTrack(excludeId: RaceBgmId | null): RaceBgmId {
    const candidates =
      excludeId && RACE_BGM_TRACKS.length > 1
        ? RACE_BGM_TRACKS.filter((t) => t.id !== excludeId)
        : RACE_BGM_TRACKS;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    return picked.id;
  }

  public getTrackStatus(id: RaceBgmId): TrackLoadStatus {
    return this.trackStatuses[id];
  }

  public getUpcomingRandomTrackId(): RaceBgmId {
    return this.upcomingRandomTrackId;
  }

  private async fetchAudioArrayBuffer(rawUrl: string): Promise<ArrayBuffer> {
    const encoded = encodeURI(rawUrl);
    if (typeof caches !== 'undefined') {
      try {
        const cached = (await caches.match(encoded)) ?? (await caches.match(rawUrl));
        if (cached) {
          return await cached.arrayBuffer();
        }
      } catch {
        // Ignore cache read error and fall back to network
      }
    }
    const res = await fetch(encoded);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('bgm-assets-cache');
        await cache.put(encoded, res.clone());
      } catch {
        // Ignore cache write error
      }
    }
    return res.arrayBuffer();
  }

  public preloadMenuMidi(): Promise<ParsedMidi | null> {
    if (this.midiParsed) return Promise.resolve(this.midiParsed);
    if (this.midiLoadPromise) return this.midiLoadPromise;

    this.midiLoadPromise = this.fetchAudioArrayBuffer(MENU_MIDI_URL)
      .then((buf) => {
        const parsed = parseStandardMidi(buf);
        this.midiParsed = parsed;
        this.midiError = null;
        this.midiPlayer?.setMidi(parsed);
        this.notify();
        if (this.currentMode === 'menu' && this.isAudible() && this.ctx?.state === 'running') {
          this.startMenuMidiPlayback();
        }
        return parsed;
      })
      .catch((err) => {
        this.midiError = err instanceof Error ? err.message : 'MIDI load failed';
        this.notify();
        return null;
      })
      .finally(() => {
        this.midiLoadPromise = null;
      });

    return this.midiLoadPromise;
  }

  public preloadRaceTrack(trackId: RaceBgmId): Promise<AudioBuffer | null> {
    const cached = this.decodedCache.get(trackId);
    if (cached) {
      if (this.trackStatuses[trackId] !== 'ready') {
        this.trackStatuses[trackId] = 'ready';
        this.notify();
      }
      return Promise.resolve(cached);
    }

    const existing = this.loadingPromises.get(trackId);
    if (existing) return existing;

    const meta = RACE_BGM_TRACKS.find((t) => t.id === trackId);
    if (!meta) return Promise.resolve(null);

    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve(null);

    this.trackStatuses[trackId] = 'loading';
    this.notify();

    const promise = this.fetchAudioArrayBuffer(meta.url)
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((decoded) => {
        this.decodedCache.set(trackId, decoded);
        this.trackStatuses[trackId] = 'ready';
        this.notify();
        return decoded;
      })
      .catch(() => {
        this.trackStatuses[trackId] = 'error';
        this.notify();
        return null;
      })
      .finally(() => {
        this.loadingPromises.delete(trackId);
      });

    this.loadingPromises.set(trackId, promise);
    return promise;
  }

  public preloadForSelection(selection: RaceBgmSelection): void {
    void this.preloadMenuMidi();
    if (selection === 'random') {
      void this.preloadRaceTrack(this.upcomingRandomTrackId);
    } else {
      void this.preloadRaceTrack(selection);
    }
  }

  private startMenuMidiPlayback(): void {
    if (!this.isAudible() || this.currentMode !== 'menu') return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    if (!this.midiParsed || !this.midiPlayer) return;
    this.midiPlayer.setMidi(this.midiParsed);
    if (!this.midiPlayer.isPlaying()) {
      this.midiPlayer.start();
    }
  }

  private stopRaceSource(): void {
    if (this.raceSource) {
      try {
        this.raceSource.stop();
        this.raceSource.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
      this.raceSource = null;
    }
    this.activeRaceTrackId = null;
  }

  private stopMenuMidi(): void {
    this.midiPlayer?.stop();
  }

  public enterMenu(selection: RaceBgmSelection): void {
    this.currentMode = 'menu';
    this.stopRaceSource();

    // Pre-pick and background-download the next random race track if needed
    if (selection === 'random') {
      this.upcomingRandomTrackId = this.chooseRandomTrack(this.lastPlayedTrackId);
      void this.preloadRaceTrack(this.upcomingRandomTrackId);
    } else {
      void this.preloadRaceTrack(selection);
    }

    void this.preloadMenuMidi().then(() => {
      if (this.currentMode === 'menu' && this.isAudible()) {
        const ctx = this.ensureContext();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume().then(() => this.startMenuMidiPlayback()).catch(() => {});
        } else {
          this.startMenuMidiPlayback();
        }
      }
    });
    this.notify();
  }

  public async prepareAndStartRace(selection: RaceBgmSelection): Promise<void> {
    this.currentMode = 'race';
    this.stopMenuMidi();
    this.stopRaceSource();

    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore resume failure
      }
    }

    const targetId =
      selection === 'random' ? this.upcomingRandomTrackId : selection;

    if (!this.bgmEnabled) {
      this.lastPlayedTrackId = targetId;
      if (selection === 'random') {
        this.upcomingRandomTrackId = this.chooseRandomTrack(targetId);
      }
      this.notify();
      return;
    }

    // Wait until the chosen race track download & decode has completed
    const buffer = await this.preloadRaceTrack(targetId);

    // Guard in case user exited back to menu while track was finishing download
    if (this.currentMode !== 'race') {
      return;
    }

    this.lastPlayedTrackId = targetId;
    if (selection === 'random') {
      this.upcomingRandomTrackId = this.chooseRandomTrack(targetId);
      void this.preloadRaceTrack(this.upcomingRandomTrackId);
    }

    if (buffer && this.ctx && this.masterGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.masterGain);
      src.start(0);
      this.raceSource = src;
      this.activeRaceTrackId = targetId;
      this.updateGain();
    }
    this.notify();
  }

  public setBgmEnabled(enabled: boolean, selection: RaceBgmSelection): void {
    this.bgmEnabled = enabled;
    this.updateGain();
    if (!enabled) {
      this.stopMenuMidi();
      this.stopRaceSource();
    } else {
      if (this.currentMode === 'menu') {
        this.enterMenu(selection);
      } else if (this.currentMode === 'race' && !this.raceSource) {
        void this.prepareAndStartRace(selection);
      }
    }
    this.notify();
  }

  public setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    this.updateGain();
  }

  public dispose(): void {
    this.currentMode = 'idle';
    this.stopMenuMidi();
    this.stopRaceSource();
    try {
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.listeners.clear();
  }
}
