"""Tests for api/scripts/deploy.py and api/scripts/resolve_categories.py."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api" / "scripts"))

import deploy  # noqa: E402
import resolve_categories as rc  # noqa: E402


class DeployTest(unittest.TestCase):
    def test_metadata_has_the_migration_only_on_the_first_deploy(self):
        first, later = deploy.build_metadata(True), deploy.build_metadata(False)
        self.assertEqual(first["migrations"], {"new_tag": "v1", "new_sqlite_classes": ["Room"]})
        self.assertNotIn("migrations", later)
        for meta in (first, later):
            self.assertEqual(meta["main_module"], "index.mjs")
            self.assertEqual(meta["keep_bindings"], ["secret_text"])
            self.assertEqual(
                meta["bindings"], [{"type": "durable_object_namespace", "name": "ROOMS", "class_name": "Room"}]
            )

    def test_multipart_parts_and_content_types(self):
        parts = deploy.script_parts(False)
        names = [p[0] for p in parts]
        self.assertEqual(names[0], "metadata")
        self.assertIn("index.mjs", names)
        self.assertIn("room.mjs", names)
        self.assertEqual(parts[0][2], "application/json")
        self.assertTrue(all(p[2] == "application/javascript+module" for p in parts[1:]))
        body = deploy.multipart(parts[:2], "b0undary").decode("utf-8")
        self.assertTrue(body.startswith("--b0undary\r\n"))
        self.assertTrue(body.endswith("--b0undary--\r\n"))
        self.assertIn('Content-Disposition: form-data; name="metadata"; filename="metadata.json"\r\n', body)
        self.assertIn(f'name="{parts[1][0]}"; filename="{parts[1][0]}"\r\nContent-Type: application/javascript+module', body)
        meta = body.split("\r\n\r\n", 1)[1].split("\r\n--b0undary", 1)[0]
        self.assertEqual(json.loads(meta)["compatibility_date"], deploy.COMPATIBILITY_DATE)


def res(track_id, artist, track, collection="Album"):
    return {"trackId": track_id, "artistName": artist, "trackName": track, "collectionName": collection,
            "previewUrl": "https://audio-ssl.itunes.apple.com/x.m4a"}


class ResolverTest(unittest.TestCase):
    def test_seed_lines(self):
        allow, seeds = rc.parse_seeds("# allow: instrumental\n# comment\n\na-ha - Take On Me\nAC/DC - Back In Black - Live\n")
        self.assertTrue(allow)
        self.assertEqual(seeds, [("a-ha", "Take On Me"), ("AC/DC", "Back In Black - Live")])
        self.assertFalse(rc.parse_seeds("Nena - 99 Luftballons\n")[0])
        with self.assertRaises(ValueError):
            rc.parse_seeds("no dash here\n")

    def test_pick_match(self):
        results = [res(1, "Karaoke Hits", "Take On Me"), res(2, "a-ha", "Take On Me (Live)"), res(3, "a-ha", "Take On Me")]
        self.assertEqual(rc.pick_match(results, "a-ha", "Take On Me")["trackId"], 3)
        self.assertIsNone(rc.pick_match([res(4, "a-ha", "Take On Me (Remix)")], "a-ha", "Take On Me"))
        self.assertIsNone(rc.pick_match([res(5, "a-ha", "Take On Me", "Tribute Album")], "a-ha", "Take On Me"))
        credit = res(6, "Mark Ronson", "Uptown Funk (feat. Bruno Mars)")
        self.assertEqual(rc.pick_match([credit], "Mark Ronson", "Uptown Funk"), credit)

    def test_instrumental_allowed_only_when_asked(self):
        theme = [res(7, "Koji Kondo", "Super Mario Bros. Theme", "Instrumental Hits")]
        self.assertIsNone(rc.pick_match(theme, "Koji Kondo", "Super Mario Bros. Theme"))
        self.assertEqual(rc.pick_match(theme, "Koji Kondo", "Super Mario Bros. Theme", rc.bad_regex(True))["trackId"], 7)


if __name__ == "__main__":
    unittest.main()
