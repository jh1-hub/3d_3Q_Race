import { useEffect, useState } from 'react';
import { MENU_MIDI_URL, RACE_BGM_TRACKS } from './settings';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const BGM_CACHE_NAME = 'bgm-assets-cache';
const SHELL_CACHE_NAME = 'hyperion-gp-shell-v1';

const ALL_BGM_URLS: string[] = [
  MENU_MIDI_URL,
  ...RACE_BGM_TRACKS.map((t) => t.url),
];

const SHELL_URLS: string[] = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export async function checkAllBgmCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(BGM_CACHE_NAME);
    for (const rawUrl of ALL_BGM_URLS) {
      const encoded = encodeURI(rawUrl);
      const match = (await cache.match(encoded)) ?? (await cache.match(rawUrl));
      if (!match) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function downloadAllOfflineAssets(
  onProgress?: (done: number, total: number) => void
): Promise<boolean> {
  if (typeof caches === 'undefined') return false;

  const total = ALL_BGM_URLS.length + SHELL_URLS.length;
  let done = 0;
  let allOk = true;
  onProgress?.(0, total);

  try {
    const bgmCache = await caches.open(BGM_CACHE_NAME);
    for (const rawUrl of ALL_BGM_URLS) {
      const encoded = encodeURI(rawUrl);
      try {
        const existing = (await bgmCache.match(encoded)) ?? (await bgmCache.match(rawUrl));
        if (!existing) {
          const res = await fetch(encoded, { cache: 'reload' });
          if (res.ok) {
            await bgmCache.put(encoded, res.clone());
          } else {
            allOk = false;
          }
        }
      } catch {
        allOk = false;
      }
      done += 1;
      onProgress?.(done, total);
    }

    const shellCache = await caches.open(SHELL_CACHE_NAME);
    for (const url of SHELL_URLS) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          await shellCache.put(url, res.clone());
        }
      } catch {
        // Shell assets are also precached by Workbox SW
      }
      done += 1;
      onProgress?.(done, total);
    }
  } catch {
    allOk = false;
  }

  return allOk;
}
