# Troubleshooting

## No sound on iPhone or iPad

**Cause:** mobile browsers only start audio after a tap, and the ring/silent switch of the device
mutes web audio on some iOS versions.

**Fix:** tap the play button yourself (the game never starts audio on its own), then check the
ring/silent switch and the volume. If the line under the progress bar stays at "Loading the
preview…" or says the preview could not be loaded, see
[The preview never loads](#the-preview-never-loads).

## The preview never loads

**Cause:** the preview is streamed from `audio-ssl.itunes.apple.com` when you press play. No
connection, a content blocker or a network policy that stops that host leaves the snippet in the
"could not be loaded" state.

**Fix:** check the connection, then allow `audio-ssl.itunes.apple.com` (the audio) and
`mzstatic.com` (the artwork) in the blocker. These two hosts are the only ones the game talks to
besides its own.

## My daily song differs from a friend's

**Cause:** the puzzle number counts days at your local midnight, so two players in different time
zones can be on different days for a few hours (see [ADR 0007](adr/0007-the-daily-song-comes-from-the-day-number.md)).
Travelling across time zones moves your day with you, so a puzzle can come round twice or be
skipped; a puzzle seen twice is counted in the statistics once.

**Fix:** nothing to fix; compare results once both of you are on the same calendar day.

## My board changed at midnight

**Cause:** the game rolls over to the next puzzle at local midnight, also while a tab is open and
a round is unfinished. The unfinished round is not counted in the statistics.

**Fix:** play the new day's song. The countdown under a finished round shows when the next
rollover happens.

## My stats are gone

**Cause:** the statistics live in the browser's local storage of the site. A private window, a
different browser or profile, or "clear site data" starts from zero.

**Fix:** use the same browser and profile you played in. There is no account and no sync, so the
data cannot be restored from elsewhere.

## `npm ci` stops with an engine error

**Cause:** `package.json` requires Node.js 22 and `.npmrc` makes that strict.

**Fix:**

```bash
nvm install     # reads .nvmrc (22.22.0)
nvm use
npm ci
```

## `npm run build` fails

**Cause:** a stale Metro cache or a half-written export from an interrupted run.

**Fix:**

```bash
rm -rf .expo web-build
npm run build
```

## Still stuck?

Search the issues, then ask in the organization's
[Discussions](https://github.com/orgs/luminare-dev/discussions). Never post secrets, keys, IP
addresses, hostnames or player data; redact logs before you paste them.
