import type { Entry } from '../api';

export const MAX_LINES = 2000;
// Entries matched per import: one iTunes search each, about a minute of the player's limit.
export const SAMPLE_SIZE = 20;
const MAX_FIELD = 200;

const NUMBERING = /^\s*\d{1,4}\s*[.)]\s+/;
const SEPARATORS = [' - ', ' – ', ' — ', '\t'];

function entry(artist: string, title: string): Entry | null {
  const a = artist.trim().slice(0, MAX_FIELD);
  const t = title.trim().slice(0, MAX_FIELD);
  return a !== '' && t !== '' ? { artist: a, title: t } : null;
}

// One song per line: "Artist - Title" (also with an en or em dash or a tab) or "Title by Artist",
// with an optional "1. " or "01) " in front. A line without an artist is skipped.
export function parseLine(line: string): Entry | null {
  const text = line.replace(NUMBERING, '').trim();
  let cut = -1;
  let width = 0;
  for (const separator of SEPARATORS) {
    const at = text.indexOf(separator);
    if (at > 0 && (cut === -1 || at < cut)) {
      cut = at;
      width = separator.length;
    }
  }
  if (cut > 0) return entry(text.slice(0, cut), text.slice(cut + width));
  const by = text.toLowerCase().lastIndexOf(' by ');
  if (by > 0) return entry(text.slice(by + 4), text.slice(0, by));
  return null;
}

export function parsePasted(text: string): Entry[] {
  const out: Entry[] = [];
  for (const line of text.split(/\r?\n/).slice(0, MAX_LINES)) {
    const parsed = parseLine(line);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

// RFC 4180: quoted fields, doubled quotes, CRLF or LF, an optional byte order mark.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (rows.length > MAX_LINES) return rows;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const TITLE_COLUMNS = ['trackname', 'title', 'song', 'track', 'name'];
const ARTIST_COLUMNS = ['artistnames', 'artistname', 'artist', 'artists'];

function column(header: string[], names: readonly string[]): number {
  const keys = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  for (const name of names) {
    const at = keys.indexOf(name);
    if (at !== -1) return at;
  }
  return -1;
}

// A CSV file with a header row, such as an Exportify export ("Track Name", "Artist Name(s)").
// Several artists in one field keep the first.
export function parseCsv(text: string): Entry[] {
  const [header, ...rows] = csvRows(text);
  if (header === undefined) return [];
  const title = column(header, TITLE_COLUMNS);
  const artist = column(header, ARTIST_COLUMNS);
  if (title === -1 || artist === -1) return [];
  const out: Entry[] = [];
  for (const row of rows.slice(0, MAX_LINES)) {
    const first = (row[artist] ?? '').split(/[,;]/)[0];
    const parsed = entry(first, row[title] ?? '');
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

// At most n entries, each song once, picked at random.
export function sampleEntries(list: readonly Entry[], n: number = SAMPLE_SIZE, rng: () => number = Math.random): Entry[] {
  const seen = new Set<string>();
  const unique: Entry[] = [];
  for (const e of list) {
    const key = `${e.artist.toLowerCase()}|${e.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(e);
    }
  }
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, n);
}
