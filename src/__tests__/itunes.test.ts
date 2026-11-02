import { pickMatch } from '../catalog/match';

type Itunes = typeof import('../catalog/itunes');
type Sources = typeof import('../catalog/sources');

// A fresh module per test, so every test starts with an empty iTunes limit.
let itunes: Itunes;
let sources: Sources;
beforeEach(() => {
  jest.isolateModules(() => {
    itunes = require('../catalog/itunes') as Itunes;
    sources = require('../catalog/sources') as Sources;
  });
});

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const AUDIO = 'https://audio-ssl.itunes.apple.com/itunes-assets/p';
const result = (trackId: number, artistName: string, trackName: string, extra: Record<string, unknown> = {}) => ({
  wrapperType: 'track',
  trackId,
  artistName,
  trackName,
  collectionName: trackName,
  previewUrl: `${AUDIO}/${trackId}.m4a`,
  artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/x/${trackId}.jpg/100x100bb.jpg`,
  trackViewUrl: `https://music.apple.com/at/album/x/1?i=${trackId}`,
  ...extra,
});

type Answer = { status?: number; body: unknown };
// A fetch stand-in: answer(url) gives the status and the JSON body; every URL is kept.
function mockFetch(answer: (url: URL) => Answer): URL[] {
  const urls: URL[] = [];
  global.fetch = jest.fn(async (input: string) => {
    const url = new URL(String(input));
    urls.push(url);
    const { status = 200, body } = answer(url);
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
  }) as unknown as typeof fetch;
  return urls;
}

describe('toTrack', () => {
  it('maps a lookup result, with the seed names when given', () => {
    const track = itunes.toTrack(result(5, 'Nirvana', 'Smells Like Teen Spirit'), 'at', { artist: 'Nirvana', title: 'Teen Spirit' });
    expect(track).toEqual({
      id: 5,
      artist: 'Nirvana',
      title: 'Teen Spirit',
      year: null,
      matchedTrack: 'Smells Like Teen Spirit',
      matchedArtist: 'Nirvana',
      previewUrl: `${AUDIO}/5.m4a`,
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/x/5.jpg/512x512bb.jpg',
      appleMusicUrl: 'https://music.apple.com/at/album/x/1?i=5',
      country: 'AT',
    });
  });
  it('checks every URL and needs a preview', () => {
    const r = result(6, 'Mark Ronson', 'Uptown Funk (feat. Bruno Mars)');
    expect(itunes.toTrack(r, 'DE')?.title).toBe('Uptown Funk (feat. Bruno Mars)');
    expect(itunes.toTrack({ ...r, previewUrl: 'https://evil.example/a.m4a' }, 'AT')).toBeNull();
    expect(itunes.toTrack({ ...r, previewUrl: `${AUDIO}/${'x'.repeat(500)}` }, 'AT')).toBeNull();
    expect(itunes.toTrack({ ...r, previewUrl: undefined }, 'AT')).toBeNull();
    expect(itunes.toTrack({ ...r, trackId: '6' }, 'AT')).toBeNull();
    expect(itunes.toTrack({ ...r, artworkUrl100: 'http://is1-ssl.mzstatic.com/a.jpg' }, 'AT')?.artworkUrl).toBe('');
    expect(itunes.toTrack({ ...r, artworkUrl100: 'https://mzstatic.com.evil.example/a.jpg' }, 'AT')?.artworkUrl).toBe('');
    expect(itunes.toTrack({ ...r, trackViewUrl: 'https://music.apple.com.evil.example/x' }, 'AT')?.appleMusicUrl).toBeNull();
    expect(itunes.toTrack({ ...r, trackViewUrl: 'javascript:alert(1)' }, 'AT')?.appleMusicUrl).toBeNull();
    expect(itunes.toTrack({ ...r, trackName: 'x'.repeat(300) }, 'AT')?.title).toHaveLength(200);
  });
});

describe('lookupTracks', () => {
  it('asks once per country and 200 ids, keeps the order and drops ids without a preview', async () => {
    const urls = mockFetch((url) => {
      const ids = (url.searchParams.get('id') ?? '').split(',').map(Number);
      return { body: { results: ids.filter((id) => id !== 3).map((id) => result(id, 'A', `T${id}`)) } };
    });
    const items = [
      ...Array.from({ length: 250 }, (_, i) => ({ id: i + 1, country: 'AT' })),
      { id: 1000, country: 'de', seed: { artist: 'Nena', title: '99 Luftballons' } },
      { id: 1, country: 'AT' },
    ];
    const tracks = await itunes.lookupTracks(items);
    expect(urls.map((u) => [u.pathname, u.searchParams.get('country'), u.searchParams.get('id')?.split(',').length])).toEqual([
      ['/lookup', 'AT', 200],
      ['/lookup', 'AT', 50],
      ['/lookup', 'DE', 1],
    ]);
    expect(tracks).toHaveLength(250);
    expect(tracks.slice(0, 3).map((t) => t.id)).toEqual([1, 2, 4]);
    expect(tracks[249]).toMatchObject({ id: 1000, artist: 'Nena', title: '99 Luftballons', country: 'DE' });
  });
  it('reports a refused lookup with its status', async () => {
    mockFetch(() => ({ status: 403, body: {} }));
    await expect(itunes.lookupTracks([{ id: 1, country: 'AT' }])).rejects.toEqual(new itunes.AppleError(403));
  });
});

