export type RaceBgmId =
  | 'hyper-cyber-drive'
  | 'neo-tokyo-sprint'
  | 'neon-overdrive'
  | 'velocity-peak'
  | 'kokuyouryou-no-uta';

export type RaceBgmSelection = 'random' | RaceBgmId;

export interface RaceBgmTrackMeta {
  id: RaceBgmId;
  title: string;
  fileName: string;
  url: string;
}

export const MENU_MIDI_URL = '/bgm/Neon_Tachyon_8-Bit_Overdrive.mid';
export const MENU_MIDI_TITLE = 'Neon_Tachyon_8-Bit_Overdrive.mid';

export const RACE_BGM_TRACKS: RaceBgmTrackMeta[] = [
  {
    id: 'hyper-cyber-drive',
    title: 'Hyper-Cyber Drive',
    fileName: 'Hyper-Cyber Drive.mp3',
    url: '/bgm/Hyper-Cyber Drive.mp3',
  },
  {
    id: 'neo-tokyo-sprint',
    title: 'Neo-Tokyo Sprint',
    fileName: 'Neo-Tokyo Sprint.mp3',
    url: '/bgm/Neo-Tokyo Sprint.mp3',
  },
  {
    id: 'neon-overdrive',
    title: 'Neon Overdrive',
    fileName: 'Neon Overdrive.mp3',
    url: '/bgm/Neon Overdrive.mp3',
  },
  {
    id: 'velocity-peak',
    title: 'Velocity Peak',
    fileName: 'Velocity Peak.mp3',
    url: '/bgm/Velocity Peak.mp3',
  },
  {
    id: 'kokuyouryou-no-uta',
    title: 'kokuyouryou_no_uta',
    fileName: 'kokuyouryou_no_uta.mp3',
    url: '/bgm/kokuyouryou_no_uta.mp3',
  },
];

export interface GameSettings {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  masterMuted: boolean;
  raceBgm: RaceBgmSelection;
}

const SETTINGS_STORAGE_KEY = 'hyperion_gp_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  bgmEnabled: true,
  sfxEnabled: true,
  masterMuted: false,
  raceBgm: 'random',
};

const VALID_TRACK_IDS = new Set<string>(RACE_BGM_TRACKS.map((t) => t.id));

export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : true,
      sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : true,
      masterMuted: typeof parsed.masterMuted === 'boolean' ? parsed.masterMuted : false,
      raceBgm:
        parsed.raceBgm === 'random' || (typeof parsed.raceBgm === 'string' && VALID_TRACK_IDS.has(parsed.raceBgm))
          ? (parsed.raceBgm as RaceBgmSelection)
          : 'random',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
