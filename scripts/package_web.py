#!/usr/bin/env python3
"""Build the web archive of a release and add it to the checksum file (Python standard library only).

Creates, from the exported site (`npm run build` writes it to web-build/):
  dist/<name>-web-<version>.tar.gz   every file of the build folder, dotfiles such as .htaccess
                                     included, under "<name>-web-<version>/" as the top folder
  dist/SHA256SUMS                    one "<sha256>  <file>" line appended (the file is created
                                     when scripts/package_release.py has not written it yet)

The archive is reproducible: entries are sorted, every timestamp is 0, owner and group are
empty, files are 0644 and folders 0755, and the gzip header carries no name and no time. The
same build folder therefore gives the same bytes, which is what the attestation refers to.

Usage: python3 scripts/package_web.py --version 0.1.0 [--name my-project] [--build-dir web-build] [--out dist]
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _entries(build_dir: Path) -> list[Path]:
    """Every folder and file below build_dir, sorted by path (a folder sorts before its content)."""
    found = sorted(build_dir.rglob("*"), key=lambda p: p.relative_to(build_dir).as_posix())
    for p in found:
        if p.is_symlink() or not (p.is_file() or p.is_dir()):
            raise SystemExit(f"error: {p} is neither a regular file nor a folder; an exported site has none")
    return found


def write_archive(build_dir: Path, archive: Path, top: str) -> None:
    """Write build_dir as a reproducible tar.gz with `top/` as the top folder."""
    archive.parent.mkdir(parents=True, exist_ok=True)
    with archive.open("wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode="w", format=tarfile.PAX_FORMAT) as tar:
            _add_entries(tar, build_dir, top)


def _add_entries(tar: tarfile.TarFile, build_dir: Path, top: str) -> None:
    root_info = tarfile.TarInfo(f"{top}/")
    root_info.type = tarfile.DIRTYPE
    _normalise(root_info, directory=True)
    tar.addfile(root_info)
    for path in _entries(build_dir):
        rel = path.relative_to(build_dir).as_posix()
        if path.is_dir():
            info = tarfile.TarInfo(f"{top}/{rel}/")
            info.type = tarfile.DIRTYPE
            _normalise(info, directory=True)
            tar.addfile(info)
        else:
            info = tarfile.TarInfo(f"{top}/{rel}")
            info.type = tarfile.REGTYPE
            info.size = path.stat().st_size
            _normalise(info, directory=False)
            with path.open("rb") as fh:
                tar.addfile(info, fh)


def _normalise(info: tarfile.TarInfo, directory: bool) -> None:
    info.mtime = 0
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mode = 0o755 if directory else 0o644


def append_checksum(sums: Path, archive: Path) -> None:
    """Add the archive's line to SHA256SUMS; a second line for the same name is an error."""
    existing = sums.read_text(encoding="utf-8") if sums.exists() else ""
    names = [line.split("  ", 1)[1].strip() for line in existing.splitlines() if "  " in line]
    if archive.name in names:
        raise SystemExit(f"error: {sums} already lists {archive.name}; remove the old line first")
    with sums.open("a", encoding="utf-8") as fh:
        fh.write(f"{sha256_file(archive)}  {archive.name}\n")


def build(root: Path, build_dir: Path, name: str, version: str, out: Path) -> list[Path]:
    if not NAME_RE.match(name):
        raise SystemExit(f"error: archive name {name!r} must be lower-case letters, digits, '.', '_' or '-'")
    if not VERSION_RE.match(version):
        raise SystemExit(f"error: version {version!r} is not X.Y.Z or X.Y.Z-suffix")
    build_dir = build_dir if build_dir.is_absolute() else root / build_dir
    out = out if out.is_absolute() else root / out
    if not build_dir.is_dir() or not any(build_dir.iterdir()):
        raise SystemExit(f"error: build folder {build_dir} is missing or empty; run `npm run build` first")
    if not (build_dir / "index.html").is_file():
        raise SystemExit(f"error: {build_dir} has no index.html; it is not an exported site")
    out.mkdir(parents=True, exist_ok=True)
    top = f"{name}-web-{version}"
    archive = out / f"{top}.tar.gz"
    sums = out / "SHA256SUMS"
    write_archive(build_dir, archive, top)
    append_checksum(sums, archive)
    return [archive, sums]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    p.add_argument("--version", required=True, help="version in the file name (X.Y.Z or X.Y.Z-suffix)")
    p.add_argument("--name", help="archive name (default: repository folder name)")
    p.add_argument("--build-dir", type=Path, default=Path("web-build"), help="the exported site")
    p.add_argument("--out", type=Path, default=Path("dist"))
    p.add_argument("--root", type=Path, default=ROOT)
    args = p.parse_args(argv)
    root = args.root.resolve()
    name = (args.name or root.name).lower()
    for f in build(root, args.build_dir, name, args.version, args.out):
        print(f"{f.relative_to(root) if f.is_relative_to(root) else f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
