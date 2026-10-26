#!/usr/bin/env python3
"""Private operator export through AWS CLI my-aws; no public administration route."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

VERSION = "HLL04-remote-table-v3"
SAFE_FIELDS = ("session_id", "participant_code", "synthetic", "order", "status", "config_version", "created_at", "updated_at", "consent", "environment", "sequence", "latest_key", "withdrawal_at", "cleanup_pending")
CSV_POLICY = "apostrophe-v1: prefix U+0027 when original starts U+0027 or leading whitespace followed by =,+,-,@, or begins TAB/CR/LF; raw values preserved in JSON"


def safe_cell(value):
    text = "" if value is None else str(value)
    if text.startswith(("'", "\t", "\r", "\n")) or re.match(r"^\s*[=+\-@]", text):
        return "'" + text
    return text


def private_write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    path.chmod(0o600)


def write_csv(path, fields, rows):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: safe_cell(row.get(key)) for key in fields})
    Path(path).chmod(0o600)


def plain(value):
    """Decode DynamoDB AttributeValue without requiring a local boto3 install."""
    if not isinstance(value, dict) or len(value) != 1:
        raise ValueError("Malformed DynamoDB value")
    kind, data = next(iter(value.items()))
    if kind == "S": return data
    if kind == "N": return int(data)
    if kind == "BOOL": return data
    if kind == "NULL": return None
    if kind == "L": return [plain(x) for x in data]
    if kind == "M": return {k: plain(v) for k, v in data.items()}
    raise ValueError("Unexpected DynamoDB value type")


def decode_item(item):
    return {k: plain(v) for k, v in item.items()}


def canonical_sid(sid):
    try:
        parsed = uuid.UUID(sid)
        if parsed.version != 4 or str(parsed) != sid: raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Noncanonical session ID in private storage")
    return sid


def validate_object_key(key, sid):
    canonical_sid(sid)
    if not isinstance(key, str) or not re.fullmatch(r"records/" + re.escape(sid) + r"/[0-9]{4}-[a-f0-9-]{36}-[a-f0-9]{64}\.json", key):
        raise ValueError("Unexpected checkpoint object key; export stopped")
    return key


class AWSReader:
    def __init__(self, deployment):
        if deployment.get("profile") != "my-aws" or deployment.get("region") != "us-east-1":
            raise ValueError("Export is scoped to my-aws / us-east-1")
        self.table = deployment["outputs"]["SessionsTable"]
        self.bucket = deployment["outputs"]["ResultsBucket"]

    def call(self, arguments):
        run = subprocess.run(["aws", "--profile", "my-aws", "--region", "us-east-1", "--no-cli-pager", "--output", "json", *arguments], capture_output=True, text=True)
        if run.returncode:
            # Do not dump storage responses or command arguments with participant content.
            raise RuntimeError("Authenticated AWS read failed; export incomplete")
        return json.loads(run.stdout or "{}")

    @staticmethod
    def projection():
        names = {f"#f{i}": name for i, name in enumerate(SAFE_FIELDS)}
        return ["--projection-expression", ",".join(names), "--expression-attribute-names", json.dumps(names)]

    def sessions(self):
        # The CLI automatically paginates. Never request token hashes/rate keys.
        result = self.call(["dynamodb", "scan", "--table-name", self.table, "--consistent-read", "--filter-expression", "sk = :meta AND begins_with(pk, :prefix)", "--expression-attribute-values", json.dumps({":meta": {"S": "META"}, ":prefix": {"S": "SESSION#"}}), *self.projection()])
        return [decode_item(x) for x in result.get("Items", [])]

    def session(self, sid):
        result = self.call(["dynamodb", "get-item", "--table-name", self.table, "--consistent-read", "--key", json.dumps({"pk": {"S": "SESSION#" + canonical_sid(sid)}, "sk": {"S": "META"}}), *self.projection()])
        return decode_item(result["Item"]) if result.get("Item") else None

    def receipts(self, sid):
        result = self.call(["dynamodb", "query", "--table-name", self.table, "--consistent-read", "--key-condition-expression", "pk = :pk AND begins_with(sk, :prefix)", "--expression-attribute-values", json.dumps({":pk": {"S": "SESSION#" + canonical_sid(sid)}, ":prefix": {"S": "CHECKPOINT#"}})])
        return [decode_item(x) for x in result.get("Items", [])]

    def document(self, key, sid, path):
        validate_object_key(key, sid)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.call(["s3api", "get-object", "--bucket", self.bucket, "--key", key, str(path)])
        path.chmod(0o600)
        if path.stat().st_size > 81920:
            raise ValueError("Unexpected checkpoint size")
        return json.loads(path.read_text())


def public_meta(meta, latest):
    withdrawn = meta["status"] == "withdrawn"
    return {"session_id": meta["session_id"], "participant_code": meta["participant_code"], "synthetic": meta["synthetic"], "order": meta["order"], "status": meta["status"], "config_version": meta["config_version"], "created_at": meta["created_at"], "updated_at": meta["updated_at"], "consent": meta.get("consent"), "environment": {} if withdrawn else meta.get("environment", {}), "latest_sequence": meta["sequence"], "latest": None if withdrawn else latest, "withdrawal": {"received_at": meta.get("withdrawal_at"), "cleanup_pending": meta.get("cleanup_pending", False)} if withdrawn else None}


def flat_rows(sessions):
    summaries, blocks, records = [], [], []
    for session in sessions:
        common = {k: session[k] for k in ("session_id", "participant_code", "synthetic", "status", "config_version")}
        summaries.append({**common, "order": ">".join(session["order"]), "created_at": session["created_at"], "updated_at": session["updated_at"], "latest_sequence": session["latest_sequence"], "withdrawn": session["status"] == "withdrawn", "cleanup_pending": (session.get("withdrawal") or {}).get("cleanup_pending", False)})
        latest = session.get("latest")
        if not latest or session["status"] == "withdrawn": continue
        for condition, block in latest["payload"]["conditions"].items():
            base = {**common, "condition": condition, "sequence": latest["sequence"], "server_received_at": latest["server_received_at"]}
            row = {**base, "block_status": block["status"], "started_at": block["started_at"], "ended_at": block["ended_at"], "elapsed_ms": block["elapsed_ms"], "saved_rows": len(block["records"]), "has_draft": block["draft"] is not None, "questionnaire_status": block["questionnaire_status"], "comments": block["comments"]}
            row.update({"export_" + k: v for k, v in block["export"].items()})
            row.update({f"sus_q{i + 1}": (block["sus"][i] if block["sus"] else None) for i in range(10)})
            blocks.append(row)
            for index, record in enumerate(block["records"]):
                records.append({**base, "row_index": index + 1, "is_draft": False, **{"record_" + k: v for k, v in record.items()}})
            if block["draft"] is not None:
                records.append({**base, "row_index": "", "is_draft": True, **{"record_" + k: v for k, v in block["draft"].items()}})
    return summaries, blocks, records


def export(reader, output):
    output = Path(output)
    if output.exists():
        raise ValueError("Use a new output directory; never overwrite an earlier export")
    output.mkdir(parents=True, mode=0o700)
    output.chmod(0o700)
    sessions, histories = [], 0
    for original in reader.sessions():
        sid = canonical_sid(original["session_id"])
        directory = output / "sessions" / sid / "checkpoints"
        meta = reader.session(sid)
        if meta is None: continue  # TTL expiration during export.
        documents = {}
        read_failure = None
        if meta["status"] != "withdrawn":
            for receipt in reader.receipts(sid):
                if receipt["ack"]["sequence"] > meta["sequence"]: continue
                key = validate_object_key(receipt["object_key"], sid)
                try:
                    doc = reader.document(key, sid, directory / Path(key).name)
                    if doc.get("schema") != "hll04.remote.record.v1" or doc.get("session_id") != sid or doc.get("sequence") != receipt["ack"]["sequence"]:
                        raise ValueError("Private checkpoint identity/receipt mismatch")
                    documents[key] = doc
                except Exception as error:
                    read_failure = error
                    break
        # Withdrawal can race a scan/download. Recheck before admitting any data.
        final = reader.session(sid)
        if final is None or final["status"] == "withdrawn":
            if directory.parent.exists(): shutil.rmtree(directory.parent)
            if final: sessions.append(public_meta(final, None))
            continue
        if read_failure: raise read_failure
        latest = documents.get(meta.get("latest_key"))
        if meta["sequence"] and latest is None:
            raise ValueError("Acknowledged latest checkpoint missing; export incomplete")
        sessions.append(public_meta(meta, latest))
        histories += len(documents)
    sessions.sort(key=lambda x: (x["synthetic"], x["participant_code"]))
    private_write(output / "sessions.json", sessions)
    summaries, blocks, records = flat_rows(sessions)
    common = ["session_id", "participant_code", "synthetic", "status", "config_version"]
    write_csv(output / "sessions.csv", common + ["order", "created_at", "updated_at", "latest_sequence", "withdrawn", "cleanup_pending"], summaries)
    block_fields = common + ["condition", "sequence", "server_received_at", "block_status", "started_at", "ended_at", "elapsed_ms", "saved_rows", "has_draft", "questionnaire_status", "comments"] + ["export_" + x for x in ("requested_at", "sha256", "bytes", "download_requested", "opened_confirmed", "opened_confirmed_at")] + [f"sus_q{i}" for i in range(1, 11)]
    write_csv(output / "blocks.csv", block_fields, blocks)
    write_csv(output / "records.csv", common + ["condition", "sequence", "server_received_at", "row_index", "is_draft"] + ["record_" + x for x in ("record_id", "task_id", "scenario", "location", "subject_id", "condition", "notes", "image_file", "image_sha256")], records)
    manifest = {"schema": "hll04.remote.private-export.v1", "config_version": VERSION, "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(), "sessions": len(sessions), "synthetic_sessions": sum(x["synthetic"] for x in sessions), "withdrawn_sessions": sum(x["status"] == "withdrawn" for x in sessions), "acknowledged_checkpoint_files": histories, "csv_policy": CSV_POLICY, "notice": "Private operator snapshot, not an analytical eligibility claim. Re-export before analysis to honor later withdrawals; delete superseded local copies. No bearer credentials or unacknowledged orphan objects included.", "files": {str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob("*") if p.is_file()}}
    private_write(output / "export-manifest.json", manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    deployment = json.loads(Path(args.deployment).read_text())
    result = export(AWSReader(deployment), args.output_dir)
    print(json.dumps({key: result[key] for key in ("sessions", "synthetic_sessions", "withdrawn_sessions", "acknowledged_checkpoint_files")}, indent=2))


if __name__ == "__main__":
    main()
