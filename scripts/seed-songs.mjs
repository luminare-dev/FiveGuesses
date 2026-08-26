// Resolves a curated seed list against the iTunes Search API and writes assets/songs.json.
// Respects the documented ~20 req/min limit (3.2s spacing, backoff on 403/429).
// Previews are promotional Apple content: the app must show the Apple Music link-out
// and "courtesy of Apple Music" attribution wherever previews play.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'songs.json');
const COUNTRIES = ['DE', 'US'];
const DELAY_MS = 3200;

// [artist, title, year]
const SEED = [
  ['Nirvana', 'Smells Like Teen Spirit', 1991],
  ['Oasis', 'Wonderwall', 1995],
  ['Britney Spears', '...Baby One More Time', 1998],
  ['Spice Girls', 'Wannabe', 1996],
  ['TLC', 'No Scrubs', 1999],
  ['Celine Dion', 'My Heart Will Go On', 1997],
  ['The Cranberries', 'Zombie', 1994],
  ['R.E.M.', 'Losing My Religion', 1991],
  ['Radiohead', 'Creep', 1992],
  ['Coolio', "Gangsta's Paradise", 1995],
  ['Natalie Imbruglia', 'Torn', 1997],
  ['Aqua', 'Barbie Girl', 1997],
  ['Bomfunk MC’s', 'Freestyler', 1999],
  ['Eiffel 65', 'Blue (Da Ba Dee)', 1998],
  ['Cher', 'Believe', 1998],
  ['Backstreet Boys', 'I Want It That Way', 1999],
  ['Lou Bega', 'Mambo No. 5 (A Little Bit of...)', 1999],
  ['The Verve', 'Bitter Sweet Symphony', 1997],
  ['Fugees', 'Killing Me Softly With His Song', 1996],
  ['Alanis Morissette', 'Ironic', 1995],
  ['Eminem', 'Lose Yourself', 2002],
  ['50 Cent', 'In da Club', 2003],
  ['OutKast', 'Hey Ya!', 2003],
  ['Beyoncé', 'Crazy in Love', 2003],
  ['The Killers', 'Mr. Brightside', 2004],
  ['The White Stripes', 'Seven Nation Army', 2003],
  ['Shakira', "Hips Don't Lie", 2006],
  ['Rihanna', 'Umbrella', 2007],
  ['Coldplay', 'Viva la Vida', 2008],
  ['The Black Eyed Peas', 'I Gotta Feeling', 2009],
  ['Lady Gaga', 'Poker Face', 2008],
  ['Snow Patrol', 'Chasing Cars', 2006],
  ['Linkin Park', 'In the End', 2000],
  ['U2', 'Beautiful Day', 2000],
  ['Red Hot Chili Peppers', 'Californication', 1999],
  ['Gorillaz', 'Feel Good Inc.', 2005],
  ['Gnarls Barkley', 'Crazy', 2006],
  ['Amy Winehouse', 'Rehab', 2006],
  ['Kings of Leon', 'Sex on Fire', 2008],
  ['Green Day', 'Boulevard of Broken Dreams', 2004],
  ['Franz Ferdinand', 'Take Me Out', 2004],
  ['O-Zone', 'Dragostea Din Tei', 2003],
  ['Adele', 'Rolling in the Deep', 2010],
  ['Mark Ronson', 'Uptown Funk', 2014],
  ['Ed Sheeran', 'Shape of You', 2017],
  ['The Weeknd', 'Blinding Lights', 2019],
  ['Gotye', 'Somebody That I Used to Know', 2011],
  ['Carly Rae Jepsen', 'Call Me Maybe', 2012],
  ['PSY', 'Gangnam Style', 2012],
  ['Avicii', 'Wake Me Up', 2013],
  ['Major Lazer', 'Lean On', 2015],
  ['Luis Fonsi', 'Despacito', 2017],
  ['Pharrell Williams', 'Happy', 2013],
  ['Taylor Swift', 'Shake It Off', 2014],
  ['Lorde', 'Royals', 2013],
  ['Hozier', 'Take Me to Church', 2013],
  ['Imagine Dragons', 'Radioactive', 2012],
  ['Macklemore & Ryan Lewis', "Can't Hold Us", 2012],
  ['OneRepublic', 'Counting Stars', 2013],
  ['John Legend', 'All of Me', 2013],
  ['Sia', 'Chandelier', 2014],
  ['The Chainsmokers', 'Closer', 2016],
  ['Camila Cabello', 'Havana', 2017],
  ['Drake', "God's Plan", 2018],
  ['Lil Nas X', 'Old Town Road', 2019],
  ['Billie Eilish', 'bad guy', 2019],
  ['Lady Gaga', 'Shallow', 2018],
  ['Tones And I', 'Dance Monkey', 2019],
  ['Ava Max', 'Sweet but Psycho', 2018],
  ['Alan Walker', 'Faded', 2015],
  ['Lilly Wood & The Prick', 'Prayer in C (Robin Schulz Remix)', 2014],
  ['Twenty One Pilots', 'Stressed Out', 2015],
  ['Vance Joy', 'Riptide', 2013],
  ['Daft Punk', 'Get Lucky', 2013],
  ['Dua Lipa', 'Levitating', 2020],
  ['Olivia Rodrigo', 'drivers license', 2021],
  ['Harry Styles', 'As It Was', 2022],
  ['Glass Animals', 'Heat Waves', 2020],
  ['The Kid LAROI', 'STAY', 2021],
  ['Miley Cyrus', 'Flowers', 2023],
  ['Taylor Swift', 'Anti-Hero', 2022],
  ['Sabrina Carpenter', 'Espresso', 2024],
  ['Benson Boone', 'Beautiful Things', 2024],
  ['Doja Cat', 'Paint The Town Red', 2023],
  ['Lady Gaga', 'Die With A Smile', 2024],
  ['Billie Eilish', 'BIRDS OF A FEATHER', 2024],
  ['ROSÉ', 'APT.', 2024],
  ['Michael Jackson', 'Billie Jean', 1982],
  ['Queen', 'Bohemian Rhapsody', 1975],
  ["Guns N' Roses", "Sweet Child O' Mine", 1987],
  ['a-ha', 'Take On Me', 1985],
  ['Toto', 'Africa', 1982],
  ['Bon Jovi', "Livin' on a Prayer", 1986],
  ['The Police', 'Every Breath You Take', 1983],
  ['AC/DC', 'Thunderstruck', 1990],
  ['Madonna', 'Like a Prayer', 1989],
  ['Whitney Houston', 'I Wanna Dance with Somebody (Who Loves Me)', 1987],
  ['Nena', '99 Luftballons', 1983],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BAD = /karaoke|tribute|cover version|as made famous|originally performed|in the style of|8-bit|lullaby|instrumental/i;

function pickMatch(results, artist, title) {
  const na = norm(artist);
  const nt = norm(title);
  const scored = results
    .filter((r) => r.previewUrl && r.trackName && r.artistName)
    .filter((r) => !BAD.test(`${r.artistName} ${r.trackName} ${r.collectionName || ''}`))
    .map((r) => {
      const rt = norm(r.trackName);
      const ra = norm(r.artistName);
      let score = 0;
      if (rt === nt) score += 4;
      else if (rt.startsWith(nt) || nt.startsWith(rt)) score += 2;
      else if (rt.includes(nt) || nt.includes(rt)) score += 1;
      if (ra === na) score += 3;
      else if (ra.includes(na.split(' ')[0])) score += 1;
      if (/live/i.test(r.trackName) && !/live/i.test(title)) score -= 3;
      if (/remix/i.test(r.trackName) && !/remix/i.test(title)) score -= 2;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score >= 3 ? scored[0].r : null;
}

async function lookup(artist, title) {
  for (const country of COUNTRIES) {
    const term = encodeURIComponent(`${artist} ${title}`);
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8&country=${country}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'FiveGuesses-seed/1.0' } });
        if (res.status === 403 || res.status === 429) {
          console.log(`  throttled (${res.status}), waiting 60s...`);
          await sleep(60000);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const match = pickMatch(data.results || [], artist, title);
        if (match) return match;
        break; // no match in this country's catalogue — try the next one
      } catch (e) {
        console.log(`  error (${e.message}), retry ${attempt + 1}/3`);
        await sleep(5000);
      }
    }
    await sleep(DELAY_MS);
  }
  return null;
}

const songs = [];
const misses = [];
let i = 0;
for (const [artist, title, year] of SEED) {
  i++;
  process.stdout.write(`[${i}/${SEED.length}] ${artist} - ${title} ... `);
  const m = await lookup(artist, title);
  if (m) {
    songs.push({
      id: m.trackId,
      artist,
      title,
      year,
      matchedTrack: m.trackName,
      matchedArtist: m.artistName,
      previewUrl: m.previewUrl,
      artworkUrl: (m.artworkUrl100 || '').replace('100x100', '512x512'),
      appleMusicUrl: m.trackViewUrl || null,
    });
    console.log('OK');
  } else {
    misses.push(`${artist} - ${title}`);
    console.log('MISS');
  }
  await sleep(DELAY_MS);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), songs }, null, 2));
console.log(`\nWrote ${songs.length}/${SEED.length} songs to ${OUT}`);
if (misses.length) console.log(`Misses:\n  ${misses.join('\n  ')}`);
