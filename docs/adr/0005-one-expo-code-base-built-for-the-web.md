# 0005. One Expo code base, built for the web first

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The game started as an Expo SDK 57 project (React Native 0.86, react-native-web 0.21, TypeScript
6). The web build is the only target that is hosted (fiveguesses.app). The forces: the existing
code works and exports to one static bundle, React Native's accessibility props map to ARIA on the
web, a native build stays possible later, and a rewrite would spend the time that the missing
features (tests, accessibility, offline shell, theme) need.

## Considered options

1. Keep Expo with react-native-web and treat the web as the one tested and released target.
2. Rewrite the UI as a plain React web app and drop React Native.
3. Keep Expo and also test and release the iOS and Android builds.

## Decision

Option 1. `scripts/build-web.mjs` runs the Expo web export into `web-build/`, copies the font next
to the bundle and finishes the service worker; `npm run check` type-checks, runs Jest and builds;
Playwright tests the built site. The native configuration stays in `app.json` but is neither tested
nor claimed anywhere. The Sora font is applied on the web through a CSS `@font-face` rule (no
`expo-font`); loading it in a native build is future work.

## Consequences

- Good: one code base, one bundle, and the accessibility work (`role`, `aria-*`) is written once.
- Good: the release carries a ready-to-serve site, and a web server needs nothing but static files.
- Bad: react-native-web adds weight to the bundle and a few web-only props need a type augmentation
  (`src/types/react-native-web.ts`); both are contained and measured in the README "Results".
