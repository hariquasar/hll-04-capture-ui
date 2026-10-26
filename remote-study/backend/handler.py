"""Private remote-study API. Python standard library plus Lambda's boto3 SDK.

Do not log request bodies, invitation codes, authorization headers or responses.
AWSStore is replaceable in local tests; production receipts are DynamoDB transactions.
"""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import time
import uuid

VERSION = "HLL04-remote-table-v3"
UI_REVISION = "research-20261026-r1"
LEGACY_UI_REVISION = "legacy-v3"
UI_REVISIONS = {LEGACY_UI_REVISION, UI_REVISION}
CONSENT_VERSION = "HLL04-remote-consent-v1"
MAX_BODY = 65536
MAX_CHECKPOINTS = 300
PHASES = {"practice", "instructions", "task", "questionnaire", "review", "complete"}
CONDITIONS = {"baseline", "guided"}
HEX = re.compile(r"^[a-fA-F0-9]{64}$")
IMAGE_FILES = {""} | {f"task-{i:02d}.png" for i in range(1, 7)}


class APIError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


class Conflict(Exception):
    pass


def fail(message):
    raise APIError(400, "invalid_request", message)


def keys(value, required, optional=()):
    if not isinstance(value, dict) or set(value) - set(required) - set(optional) or set(required) - set(value):
        fail("Object fields do not match the API contract")


def string(value, limit, empty=True):
    if not isinstance(value, str) or len(value) > limit or (not empty and not value):
        fail("Invalid or overlong text value")
    return value


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        fail("Integer outside its permitted range")


def boolean(value):
    if type(value) is not bool:
        fail("Boolean required")


def oneof(value, choices):
    if not isinstance(value, str) or value not in choices:
        fail("Value outside its permitted choices")


def timestamp(value, nullable=True):
    if value is None and nullable:
        return
    string(value, 40, False)
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or not 2000 <= parsed.year <= 2200:
            fail("A timezone-qualified ISO timestamp is required")
    except ValueError:
        fail("A timezone-qualified ISO timestamp is required")


def request_uuid(value):
    string(value, 36, False)
    try:
        parsed = uuid.UUID(value)
        if parsed.version != 4 or str(parsed) != value:
            fail("A canonical random UUID is required")
    except ValueError:
        fail("A canonical random UUID is required")


def validate_record(value):
    fields = {"record_id", "task_id", "scenario", "location", "subject_id", "condition", "notes", "image_file", "image_sha256"}
    keys(value, fields)
    for field in fields:
        string(value[field], 120 if field == "record_id" else 500)
    if value["image_file"] not in IMAGE_FILES:
        fail("Only the six prepared synthetic image filenames are accepted")
    if value["image_sha256"] and not HEX.fullmatch(value["image_sha256"]):
        fail("Image digest must be empty or SHA256 hex")
    # Deliberately do not correct or reject blank/incorrect/duplicate task IDs,
    # schema choices, subject IDs, or metadata: these are research outcomes.


