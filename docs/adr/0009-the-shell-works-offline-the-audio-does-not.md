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

Content-Security-Policy: the shell was first served with `style-src 'self'`. react-native-web
writes its styles through the CSS object model, which the policy does not block, and the shell has
no inline `<style>` (the build fails if the export ever adds one). The Playwright test
`e2e/csp.spec.ts` serves the build with the exact header from `public/.htaccess` and fails on any
`securitypolicyviolation` event.

Outcome of that test (2026-10-21): one violation. Report: `violatedDirective` and
`effectiveDirective` `style-src-elem`, `blockedURI` `inline`, `sourceFile` the hashed bundle
`/_expo/static/js/web/index-<hash>.js` (line 90, column 512 in the build of that day),
`disposition` `enforce`, an empty `sample`. Cause: react-native-web
(`StyleSheet/dom/createCSSStyleSheet.js`) inserts an empty `<style id="react-native-stylesheet">`
element as the first child of `<head>` and only then adds its rules through the CSS object model.
The rule insertion is not governed by the policy, but the element is: Chromium reports the empty
inline element under `style-src-elem`, leaves its sheet unusable, and the page renders without styles (the sheets never
gain their dialog role because the fade never ends). `public/.htaccess` therefore allows that one
element by its hash, `style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`
(the SHA-256 of the empty string, the value Chromium's console message names). With that value the
test records no violation, the style element carries the app's rules and every scenario passes.
`'unsafe-inline'` would also pass, but it allows every inline style; the hash allows exactly the
empty element. The hash was verified in Chromium 141 by the test; other browsers apply the same
hash rule to inline style elements but were not run here. Should a react-native-web update ever
write text into that element, the test fails in CI and the hash has to follow it (or give way to
`'unsafe-inline'`).

## Consequences

- Good: the game opens offline with the saved round and the statistics; the audio states clearly
  that it needs a connection.
- Good: a deploy is picked up on the next navigation, because `index.html`, `sw.js` and the
  manifest are served with `no-cache` and the names of the bundle and the stylesheets are
  content-hashed.
- Bad: an open tab keeps the old bundle until it navigates; there is no in-app update prompt.
