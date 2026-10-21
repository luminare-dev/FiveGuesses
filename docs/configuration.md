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
| `expo.web.name` (`app.json`) | string | `FiveGuesses — daily song guessing` | The page title. |
| `expo.web.description` (`app.json`) | string | the one-line description from the README | The `description` meta tag of the page. |
| `expo.web.themeColor` (`app.json`) | colour | `#0A1224` | The `theme-color` meta tag the export appends; the shell's own light and dark values live in `public/index.html`. |
| `PW_CHROMIUM_PATH` | environment variable | `/opt/pw-browsers/chromium` | A Chromium binary for `npm run e2e`, used outside CI when the file exists; otherwise the tests use the Chromium that `npx playwright install chromium` provides (the build pinned by `@playwright/test` in the lockfile). CI ignores it and runs the same install command with `--with-deps`. |

## Secrets

Secrets never go into this repository, an issue or a log. Pass them through environment variables
or a secret store. CI scans every commit with gitleaks; a leaked secret is rotated first and
removed from history second.

The app needs no secret at run time: it has no backend and no API key. The only secrets belong to
the deploy workflow (`.github/workflows/deploy.yml`), stored as repository secrets:

| Secret | Holds |
|---|---|
| `DEPLOY_HOST` | The host name or address of the web server. |
| `DEPLOY_USER` | The SSH user that owns the docroot. |
| `DEPLOY_KEY` | The private key of that user, as generated for the deploy (see the [runbook](runbook.md)). |
| `DEPLOY_PATH` | Where the site is synced: `.` with the restricted deploy key of the runbook (rrsync limits the key to the docroot; the workflow refuses a relative path when the key is not restricted), otherwise the docroot's full path. |

Without all four the deploy job is skipped and the workflow run stays green.
