import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid

from handler import App, APIError, Conflict, VERSION, CONSENT_VERSION, digest, iso, MAX_BODY
import deploy
import handler

ORIGIN = "https://main.d3g93doyp3ywja.amplifyapp.com"
NOW = 1792570000


def record(task="1"):
    return {"record_id": "row-1", "task_id": task, "scenario": "equipment", "location": "Lab B5", "subject_id": "EQ-1021", "condition": "good", "notes": "", "image_file": "task-01.png", "image_sha256": "a" * 64}


def block():
    return {"practice": {"started_at": None, "ended_at": None, "status": "not_started", "duration_ms": 0},
            "status": "not_started", "started_at": None, "ended_at": None, "elapsed_ms": 0, "records": [], "draft": None,
            "export": {"requested_at": None, "sha256": None, "bytes": 0, "download_requested": False, "opened_confirmed": False, "opened_confirmed_at": None},
            "sus": [], "questionnaire_status": "not_started", "comments": ""}


def payload():
    return {"phase": "instructions", "condition_index": 0, "conditions": {"baseline": block(), "guided": block()}, "events": [],
            "interruption_counts": {k: 0 for k in ("blur", "hidden", "reload", "offline", "resize")}, "client_saved_at": iso(NOW)}


class MemoryStore:
    """Deterministic model of the persistence boundary, not evidence about AWS."""
    def __init__(self):
        self.sessions = {}; self.creates = {}; self.requests = {}; self.documents = {}; self.counts = {False: 0, True: 0}; self.rates = {}
        self.lock = threading.Lock(); self.fail_write = False; self.lose_ack = False; self.purge_fail = False; self.before_commit = None

    def get_session(self, sid): return copy.deepcopy(self.sessions.get(sid))
    def get_create(self, key): return self.get_session(self.creates[key]) if key in self.creates else None
    def get_request(self, sid, rid): return copy.deepcopy(self.requests.get((sid, rid)))
    def rate_guard(self, key, limit, window, now):
        key = (key, now // window)
        self.rates[key] = self.rates.get(key, 0) + 1
        if self.rates[key] > limit: raise APIError(429, "rate_limited", "Too many requests")
    def allocate_session(self, key, meta, now, daily_limit):
        with self.lock:
            old = self.get_create(key)
            if old: return old
            group = meta["synthetic"]; self.counts[group] += 1; n = self.counts[group]
            meta = dict(meta, participant_code=("S" if group else "P") + f"{n:03d}", order=["baseline", "guided"] if n % 2 else ["guided", "baseline"])
            self.sessions[meta["session_id"]] = copy.deepcopy(meta); self.creates[key] = meta["session_id"]
            return copy.deepcopy(meta)
    def commit_checkpoint(self, session, document, fingerprint, ack):
        if self.fail_write: raise RuntimeError("Storage write failed")
        if self.before_commit: self.before_commit()
        current = self.sessions[session["session_id"]]
        if current["status"] != "active" or current["sequence"] != document["sequence"] - 1: raise Conflict()
        key = f"records/{session['session_id']}/{document['sequence']}.json"
        self.documents[key] = copy.deepcopy(document)
        current.update(sequence=document["sequence"], status=ack["status"], latest_key=key, updated_at=ack["server_received_at"])
        self.requests[(session["session_id"], document["request_id"])] = {"body_sha256": fingerprint, "ack": copy.deepcopy(ack), "object_key": key}
        if self.lose_ack: self.lose_ack = False; raise RuntimeError("Transport failed after commit")
    def read_checkpoint(self, key): return copy.deepcopy(self.documents[key])
    def mark_withdrawn(self, session, rid, at):
        current = self.sessions[session["session_id"]]
        if current["status"] != "withdrawn":
            current.update(status="withdrawn", withdrawal_receipt=rid, withdrawal_at=at, latest_key=None, updated_at=at, cleanup_pending=True)
            current.pop("environment", None)
        return {"receipt_id": current["withdrawal_receipt"], "status": "withdrawn", "sequence": current["sequence"], "server_received_at": current["withdrawal_at"], "config_version": VERSION}
    def purge_session(self, sid):
        if self.purge_fail: return False
        self.documents = {k: v for k, v in self.documents.items() if not k.startswith("records/" + sid + "/")}; return True
    def set_cleanup_pending(self, sid, pending): self.sessions[sid]["cleanup_pending"] = pending


class HandlerTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore(); self.now = NOW
        self.config = {"ALLOWED_ORIGIN": ORIGIN, "TOKEN_SECRET": "a" * 64, "RATE_SALT": "b" * 64, "INVITE_HASH": digest("human-invite"), "SYNTHETIC_INVITE_HASH": digest("synthetic-invite"), "RETENTION_DAYS": 90}
        self.app = App(self.store, self.config, lambda: self.now)

    def event(self, path, body, session=None, method="POST", origin=ORIGIN):
        headers = {"origin": origin, "content-type": "application/json"}
        if session: headers.update(authorization="Bearer " + session["token"], **{"x-study-session": session["session_id"]})
        return {"rawPath": path, "requestContext": {"http": {"method": method, "sourceIp": "192.0.2.1"}}, "headers": headers, "body": json.dumps(body)}

    def call(self, path, body, session=None, **kwargs):
        result = self.app.handle(self.event(path, body, session, **kwargs))
        return result["statusCode"], json.loads(result["body"]) if result["body"] else None

    def creation(self, synthetic=False):
        return {"request_id": str(uuid.uuid4()), "config_version": VERSION, "invite_code": "synthetic-invite" if synthetic else "human-invite", "synthetic": synthetic,
                "consent": {"agreed": True, "adult": True, "version": CONSENT_VERSION},
                "environment": {"user_agent": "Synthetic test", "platform": "test", "language": "en", "viewport_width": 1280, "viewport_height": 720}}

    def session(self, synthetic=False):
        code, data = self.call("/session", self.creation(synthetic)); self.assertEqual(code, 200); return data

    def checkpoint(self, sequence=1, data=None):
        return {"request_id": str(uuid.uuid4()), "sequence": sequence, "config_version": VERSION, "payload": data or payload()}

    def test_revised_ui_is_pinned_and_checkpoint_document_and_ack_keep_provenance(self):
        body = self.creation(True); body["ui_revision"] = handler.UI_REVISION
        code, session = self.call("/session", body)
        self.assertEqual(code, 200)
        self.assertEqual(session["ui_revision"], handler.UI_REVISION)
        self.assertEqual(self.call("/session", body)[1]["session_id"], session["session_id"])
        checkpoint = self.checkpoint(); checkpoint["ui_revision"] = handler.UI_REVISION
        code, ack = self.call("/checkpoint", checkpoint, session)
        self.assertEqual(code, 200)
        self.assertEqual(ack["ui_revision"], handler.UI_REVISION)
        self.assertEqual(next(iter(self.store.documents.values()))["ui_revision"], handler.UI_REVISION)
        self.assertEqual(self.call("/checkpoint", checkpoint, session)[1], ack)
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, session)[0], 400)
        self.assertEqual(self.call("/resume", {"config_version": VERSION, "ui_revision": handler.UI_REVISION}, session)[1]["ui_revision"], handler.UI_REVISION)
        altered = self.checkpoint(2); altered["ui_revision"] = handler.LEGACY_UI_REVISION
        self.assertEqual(self.call("/checkpoint", altered, session)[0], 400)
        self.assertEqual(self.store.sessions[session["session_id"]]["sequence"], 1)
        # A retained credential can still withdraw even if its UI field was omitted.
        self.assertEqual(self.call("/withdraw", {"request_id": str(uuid.uuid4()), "config_version": VERSION}, session)[0], 200)

    def test_legacy_sessions_and_exact_pending_requests_keep_original_revision(self):
        session = self.session(True)
        self.assertEqual(session["ui_revision"], handler.LEGACY_UI_REVISION)
        # Model a pre-revision database record without migrating it.
        self.store.sessions[session["session_id"]].pop("ui_revision")
        pending = self.checkpoint()
        self.assertEqual(self.call("/checkpoint", pending, session)[0], 200)
        resumed = self.call("/resume", {"config_version": VERSION}, session)[1]
        self.assertEqual(resumed["ui_revision"], handler.LEGACY_UI_REVISION)
        self.assertNotIn("ui_revision", self.store.sessions[session["session_id"]])
        self.assertEqual(self.call("/checkpoint", pending, session)[0], 200)
        pending["ui_revision"] = handler.UI_REVISION
        self.assertEqual(self.call("/checkpoint", pending, session)[0], 400)
        body = self.creation(True); body["ui_revision"] = "unknown"
        self.assertEqual(self.call("/session", body)[0], 400)

    def test_explicit_consent_adult_and_version_required_before_allocating(self):
        for field, bad in (("adult", False), ("agreed", False), ("adult", 1), ("version", "older")):
            body = self.creation(); body["consent"][field] = bad
            self.assertEqual(self.call("/session", body)[0], 400)
        self.assertEqual(self.store.sessions, {})

    def test_invitation_gate_and_separate_synthetic_gate(self):
        body = self.creation(); body["invite_code"] = "wrong"
        self.assertEqual(self.call("/session", body)[0], 403)
        body = self.creation(True); body["invite_code"] = "human-invite"
        self.assertEqual(self.call("/session", body)[0], 403)
        self.assertFalse(self.store.sessions)

    def test_exact_origin_and_method_paths(self):
        self.assertEqual(self.call("/session", self.creation(), origin=ORIGIN + ".attacker.test")[0], 403)
        self.assertEqual(self.call("/session", self.creation(), origin="null")[0], 403)
        self.assertEqual(self.call("/session", self.creation(), method="GET")[0], 405)
        self.assertEqual(self.call("/admin", {})[0], 404)
        self.assertEqual(self.call("/resume", {}, method="OPTIONS")[0], 204)

    def test_create_lost_response_retry_same_identity_token_and_no_counter_increment(self):
        body = self.creation(); a = self.call("/session", body); b = self.call("/session", body)
        self.assertEqual(a, b); self.assertEqual(a[1]["participant_code"], "P001"); self.assertEqual(len(a[1]["token"]), 43)
        self.assertEqual(self.store.counts[False], 1)
        body["environment"]["language"] = "zh"
        self.assertEqual(self.call("/session", body)[0], 409)

    def test_server_balanced_assignment_synthetic_does_not_shift_humans(self):
        p1 = self.session(); s1 = self.session(True); p2 = self.session()
        self.assertEqual((p1["participant_code"], s1["participant_code"], p2["participant_code"]), ("P001", "S001", "P002"))
        self.assertEqual(p1["order"], ["baseline", "guided"]); self.assertEqual(p2["order"], ["guided", "baseline"])
        self.assertNotEqual(p1["token"], p2["token"])

    def test_no_token_or_ip_in_persisted_research_document(self):
        s = self.session(); self.assertEqual(self.call("/checkpoint", self.checkpoint(), s)[0], 200)
        research = json.dumps(list(self.store.documents.values()))
        self.assertNotIn(s["token"], research); self.assertNotIn("192.0.2.1", research); self.assertNotIn("human-invite", research)

    def test_auth_cannot_read_other_session(self):
        a, b = self.session(), self.session(); a["session_id"] = b["session_id"]
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, a)[0], 401)

    def test_checkpoint_ack_and_resume_full_raw_payload(self):
        s = self.session(); p = payload(); p["conditions"]["baseline"]["records"] = [record(""), record("nonsense")]
        p["conditions"]["baseline"]["records"][0]["notes"] = " =SUM(1,1)\n'original"
        req = self.checkpoint(data=p); status, ack = self.call("/checkpoint", req, s)
        self.assertEqual(status, 200); self.assertEqual(ack["sequence"], 1)
        result = self.call("/resume", {"config_version": VERSION}, s)[1]
        self.assertEqual(result["checkpoint"], p)
        document = next(iter(self.store.documents.values()))
        self.assertEqual(document["schema"], "hll04.remote.record.v1"); self.assertEqual(document["server_received_at"], iso(NOW))

    def test_repeated_checkpoint_idempotent_changed_body_rejected(self):
        s = self.session(); req = self.checkpoint(); a = self.call("/checkpoint", req, s); b = self.call("/checkpoint", req, s)
        self.assertEqual(a, b); self.assertEqual(len(self.store.documents), 1)
        req["payload"]["conditions"]["guided"]["comments"] = "changed"
        self.assertEqual(self.call("/checkpoint", req, s)[0], 409)

    def test_old_checkpoint_cannot_replace_newer(self):
        s = self.session(); self.assertEqual(self.call("/checkpoint", self.checkpoint(), s)[0], 200)
        second = self.checkpoint(2); second["payload"]["phase"] = "review"
        self.assertEqual(self.call("/checkpoint", second, s)[0], 200)
        self.assertEqual(self.call("/checkpoint", self.checkpoint(), s)[0], 409)
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, s)[1]["sequence"], 2)

    def test_storage_failure_is_not_acknowledged_and_retry_recovers(self):
        s = self.session(); req = self.checkpoint(); self.store.fail_write = True
        self.assertEqual(self.call("/checkpoint", req, s)[0], 503)
        self.assertEqual(self.store.get_session(s["session_id"])["sequence"], 0)
        self.store.fail_write = False; self.assertEqual(self.call("/checkpoint", req, s)[0], 200)

    def test_commit_succeeded_response_lost_retry_returns_original_ack(self):
        s = self.session(); req = self.checkpoint(); self.store.lose_ack = True
        self.assertEqual(self.call("/checkpoint", req, s)[0], 503)
        self.assertEqual(self.call("/checkpoint", req, s)[0], 200)
        self.assertEqual(len(self.store.documents), 1)

    def test_submit_partial_work_keeps_raw_missingness_and_closes(self):
        s = self.session(); p = payload(); p["phase"] = "complete"; p["conditions"]["baseline"]["status"] = "skipped"
        p["conditions"]["guided"]["sus"] = [1, None, 3, None, None, None, None, None, None, None]
        p["conditions"]["guided"]["questionnaire_status"] = "skipped"
        req = self.checkpoint(data=p); first = self.call("/submit", req, s)
        self.assertEqual(first[0], 200); self.assertEqual(first[1]["status"], "submitted")
        self.assertEqual(self.call("/submit", req, s), first)
        self.assertEqual(self.call("/checkpoint", self.checkpoint(2), s)[0], 409)

    def test_completed_questionnaire_requires_all_ten_integer_responses(self):
        s = self.session(); p = payload(); b = p["conditions"]["guided"]; b["questionnaire_status"] = "completed"
        for sus in ([1] * 9, [1] * 9 + [None], [True] * 10, [0] * 10, [6] * 10):
            b["sus"] = sus; self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)
        b["sus"] = [1, 2, 3, 4, 5] * 2; self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 200)

    def test_whitelist_rejects_image_bytes_unknown_nested_keys_and_bad_types(self):
        s = self.session()
        variants = []
        p = payload(); p["image_data"] = "data:image/png;base64,AAA"; variants.append(p)
        p = payload(); p["conditions"]["guided"]["records"] = [dict(record(), image_bytes="AAA")]; variants.append(p)
        p = payload(); p["conditions"]["guided"]["records"] = [dict(record(), image_file="private.png")]; variants.append(p)
        p = payload(); p["conditions"]["guided"]["elapsed_ms"] = True; variants.append(p)
        p = payload(); p["interruption_counts"]["blur"] = -1; variants.append(p)
        p = payload(); p["conditions"]["guided"]["comments"] = {"arbitrary": "object"}; variants.append(p)
        for p in variants: self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)

    def test_payload_record_event_and_text_bounds(self):
        s = self.session()
        p = payload(); p["conditions"]["guided"]["records"] = [record()] * 7
        self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)
        p = payload(); p["events"] = [{"type": "blur", "at": iso(NOW), "condition": "guided", "phase": "task", "detail": ""}] * 201
        self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)
        p = payload(); p["conditions"]["guided"]["comments"] = "x" * 2001
        self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)
        e = self.event("/checkpoint", self.checkpoint(), s); e["body"] = "x" * (MAX_BODY + 1)
        self.assertEqual(self.app.handle(e)["statusCode"], 413)

    def test_duplicate_keys_nonfinite_and_bad_base64_fail(self):
        e = self.event("/session", self.creation())
        e["body"] = '{"config_version":"' + VERSION + '","config_version":"' + VERSION + '"}'
        self.assertEqual(self.app.handle(e)["statusCode"], 400)
        e["body"] = '{"n":NaN}'; self.assertEqual(self.app.handle(e)["statusCode"], 400)
        e["body"] = "***"; e["isBase64Encoded"] = True; self.assertEqual(self.app.handle(e)["statusCode"], 400)

    def test_withdrawal_removes_contents_retains_excluded_tombstone(self):
        s = self.session(); req = self.checkpoint(); self.call("/checkpoint", req, s)
        withdrawal = {"request_id": str(uuid.uuid4()), "config_version": VERSION}
        a = self.call("/withdraw", withdrawal, s); b = self.call("/withdraw", withdrawal, s)
        self.assertEqual(a, b); self.assertFalse(a[1]["cleanup_pending"]); self.assertFalse(self.store.documents)
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, s)[1]["checkpoint"], None)
        self.assertEqual(self.call("/checkpoint", req, s)[0], 409)
        self.assertNotIn("environment", self.store.get_session(s["session_id"]))

    def test_withdrawal_partial_cleanup_explicit_retry(self):
        s = self.session(); self.call("/checkpoint", self.checkpoint(), s); self.store.purge_fail = True
        req = {"request_id": str(uuid.uuid4()), "config_version": VERSION}
        code, data = self.call("/withdraw", req, s)
        self.assertEqual(code, 202); self.assertTrue(data["cleanup_pending"])
        self.assertEqual(self.store.get_session(s["session_id"])["status"], "withdrawn")
        self.store.purge_fail = False; self.assertEqual(self.call("/withdraw", req, s)[0], 200)

    def test_withdrawal_wins_over_inflight_checkpoint_commit(self):
        s = self.session()
        def withdraw(): self.store.mark_withdrawn(self.store.get_session(s["session_id"]), str(uuid.uuid4()), iso(NOW))
        self.store.before_commit = withdraw
        self.assertEqual(self.call("/checkpoint", self.checkpoint(), s)[0], 409)
        self.assertFalse(self.store.documents)

    def test_four_hour_collection_expiry_still_allows_retention_window_withdrawal(self):
        s = self.session(); self.now += 14401
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, s)[0], 401)
        self.assertEqual(self.call("/withdraw", {"request_id": str(uuid.uuid4()), "config_version": VERSION}, s)[0], 200)
        self.now += 90 * 86400
        self.assertEqual(self.call("/withdraw", {"request_id": str(uuid.uuid4()), "config_version": VERSION}, s)[0], 401)

    def test_rate_guard_has_no_raw_ip_research_record_and_429(self):
        s = self.session()
        for _ in range(30): self.assertEqual(self.call("/resume", {"config_version": VERSION}, s)[0], 200)
        self.assertEqual(self.call("/resume", {"config_version": VERSION}, s)[0], 429)
        self.assertNotIn("192.0.2.1", repr(self.store.rates))

    def test_server_timestamps_do_not_accept_client_assignment_or_scores(self):
        body = self.creation(); body["participant_code"] = "P999"
        self.assertEqual(self.call("/session", body)[0], 400)
        s = self.session(); p = payload(); p["score"] = 100
        self.assertEqual(self.call("/checkpoint", self.checkpoint(data=p), s)[0], 400)



