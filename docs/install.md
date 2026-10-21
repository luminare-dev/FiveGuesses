# Installation

The README quickstart is the short version of this page. The install, build and check commands
below were run on a Linux machine with Node.js 22.22.0 and npm 10.9.4 on 2026-10-21; the release
checks apply once a release exists.

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22.x | `.nvmrc` pins 22.22.0 and `.npmrc` sets `engine-strict=true`, so an older Node stops `npm ci` with an engine error |
| npm | 10.x | comes with Node.js 22 |
| A current browser | Chrome, Firefox, Safari or iOS Safari | the end-to-end tests run in Chromium 141 |
| Python | 3.10 or later | for the template checks in `tests/` and `scripts/*.py` and for `npm run e2e`, which serves `web-build/` with `python3 -m http.server`; the game itself needs no Python |
| Apache (hosting only) | 2.4 with `mod_rewrite`, `mod_headers` and `mod_deflate` | the default of a KeyHelp host; other static hosts serve the build without the `.htaccess` headers |

## Install

```bash
git clone https://github.com/luminare-dev/FiveGuesses.git
cd FiveGuesses
npm ci
npm run web
```

`npm run web` starts the development server and opens the game at <http://localhost:8081>.

Build the static site with `npm run build`: it exports the web bundle to `web-build/`, writes the
licence notices of the packages in the bundle to `web-build/third-party-notices.txt`, copies the
font to `web-build/fonts/`, writes the precache list and build id into the service worker and
checks that the shell carries no inline style or script. `web-build/` is what a web server serves
(with the `.htaccess` that the export copies from `public/`).

## Verify the release download

Every release has a `SHA256SUMS` file. A release carries two archives: `fiveguesses-X.Y.Z.tar.gz`
(the tracked source files) and `fiveguesses-web-X.Y.Z.tar.gz` (the built site, ready for the
docroot). Releases published while the repository is public also carry a build provenance
attestation for both archives; releases published while it was private are verified with
`SHA256SUMS` alone.

```bash
sha256sum -c SHA256SUMS
gh attestation verify fiveguesses-X.Y.Z.tar.gz --repo luminare-dev/FiveGuesses
gh attestation verify fiveguesses-web-X.Y.Z.tar.gz --repo luminare-dev/FiveGuesses
```

## Check that it works

```bash
npm ci && npm run check
```

The command type-checks, runs the unit tests and builds the site. It ends with the Jest summary
(`Tests: N passed, N total`), the bundle name with its size and gzip size, and the precache count;
afterwards `web-build/index.html` exists. Opening <http://localhost:8081> after `npm run web` shows
the title "FiveGuesses", the subtitle `Daily #N · Name the song` and a play button.

## Checks that CI runs

The `web` job of `.github/workflows/ci.yml` runs `npm ci`, `npm run check`, installs the Chromium
build that belongs to the pinned `@playwright/test` (`npx playwright install --with-deps chromium`)
and runs `npm run e2e`. The `lint-test` job runs the template checks; the same tools, pinned to the
same versions, run locally like this:

```bash
python3 -m venv .venv
.venv/bin/pip install --require-hashes --only-binary=:all: -r requirements-dev.txt   # yamllint 1.38.0, zizmor 1.30.1
python3 scripts/forbidden_words.py
python3 scripts/set_byline.py verify
python3 scripts/check_workflows.py --list
.venv/bin/yamllint --strict .
markdownlint-cli2 "**/*.md"          # markdownlint-cli2 0.23 (CI uses the markdownlint-cli2 action)
actionlint -color                    # actionlint 1.7.12, shellcheck on every run: block
.venv/bin/zizmor --offline --min-severity=low .github/workflows
python3 -m unittest discover -s tests -v
gitleaks git --redact --no-banner --config .gitleaks.toml .   # gitleaks 8.30.1, full history
```

## Uninstall

Delete the clone. A few things stay outside it: npm's package cache (`npm cache clean --force`
empties it), pip's download cache if you installed the check tools (`~/.cache/pip` on Linux)
and, if you ran `npx playwright install chromium` for the end-to-end tests, that browser
(`npx playwright uninstall` removes it). The game stores nothing on your machine except
the browser's local storage for the site you played on: open About in the game and choose
"Reset my data", or clear the site's data in the browser's settings.