def validate_block(value):
    keys(value, {"practice", "status", "started_at", "ended_at", "elapsed_ms", "records", "draft", "export", "sus", "questionnaire_status", "comments"})
    p = value["practice"]
    keys(p, {"started_at", "ended_at", "status", "duration_ms"})
    timestamp(p["started_at"]); timestamp(p["ended_at"])
    oneof(p["status"], {"not_started", "in_progress", "completed", "abandoned"})
    integer(p["duration_ms"], 0, 14400000)
    oneof(value["status"], {"not_started", "in_progress", "completed", "capped", "abandoned", "skipped"})
    timestamp(value["started_at"]); timestamp(value["ended_at"])
    integer(value["elapsed_ms"], 0, 14400000)
    if not isinstance(value["records"], list) or len(value["records"]) > 6:
        fail("At most six saved rows per condition")
    for record in value["records"]:
        validate_record(record)
    if value["draft"] is not None:
        validate_record(value["draft"])
    e = value["export"]
    keys(e, {"requested_at", "sha256", "bytes", "download_requested", "opened_confirmed", "opened_confirmed_at"})
    timestamp(e["requested_at"]); timestamp(e["opened_confirmed_at"])
    if e["sha256"] is not None and (not isinstance(e["sha256"], str) or not HEX.fullmatch(e["sha256"])):
        fail("Export digest must be null or SHA256 hex")
    integer(e["bytes"], 0, 25000000)
    boolean(e["download_requested"]); boolean(e["opened_confirmed"])
    oneof(value["questionnaire_status"], {"not_started", "completed", "skipped"})
    sus = value["sus"]
    if not isinstance(sus, list) or len(sus) not in (0, 10):
        fail("SUS must be empty or contain ten responses")
    for answer in sus:
        if answer is not None:
            integer(answer, 1, 5)
    if value["questionnaire_status"] == "completed" and (len(sus) != 10 or any(x is None for x in sus)):
        fail("Completed questionnaire requires all ten responses")
    string(value["comments"], 2000)


