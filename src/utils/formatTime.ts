export function formatRaceTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) {
    return '--:--.--';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centis).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

export function formatDeltaTime(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return '--';
  const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '±';
  const absSec = Math.abs(deltaMs) / 1000;
  return `${sign}${absSec.toFixed(2)}s`;
}
