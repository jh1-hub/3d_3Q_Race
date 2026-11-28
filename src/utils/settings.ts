import { PlayerModelDetail } from '../game/types';

export type RaceBgmId = 'kiokuyouryou-no-uta';

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
    id: 'kiokuyouryou-no-uta',
    title: '記憶容量と処理速度のうた',
    fileName: 'kiokuyouryou_no_uta.mp3',
    url: '/bgm/kiokuyouryou_no_uta.mp3',
  },
];

export interface GameSettings {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  masterMuted: boolean;
  raceBgm: RaceBgmSelection;
  showBestGhost: boolean;
  showLastGhost: boolean;
  playerModelDetail: PlayerModelDetail;
}

const SETTINGS_STORAGE_KEY = 'hyperion_gp_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  bgmEnabled: true,
  sfxEnabled: true,
  masterMuted: false,
  raceBgm: 'random',
  showBestGhost: true,
  showLastGhost: true,
  playerModelDetail: 'ultra',
};

const VALID_TRACK_IDS = new Set<string>(RACE_BGM_TRACKS.map((t) => t.id));

export function loadGameSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const rawRaceBgm =
      (parsed.raceBgm as string | undefined) === 'kokuyouryou-no-uta'
        ? 'kiokuyouryou-no-uta'
        : parsed.raceBgm;
    return {
      bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : true,
      sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : true,
      masterMuted: typeof parsed.masterMuted === 'boolean' ? parsed.masterMuted : false,
      raceBgm:
        rawRaceBgm === 'random' || (typeof rawRaceBgm === 'string' && VALID_TRACK_IDS.has(rawRaceBgm))
          ? (rawRaceBgm as RaceBgmSelection)
          : 'random',
      showBestGhost: typeof parsed.showBestGhost === 'boolean' ? parsed.showBestGhost : true,
      showLastGhost: typeof parsed.showLastGhost === 'boolean' ? parsed.showLastGhost : true,
      playerModelDetail: parsed.playerModelDetail === 'standard' ? 'standard' : 'ultra',
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
