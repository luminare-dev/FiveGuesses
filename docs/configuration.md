# Configuration

The game has no configuration file. The values below come from the source and from the build; the
table is kept in step with `src/game.ts`, `src/config.ts` and `app.json`.

| Option | Type | Default | Description |
|---|---|---|---|
| `MAX_GUESSES` (`src/game.ts`) | number | `5` | Guesses per round. |
| `SNIPPET_SECONDS` (`src/game.ts`) | number list | `[1, 2, 4, 8, 16]` | Seconds of preview unlocked after 0, 1, 2, 3 and 4 misses. |
| `EPOCH` (`src/game.ts`) | date | `2026-08-25` | Puzzle #1 is this day; the number grows by one at every local midnight. |
| `assets/songs.json` | file | generated | The song list: artist, title, year and the preview, artwork and song-page links from the public iTunes Search API. Regenerate with `node scripts/seed-songs.mjs`; the script is never run by CI. |
| `EXPO_PUBLIC_SITE_URL` | environment variable, read at build time | `https://fiveguesses.app` | The site address; its host is the last line of the share text (`src/config.ts`). |
| `EXPO_PUBLIC_API_URL` | environment variable, read at build time | `https://api.fiveguesses.app` | The rooms and song-list service (`api/`); the room WebSocket uses the same host with `wss://`. |
| `DISCONNECT_GRACE`, `SEAT_TTL` (`api/src/rules.mjs`) | ms | `30000`, `300000` | A room waits 30 s for a dropped player; the seat goes after 5 minutes. |
| `REVEAL_MS` (`api/src/rules.mjs`) | ms | `10000` | The answer shows this long before the next room round starts. |
| `IDLE_TTL`, `EMPTY_TTL`, `FINISHED_TTL` (`api/src/rules.mjs`) | ms | 15, 5 and 10 minutes | A room is deleted after this long without activity, without players, or after the results. |
| `BASE_POINTS`, `PLACE_BONUS` (`api/src/rules.mjs`) | numbers | `100/80/60/40/20`, `30/20/10` | Room points for 1, 2, 4, 8 or 16 seconds, plus the bonus for the first three correct guesses. |
| `expo.web.name` (`app.json`) | string | `FiveGuesses — daily song guessing` | The page title. |
| `expo.web.description` (`app.json`) | string | the one-line description from the README | The `description` meta tag of the page. |
| `expo.web.themeColor` (`app.json`) | colour | `#0A1224` | The `theme-color` meta tag the export appends; the shell's own light and dark values live in `public/index.html`. |
| `PW_CHROMIUM_PATH` | environment variable | `/opt/pw-browsers/chromium` | A Chromium binary for `npm run e2e`, used outside CI when the file exists; otherwise the tests use the Chromium that `npx playwright install chromium` provides (the build pinned by `@playwright/test` in the lockfile). CI ignores it and runs the same install command with `--with-deps`. |

## Secrets

Secrets never go into this repository, an issue or a log. Pass them through environment variables
or a secret store. CI scans every commit with gitleaks; a leaked secret is rotated first and
removed from history second.

The app itself needs no secret. The worker behind `api.fiveguesses.app` has one, stored as a
Worker secret by `api/scripts/deploy.py`: `YOUTUBE_API_KEY` (YouTube Data API, playlist import).
The deploy script reads `CLOUDFLARE_API_TOKEN` from the environment; it is used to deploy only and
never goes into the repository.

The deploy workflow (`.github/workflows/deploy.yml`) has its own, stored as repository secrets:

| Secret | Holds |
|---|---|
| `DEPLOY_HOST` | The host name or address of the web server. |
| `DEPLOY_USER` | The SSH user that owns the docroot. |
| `DEPLOY_KEY` | The private key of that user, as generated for the deploy (see the [runbook](runbook.md)). |
| `DEPLOY_PATH` | Where the site is synced: `.` with the restricted deploy key of the runbook (rrsync limits the key to the docroot; the workflow refuses a relative path when the key is not restricted), otherwise the docroot's full path. |

Without all four the deploy job is skipped and the workflow run stays green.
