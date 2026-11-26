import hashlib
import os
import sys
import tempfile
from pathlib import Path
import unittest
from jsonschema import ValidationError

import check_install
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


class InstallerRuntimeTests(unittest.TestCase):
    def test_cli_output_uses_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            command = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(bytes.fromhex('e29c93'))"]
            self.assertEqual(check_install.run(command, directory), "\u2713")

    @unittest.skipUnless(os.name == "nt", "Windows runtime environment")
    def test_windows_child_uses_disposable_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            env = check_install.child_env(home)
            self.assertEqual(env["SystemRoot"], os.environ["SystemRoot"])
            self.assertEqual(Path(env["USERPROFILE"]), home)
            for name in ("APPDATA", "LOCALAPPDATA", "CODEX_HOME", "XDG_CONFIG_HOME"):
                self.assertTrue(Path(env[name]).is_relative_to(home), name)