def validate_payload(value):
    keys(value, {"phase", "condition_index", "conditions", "events", "interruption_counts", "client_saved_at"})
    oneof(value["phase"], PHASES)
    integer(value["condition_index"], 0, 1)
    keys(value["conditions"], CONDITIONS)
    for block in value["conditions"].values():
        validate_block(block)
    if not isinstance(value["events"], list) or len(value["events"]) > 200:
        fail("At most 200 events per snapshot")
    for event in value["events"]:
        keys(event, {"type", "at", "condition", "phase", "detail"})
        if not isinstance(event["type"], str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", event["type"]):
            fail("Invalid event type")
        timestamp(event["at"], False)
        if event["condition"] is not None:
            oneof(event["condition"], CONDITIONS)
        if event["phase"] is not None:
            oneof(event["phase"], PHASES)
        string(event["detail"], 500)
    keys(value["interruption_counts"], {"blur", "hidden", "reload", "offline", "resize"})
    for count in value["interruption_counts"].values():
        integer(count, 0, 100000)
    timestamp(value["client_saved_at"], False)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def iso(epoch):
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def json_pairs(pairs):
    value = {}
    for k, v in pairs:
        if k in value:
            fail("Duplicate JSON key")
        value[k] = v
    return value


class App:
    def __init__(self, store, config, clock=time.time):
        self.store, self.config, self.clock = store, config, clock

    def token(self, session_id):
        # Pseudorandom 256-bit bearer over a cryptographically random UUID.
        # Re-derivation supports lost create responses without storing bearer text.
        return base64.urlsafe_b64encode(hmac.new(self.config["TOKEN_SECRET"].encode(), session_id.encode(), hashlib.sha256).digest()).decode().rstrip("=")

    def assignment(self, session, include_token=False):
        result = {key: session[key] for key in ("session_id", "participant_code", "order", "sequence", "status", "config_version")}
        result.update(ui_revision=session.get("ui_revision", LEGACY_UI_REVISION), server_received_at=session["updated_at"], expires_at=iso(session["auth_expires_at"]), withdrawal_expires_at=iso(session["expires_at"]))
        if include_token:
            result["token"] = self.token(session["session_id"])
        return result

    def authenticate(self, headers, withdrawal=False):
        sid = headers.get("x-study-session", "")
        request_uuid(sid)
        authorization = headers.get("authorization", "")
        if not authorization.startswith("Bearer ") or len(authorization) > 128:
            raise APIError(401, "unauthorized", "A private session credential is required")
        session = self.store.get_session(sid)
        token_hash = digest(authorization[7:])
        if not session or not hmac.compare_digest(session["token_hash"], token_hash):
            raise APIError(401, "unauthorized", "Invalid session credential")
        expiry = session["expires_at"] if withdrawal else session["auth_expires_at"]
        if self.clock() >= expiry:
            raise APIError(401, "session_expired", "Collection has expired. A retained credential can still request withdrawal during the retention window.")
        self.store.rate_guard("session:" + sid, 30, 60, int(self.clock()))
        return session

    def create(self, body, ip):
        keys(body, {"request_id", "config_version", "invite_code", "synthetic", "consent", "environment"}, {"ui_revision"})
        request_uuid(body["request_id"])
        oneof(body.get("ui_revision", LEGACY_UI_REVISION), UI_REVISIONS)
        boolean(body["synthetic"])
        string(body["invite_code"], 128, False)
        consent = body["consent"]
        keys(consent, {"agreed", "adult", "version"})
        if consent["agreed"] is not True or consent["adult"] is not True or consent["version"] != CONSENT_VERSION:
            fail("Explicit consent and adult confirmation are required")
        env = body["environment"]
        keys(env, {"user_agent", "platform", "language", "viewport_width", "viewport_height"})
        string(env["user_agent"], 500); string(env["platform"], 100); string(env["language"], 80)
        integer(env["viewport_width"], 1, 20000); integer(env["viewport_height"], 1, 20000)
        now = int(self.clock())
        ip_key = hmac.new(self.config["RATE_SALT"].encode(), ip.encode(), hashlib.sha256).hexdigest()
        self.store.rate_guard("create:" + ip_key, 20, 3600, now)
        expected = self.config["SYNTHETIC_INVITE_HASH" if body["synthetic"] else "INVITE_HASH"]
        if not hmac.compare_digest(digest(body["invite_code"]), expected):
            raise APIError(403, "invalid_invite", "Invitation is invalid")
        key = digest(expected + ":" + body["request_id"])
        fingerprint = digest(canonical(body))
        old = self.store.get_create(key)
        if old:
            if old["create_sha256"] != fingerprint:
                raise APIError(409, "idempotency_conflict", "This create request ID was used with different content")
            if now >= old["auth_expires_at"]:
                raise APIError(401, "session_expired", "This collection session has expired")
            return self.assignment(old, True)
        sid = str(uuid.uuid4())
        meta = {"session_id": sid, "synthetic": body["synthetic"], "token_hash": digest(self.token(sid)), "create_sha256": fingerprint,
                "config_version": VERSION, "ui_revision": body.get("ui_revision", LEGACY_UI_REVISION), "sequence": 0, "status": "active", "created_at": iso(now), "updated_at": iso(now),
                "auth_expires_at": now + 14400, "expires_at": now + int(self.config.get("RETENTION_DAYS", 90)) * 86400,
                "consent": dict(consent, accepted_at=iso(now)), "environment": env, "latest_key": None, "cleanup_pending": False}
        session = self.store.allocate_session(key, meta, now, int(self.config.get("DAILY_SESSION_LIMIT", 100)))
        if session["create_sha256"] != fingerprint:
            raise APIError(409, "idempotency_conflict", "This create request ID was used with different content")
        return self.assignment(session, True)

    def checkpoint(self, session, body, terminal):
        keys(body, {"request_id", "sequence", "config_version", "payload"}, {"ui_revision"})
        request_uuid(body["request_id"])
        integer(body["sequence"], 1, MAX_CHECKPOINTS + (1 if terminal else 0))
        validate_payload(body["payload"])
        if terminal and body["payload"]["phase"] != "complete":
            fail("Submission requires the complete review phase")
        if session["status"] == "withdrawn":
            raise APIError(409, "session_closed", "This session was withdrawn and its records are excluded")
        fingerprint = digest(canonical({"kind": "submission" if terminal else "checkpoint", "body": body}))
        old = self.store.get_request(session["session_id"], body["request_id"])
        if old:
            if old["body_sha256"] != fingerprint:
                raise APIError(409, "idempotency_conflict", "Request ID was used with different content")
            return old["ack"]
        if session["status"] != "active":
            raise APIError(409, "session_closed", "This session cannot accept more records")
        if body["sequence"] != session["sequence"] + 1:
            raise APIError(409, "sequence_conflict", "Resume before sending a newer sequential checkpoint")
        now = iso(self.clock())
        document = {key: session[key] for key in ("session_id", "participant_code", "synthetic", "order", "consent", "environment", "config_version")}
        document.update(ui_revision=session.get("ui_revision", LEGACY_UI_REVISION), schema="hll04.remote.record.v1", sequence=body["sequence"], request_id=body["request_id"],
                        kind="submission" if terminal else "checkpoint", server_received_at=now, payload=body["payload"])
        ack = {"receipt_id": body["request_id"], "sequence": body["sequence"], "status": "submitted" if terminal else "active", "server_received_at": now, "config_version": VERSION, "ui_revision": session.get("ui_revision", LEGACY_UI_REVISION)}
        try:
            self.store.commit_checkpoint(session, document, fingerprint, ack)
        except Conflict:
            old = self.store.get_request(session["session_id"], body["request_id"])
            if old and old["body_sha256"] == fingerprint:
                return old["ack"]
            raise APIError(409, "sequence_conflict", "A different checkpoint or withdrawal committed first")
        return ack

    def dispatch(self, path, body, headers, ip):
        if not isinstance(body, dict) or body.get("config_version") != VERSION:
            fail("Configuration version mismatch")
        if path == "/session":
            return 200, self.create(body, ip)
        session = self.authenticate(headers, withdrawal=path == "/withdraw")
        # Missing revision is the original client. Never let a checkpoint switch UI.
        if path != "/withdraw" or "ui_revision" in body:
            if body.get("ui_revision", LEGACY_UI_REVISION) != session.get("ui_revision", LEGACY_UI_REVISION):
                fail("Study UI revision mismatch; resume with the original instrument")
        if path == "/resume":
            keys(body, {"config_version"}, {"ui_revision"})
            result = self.assignment(session)
            result["checkpoint"] = self.store.read_checkpoint(session["latest_key"])["payload"] if session["latest_key"] and session["status"] != "withdrawn" else None
            result["cleanup_pending"] = session.get("cleanup_pending", False)
            return 200, result
        if path in ("/checkpoint", "/submit"):
            return 200, self.checkpoint(session, body, terminal=path == "/submit")
        keys(body, {"request_id", "config_version"}, {"ui_revision"})
        request_uuid(body["request_id"])
        # Withdrawal is a terminal exclusion even if object deletion temporarily fails.
        receipt = self.store.mark_withdrawn(session, body["request_id"], iso(self.clock()))
        pending = not self.store.purge_session(session["session_id"])
        self.store.set_cleanup_pending(session["session_id"], pending)
        return (202 if pending else 200), dict(receipt, cleanup_pending=pending, ui_revision=session.get("ui_revision", LEGACY_UI_REVISION))

    def handle(self, event):
        headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
        allowed = self.config["ALLOWED_ORIGIN"]
        response_headers = {"Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff"}
        status, body = 500, {}
        try:
            if headers.get("origin") != allowed:
                raise APIError(403, "origin_forbidden", "Origin is not allowed")
            response_headers.update({"Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type, x-study-session", "Access-Control-Max-Age": "300"})
            method = event.get("requestContext", {}).get("http", {}).get("method", "")
            path = event.get("rawPath", "")
            if path not in {"/session", "/resume", "/checkpoint", "/submit", "/withdraw"}:
                raise APIError(404, "not_found", "Route does not exist")
            if method == "OPTIONS":
                return {"statusCode": 204, "headers": response_headers, "body": ""}
            if method != "POST":
                raise APIError(405, "method_not_allowed", "Only POST is supported")
            if headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
                fail("Content-Type application/json required")
            raw = event.get("body", "")
            if not isinstance(raw, str) or len(raw) > MAX_BODY * 2:
                raise APIError(413, "body_too_large", "Request body exceeds 64 KiB")
            try:
                data = base64.b64decode(raw, validate=True) if event.get("isBase64Encoded") else raw.encode("utf-8")
            except (ValueError, UnicodeError):
                fail("Invalid body encoding")
            if len(data) > MAX_BODY:
                raise APIError(413, "body_too_large", "Request body exceeds 64 KiB")
            try:
                parsed = json.loads(data.decode("utf-8"), object_pairs_hook=json_pairs, parse_constant=lambda _: fail("Non-finite JSON number"))
            except (ValueError, UnicodeError, RecursionError):
                fail("Invalid JSON body")
            ip = str(event.get("requestContext", {}).get("http", {}).get("sourceIp", "unknown"))[:128]
            status, body = self.dispatch(path, parsed, headers, ip)
        except APIError as error:
            status, body = error.status, {"error": {"code": error.code, "message": error.message}, "server_received_at": iso(self.clock())}
            if status == 429:
                response_headers["Retry-After"] = "60"
        except Exception:
            # No request/credential logging or misleading successful acknowledgement.
            status, body = 503, {"error": {"code": "storage_unavailable", "message": "Upload not confirmed. Retain local data and retry the same request."}, "server_received_at": iso(self.clock())}
        return {"statusCode": status, "headers": response_headers, "body": canonical(body)}


class AWSStore:
    def __init__(self, table_name, bucket):
        import boto3
        from botocore.config import Config
        from boto3.dynamodb.types import TypeSerializer
        self.table = boto3.resource("dynamodb").Table(table_name)
        self.ddb = boto3.client("dynamodb")
        self.s3 = boto3.client("s3", config=Config(connect_timeout=3, read_timeout=5, retries={"max_attempts": 1}))
        self.table_name, self.bucket = table_name, bucket
        self.serializer = TypeSerializer()

    def av(self, value):
        return {k: self.serializer.serialize(v) for k, v in value.items()}

    def get(self, pk, sk="META"):
        item = self.table.get_item(Key={"pk": pk, "sk": sk}, ConsistentRead=True).get("Item")
        if item:
            # Metadata contains only integral numbers; payload JSON is kept in S3.
            from decimal import Decimal
            def plain(x):
                if isinstance(x, Decimal): return int(x)
                if isinstance(x, dict): return {k: plain(v) for k, v in x.items()}
                if isinstance(x, list): return [plain(v) for v in x]
                return x
            return plain(item)
        return None

    def get_session(self, sid):
        return self.get("SESSION#" + sid)

    def get_create(self, key):
        item = self.get("CREATE#" + key)
        return self.get_session(item["session_id"]) if item else None

    def get_request(self, sid, rid):
        return self.get("SESSION#" + sid, "REQUEST#" + rid)

    def rate_guard(self, key, limit, window, now):
        try:
            self.table.update_item(Key={"pk": "RATE#" + digest(key), "sk": str(now // window)},
                UpdateExpression="SET expires_at = :ttl ADD requests :one",
                ConditionExpression="attribute_not_exists(requests) OR requests < :limit",
                ExpressionAttributeValues={":ttl": now + window * 2, ":one": 1, ":limit": limit})
        except self.ddb.exceptions.ConditionalCheckFailedException:
            raise APIError(429, "rate_limited", "Too many requests; retry later")

    def allocate_session(self, create_key, meta, now, daily_limit):
        group = "synthetic" if meta["synthetic"] else "human"
        for attempt in range(10):
            existing = self.get_create(create_key)
            if existing: return existing
            counter = self.get("CONTROL", "COUNTER#" + group)
            n = (counter or {}).get("count", 0)
            item = dict(meta, participant_code=("S" if meta["synthetic"] else "P") + f"{n + 1:03d}", order=["baseline", "guided"] if (n + 1) % 2 else ["guided", "baseline"], pk="SESSION#" + meta["session_id"], sk="META")
            counter_update = {"TableName": self.table_name, "Key": self.av({"pk": "CONTROL", "sk": "COUNTER#" + group}), "UpdateExpression": "SET #n = :new", "ConditionExpression": "attribute_not_exists(#n)" if n == 0 else "#n = :old", "ExpressionAttributeNames": {"#n": "count"}, "ExpressionAttributeValues": self.av({":new": n + 1, **({":old": n} if n else {})})}
            daily = {"TableName": self.table_name, "Key": self.av({"pk": "CONTROL", "sk": f"DAILY#{group}#{now // 86400}"}), "UpdateExpression": "SET expires_at = :ttl ADD #n :one", "ConditionExpression": "attribute_not_exists(#n) OR #n < :limit", "ExpressionAttributeNames": {"#n": "count"}, "ExpressionAttributeValues": self.av({":ttl": now + 172800, ":one": 1, ":limit": daily_limit})}
            try:
                self.ddb.transact_write_items(TransactItems=[{"Update": counter_update}, {"Update": daily},
                    {"Put": {"TableName": self.table_name, "Item": self.av(item), "ConditionExpression": "attribute_not_exists(pk)"}},
                    {"Put": {"TableName": self.table_name, "Item": self.av({"pk": "CREATE#" + create_key, "sk": "META", "session_id": meta["session_id"], "expires_at": meta["expires_at"]}), "ConditionExpression": "attribute_not_exists(pk)"}}])
                return item
            except self.ddb.exceptions.TransactionCanceledException:
                day = self.get("CONTROL", f"DAILY#{group}#{now // 86400}")
                if day and day.get("count", 0) >= daily_limit:
                    raise APIError(429, "daily_limit", "Study session limit reached; contact the researcher")
                time.sleep(min(0.01 * 2**attempt, 0.3))
        raise Conflict("Session allocation contention")

    def read_checkpoint(self, key):
        response = self.s3.get_object(Bucket=self.bucket, Key=key)
        return json.loads(response["Body"].read(MAX_BODY + 16384))

    def commit_checkpoint(self, session, document, fingerprint, ack):
        sid, seq, rid = session["session_id"], document["sequence"], document["request_id"]
        key = f"records/{sid}/{seq:04d}-{rid}-{fingerprint}.json"
        # A bounded upload lease lets withdrawal detect in-flight object writes.
        # It outlives the Lambda timeout; withdrawal stays pending until released.
        lease = str(uuid.uuid4())
        now = int(time.time())
        try:
            self.table.update_item(Key={"pk": "SESSION#" + sid, "sk": "META"},
                UpdateExpression="SET upload_lease = :lease, upload_lease_until = :until",
                ConditionExpression="#status = :active AND (attribute_not_exists(upload_lease_until) OR upload_lease_until < :now)",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":lease": lease, ":until": now + 180, ":now": now, ":active": "active"})
        except self.ddb.exceptions.ConditionalCheckFailedException:
            raise Conflict("Another upload or withdrawal is in progress")
        receipt = {"pk": "SESSION#" + sid, "sk": "REQUEST#" + rid, "body_sha256": fingerprint, "ack": ack, "object_key": key, "expires_at": session["expires_at"]}
        update = {"TableName": self.table_name, "Key": self.av({"pk": "SESSION#" + sid, "sk": "META"}),
            "UpdateExpression": "SET #seq = :seq, #status = :status, latest_key = :key, updated_at = :now",
            "ConditionExpression": "#seq = :previous AND #status = :active AND upload_lease = :lease",
            "ExpressionAttributeNames": {"#seq": "sequence", "#status": "status"},
            "ExpressionAttributeValues": self.av({":seq": seq, ":status": ack["status"], ":key": key, ":now": ack["server_received_at"], ":previous": seq - 1, ":active": "active", ":lease": lease})}
        object_write_settled = False
        try:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=canonical(document).encode("utf-8"), ContentType="application/json", ServerSideEncryption="AES256")
            object_write_settled = True
            self.ddb.transact_write_items(TransactItems=[{"Update": update},
                {"Put": {"TableName": self.table_name, "Item": self.av(receipt), "ConditionExpression": "attribute_not_exists(pk)"}},
                {"Put": {"TableName": self.table_name, "Item": self.av(dict(receipt, sk=f"CHECKPOINT#{seq:04d}")), "ConditionExpression": "attribute_not_exists(pk)"}}])
        except self.ddb.exceptions.TransactionCanceledException:
            current = self.get_session(sid)
            if current and current["status"] == "withdrawn":
                # Close the race where an already-running upload lands after purge.
                object_write_settled = False
                self.s3.delete_object(Bucket=self.bucket, Key=key)
                object_write_settled = True
            raise Conflict("Checkpoint changed concurrently")
        finally:
            try:
                # A timed-out PUT/delete can still finish remotely. Keep the
                # bounded lease so withdrawal cannot acknowledge early purge.
                if object_write_settled:
                    self.table.update_item(Key={"pk": "SESSION#" + sid, "sk": "META"},
                        UpdateExpression="REMOVE upload_lease, upload_lease_until", ConditionExpression="upload_lease = :lease",
                        ExpressionAttributeValues={":lease": lease})
            except Exception:
                # The bounded lease expires; no response may imply deletion until then.
                pass

    def mark_withdrawn(self, session, rid, received_at):
        sid = session["session_id"]
        current = self.get_session(sid)
        if current["status"] != "withdrawn":
            try:
                self.table.update_item(Key={"pk": "SESSION#" + sid, "sk": "META"},
                    UpdateExpression="SET #status = :withdrawn, withdrawal_at = :now, withdrawal_receipt = :rid, cleanup_pending = :yes, latest_key = :empty, updated_at = :now REMOVE environment",
                    ConditionExpression="#status <> :withdrawn", ExpressionAttributeNames={"#status": "status"},
                    ExpressionAttributeValues={":withdrawn": "withdrawn", ":now": received_at, ":rid": rid, ":yes": True, ":empty": None})
            except self.ddb.exceptions.ConditionalCheckFailedException:
                pass
            current = self.get_session(sid)
        return {"receipt_id": current["withdrawal_receipt"], "status": "withdrawn", "sequence": current["sequence"], "server_received_at": current["withdrawal_at"], "config_version": VERSION}

    def purge_session(self, sid):
        try:
            current = self.get_session(sid)
            if current.get("upload_lease_until", 0) >= int(time.time()):
                return False
            paginator = self.s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=f"records/{sid}/"):
                objects = [{"Key": x["Key"]} for x in page.get("Contents", [])]
                if objects:
                    result = self.s3.delete_objects(Bucket=self.bucket, Delete={"Objects": objects, "Quiet": True})
                    if result.get("Errors"): return False
            return True
        except Exception:
            return False

    def set_cleanup_pending(self, sid, pending):
        self.table.update_item(Key={"pk": "SESSION#" + sid, "sk": "META"}, UpdateExpression="SET cleanup_pending = :pending", ExpressionAttributeValues={":pending": pending})


_APP = None


def lambda_handler(event, context):
    global _APP
    if _APP is None:
        required = ("TABLE_NAME", "DATA_BUCKET", "ALLOWED_ORIGIN", "TOKEN_SECRET", "RATE_SALT", "INVITE_HASH", "SYNTHETIC_INVITE_HASH")
        config = {key: os.environ[key] for key in required}
        config.update(RETENTION_DAYS=os.environ.get("RETENTION_DAYS", "90"), DAILY_SESSION_LIMIT=os.environ.get("DAILY_SESSION_LIMIT", "100"))
        _APP = App(AWSStore(config["TABLE_NAME"], config["DATA_BUCKET"]), config)
    return _APP.handle(event)
