# 0011. The web build ships in every release

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The template's release workflow attaches the source archive (`fiveguesses-X.Y.Z.tar.gz`) and
`SHA256SUMS` to a draft release and publishes it in the same run. The site is deployed from a
release, by the deploy workflow or by hand (docs/runbook.md), and should never be built on the
host. With immutable releases nothing can be attached after the release is published, so the built
site has to exist before the publish job runs.

## Considered options

1. Add a Node setup and the web build archive to the `build` job of `reusable-release.yml`.
2. Build the site in the deploy workflow on every deploy.
3. Commit the built site to the repository.

## Decision

Option 1. `.github/workflows/reusable-release.yml` differs from the template copy in two added steps
of the `build` job: a SHA-pinned `actions/setup-node` (version from `.nvmrc`, no dependency cache,
as the zizmor cache-poisoning audit requires in a release workflow) and `scripts/package_web.py`,
which packs `web-build/` into `fiveguesses-web-X.Y.Z.tar.gz` with a deterministic tar and appends
its line to `SHA256SUMS`. The test command of `release.yml` runs `npm ci && npm run check` first,
so the archive is the output of that build. The publish job then attests both archives when the
repository is public at release time; while it is private the attest step is skipped, and
`SHA256SUMS` covers both archives either way. The file is listed as "adapted, not copied" in
`tests/test_template_copies.py`, with this ADR as the reason.

## Consequences

- Good: a deploy verifies and extracts a checksummed archive; the host needs neither Node nor npm.
- Good: the manual path in the runbook is the same files the workflow uses.
- Bad: one reusable workflow is no longer byte-identical to the template; a template update of that
  file has to be merged by hand.
