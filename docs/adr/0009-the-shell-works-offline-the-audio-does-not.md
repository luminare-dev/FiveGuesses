# 0009. The shell works offline, the audio does not

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The site should be installable and should open without a connection, but the previews must never
be cached (ADR 0008). The static shell is also served with a strict Content-Security-Policy, which
rules out inline scripts and, if it holds, inline styles.

## Considered options

1. A hand-written service worker that precaches the app shell only, never anything cross-origin.
2. A service-worker library with runtime caching of every response.
3. No offline support.

## Decision

Option 1. `public/sw.js` precaches the shell: the page, the stylesheets, the manifest, the icons,
the font, the hashed bundle with the images it loads and the privacy page. The build injects the
list and a build id that is the hash of every precached file's bytes, so the cache name changes
whenever the shell changes; the worker deletes older caches on activation and claims the open
pages. The build also names the two stylesheets after their content hash (`styles.<hash>.css`,
`legal/legal.<hash>.css`) and rewrites the links in both pages, so a changed stylesheet has a new
URL and a new page never meets the previous styles in either cache. The worker fills its cache
without storing stale copies and without fetching a file twice: files whose names carry a content
hash (the bundle, the stylesheets and the images under `/assets/`) come from the browser's HTTP
cache, where the page has just put them; every other file is revalidated with cache mode
`no-cache`, so an unchanged file costs a 304. `.htaccess` lets the browser keep the hashed bundle
and stylesheets for a year and the icons and the font for a week, and a new worker that took
those unhashed copies unchecked would store them under the new cache name and serve them until a
later deploy. Navigations are network-first with the cached page as the offline fallback
(`/legal*` falls back to the privacy page); precached files are cache-first; everything else
same-origin goes to the network; cross-origin requests are not handled at all, so the previews
and the artwork are never stored. Offline, the game shows
"You are offline. The preview needs a connection." when play is pressed, and the saved round and
the statistics are available. The worker is registered from `public/register-sw.js`, a separate
file, so `script-src 'self'` holds.

Content-Security-Policy: the shell ships with `style-src 'self'`. react-native-web writes its
styles through the CSS object model, which the policy does not block, and the shell has no inline
`<style>` (the build fails if the export ever adds one). The Playwright test `e2e/csp.spec.ts`
serves the build with the exact header from `public/.htaccess` and fails on any
`securitypolicyviolation` event; if it ever proves a violation, `style-src` is relaxed to
`'self' 'unsafe-inline'` and the report is added to this file.

## Consequences

- Good: the game opens offline with the saved round and the statistics; the audio states clearly
  that it needs a connection.
- Good: a deploy is picked up on the next navigation, because `index.html`, `sw.js` and the
  manifest are served with `no-cache` and the names of the bundle and the stylesheets are
  content-hashed.
- Bad: an open tab keeps the old bundle until it navigates; there is no in-app update prompt.
