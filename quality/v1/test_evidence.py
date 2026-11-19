import hashlib
import unittest
from jsonschema import ValidationError

from verify_receipt import verify


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.profile = b'{"skills":["example"],"targets":["codex"]}'
        self.rev = "a"*40
        self.row = dict(skill="example", target="codex", status="pass", payload="pass", fileCount=1,
                        entrypointSha256="c"*64, scopedRemoval="pass", projectClean=True)
        self.record = dict(schemaVersion=1, dimension="installer-roundtrip", installerVersion="1.9.0",
                           observedAt="2026-11-19T00:00:00Z", sourceRevision=self.rev,
                           profileSha256=hashlib.sha256(self.profile).hexdigest(), results=[self.row])

    def check(self):
        return verify(self.record, self.profile, self.rev)

    def test_complete_pass(self):
        self.assertTrue(self.check())

    def test_residue_blocks_claim(self):
        self.row.update(status="fail", scopedRemoval="residue")
        self.assertFalse(self.check())

    def test_residue_cannot_pass(self):
        self.row.update(scopedRemoval="residue")
        with self.assertRaises(ValidationError):
            self.check()

    def test_missing_measurement_cannot_pass(self):
        del self.row["payload"]
        with self.assertRaises(ValidationError):
            self.check()

    def test_duplicate_and_missing_cells(self):
        self.record["results"].append(dict(self.row))
        with self.assertRaises(ValueError):
            self.check()
        self.record["results"] = []
        with self.assertRaises(ValidationError):
            self.check()

    def test_wrong_revision_or_profile(self):
        for key in ("sourceRevision", "profileSha256"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify(dict(self.record, **{key:"e"*len(self.record[key])}), self.profile, self.rev)
