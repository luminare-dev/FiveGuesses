import { searchApple, SearchError, toSuggestions } from '../catalog/appleSearch';
import { APPLE_PER_MINUTE, appleLimiter } from '../catalog/itunes';

const result = (trackId: number, artistName: string, trackName: string, art = 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg') => ({
  trackId,
  artistName,
  trackName,
  artworkUrl100: art,
});

describe('toSuggestions', () => {
  it('maps Apple results to songs with a small cover', () => {
    expect(toSuggestions([result(1, 'a-ha', 'Take On Me')])).toEqual([
      {
        id: 1,
        artist: 'a-ha',
        title: 'Take On Me',
        year: null,
        matchedTrack: 'Take On Me',
        matchedArtist: 'a-ha',
        previewUrl: '',
        artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/a/60x60bb.jpg',
        appleMusicUrl: null,
      },
    ]);
  });
  it('drops covers from other hosts and broken results', () => {
    const items = toSuggestions([
      result(1, 'A', 'One', 'http://is1-ssl.mzstatic.com/x/100x100bb.jpg'),
      result(2, 'B', 'Two', 'https://evil.example/100x100bb.jpg'),
      { trackId: '3', artistName: 'C', trackName: 'Three' },
      { trackId: 4, artistName: '', trackName: 'Four' },
    ]);
    expect(items.map((s) => [s.id, s.artworkUrl])).toEqual([
      [1, ''],
      [2, ''],
    ]);
  });
  it('keeps one version of a song by the same first artist', () => {
    const items = toSuggestions([
      result(1, 'Daft Punk', 'Get Lucky (feat. Pharrell Williams)'),
      result(2, 'Daft Punk & Pharrell Williams', 'Get Lucky [Radio Edit]'),
      result(3, 'Some Band', 'Get Lucky'),
    ]);
    expect(items.map((s) => s.id)).toEqual([1, 3]);
  });
  it('gives at most 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => result(i + 1, `Artist ${i}`, `Song ${i}`));
    expect(toSuggestions(many)).toHaveLength(8);
  });
});

describe('searchApple', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('asks the Austrian catalogue and parses the text answer', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ resultCount: 1, results: [result(7, 'Oasis', 'Wonderwall')] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const items = await searchApple('wonder wall');
    expect(items.map((s) => s.id)).toEqual([7]);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      term: 'wonder wall',
      media: 'music',
      entity: 'song',
      limit: '20',
      country: 'AT',
    });
  });
  it('throws the status of a refused search', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => '' })) as unknown as typeof fetch;
    await expect(searchApple('abc')).rejects.toEqual(new SearchError(403));
  });
  it('passes the abort signal on', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn((_url: string, init: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const pending = searchApple('abc', controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
  // Last in the file: it uses up the page's iTunes limit for the minute.
  it('shares the page iTunes limit: no search once lookups and matching used it up', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ results: [] }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    // The searches above took their slots too.
    expect(appleLimiter.wait()).toBe(0);
    await expect(searchApple('first')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    let taken = 0;
    while (appleLimiter.tryTake()) taken++;
    expect(taken).toBeLessThan(APPLE_PER_MINUTE);
    expect(appleLimiter.wait()).toBeGreaterThan(0);
    await expect(searchApple('take on')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
