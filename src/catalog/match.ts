// Search-result matching for imported "Artist - Title" entries, ported from
// scripts/seed-songs.mjs (the seeds were matched the same way): the original recording by that
// artist, never a karaoke, tribute, live, remix or other alternate version.

export type SearchResult = {
  trackId?: unknown;
  artistName?: unknown;
  trackName?: unknown;
  collectionName?: unknown;
  previewUrl?: unknown;
  artworkUrl100?: unknown;
  trackViewUrl?: unknown;
  wrapperType?: unknown;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s: string): string[] => s.split(' ').filter((t) => t !== '' && t !== 'the');

const BAD =
  /karaoke|tribute|cover version|as made famous|originally performed|in the style of|8-bit|lullaby|instrumental|\bacoustic\b|\blive at\b|\bdemo\b/i;
const VARIANT_WORDS = new Set(['acoustic', 'demo', 'version', 'edit', 'radio', 'live', 'remix', 'mix', 'instrumental']);
const CREDIT = /^(feat|featuring|with|from)\b/;

// Every word of the asked artist appears in the result's artist.
function seedArtist(resultArtist: string, askedArtist: string): boolean {
  if (resultArtist === askedArtist) return true;
  const have = new Set(tokens(resultArtist));
  return tokens(askedArtist).every((t) => have.has(t));
}

function alternateVersion(trackName: string, askedTitle: string): boolean {
  const seedWords = new Set(tokens(askedTitle));
  if (tokens(norm(trackName)).some((w) => VARIANT_WORDS.has(w) && !seedWords.has(w))) return true;
  const qualifiers = [...trackName.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => norm(m[1]));
  return qualifiers.some((q) => q !== '' && !askedTitle.includes(q) && !CREDIT.test(q));
}

// The best result for an entry, or null when none is close enough.
export function pickMatch<T extends SearchResult>(results: readonly T[], artist: string, title: string): T | null {
  const na = norm(artist);
  const nt = norm(title);
  if (na === '' || nt === '') return null;
  let best: { r: T; score: number } | null = null;
  for (const r of results) {
    const trackName = str(r.trackName);
    const artistName = str(r.artistName);
    if (str(r.previewUrl) === '' || trackName === '' || artistName === '') continue;
    if (BAD.test(`${artistName} ${trackName} ${str(r.collectionName)}`)) continue;
    const ra = norm(artistName);
    if (!seedArtist(ra, na)) continue;
    const rt = norm(trackName);
    let score = 0;
    if (rt === nt) score += 4;
    else if (rt.startsWith(nt) || nt.startsWith(rt)) score += 2;
    else if (rt.includes(nt) || nt.includes(rt)) score += 1;
    if (score === 0) continue;
    score += ra === na ? 3 : 1;
    if (alternateVersion(trackName, nt)) score -= 3;
    if (best === null || score > best.score) best = { r, score };
  }
  return best !== null && best.score >= 3 ? best.r : null;
}
