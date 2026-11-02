// Guess judging (the same rules as src/game.ts) and search-result matching (scripts/seed-songs.mjs).

// Apostrophes and periods vanish, every other mark becomes a word break.
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’ʼ`´.]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compact(normalised) {
  return normalised.replace(/ /g, '');
}

// The title without bracketed groups and without anything after ' - ' ("Get Lucky [Radio Edit]").
export function coreTitle(t) {
  const core = normalize(String(t).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').split(' - ')[0]);
  return core || normalize(t);
}

const ARTIST_SPLIT = /,|&| x | and | featuring | feat\.? | ft\. | with /;

export function artistNames(a) {
  return String(a)
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .split(ARTIST_SPLIT)
    .map((n) => normalize(n).replace(/^the /, ''))
    .filter(Boolean);
}

export function sameArtist(a, b) {
  const names = new Set(artistNames(a));
  return artistNames(b).some((n) => names.has(n));
}

function isCorrect(guess, answer) {
  if (guess.id && guess.id === answer.id) return true;
  if (normalize(guess.title) === normalize(answer.title) && normalize(guess.artist) === normalize(answer.artist)) {
    return true;
  }
  return coreTitle(guess.title) === coreTitle(answer.title) && sameArtist(guess.artist, answer.artist);
}

// A typed text guess (artist '') names the title, "artist title" or "first artist + title".
function textCorrect(text, answer) {
  const q = compact(normalize(text));
  if (!q) return false;
  const core = compact(coreTitle(answer.title));
  const first = artistNames(answer.artist)[0] || '';
  return (
    q === core ||
    q === compact(normalize(`${answer.artist} ${answer.title}`)) ||
    q === compact(first) + core
  );
}

// -> 'correct' | 'partial' | 'wrong'
export function classify(guess, answer) {
  if (!guess.artist) return textCorrect(guess.title, answer) ? 'correct' : 'wrong';
  if (isCorrect(guess, answer)) return 'correct';
  return sameArtist(guess.artist, answer.artist) ? 'partial' : 'wrong';
}

// --- search-result matching, ported from scripts/seed-songs.mjs ---

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s) => s.split(' ').filter((t) => t && t !== 'the');

const BAD =
  /karaoke|tribute|cover version|as made famous|originally performed|in the style of|8-bit|lullaby|instrumental|\bacoustic\b|\blive at\b|\bdemo\b/i;
const VARIANT_WORDS = new Set(['acoustic', 'demo', 'version', 'edit', 'radio', 'live', 'remix', 'mix', 'instrumental']);
const CREDIT = /^(feat|featuring|with|from)\b/;

function seedArtist(ra, na) {
  if (ra === na) return true;
  const have = new Set(tokens(ra));
  return tokens(na).every((t) => have.has(t));
}

function alternateVersion(trackName, nt) {
  const seedWords = new Set(tokens(nt));
  if (tokens(norm(trackName)).some((w) => VARIANT_WORDS.has(w) && !seedWords.has(w))) return true;
  const qualifiers = [...trackName.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => norm(m[1]));
  return qualifiers.some((q) => q && !nt.includes(q) && !CREDIT.test(q));
}

export function pickMatch(results, artist, title) {
  const na = norm(artist);
  const nt = norm(title);
  if (!na || !nt) return null;
  const scored = results
    .filter((r) => r && r.previewUrl && r.trackName && r.artistName)
    .filter((r) => !BAD.test(`${r.artistName} ${r.trackName} ${r.collectionName || ''}`))
    .filter((r) => seedArtist(norm(r.artistName), na))
    .map((r) => {
      const rt = norm(r.trackName);
      const ra = norm(r.artistName);
      let score = 0;
      if (rt === nt) score += 4;
      else if (rt.startsWith(nt) || nt.startsWith(rt)) score += 2;
      else if (rt.includes(nt) || nt.includes(rt)) score += 1;
      if (score === 0) return null;
      score += ra === na ? 3 : 1;
      if (alternateVersion(r.trackName, nt)) score -= 3;
      return { r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score >= 3 ? scored[0].r : null;
}
