<!-- header:begin: the project page on luminare.tech drops this block, because the page has its own heading -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-header-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/brand/readme-header-light.svg">
  <img alt="FiveGuesses" src="docs/brand/readme-header-light.svg">
</picture>

<!-- byline:studio -->
*a [Luminare Development](https://luminare.tech/open-source/fiveguesses/) open-source project*
<!-- /byline:studio -->
<!-- byline:personal
*by ItsPaulAT · [project page](https://luminare.tech/open-source/fiveguesses/)*
/byline:personal -->
<!-- header:end -->

# FiveGuesses

A daily song-guessing game for the browser: five guesses, and every miss doubles the preview you
hear (1, 2, 4, 8 and 16 seconds).

[![ci](https://github.com/luminare-dev/FiveGuesses/actions/workflows/ci.yml/badge.svg)](https://github.com/luminare-dev/FiveGuesses/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/luminare-dev/FiveGuesses?sort=semver)](https://github.com/luminare-dev/FiveGuesses/releases)
[![licence](https://img.shields.io/github/license/luminare-dev/FiveGuesses)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/luminare-dev/FiveGuesses/badge)](https://scorecard.dev/viewer/?uri=github.com/luminare-dev/FiveGuesses)

## How to play

Press play and name the song. You get five guesses; a skip or a wrong guess unlocks a longer
preview. Everyone gets the same song each day; free play, song categories, playlists and rooms
can be picked from the start screen at any time. Stats and streaks stay in your browser's local
storage; there are no accounts.

Play with friends opens a room at `fiveguesses.app/r/<CODE>`: everyone hears the same song, rounds
are scored by speed. Rooms, song categories and playlist import run on a small Cloudflare worker
(`api/`).

## Run locally

```bash
git clone https://github.com/luminare-dev/FiveGuesses.git
cd FiveGuesses
npm ci
npm run web
```

The game opens at <http://localhost:8081>. Needs Node.js 22 (`.nvmrc`). `npm run check` runs the
type check, the unit tests and the web build; `npm run e2e` runs the Playwright tests.

## Song previews

Previews are 30-second clips streamed from Apple Music through the public iTunes Search API. The
app never downloads or re-hosts them, shows a **Listen on Apple Music** link on every reveal and
the line *Previews courtesy of Apple Music* wherever a preview plays.

*Previews courtesy of Apple Music.*

## Docs

- [Installation](docs/install.md) · [Configuration](docs/configuration.md) ·
  [Upgrade](docs/upgrade.md) · [Troubleshooting](docs/troubleshooting.md) ·
  [Runbook](docs/runbook.md) · [Accessibility](docs/accessibility.md)
- [Changelog](CHANGELOG.md) and [releases](https://github.com/luminare-dev/FiveGuesses/releases)
- [Contributing](https://github.com/luminare-dev/.github/blob/main/CONTRIBUTING.md) ·
  [Code of conduct](https://github.com/luminare-dev/.github/blob/main/CODE_OF_CONDUCT.md) ·
  [Security](https://github.com/luminare-dev/.github/blob/main/SECURITY.md) ·
  [Support](https://github.com/luminare-dev/.github/blob/main/SUPPORT.md)

## Not affiliated

Not affiliated with or endorsed by Apple. Apple Music and the iTunes Search API are named only to
describe where the song previews come from.

## Licence

[MIT](LICENSE). The licence covers the code only: the project name, logo, header images
and `docs/brand/` are not licensed (see [NOTICE](NOTICE)).

<!-- byline:studio -->
*a [Luminare Development](https://luminare.tech/open-source/fiveguesses/) open-source project*
<!-- /byline:studio -->
<!-- byline:personal
*by ItsPaulAT · [project page](https://luminare.tech/open-source/fiveguesses/)*
/byline:personal -->
