// Fake fetch for the tests: routes are [predicate(url), response | (url) => response].
import { readFileSync } from 'node:fs';

export const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

export function fakeFetch(routes) {
  const calls = [];
  const inits = [];
  const fetch = async (url, init) => {
    calls.push(String(url));
    inits.push(init);
    for (const [match, res] of routes) {
      if (match(String(url))) {
        const r = typeof res === 'function' ? res(String(url), init) : res instanceof Response ? res.clone() : res;
        return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
      }
    }
    return new Response('not found', { status: 404 });
  };
  fetch.calls = calls;
  fetch.inits = inits;
  return fetch;
}

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// An iTunes result with a valid preview.
export const result = (trackId, artistName, trackName, extra = {}) => ({
  wrapperType: 'track',
  kind: 'song',
  trackId,
  artistName,
  trackName,
  collectionName: trackName,
  previewUrl: `https://audio-ssl.itunes.apple.com/itunes-assets/p/${trackId}.m4a`,
  artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/x/${trackId}.jpg/100x100bb.jpg`,
  trackViewUrl: `https://music.apple.com/at/album/x/1?i=${trackId}`,
  ...extra,
});
