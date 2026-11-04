// Guess judging, the same rules as src/game.ts. Search results are matched in the browser
// (src/catalog/match.ts).

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
