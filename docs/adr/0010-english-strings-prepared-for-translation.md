# 0010. English strings prepared for translation

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The game ships in English only, and the strings should be ready for a second language without a
rewrite. The template's CI rejects unfilled upper-case markers in double curly braces, so an
interpolation syntax that looks like them would need an exception.

## Considered options

1. One dictionary `src/i18n/en.ts` with a small `t(key, params)` and single-brace placeholders
   such as `{puzzle}`.
2. An i18n library with ICU message syntax.
3. Literal strings in the components, translated later.

## Decision

Option 1. Every user-facing string lives in `src/i18n/en.ts` under a dotted key whose segments are
lower-case or camelCase (`stats.winRate`) and is rendered through `t()`; the two sentences that
contain a link ("Built by {studio}", "© 2026 {studio}") go through `tNodes()`, which splits on the
placeholder and inserts a node, so no sentence is built from fragments. Placeholders are
single-brace, lower-case names (`{puzzle}`, `{seconds}`, `{song}`), which can never be mistaken for
the template's double-brace markers and need no library. One sentence per key, no dynamic key names.
A unit test checks that every key is used and every used key exists, that no value contains a double
brace and that every placeholder matches `{name}`. The privacy page and the README are prose outside
the app and keep their own English.

## Consequences

- Good: a translation is one more dictionary file with the same keys; the test catches a missing
  key at once.
- Bad: plural and gender rules are not modelled; the current strings avoid them, and a language
  that needs them would bring a library at that point.
