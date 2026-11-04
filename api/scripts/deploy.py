#!/usr/bin/env python3
"""Deploys api/src to the Cloudflare Worker fiveguesses-api at api.fiveguesses.app.

Stdlib only, no wrangler. Reads CLOUDFLARE_API_TOKEN and YOUTUBE_API_KEY from the environment
and never prints them; prints only HTTP status codes and Cloudflare error messages.

Usage:
  set -a; . /path/to/fiveguesses.env; set +a
  python3 -I api/scripts/deploy.py [--no-secret] [--no-domain] [--no-wait]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://api.cloudflare.com/client/v4"
ACCOUNT_NAME = "Pauls Account"
ZONE = "fiveguesses.app"
SCRIPT = "fiveguesses-api"
HOST = "api.fiveguesses.app"
MIGRATION_TAG = "v1"
COMPATIBILITY_DATE = "2026-10-01"
SRC = Path(__file__).resolve().parent.parent / "src"


def build_metadata(first: bool) -> dict:
    meta = {
        "main_module": "index.mjs",
        "compatibility_date": COMPATIBILITY_DATE,
        "bindings": [
            {"type": "durable_object_namespace", "name": "ROOMS", "class_name": "Room"},
            # Per IP: 20 API calls and 60 room connections a minute.
            {"type": "ratelimit", "name": "RL", "namespace_id": "1001", "simple": {"limit": 20, "period": 60}},
            {"type": "ratelimit", "name": "RL_WS", "namespace_id": "1002", "simple": {"limit": 60, "period": 60}},
        ],
        "keep_bindings": ["secret_text"],
        "observability": {"enabled": False},
    }
    if first:
        # Workers Free: SQLite-backed Durable Objects only.
        meta["migrations"] = {"new_tag": MIGRATION_TAG, "new_sqlite_classes": ["Room"]}
    return meta


def multipart(parts: list[tuple[str, str, str, bytes]], boundary: str) -> bytes:
    """parts: (name, filename, content type, body)."""
    out = bytearray()
    for name, filename, ctype, body in parts:
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        out += f"Content-Type: {ctype}\r\n\r\n".encode()
        out += body + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out)


def script_parts(first: bool, src: Path = SRC) -> list[tuple[str, str, str, bytes]]:
    parts = [("metadata", "metadata.json", "application/json", json.dumps(build_metadata(first)).encode())]
    for f in sorted(src.glob("*.mjs")):
        parts.append((f.name, f.name, "application/javascript+module", f.read_bytes()))
    return parts


class CloudflareError(Exception):
    pass


def call(method: str, path: str, token: str, body: bytes | None = None, ctype: str = "application/json"):
    req = urllib.request.Request(f"{API}{path}", data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status, data = r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            data = json.loads(e.read() or b"{}")
        except ValueError:
            data = {}
    msgs = "; ".join(str(x.get("message")) for x in data.get("errors") or [])
    print(f"{method} {path.split('?')[0]} -> {status}{' ' + msgs if msgs else ''}", flush=True)
    if not data.get("success"):
        raise CloudflareError(msgs or f"HTTP {status}")
    return data.get("result")


def wait_for_health(timeout: int = 600) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            # Cloudflare answers 403 to the default Python-urllib user agent.
            req = urllib.request.Request(f"https://{HOST}/api/health", headers={"User-Agent": "fiveguesses-deploy/1.0"})
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200 and json.loads(r.read()) == {"ok": True}:
                    print("health ok", flush=True)
                    return True
        except Exception as e:  # noqa: BLE001 - DNS and certificate take a while
            print(f"health: {type(e).__name__}", flush=True)
        time.sleep(10)
    return False


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-secret", action="store_true", help="keep the YOUTUBE_API_KEY already set")
    ap.add_argument("--no-domain", action="store_true", help="upload only; leave the custom domain as it is")
    ap.add_argument("--no-wait", action="store_true", help="do not poll /api/health")
    args = ap.parse_args(argv)
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        print("CLOUDFLARE_API_TOKEN is not set", file=sys.stderr)
        return 2
    try:
        accounts = call("GET", "/accounts", token)
        acct = next(a["id"] for a in accounts if a["name"] == ACCOUNT_NAME)
        zone = call("GET", f"/zones?name={ZONE}", token)[0]["id"]
        scripts = call("GET", f"/accounts/{acct}/workers/scripts", token) or []
        current = next((s for s in scripts if s.get("id") == SCRIPT), None)
        first = not current or current.get("migration_tag") != MIGRATION_TAG
        print(f"script {'new' if not current else 'exists'}, migration {'included' if first else 'done'}")
        boundary = uuid.uuid4().hex
        body = multipart(script_parts(first), boundary)
        call("PUT", f"/accounts/{acct}/workers/scripts/{SCRIPT}", token, body, f"multipart/form-data; boundary={boundary}")
        if not args.no_secret:
            key = os.environ.get("YOUTUBE_API_KEY", "")
            if key:
                secret = json.dumps({"name": "YOUTUBE_API_KEY", "text": key, "type": "secret_text"}).encode()
                call("PUT", f"/accounts/{acct}/workers/scripts/{SCRIPT}/secrets", token, secret)
            else:
                print("YOUTUBE_API_KEY not set, secret skipped")
        if args.no_domain:
            return 0
        domain = {"hostname": HOST, "service": SCRIPT, "zone_id": zone, "environment": "production"}
        try:
            call("PUT", f"/accounts/{acct}/workers/domains", token, json.dumps(domain).encode())
        except CloudflareError as e:
            if "environment" not in str(e).lower():
                raise
            del domain["environment"]
            call("PUT", f"/accounts/{acct}/workers/domains", token, json.dumps(domain).encode())
        try:
            call("POST", f"/accounts/{acct}/workers/scripts/{SCRIPT}/subdomain", token, b'{"enabled":false}')
        except CloudflareError:
            pass
    except CloudflareError as e:
        print(f"deploy failed: {e}", file=sys.stderr)
        return 1
    except (StopIteration, IndexError, KeyError, TypeError):
        print("account or zone not found", file=sys.stderr)
        return 1
    if args.no_wait:
        return 0
    return 0 if wait_for_health() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