describe('charts', () => {
  const entry = (id: number, name: string, artist: string, preview = `${AUDIO}/${id}.m4a`) => ({
    'im:name': { label: name },
    'im:artist': { label: artist },
    'im:image': [
      { label: `https://is1-ssl.mzstatic.com/image/thumb/m/${id}.jpg/55x55bb.png` },
      { label: `https://is1-ssl.mzstatic.com/image/thumb/m/${id}.jpg/170x170bb.png` },
    ],
    id: { label: `https://music.apple.com/at/album/x/1?i=${id}&uo=2`, attributes: { 'im:id': String(id) } },
    link: [
      { attributes: { rel: 'alternate', type: 'text/html', href: `https://music.apple.com/at/album/x/1?i=${id}&uo=2` } },
      { attributes: { rel: 'enclosure', type: 'audio/x-m4a', href: preview } },
    ],
  });

  it('reads the top-songs feed into tracks in chart order', () => {
    const feed = { feed: { entry: [entry(7, 'Song', 'Band'), entry(8, 'Bad', 'Band', 'https://evil.example/a.m4a'), entry(7, 'Song', 'Band')] } };
    expect(itunes.parseChart(feed, 'AT')).toEqual([
      {
        id: 7,
        artist: 'Band',
        title: 'Song',
        year: null,
        matchedTrack: 'Song',
        matchedArtist: 'Band',
        previewUrl: `${AUDIO}/7.m4a`,
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/m/7.jpg/512x512bb.png',
        appleMusicUrl: 'https://music.apple.com/at/album/x/1?i=7&uo=2',
        country: 'AT',
      },
    ]);
    expect(itunes.parseChart({ feed: { entry: entry(9, 'One', 'Solo') } }, 'GB').map((t) => t.id)).toEqual([9]);
    expect(itunes.parseChart(null, 'AT')).toEqual([]);
    expect(itunes.parseChart({ feed: {} }, 'AT')).toEqual([]);
  });

  it('loads a chart from the iTunes feed of its country, without the song service', async () => {
    const urls = mockFetch(() => ({ body: { feed: { entry: [entry(1, 'A', 'X'), entry(2, 'B', 'Y'), entry(3, 'C', 'Z')] } } }));
    const list = await sources.loadSongs('chart-de', 2, [2], () => 0);
    expect(urls.map((u) => u.href)).toEqual(['https://itunes.apple.com/de/rss/topsongs/limit=100/json']);
    expect(list.label).toBe('Top songs Germany');
    expect(list.tracks.map((t) => t.id).sort()).toEqual([1, 3]);
    expect(list.tracks.every((t) => t.country === 'DE')).toBe(true);
  });

  it('knows the chart ids', () => {
    expect(sources.chartSources().map((s) => [s.id, s.label])).toEqual([
      ['chart-at', 'Top songs Austria'],
      ['chart-de', 'Top songs Germany'],
      ['chart-us', 'Top songs US'],
      ['chart-gb', 'Top songs UK'],
    ]);
    expect(sources.chartCountry('chart-gb')).toBe('gb');
    expect(sources.chartCountry('80s')).toBeNull();
  });
});

describe('a category', () => {
  it('takes the entries from the service and the previews from one lookup per country', async () => {
    const entries = [
      { id: 11, artist: 'a-ha', title: 'Take On Me', country: 'AT' },
      { id: 12, artist: 'Nena', title: '99 Luftballons', country: 'DE' },
      { id: 13, artist: 'Gone', title: 'Gone', country: 'AT' },
    ];
    const urls = mockFetch((url) => {
      if (url.host === 'api.fiveguesses.app') return { body: { source: '80s', label: '1980s', entries } };
      const ids = (url.searchParams.get('id') ?? '').split(',').map(Number);
      return { body: { results: ids.filter((id) => id !== 13).map((id) => result(id, 'Apple Name', 'Apple Title')) } };
    });
    const list = await sources.loadSongs('80s', 5, [], () => 0);
    expect(urls[0].href).toBe('https://api.fiveguesses.app/api/pool?source=80s');
    expect(urls.slice(1).map((u) => u.searchParams.get('country')).sort()).toEqual(['AT', 'DE']);
    expect(list.label).toBe('1980s');
    expect(list.tracks.map((t) => [t.id, t.artist, t.title]).sort()).toEqual([
      [11, 'a-ha', 'Take On Me'],
      [12, 'Nena', '99 Luftballons'],
    ]);
  });
});