class AWSUploadLeaseTests(unittest.TestCase):
    def store(self, put_fails=False, transaction_fails=False, delete_fails=False):
        from types import SimpleNamespace
        class Cancelled(Exception): pass
        class Conditional(Exception): pass
        calls = []
        def put(**kw):
            calls.append("put")
            if put_fails: raise TimeoutError("uncertain PUT outcome")
        def delete(**kw):
            calls.append("delete")
            if delete_fails: raise TimeoutError("uncertain DELETE outcome")
        def transaction(**kw):
            calls.append("transaction")
            if transaction_fails: raise Cancelled()
        def update(**kw):
            calls.append("release" if kw["UpdateExpression"].startswith("REMOVE") else "lease")
        store = handler.AWSStore.__new__(handler.AWSStore)
        store.table_name, store.bucket = "table", "bucket"
        store.av = lambda value: value
        store.table = SimpleNamespace(update_item=update)
        store.ddb = SimpleNamespace(transact_write_items=transaction, exceptions=SimpleNamespace(TransactionCanceledException=Cancelled, ConditionalCheckFailedException=Conditional))
        store.s3 = SimpleNamespace(put_object=put, delete_object=delete)
        store.get_session = lambda sid: {"status": "withdrawn"}
        return store, calls

    def commit(self, store):
        store.commit_checkpoint({"session_id": str(uuid.uuid4()), "expires_at": 12345},
            {"sequence": 1, "request_id": str(uuid.uuid4())}, "a" * 64,
            {"status": "active", "server_received_at": "2026-10-21T00:00:00Z"})

    def test_uncertain_put_retains_lease_for_withdrawal_retry(self):
        store, calls = self.store(put_fails=True)
        with self.assertRaises(TimeoutError): self.commit(store)
        self.assertEqual(calls, ["lease", "put"])

    def test_uncertain_delete_retains_lease_for_withdrawal_retry(self):
        store, calls = self.store(transaction_fails=True, delete_fails=True)
        with self.assertRaises(TimeoutError): self.commit(store)
        self.assertEqual(calls, ["lease", "put", "transaction", "delete"])

    def test_success_releases_lease_and_known_withdrawal_delete_releases(self):
        store, calls = self.store(); self.commit(store)
        self.assertEqual(calls, ["lease", "put", "transaction", "release"])
        store, calls = self.store(transaction_fails=True)
        with self.assertRaises(handler.Conflict): self.commit(store)
        self.assertEqual(calls, ["lease", "put", "transaction", "delete", "release"])


