"""Tests for scripts/package_web.py."""

from __future__ import annotations

import hashlib
import io
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import package_web as pw  # noqa: E402


def scratch_site() -> Path:
    """A repository folder with a small exported site in web-build/ and a file outside it."""
    tmp = Path(tempfile.mkdtemp(prefix="pkg-web-test-"))
    unittest.addModuleCleanup(shutil.rmtree, tmp, ignore_errors=True)
    repo = tmp / "demo-project"
    site = repo / "web-build"
    (site / "_expo" / "static" / "js" / "web").mkdir(parents=True)
    (site / "legal").mkdir()
    (site / "index.html").write_text("<!doctype html><title>demo</title>\n", encoding="utf-8")
    (site / ".htaccess").write_text("Options -Indexes\n", encoding="utf-8")
    (site / "_expo" / "static" / "js" / "web" / "index-0123456789abcdef0123456789abcdef.js").write_bytes(b"x" * 5000)
    (site / "legal" / "index.html").write_text("<!doctype html><title>legal</title>\n", encoding="utf-8")
    (repo / "README.md").write_text("# demo\n", encoding="utf-8")
    (repo / "secret.txt").write_text("not in the archive\n", encoding="utf-8")
    return repo


def member_names(archive: Path) -> list[str]:
    with tarfile.open(archive) as tar:
        return sorted(tar.getnames())


class PackageWebTest(unittest.TestCase):
    def test_archive_name_top_folder_and_content(self):
        repo = scratch_site()
        archive, sums = pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))
        self.assertEqual(archive, repo / "dist" / "demo-project-web-0.1.0.tar.gz")
        self.assertEqual(sums, repo / "dist" / "SHA256SUMS")
        names = member_names(archive)
        self.assertIn("demo-project-web-0.1.0/index.html", names)
        self.assertIn("demo-project-web-0.1.0/.htaccess", names)
        self.assertIn("demo-project-web-0.1.0/legal/index.html", names)
        self.assertIn("demo-project-web-0.1.0/_expo/static/js/web/index-0123456789abcdef0123456789abcdef.js", names)
        self.assertTrue(all(n == "demo-project-web-0.1.0" or n.startswith("demo-project-web-0.1.0/") for n in names), names)
        self.assertFalse(any(n.endswith("README.md") or n.endswith("secret.txt") for n in names), names)
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                self.assertEqual(member.mtime, 0, member.name)
                self.assertEqual((member.uid, member.gid, member.uname, member.gname), (0, 0, "", ""), member.name)
                self.assertEqual(member.mode, 0o755 if member.isdir() else 0o644, member.name)
            data = tar.extractfile("demo-project-web-0.1.0/.htaccess")
            assert data is not None
            self.assertEqual(data.read(), b"Options -Indexes\n")

    def test_checksum_line_and_sha256sum(self):
        repo = scratch_site()
        archive, sums = pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        self.assertEqual(sums.read_text(encoding="utf-8"), f"{digest}  demo-project-web-0.1.0.tar.gz\n")
        check = subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=repo / "dist", capture_output=True, text=True)
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)

    def test_line_is_appended_after_the_source_archive_line(self):
        repo = scratch_site()
        out = repo / "dist"
        out.mkdir()
        source = out / "demo-project-0.1.0.tar.gz"
        source.write_bytes(b"source archive stand-in\n")
        first = f"{hashlib.sha256(source.read_bytes()).hexdigest()}  demo-project-0.1.0.tar.gz\n"
        (out / "SHA256SUMS").write_text(first, encoding="utf-8")
        archive, sums = pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))
        lines = sums.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0] + "\n", first)
        self.assertEqual(lines[1], f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  demo-project-web-0.1.0.tar.gz")
        check = subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=out, capture_output=True, text=True)
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)

    def test_reproducible(self):
        repo = scratch_site()
        a = pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist-a"))[0].read_bytes()
        b = pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist-b"))[0].read_bytes()
        self.assertEqual(a, b)

    def test_duplicate_checksum_line_is_an_error(self):
        repo = scratch_site()
        pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))

    def test_missing_index_html_is_an_error(self):
        repo = scratch_site()
        (repo / "web-build" / "index.html").unlink()
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("web-build"), "demo-project", "0.1.0", Path("dist"))

    def test_missing_or_empty_build_dir_is_an_error(self):
        repo = scratch_site()
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("not-there"), "demo-project", "0.1.0", Path("dist"))
        (repo / "empty").mkdir()
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("empty"), "demo-project", "0.1.0", Path("dist"))

    def test_bad_name_and_bad_version(self):
        repo = scratch_site()
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("web-build"), "Bad Name", "0.1.0", Path("dist"))
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("web-build"), "demo-project", "v0.1.0", Path("dist"))
        with self.assertRaises(SystemExit):
            pw.build(repo, Path("web-build"), "demo-project", "0.1", Path("dist"))

    def test_cli_defaults_and_output(self):
        repo = scratch_site()
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = pw.main(["--version", "0.2.0-rc.1", "--root", str(repo)])
        self.assertEqual(code, 0)
        self.assertEqual(buf.getvalue().splitlines(), ["dist/demo-project-web-0.2.0-rc.1.tar.gz", "dist/SHA256SUMS"])
        self.assertTrue((repo / "dist" / "demo-project-web-0.2.0-rc.1.tar.gz").is_file())


if __name__ == "__main__":
    unittest.main()