describe('matchEntries', () => {
  // Finds "<one-word artist> <title>" as that song.
  const found = (url: URL): Answer => {
    const [artist, ...title] = (url.searchParams.get('term') ?? '').split(' ');
    return { body: { results: [result(artist.charCodeAt(0), artist, title.join(' '))] } };
  };

  it('searches each entry once in the Austrian catalogue and reports progress', async () => {
    const urls = mockFetch((url) => {
      const term = url.searchParams.get('term');
      if (term === 'a-ha Take On Me') return { body: { results: [result(1, 'a-ha', 'Take On Me (Live)'), result(2, 'a-ha', 'Take On Me')] } };
      if (term === 'Karaoke Star Take On Me') return { body: { results: [result(3, 'Karaoke Star', 'Take On Me (Karaoke Version)')] } };
      return { body: { results: [] } };
    });
    const progress: string[] = [];
    const out = await itunes.matchEntries(
      [
        { artist: 'a-ha', title: 'Take On Me' },
        { artist: 'Karaoke Star', title: 'Take On Me' },
        { artist: 'Nobody', title: 'Nothing' },
      ],
      (p) => progress.push(`${p.done}/${p.total}:${p.found}`)
    );
    expect(out.tracks.map((t) => t.id)).toEqual([2]);
    expect(out.unresolved).toBe(2);
    expect(out.throttled).toBe(false);
    expect(progress).toEqual(['1/3:1', '2/3:1', '3/3:1']);
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({ term: 'a-ha Take On Me', media: 'music', entity: 'song', limit: '10', country: 'AT' });
  });

  it('stops at the first throttled answer and keeps what was found', async () => {
    let calls = 0;
    mockFetch((url) => (++calls === 2 ? { status: 429, body: {} } : found(url)));
    const out = await itunes.matchEntries([
      { artist: 'A', title: 'One' },
      { artist: 'B', title: 'Two' },
      { artist: 'C', title: 'Three' },
    ]);
    expect(calls).toBe(2);
    expect(out.throttled).toBe(true);
    expect(out.tracks.map((t) => [t.artist, t.title])).toEqual([['A', 'One']]);
    expect(out.unresolved).toBe(2);
  });

  it('ends without a request once aborted', async () => {
    const urls = mockFetch(found);
    const controller = new AbortController();
    controller.abort();
    const out = await itunes.matchEntries([{ artist: 'A', title: 'One' }], undefined, controller.signal);
    expect(urls).toEqual([]);
    expect(out).toEqual({ tracks: [], unresolved: 1, throttled: false });
  });
});

describe('RateLimiter', () => {
  it('allows the limit in a window and then waits for the oldest request to age out', () => {
    let now = 1000;
    const limiter = new itunes.RateLimiter(3, 60_000, () => now);
    limiter.note();
    now += 10;
    limiter.note();
    now += 10;
    expect(limiter.wait()).toBe(0);
    limiter.note();
    expect(limiter.wait()).toBe(60_000 - 20);
    now = 61_000;
    expect(limiter.wait()).toBe(0);
  });
  it('take() sleeps until a slot is free and can be aborted', async () => {
    const limiter = new itunes.RateLimiter(1, 30);
    await limiter.take();
    const started = Date.now();
    await limiter.take();
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    const controller = new AbortController();
    const pending = limiter.take(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('stays at 18 iTunes requests a minute', () => {
    expect(itunes.APPLE_PER_MINUTE).toBe(18);
    expect(itunes.APPLE_WINDOW_MS).toBe(60_000);
  });
});

describe('pickMatch', () => {
  const r = (trackName: string, artistName = 'a-ha', collectionName = 'Hunting High and Low', trackId = 1) => ({
    trackId,
    trackName,
    artistName,
    collectionName,
    previewUrl: `${AUDIO}/x.m4a`,
  });
  it('takes the original', () => {
    const results = [r('Take On Me (Live)', 'a-ha', 'Live', 2), r('Take On Me', 'a-ha', 'Hunting High and Low', 3)];
    expect(pickMatch(results, 'a-ha', 'Take On Me')?.trackId).toBe(3);
  });
  it('rejects karaoke, covers, live and remixes', () => {
    expect(pickMatch([r('Take On Me', 'Karaoke Hits')], 'a-ha', 'Take On Me')).toBeNull();
    expect(pickMatch([r('Take On Me', 'a-ha', 'Tribute to a-ha')], 'a-ha', 'Take On Me')).toBeNull();
    expect(pickMatch([r('Take On Me (Live at Wembley)')], 'a-ha', 'Take On Me')).toBeNull();
    expect(pickMatch([r('Take On Me (Remix)')], 'a-ha', 'Take On Me')).toBeNull();
    expect(pickMatch([r('Take On Me', 'Some Cover Band')], 'a-ha', 'Take On Me')).toBeNull();
  });
  it('keeps a credit and needs a preview', () => {
    const ok = r('Uptown Funk (feat. Bruno Mars)', 'Mark Ronson');
    expect(pickMatch([ok], 'Mark Ronson', 'Uptown Funk')).toBe(ok);
    expect(pickMatch([{ ...ok, previewUrl: '' }], 'Mark Ronson', 'Uptown Funk')).toBeNull();
    expect(pickMatch([ok], '', 'Uptown Funk')).toBeNull();
  });
});