class DeploymentTests(unittest.TestCase):
    def test_plan_is_local_idempotent_and_preserves_existing_secrets(self):
        with tempfile.TemporaryDirectory() as d:
            config = Path(d) / "config.json"; out = Path(d) / "evidence"
            deploy.initialize(config); before = config.read_bytes()
            with self.assertRaises(ValueError): deploy.initialize(config)
            a = deploy.plan(config, out)[2]; b = deploy.plan(config, out)[2]
            self.assertEqual(a, b); self.assertEqual(before, config.read_bytes())
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertEqual((out / "parameters.private.json").stat().st_mode & 0o777, 0o600)
            self.assertLess((out / "template.json").stat().st_size, 51200)

    def test_template_has_no_url_cors_duplication_no_public_bucket_and_both_url_permissions(self):
        t = deploy.template("def lambda_handler(event, context): return {}")
        resources = t["Resources"]
        self.assertNotIn("Cors", resources["FunctionUrl"]["Properties"])
        self.assertTrue(all(resources["ResultsBucket"]["Properties"]["PublicAccessBlockConfiguration"].values()))
        self.assertEqual(resources["UrlPermission"]["Properties"]["Action"], "lambda:InvokeFunctionUrl")
        self.assertTrue(resources["UrlOnlyInvokePermission"]["Properties"]["InvokedViaFunctionUrl"])
        actions = json.dumps(resources["ExecutionRole"]["Properties"]["Policies"])
        self.assertNotIn('"s3:*"', actions); self.assertNotIn('"dynamodb:*"', actions)
        self.assertEqual(resources["ResultsBucket"]["DeletionPolicy"], "Retain")


if __name__ == "__main__":
    unittest.main(verbosity=2)
