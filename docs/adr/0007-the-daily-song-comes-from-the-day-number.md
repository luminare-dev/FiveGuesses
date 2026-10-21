# 0007. The daily song comes from the day number

- **Status:** accepted
- **Date:** 2026-10-21

## Context

Every player should get the same song on the same day without a server (ADR 0006). The song list is
a fixed, curated set in `assets/songs.json`, resolved against the public iTunes Search API by
`scripts/seed-songs.mjs`. The puzzle must be the same on every device, must not depend on the order
in which players open the game, and must change once a day.

## Considered options

1. Puzzle number = days since a fixed epoch at local midnight; song index = a fixed-stride walk
   over the list.
2. The same puzzle number with a seeded permutation of the list.
3. A server that publishes the song of the day.

## Decision

Option 1. `puzzleNumber(now)` counts the days from 2026-08-25 at local midnight (puzzle #1 is that
day; earlier dates clamp to 1; the rounding absorbs the daylight-saving shifts).
`dailySongIndex(puzzle, count)` is `(puzzle × 7919) mod count`: 7919 is prime, so the walk visits
every index before it repeats, and the order repeats after `count` days (95 songs: puzzle 96 plays
the song of puzzle 1). Local midnight is kept on purpose: the game has no clock of its own, and a
player's day ends at the player's midnight. The puzzle is recomputed when the tab becomes visible,
on window focus, on pageshow, one second after local midnight and by a once-a-second check of the
wall clock, so an open tab rolls over without a reload; an unfinished round of the old day is
discarded and never counted. Free play never serves today's song and never repeats a song within
the session. Option 2 replaces option 1 if the list grows enough for the fixed stride to show.

Data quality: three entries in the seed list had a preview that was not the original recording
(an acoustic version, a radio edit and a cover by another artist). The seed script gets a stricter
artist match that penalises alternate versions and an `--only` option that re-resolves named seeds
in place; the outcome of that re-run is given at the end of this record.

## Consequences

- Good: no server, no clock synchronisation, and the puzzle number is a pure function that the unit
  tests pin for every daylight-saving case.
- Bad: players in different time zones get the new song at different moments, and a traveller can
  see a day twice or skip one; both are documented in the troubleshooting page. A day seen twice is
  counted in the statistics once.
- Bad: the stride is predictable from the source, which is accepted for a game with no leaderboard.

Outcome of the data fix (2026-10-21): `node scripts/seed-songs.mjs --only "Radiohead - Creep" --only "Eiffel 65 - Blue (Da Ba Dee)" --only "Green Day - Boulevard of Broken Dreams"`
reached the search API for both catalogues (Germany first, then the United States) and found no
acceptable match for any of the three seeds: the only Radiohead result is the acoustic take, every
Eiffel 65 result carries a remix, mix, edit or cut qualifier, and no result for Boulevard of Broken
Dreams is by Green Day. A manual query with 50 results per catalogue adds no result by Green Day and
only more Eiffel 65 remixes; for Radiohead it adds other songs of the band and, in the German
catalogue at position 47, a Creep with cleaned lyrics on a 2013 various-artists compilation that is
not marked streamable. That version lies outside the script's 8-result query and is not taken as the
original recording, so the entry stays out. The three entries were removed, so `assets/songs.json`
holds 95 songs. Besides the artist rule and the penalty for alternate versions, the matcher
rejects results whose title does not overlap the seed title and bracketed qualifiers that are
neither a credit (`feat.`, `from`) nor part of the seed title. A full run would therefore also
re-resolve Daft Punk - Get Lucky, whose kept entry is the radio edit of the single. The three seeds
stay in the script's list and are tried again by the next full run.
