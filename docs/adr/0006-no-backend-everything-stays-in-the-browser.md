# 0006. No backend: everything stays in the browser

- **Status:** accepted
- **Date:** 2026-10-21

## Context

A daily game needs the same puzzle for everyone, a saved round that survives a reload, and
statistics with a streak. Most games of this kind keep that on a server with accounts. This
project is meant to run without an operator-side service: no accounts, no uploads, no analytics and
no requests to other hosts except Apple's preview and artwork hosts (ADR 0008).

## Considered options

1. A backend with accounts that stores rounds and statistics.
2. Everything in the browser's local storage, with a daily puzzle that every client computes itself.
3. Local storage plus an optional sync service.

## Decision

Option 2. The daily puzzle comes from the day number (ADR 0007), so no server has to publish it.
The browser keeps three keys: `fg:stats:v1` (played, wins, streak, best streak, last puzzle won and
played, the distribution of wins per guess), `fg:round:v2:<puzzle>` (today's entries and status;
only today's key is kept, plus the round of one of the next two puzzles while a change of time
zone has moved the date back) and `fg:theme:v1` (`system`, `light` or `dark`). Migration policy: a
shape change bumps the key version, one reader per old version converts it once, old keys are
deleted after a successful write, and no key is read without validation (`normaliseStats`, the
round loader). Every write is wrapped so a full or blocked storage never throws into the UI.
"Reset my data" in the About sheet removes every `fg:` key. Free play is kept in memory only.

## Consequences

- Good: nothing to operate beyond the static web server; the operator holds no game data, only the
  web server's access logs described on the privacy page (`/legal/`), and the game runs offline
  once the shell is cached (ADR 0009).
- Good: the privacy page can list every stored key and every outbound request.
- Bad: statistics are per browser; clearing site data or switching devices starts from zero, which
  the README "Limitations" and the troubleshooting page say plainly.
