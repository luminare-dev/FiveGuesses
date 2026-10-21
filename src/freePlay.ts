// Picks the song for a free round: never today's daily song and never one already played in
// this session. The history lives in memory only (it is gone after a reload). When every song
// has been played, the session history is dropped and only the first excluded index (the daily
// song, inserted first by the caller) stays out.
export function pickFreePlayIndex(
  count: number,
  excluded: ReadonlySet<number>,
  rng: () => number = Math.random
): number {
  const all = Array.from({ length: count }, (_, i) => i);
  let candidates = all.filter((i) => !excluded.has(i));
  if (candidates.length === 0) {
    const first = excluded.values().next();
    candidates = first.done ? all : all.filter((i) => i !== first.value);
  }
  if (candidates.length === 0) return 0;
  const pick = Math.floor(rng() * candidates.length);
  return candidates[Math.min(Math.max(pick, 0), candidates.length - 1)];
}
