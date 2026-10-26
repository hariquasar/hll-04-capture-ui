import copy
import csv
import json
from pathlib import Path
import tempfile
import unittest
import uuid

import export_results as export
from test_handler import payload


class Reader:
    def __init__(self, withdrawn=False, withdraw_during=False, missing=False):
        sid = str(uuid.uuid4()); rid = str(uuid.uuid4())
        self.key = f"records/{sid}/0001-{rid}-{'a' * 64}.json"
        self.meta = {"session_id": sid, "participant_code": "S001", "synthetic": True, "order": ["baseline", "guided"], "status": "withdrawn" if withdrawn else "active", "config_version": export.VERSION, "created_at": "2026-10-21T00:00:00Z", "updated_at": "2026-10-21T00:00:00Z", "consent": {"agreed": True}, "environment": {"platform": "test"}, "sequence": 1, "latest_key": self.key, "cleanup_pending": False, "token_hash": "MUST NOT EXPORT"}
        self.document_value = {"schema": "hll04.remote.record.v1", "config_version": export.VERSION, "session_id": sid, "participant_code": "S001", "synthetic": True, "order": ["baseline", "guided"], "sequence": 1, "server_received_at": "2026-10-21T00:00:00Z", "payload": payload()}
        self.document_value["payload"]["conditions"]["baseline"]["comments"] = "=1+1"
        self.withdraw_during, self.missing, self.downloads, self.reads = withdraw_during, missing, 0, 0

    def sessions(self): return [copy.deepcopy(self.meta)]
    def session(self, sid):
        self.reads += 1
        if self.withdraw_during and self.reads > 1: self.meta["status"] = "withdrawn"
        return copy.deepcopy(self.meta)
    def receipts(self, sid): return [{"ack": {"sequence": 1}, "object_key": self.key}]
    def document(self, key, sid, path):
        self.downloads += 1
        if self.missing: raise RuntimeError("object no longer available")
        export.private_write(path, self.document_value)
        return copy.deepcopy(self.document_value)


class ExportTests(unittest.TestCase):
    def test_formula_escape_reversible_with_raw_json(self):
        for raw in ("=1+1", "+SUM(1,1)", "-1+1", "@SUM(1,1)", "  =1+1", "\ttext", "\rtext", "\ntext", "'=1+1"):
            self.assertEqual(export.safe_cell(raw), "'" + raw)
        for raw in ("good", "Lab B5", "He said \"good\"\nnext line"):
            self.assertEqual(export.safe_cell(raw), raw)

    def test_export_private_complete_history_and_raw_latest_no_credentials(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "new"; reader = Reader()
            manifest = export.export(reader, out)
            sessions = json.loads((out / "sessions.json").read_text())
            self.assertEqual(manifest["acknowledged_checkpoint_files"], 1)
            self.assertEqual(sessions[0]["latest"]["payload"]["conditions"]["baseline"]["comments"], "=1+1")
            with (out / "blocks.csv").open(encoding="utf-8-sig") as stream:
                self.assertEqual(next(csv.DictReader(stream))["comments"], "'=1+1")
            for path in out.rglob("*"):
                if path.is_file():
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                    self.assertNotIn("MUST NOT EXPORT", path.read_text())
            with self.assertRaises(ValueError): export.export(reader, out)

    def test_withdrawn_never_downloads(self):
        with tempfile.TemporaryDirectory() as d:
            reader = Reader(withdrawn=True); out = Path(d) / "new"
            result = export.export(reader, out)
            self.assertEqual(reader.downloads, 0)
            self.assertEqual(result["withdrawn_sessions"], 1)
            session = json.loads((out / "sessions.json").read_text())[0]
            self.assertIsNone(session["latest"]); self.assertEqual(session["environment"], {})

    def test_withdrawal_during_download_removes_raw_files_and_missing_object_not_failure(self):
        for missing in (False, True):
            with tempfile.TemporaryDirectory() as d:
                reader = Reader(withdraw_during=True, missing=missing); out = Path(d) / "new"
                result = export.export(reader, out)
                self.assertEqual(result["acknowledged_checkpoint_files"], 0)
                self.assertFalse(list(out.glob("sessions/*/checkpoints/*.json")))
                self.assertIsNone(json.loads((out / "sessions.json").read_text())[0]["latest"])

    def test_unavailable_acknowledged_object_fails_without_success_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "new"
            with self.assertRaises(RuntimeError): export.export(Reader(missing=True), out)
            self.assertFalse((out / "export-manifest.json").exists())

    def test_untrusted_object_key_cannot_escape_session_directory(self):
        reader = Reader()
        for bad in ("../private.json", reader.key.replace(reader.meta["session_id"], str(uuid.uuid4())), reader.key + "/../x"):
            with self.assertRaises(ValueError): export.validate_object_key(bad, reader.meta["session_id"])

    def test_private_scan_projection_excludes_credentials_and_no_public_auth(self):
        self.assertNotIn("token_hash", export.AWSReader.projection()[-1])
        self.assertNotIn("create_sha256", export.AWSReader.projection()[-1])
        with self.assertRaises(ValueError): export.AWSReader({"profile": "default", "region": "us-east-1"})
        self.assertEqual(export.plain({"M": {"answer": {"N": "3"}, "flag": {"BOOL": True}}}), {"answer": 3, "flag": True})


if __name__ == "__main__": unittest.main(verbosity=2)
