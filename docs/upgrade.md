# Upgrading

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Before 1.0.0 a minor
release may contain breaking changes; they are listed under "BREAKING CHANGES" in the
[changelog](../CHANGELOG.md).

## General steps

1. Read the changelog entries between your version and the new one.
2. Back up nothing: the game keeps its data in the player's browser, and a new build keeps the
   local-storage keys compatible or migrates them on the first start.
3. Install the new release (see [Installation](install.md)) and verify its checksum.
4. Run the check from [Installation](install.md) again.

A hosted site is upgraded by deploying the new release archive (see the [runbook](runbook.md)); the
service worker picks up the new build on the next page load, and open tabs keep the old build until
they navigate.

## Version notes

### 0.1.0

First release; no manual steps.
