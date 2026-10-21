"""The files copied from luminare-dev/oss-template must stay byte-for-byte copies (one source of truth).

Run: python3 -m unittest discover -s tests -v

To update them: copy the files again from the template, then set SOURCE_COMMIT and the hashes
below. When a checkout of the template is available (OSS_TEMPLATE_DIR, default ../oss-template),
the copies are also compared with the files of SOURCE_COMMIT there.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = Path(os.environ.get("OSS_TEMPLATE_DIR", ROOT.parent / "oss-template"))
SOURCE_COMMIT = "ec8a6127d35244d093cbcaa7368b3d27a33c03ce"  # luminare-dev/oss-template, 2026-10-21
COPIES = {
    "scripts/forbidden_words.py": "dd4773373f182e457c0200036e0a010f6df880f506e6b5087f7935255300834e",
    "scripts/set_byline.py": "7655a30b5d00ccdb88fa468e97055ffac8dcf74fa4c6c3f0695eb0af8787f0e1",
    "scripts/check_workflows.py": "3c0a075411d2f0e0143ab130be638d3de7ba3dedc2ce64af19d7f3afb664b247",
    "scripts/check_pr_title.py": "a20da7141a68c291c1c023fab0cd1fb077b718132beae5d69db187bd7322a71d",
    "scripts/package_release.py": "6d4e0baf3169af3b78a8f88e855bce241be949d5c15979211473ae397d351eda",
    "tests/test_forbidden_words.py": "00fba1019c6cd50ba336923ea4fdd8f547234b03fbe94526ce5ba444850a1c7f",
    "tests/test_set_byline.py": "0756ac5d56501fce8d79f0728f3a00bb038075c025449464084df6e2e44c8f8b",
    "tests/test_check_workflows.py": "a8a0fe2caa20cb8168fcd96cd53e2ac09c0ec02ef876b1c5041e9c780c288968",
    "tests/test_check_pr_title.py": "a2a1db6eea4b0f3101831f8e1ffabb5a60f0da770800778d4444f87b3257cd1c",
    "tests/test_package_release.py": "0ac683ef365a542bb75c7ebbab2b05f58240bbfde6f1a0c5a59dcbc2acf912b2",
    "tests/test_repo_config.py": "822db9e66c955a123ec62c0d92f3745036eaf64ded7cd544d7f194967e12d35b",
    # The fixture's name next to a hex value reads like a credential to gitleaks, so the hash
    # sits on its own line.
    "tests/fixtures/secret-placeholders.md":
        "478798cdc7f42e8aa8123f4776f1433e49845ecbb374f917aca4eed9f04f72b8",
    ".github/workflows/pr-title.yml": "2e6c2aa6b2eef94c5c2a22a30482d9650aab86ff9de88a6a18ba4c7ebf61db6b",
    ".github/workflows/reusable-ci.yml": "c9c99667f9389f4c64f8716ea36623a72db682e996d6d1c2f7b6f6f3f3a65af9",
    ".github/workflows/reusable-gitleaks.yml": "696a42a07731eaa36bd2237e7f7853cb1c664306b51a7d84e156d3d0f069abf6",
    ".github/workflows/reusable-scorecard.yml": "7a9963872ade0c5da4d330f91aa502ee0169da778b90a03659bad731954c4ddf",
    ".github/zizmor.yml": "6cbaf078980e87dd4cd0de7837f143cac4d669bf029dfa66887f61f1fc04c577",
    ".github/CODEOWNERS": "82584dcce8af50ee68a2877e9b88e2fb69ffd8fc09c18787b8bbae947b07d627",
    ".gitleaks.toml": "0e9a0915d0bc2636c6b59f8d0c8631fb64def2d9224f7c99b9e4709dc7d62d72",
    ".yamllint.yml": "ac04d11a9f57f9e7cdea327cb4300b7f2a331090bc7c3d58096983a09168cb0d",
    ".markdownlint-cli2.jsonc": "98b4a385ce8d3213c89461ff7b211fa7cacd5d984a878730c972be24451f6c90",
    "requirements-dev.txt": "fe5ad61136adb4271c27dd90045fe19152dd0432ced703f2821132689abee8ae",
    "docs/adr/0000-template.md": "baec9bb4c481ec3ecef0787820461cbb552e6ae2dfe7ba7f1a86b9b4fb836d49",
    "docs/adr/0001-record-architecture-decisions.md": "f092a2c84d1bf9cd018943b83ca5e73edd3896370fca6849a51c29d10a661b8f",
    "docs/adr/0002-pin-actions-and-downloaded-tools.md": "0e9d3e07e76d37a54840cf02e8dec6575669ee5a1f3fdc62e5e674ecd7c72967",
    "docs/adr/0003-secret-scanning-with-the-gitleaks-binary.md": "11a1cd818d382c1ae323baf45530ad9a4abc2b3061ee41920a1b6df981bde9bd",
    "docs/adr/0004-draft-releases-with-checksums-and-provenance.md": "5e4a1cf5e7631882b2a6de47c554e23d5fcd75fca37c623009085973798b464d",
}
# Adapted, not copied: .github/workflows/ci.yml (adds the "web" job), release.yml (test command and
# archive name), reusable-release.yml (Node setup and the web build archive); see docs/adr/0005+.
# scorecard.yml adds the "visibility" job, which reads the visibility from the API because the
# payload of a scheduled run carries no repository; the scorecard job runs only when that job reads
# "private": false (docs/adr/0012-logic-tests-in-jest-ui-tests-in-playwright.md). Two tests below
# check the difference.
# release-please-config.json is not in COPIES either: it keeps every template value and adds the
# two "extra-files" entries that bump package.json and app.json with version.txt
# (docs/adr/0012-logic-tests-in-jest-ui-tests-in-playwright.md); the test below checks it key by key.

# sha256 of the template's .github/workflows/scorecard.yml at SOURCE_COMMIT. Our scorecard.yml,
# with the visibility check taken out again (_scorecard_without_the_visibility_check), must hash to
# it, so a drift is caught even where no template checkout exists (CI).
TEMPLATE_SCORECARD_SHA256 = "dc1ef96aa1a8105d87c991c894aeecf8582cb28be2b7d09c16644dedee0b621e"

# The template's release-please-config.json at SOURCE_COMMIT, as data.
TEMPLATE_RELEASE_CONFIG = {
    "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "release-type": "simple",
    "include-v-in-tag": True,
    "bump-minor-pre-major": True,
    "bump-patch-for-minor-pre-major": False,
    "initial-version": "0.1.0",
    "draft": True,
    "force-tag-creation": True,
    "signoff": "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
    "changelog-path": "CHANGELOG.md",
    "changelog-sections": [
        {"type": "feat", "section": "Added"},
        {"type": "fix", "section": "Fixed"},
        {"type": "perf", "section": "Changed"},
        {"type": "security", "section": "Security"},
        {"type": "revert", "section": "Reverted"},
        {"type": "docs", "section": "Documentation", "hidden": True},
        {"type": "refactor", "section": "Refactoring", "hidden": True},
        {"type": "test", "section": "Tests", "hidden": True},
        {"type": "style", "section": "Style", "hidden": True},
        {"type": "build", "section": "Build", "hidden": True},
        {"type": "ci", "section": "CI", "hidden": True},
        {"type": "chore", "section": "Maintenance", "hidden": True},
    ],
    "packages": {".": {}},
}
EXTRA_FILES = [
    {"type": "json", "path": "package.json", "jsonpath": "$.version"},
    {"type": "json", "path": "app.json", "jsonpath": "$.expo.version"},
]


def _template_file(rel: str) -> bytes | None:
    try:
        out = subprocess.run(["git", "-C", str(TEMPLATE), "show", f"{SOURCE_COMMIT}:{rel}"],
                             capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout


def _scorecard_without_the_visibility_check() -> list[str]:
    """Our scorecard.yml with the header lines, "needs: visibility", the visibility job and the new
    guard turned back into the template's text."""
    ours = (ROOT / ".github/workflows/scorecard.yml").read_text(encoding="utf-8").splitlines()
    extra = [i for i, line in enumerate(ours) if line.startswith("# From luminare-dev/oss-template")]
    extra.append(extra[0] + 1)  # the header comment's second line
    extra.append(ours.index("    needs: visibility"))
    start = ours.index("  visibility:")
    extra += range(start - 1, len(ours))  # the blank line before "  visibility:" and the whole job
    stripped = [line for i, line in enumerate(ours) if i not in extra]
    guard = stripped.index("    if: ${{ needs.visibility.outputs.private == 'false' }}")
    stripped[guard] = "    if: ${{ !github.event.repository.private }}"
    return stripped


