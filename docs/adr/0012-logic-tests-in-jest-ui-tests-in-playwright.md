# 0012. Logic tests in Jest, UI tests in Playwright

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The game logic (puzzle number, daily pick, matching, the round reducer, statistics, storage, share
text, the snippet controller) is pure and fast to test in Node. The UI behaviour that matters most
(keyboard control, ARIA roles and names, the live region, the themes, the offline shell, the
Content-Security-Policy) only shows in a real browser. ADR 0002 pins every downloaded tool by
version and checksum; a browser download has no checksum of its own.

## Considered options

1. Jest for the pure modules and Playwright with axe for the built site in Chromium.
2. A React Native testing library for component tests and no browser tests.
3. Browser tests only.

## Decision

Option 1. Jest (`jest-expo` 57.0.6, `jest` 29.7.0) runs `src/**/__tests__/*.test.ts` with the time
zone pinned to Europe/Vienna, so the daylight-saving cases are deterministic. Playwright
(`@playwright/test` 1.56.1) with `@axe-core/playwright` runs `e2e/*.spec.ts` against `web-build/`
served by Python's `http.server`, with the clock fixed, the preview and artwork hosts stubbed
in-process, and no request to any other host. Outside CI the tests use the binary at
`PW_CHROMIUM_PATH` (default `/opt/pw-browsers/chromium`) when that file exists, otherwise the
Chromium that `npx playwright install chromium` provides; CI ignores the variable, and the `web`
job runs the same install command with `--with-deps`. That download is the one tool CI fetches without a
checksum of its own: each Playwright version maps to exactly one Chromium build, and the version is
pinned in `package-lock.json`, so the build is pinned indirectly; this is the recorded exception to
ADR 0002.

Release automation: `release-please-config.json` keeps every value of the template and adds two
`extra-files` entries so that `package.json` (`$.version`) and `app.json` (`$.expo.version`) are
bumped together with `version.txt`; `tests/test_template_copies.py` checks the file key by key
instead of by hash. `npm ci` was verified to pass, with an unchanged lockfile, when the version in
`package.json` differs from the root version recorded in `package-lock.json`, so a release bump
does not break the install.

Dependency updates: the files copied from the template are pinned by hash in
`tests/test_template_copies.py`, so a Dependabot edit of them would fail `ci / lint-test`.
`.github/dependabot.yml` therefore leaves them out (the copied workflows and `scorecard.yml` through
`exclude-paths`, `requirements-dev.txt` by having no `pip` entry); they are updated by copying them
again from the template, which receives the same updates. This is the second recorded exception to
ADR 0002. The `npm` entry ignores the updates Expo SDK 57 does not take (new minor versions of the
packages the SDK pins, and the majors of `jest-expo`, Jest, TypeScript and the Node types); an SDK
upgrade goes through `npx expo install --fix`.

Scorecard while the repository is private: the payload of a scheduled run carries no repository,
so the template's guard `if: ${{ !github.event.repository.private }}` is true on the weekly run and
the analysis would run, and fail, in a private repository. `.github/workflows/scorecard.yml`
therefore differs from the template copy in one added job and the guard of the `scorecard` job:
the `visibility` job reads the repository's visibility with `gh api` and a read-only token, and the
`scorecard` job needs it and runs only when it reports `private` as `false`, on every trigger. The
job id and the check name `scorecard / analysis` stay the same. `tests/test_template_copies.py`
lists the file as adapted instead of pinning its hash and checks that nothing else differs from the
template. The file stays in Dependabot's `exclude-paths`; it uses no remote action.

## Consequences

- Good: logic tests run in seconds; browser tests prove the accessibility contract and the offline
  shell on the real build.
- Good: a Dependabot bump of `@playwright/test` moves the lockfile and the CI browser together.
- Bad: the e2e suite needs a browser and takes about a minute; the CI browser download is pinned
  by version only, not by checksum.
- Bad: the pins in the copied workflows and `requirements-dev.txt` stay where they are until the
  files are copied again from the template.
- Bad: `scorecard.yml` is no longer byte-identical to the template; a template update of that file
  has to be merged by hand.