class TestTemplateCopies(unittest.TestCase):
    def test_copies_match_the_pinned_hashes(self):
        for rel, want in COPIES.items():
            got = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()
            self.assertEqual(got, want, f"{rel} differs from the template copy; copy it again instead of editing it")

    @unittest.skipUnless((TEMPLATE / ".git").exists(), "no oss-template checkout (set OSS_TEMPLATE_DIR)")
    def test_copies_match_the_source_commit(self):
        if _template_file("README.md") is None:
            self.skipTest(f"{TEMPLATE} does not contain commit {SOURCE_COMMIT[:12]}")
        for rel in COPIES:
            self.assertEqual((ROOT / rel).read_bytes(), _template_file(rel), rel)

    @unittest.skipUnless((TEMPLATE / ".git").exists(), "no oss-template checkout (set OSS_TEMPLATE_DIR)")
    def test_ci_caller_differs_from_the_template_only_in_the_web_job(self):
        template_ci = _template_file(".github/workflows/ci.yml")
        if template_ci is None:
            self.skipTest(f"{TEMPLATE} does not contain commit {SOURCE_COMMIT[:12]}")
        ours = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8").splitlines()
        extra = [i for i, line in enumerate(ours) if line.startswith("# From luminare-dev/oss-template")]
        start = ours.index("  web:")
        extra += range(start - 1, len(ours))  # the blank line before "  web:" and the whole job
        stripped = [line for i, line in enumerate(ours) if i not in extra]
        self.assertEqual(stripped, template_ci.decode("utf-8").splitlines())

    @unittest.skipUnless((TEMPLATE / ".git").exists(), "no oss-template checkout (set OSS_TEMPLATE_DIR)")
    def test_scorecard_caller_differs_from_the_template_only_in_the_visibility_check(self):
        template_scorecard = _template_file(".github/workflows/scorecard.yml")
        if template_scorecard is None:
            self.skipTest(f"{TEMPLATE} does not contain commit {SOURCE_COMMIT[:12]}")
        self.assertEqual(_scorecard_without_the_visibility_check(), template_scorecard.decode("utf-8").splitlines())

    def test_scorecard_caller_without_the_visibility_check_hashes_to_the_template_file(self):
        text = "\n".join(_scorecard_without_the_visibility_check()) + "\n"
        self.assertEqual(hashlib.sha256(text.encode("utf-8")).hexdigest(), TEMPLATE_SCORECARD_SHA256,
                         "scorecard.yml differs from the template beyond the visibility check")

    def test_scorecard_caller_skips_private_repositories_on_every_trigger(self):
        # "scorecard / analysis" keeps its name; the guard reads the visibility from the API, with a
        # read-only token, instead of the event payload, which a scheduled run does not have.
        sc = (ROOT / ".github/workflows/scorecard.yml").read_text(encoding="utf-8")
        self.assertRegex(sc, r"(?m)^name: scorecard$")
        self.assertRegex(sc, r"(?m)^  scorecard:\n(?:    #.*\n)*    needs: visibility\n"
                             r"    if: \$\{\{ needs\.visibility\.outputs\.private == 'false' \}\}\n"
                             r"    uses: \./\.github/workflows/reusable-scorecard\.yml$")
        job = sc.split("\n  visibility:\n", 1)[1]
        self.assertRegex(job, r"(?m)^    permissions:\n      contents: read +#")
        self.assertNotRegex(job, r"(?m)^ +[a-z-]+: write")
        self.assertRegex(job, r"(?m)^      private: \$\{\{ steps\.repo\.outputs\.private \}\}$")
        self.assertIn('private="$(gh api "repos/$GITHUB_REPOSITORY" --jq .private)"', job)

    def test_ci_caller_keeps_the_job_ids_of_the_required_checks(self):
        # The ruleset requires "ci / lint-test", "secrets / gitleaks", "pr / pr-title" and "web".
        ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        pr = (ROOT / ".github/workflows/pr-title.yml").read_text(encoding="utf-8")
        self.assertRegex(ci, r"(?m)^  ci:\n    uses: \./\.github/workflows/reusable-ci\.yml$")
        self.assertRegex(ci, r"(?m)^  secrets:\n    uses: \./\.github/workflows/reusable-gitleaks\.yml$")
        self.assertRegex(ci, r"(?m)^  web:\n    name: web$")
        self.assertRegex(pr, r"(?m)^  pr:\n    uses: \./\.github/workflows/reusable-ci\.yml$")

    def test_release_config_keeps_the_template_values_and_adds_extra_files(self):
        # Every key of the template file is kept with its value; the one deviation is the
        # "extra-files" list of the root package, which release-please bumps with version.txt.
        ours = json.loads((ROOT / "release-please-config.json").read_text(encoding="utf-8"))
        want = dict(TEMPLATE_RELEASE_CONFIG, packages={".": {"extra-files": EXTRA_FILES}})
        self.assertEqual(ours, want)
        self.assertEqual(ours["packages"]["."]["extra-files"], EXTRA_FILES)
        if (TEMPLATE / ".git").exists() and (template_config := _template_file("release-please-config.json")):
            self.assertEqual(json.loads(template_config), TEMPLATE_RELEASE_CONFIG,
                             "the template's release-please-config.json changed; update TEMPLATE_RELEASE_CONFIG")


if __name__ == "__main__":
    unittest.main()
