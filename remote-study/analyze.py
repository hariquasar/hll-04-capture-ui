#!/usr/bin/env python3
"""Offline analysis of the private remote-v3 export; never modifies raw inputs."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

VERSION = "HLL04-remote-table-v3"
FROZEN_TRUTH_SHA256 = "c15a0c6493b7e9eda805cbc309e625ce802706a37277bb2759be42de07c3500a"
SCHEMA = "hll04.remote.record.v1"
CONDITIONS = ("baseline", "guided")
FIELDS = ("scenario", "location", "subject_id", "condition")
TASK_IDS = tuple(str(n) for n in range(1, 7))
STATUSES = ("not_started", "in_progress", "completed", "capped", "abandoned", "skipped")
INTERRUPTIONS = ("blur", "hidden", "reload", "offline", "resize")
OUTCOMES = ("completeness_pct", "accuracy_pct", "reported_image_hash_matches", "format_errors", "seconds", "sus")
QUALITY_OUTCOMES = OUTCOMES[:4]
HEX64 = re.compile(r"^[a-fA-F0-9]{64}$")


def integer(value):
    return type(value) is int


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else None
    except ValueError:
        return None


def read_json(path):
    def reject_constant(value):
        raise ValueError("Non-finite JSON number: " + value)
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def field_format_error(field, value):
    """Nonempty formatting errors; missing cells are reported separately."""
    value = value.strip()
    if not value:
        return False
    if field == "scenario":
        return value not in ("indoor", "outdoor", "vehicle", "equipment", "document", "other")
    if field == "condition":
        return value not in ("good", "fair", "poor", "unknown")
    if field == "location":
        return len(value) < 2
    if field == "subject_id":
        return re.fullmatch(r"[A-Z]{2,4}-[0-9]{3,6}", value) is None
    raise ValueError("Unknown scoring field")


def validate_truth(truth):
    tasks = truth.get("tasks") if isinstance(truth, dict) else None
    if not isinstance(tasks, list) or len(tasks) != 6:
        raise ValueError("Truth must contain exactly six tasks")
    if any(not isinstance(t, dict) or not isinstance(t.get("task_id"), str) for t in tasks) or sorted(t["task_id"] for t in tasks) != list(TASK_IDS):
        raise ValueError("Truth task IDs must be exact unique strings 1..6")
    for task in tasks:
        for field in FIELDS:
            value = task.get(field)
            if not isinstance(value, str) or not value.strip() or field_format_error(field, value):
                raise ValueError(f"Invalid truth task {task['task_id']}, field {field}")
        if not isinstance(task.get("image_sha256"), str) or not HEX64.fullmatch(task["image_sha256"]):
            raise ValueError("Truth requires a valid image hash for each task")
    return {task["task_id"]: task for task in tasks}


def quality(records, truth):
    """Ambiguous task identity makes quality unscorable, never inferred by order."""
    result = {name: None for name in QUALITY_OUTCOMES}
    result.update(metadata_denominator=24, image_denominator=6, quality_eligible=False,
                  identity_flags=[], quality_flags=[], cell_diagnostics=[], image_diagnostics=[])
    if not isinstance(records, list):
        result["quality_flags"].append("records_not_array")
        return result
    indexed = {}
    if len(records) > 6:
        result["identity_flags"].append("more_than_six_records")
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            result["identity_flags"].append(f"record_{index}:not_object")
            continue
        task_id = record.get("task_id")
        if not isinstance(task_id, str) or task_id not in TASK_IDS:
            result["identity_flags"].append(f"record_{index}:missing_or_unknown_task_id")
            continue
        if task_id in indexed:
            result["identity_flags"].append("duplicate_task_id:" + task_id)
        indexed[task_id] = record
        for field in FIELDS:
            if field in record and not isinstance(record[field], str):
                result["quality_flags"].append(f"task_{task_id}:{field}:not_string")
    if result["identity_flags"] or result["quality_flags"]:
        return result
    nonempty = correct = formats = image_matches = 0
    for task_id in TASK_IDS:
        record = indexed.get(task_id)
        for field in FIELDS:
            raw = record.get(field, "") if record else ""
            present = bool(raw.strip())
            match = present and raw.strip().lower() == truth[task_id][field].strip().lower()
            invalid_format = field_format_error(field, raw)
            nonempty += present
            correct += match
            formats += invalid_format
            result["cell_diagnostics"].append({"task_id": task_id, "field": field,
                "raw": raw, "record_missing": record is None, "nonempty": present,
                "correct": match, "format_error": invalid_format})
        reported_hash = record.get("image_sha256", "") if record else ""
        valid_hash = isinstance(reported_hash, str) and HEX64.fullmatch(reported_hash) is not None
        image_match = valid_hash and reported_hash.lower() == truth[task_id]["image_sha256"].lower()
        image_matches += image_match
        result["image_diagnostics"].append({"task_id": task_id,
            "image_file": record.get("image_file", "") if record else "",
            "image_file_matches_truth": bool(record and record.get("image_file") == truth[task_id].get("image_file")),
            "reported_sha256": reported_hash, "reported_hash_matches_truth": bool(image_match),
            "status": "reported_match" if image_match else "missing" if not reported_hash else "reported_mismatch_or_invalid"})
    result.update(quality_eligible=True, metadata_nonempty=nonempty, metadata_correct=correct,
                  missing_task_ids=[t for t in TASK_IDS if t not in indexed],
                  completeness_pct=nonempty / 24 * 100, accuracy_pct=correct / 24 * 100,
                  format_errors=formats, reported_image_hash_matches=image_matches)
    return result


def sus_score(answers):
    if not isinstance(answers, list) or len(answers) != 10 or any(not integer(v) or v < 1 or v > 5 for v in answers):
        return None
    return 2.5 * sum(v - 1 if index % 2 == 0 else 5 - v for index, v in enumerate(answers))


def event_order(payload):
    events = payload.get("events", [])
    if not isinstance(events, list):
        return []
    order = []
    for event in events:
        if isinstance(event, dict) and event.get("condition") in CONDITIONS and event.get("phase") == "task":
            condition = event["condition"]
            if condition not in order:
                order.append(condition)
    return order


def actual_order(blocks):
    starts = [(timestamp(blocks.get(c, {}).get("started_at")), c) for c in CONDITIONS]
    present = [(date, c) for date, c in starts if date is not None]
    if len(present) == 2 and present[0][0] == present[1][0]:
        return [], "ambiguous_equal_client_start_timestamps"
    return [c for _, c in sorted(present)], "client_start_timestamps; not independent observation"


def observation(session, condition, payload, truth):
    blocks = payload.get("conditions", {})
    block = blocks.get(condition)
    block = block if isinstance(block, dict) else {}
    status = block.get("status", "not_started")
    records = block.get("records", [])
    began = status in ("in_progress", "completed", "capped", "abandoned") or bool(block.get("started_at")) or bool(records)
    flags = []
    if status not in STATUSES:
        flags.append("unknown_block_status")
    if not began and status == "skipped":
        flags.append("skipped_without_observed_start")
    scored = quality(records, truth)
    if not began or status not in STATUSES:
        scored["quality_eligible"] = False
        scored["quality_flags"].append("no_measured_attempt" if not began else "unknown_block_status")
        for metric in QUALITY_OUTCOMES:
            scored[metric] = None
    elapsed = block.get("elapsed_ms")
    start = timestamp(block.get("started_at"))
    end = timestamp(block.get("ended_at"))
    time_reasons = []
    if status != "completed":
        time_reasons.append("block_not_completed")
    if not integer(elapsed) or elapsed < 0 or elapsed > 900000:
        time_reasons.append("elapsed_ms_not_integer_in_0_to_900000")
    if start is None or end is None or end < start:
        time_reasons.append("missing_invalid_or_reversed_client_start_end")
    if start and end and integer(elapsed) and abs((end - start).total_seconds() * 1000 - elapsed) > 2000:
        flags.append("client_wall_timestamp_and_elapsed_differ_over_2_seconds")
    answers = block.get("sus", [])
    sus = sus_score(answers)
    sus_reasons = []
    if not began:
        sus_reasons.append("no_measured_attempt")
    if block.get("questionnaire_status") != "completed":
        sus_reasons.append("questionnaire_not_marked_completed")
    if sus is None:
        sus_reasons.append("not_ten_integer_answers_in_1_to_5")
    export = block.get("export", {})
    export = export if isinstance(export, dict) else {}
    sha = export.get("sha256")
    generated = isinstance(sha, str) and HEX64.fullmatch(sha) is not None and integer(export.get("bytes")) and export["bytes"] > 0
    if not generated:
        time_reasons.append("no_generated_artifact_reported_for_completion_endpoint")
        if status == "completed":
            flags.append("completed_without_generated_artifact")
    events = payload.get("events", [])
    events = events if isinstance(events, list) else []
    condition_events = [e for e in events if isinstance(e, dict) and e.get("condition") == condition]
    return {"session_id": session["session_id"], "participant_code": session["participant_code"],
        "condition": condition, "assigned_position": session["order"].index(condition) + 1,
        "session_status": session["status"], "status": status, "attempted": began,
        "completed": status == "completed", "flags": flags, **scored,
        "raw_elapsed_ms": elapsed, "seconds": elapsed / 1000 if not time_reasons else None,
        "time_eligible": not time_reasons, "time_ineligibility": time_reasons,
        "client_started_at": block.get("started_at"), "client_ended_at": block.get("ended_at"),
        "sus": sus if not sus_reasons else None, "sus_eligible": not sus_reasons,
        "sus_ineligibility": sus_reasons, "raw_sus": answers,
        "questionnaire_status": block.get("questionnaire_status", "not_started"),
        "comments": block.get("comments", ""), "draft_present": block.get("draft") is not None,
        "raw_records": records, "raw_draft": block.get("draft"),
        "export_generated_reported": bool(generated),
        "export_download_requested": export.get("download_requested") is True,
        "export_opened_confirmed_self_report": export.get("opened_confirmed") is True,
        "raw_export": export, "environment": session.get("environment", {}),
        "session_interruption_counts": payload.get("interruption_counts", {}),
        "focus_blur_caveat": "raw blur may be a legitimate click into the study iframe; not an interruption or exclusion by itself",
        "condition_events": condition_events,
        "server_received_at": (session.get("latest") or {}).get("server_received_at"),
        "timing_trust": "client-reported, unmoderated; server receipt is not task time",
        "image_trust": "reported selection hash only; image bytes not collected or independently verified"}


def summary(values):
    return {"n": len(values), "mean": mean(values) if values else None, "median": median(values) if values else None}


def ineligibility(row, metric):
    if row is None:
        return ["condition_not_observed"]
    if metric == "seconds":
        return row["time_ineligibility"]
    if metric == "sus":
        return row["sus_ineligibility"]
    return row["identity_flags"] + row["quality_flags"]


def analyze_sessions(sessions, truth):
    if not isinstance(sessions, list):
        raise ValueError("sessions.json must be an array from the private export CLI")
    truth = validate_truth(truth)
    if any(not isinstance(s, dict) for s in sessions):
        raise ValueError("Every session must be an object")
    ids = Counter(s.get("session_id") for s in sessions if isinstance(s.get("session_id"), str))
    pids = Counter(s.get("participant_code") for s in sessions if isinstance(s.get("participant_code"), str))
    audit, observations, included = [], [], []
    for session in sessions:
        reasons = []
        sid, pid = session.get("session_id"), session.get("participant_code")
        synthetic = session.get("synthetic") is True or isinstance(pid, str) and pid.startswith("S")
        withdrawn = session.get("status") == "withdrawn" or session.get("withdrawal") is not None
        if synthetic:
            reasons.append("synthetic_session")
        if withdrawn:
            reasons.append("withdrawn_session")
        if session.get("config_version") != VERSION:
            reasons.append("study_version_mismatch")
        if type(session.get("synthetic")) is not bool:
            reasons.append("missing_or_invalid_synthetic_marker")
        if not isinstance(sid, str) or not sid.strip():
            reasons.append("missing_session_id")
        elif ids[sid] > 1:
            reasons.append("duplicate_session_id")
        if not isinstance(pid, str) or re.fullmatch(r"P[0-9]{3,}", pid) is None:
            if not synthetic:
                reasons.append("invalid_participant_code")
        elif pids[pid] > 1:
            reasons.append("duplicate_participant_code")
        if session.get("order") not in (["baseline", "guided"], ["guided", "baseline"]):
            reasons.append("invalid_assigned_order")
        if session.get("status") not in ("active", "submitted", "withdrawn"):
            reasons.append("invalid_session_status")
        consent = session.get("consent", {})
        if not isinstance(consent, dict) or consent.get("agreed") is not True or consent.get("adult") is not True:
            reasons.append("consent_not_confirmed")
        latest = session.get("latest")
        payload = {}
        if latest is not None:
            if not isinstance(latest, dict):
                reasons.append("latest_not_object")
            else:
                for key, expected in (("schema", SCHEMA), ("config_version", VERSION), ("session_id", sid), ("participant_code", pid), ("synthetic", session.get("synthetic")), ("order", session.get("order"))):
                    if latest.get(key) != expected:
                        reasons.append("latest_metadata_disagreement:" + key)
                if not isinstance(latest.get("payload"), dict) or not isinstance(latest.get("payload", {}).get("conditions"), dict):
                    reasons.append("missing_or_invalid_snapshot")
                else:
                    payload = latest["payload"]
                    if any(c not in CONDITIONS for c in payload["conditions"]):
                        reasons.append("unexpected_condition")
                    if any(not isinstance(b, dict) for b in payload["conditions"].values()):
                        reasons.append("condition_block_not_object")
        entry = {"session_id": sid, "participant_code": pid, "status": session.get("status"),
            "synthetic": synthetic, "withdrawn": withdrawn, "included": not reasons,
            "exclusion_reasons": reasons, "assigned_order": session.get("order"),
            "latest_sequence": session.get("latest_sequence"), "snapshot_present": latest is not None}
        audit.append(entry)
        if reasons:
            continue
        included.append(pid)
        blocks = payload.get("conditions", {})
        entry["actual_order_from_client_starts"], entry["actual_order_basis"] = actual_order(blocks)
        entry["order_from_retained_task_events"] = event_order(payload)
        entry["order_deviation"] = len(entry["actual_order_from_client_starts"]) == 2 and entry["actual_order_from_client_starts"] != session["order"]
        for condition in CONDITIONS:
            row = observation(session, condition, payload, truth)
            row["actual_order_from_client_starts"] = entry["actual_order_from_client_starts"]
            row["actual_position_from_client_starts"] = entry["actual_order_from_client_starts"].index(condition) + 1 if condition in entry["actual_order_from_client_starts"] else None
            row["order_deviation"] = entry["order_deviation"]
            observations.append(row)
    descriptive, paired = {}, {}
    for condition in CONDITIONS:
        rows = [r for r in observations if r["condition"] == condition]
        descriptive[condition] = {"rows": len(rows), "attempted": sum(r["attempted"] for r in rows),
            "status_counts": dict(Counter(r["status"] for r in rows)),
            "outcomes": {metric: summary([r[metric] for r in rows if r[metric] is not None]) for metric in OUTCOMES}}
    indexed = {(r["participant_code"], r["condition"]): r for r in observations}
    for metric in OUTCOMES:
        pairs, missing = [], []
        for pid in included:
            baseline, guided = (indexed.get((pid, c)) for c in CONDITIONS)
            if baseline[metric] is not None and guided[metric] is not None:
                pairs.append({"participant_code": pid, "baseline": baseline[metric], "guided": guided[metric],
                              "guided_minus_baseline": guided[metric] - baseline[metric]})
            else:
                missing.append({"participant_code": pid,
                    "baseline": ineligibility(baseline, metric) if baseline[metric] is None else [],
                    "guided": ineligibility(guided, metric) if guided[metric] is None else []})
        paired[metric] = {**summary([p["guided_minus_baseline"] for p in pairs]), "pairs": pairs, "missing_pairs": missing,
                          "unit": "percentage points" if metric in ("completeness_pct", "accuracy_pct") else "seconds" if metric == "seconds" else "score points" if metric == "sus" else "count",
                          "direction": "guided minus baseline"}
    order_flow = []
    for assigned in (["baseline", "guided"], ["guided", "baseline"]):
        entries = [s for s in audit if not s["synthetic"] and s["assigned_order"] == assigned]
        usable = [s for s in entries if s["included"]]
        order_flow.append({"assigned_order": assigned, "exported_human_session_rows": len(entries),
            "withdrawn_session_rows": sum(s["withdrawn"] for s in entries),
            "included_sessions": len(usable),
            "both_blocks_completed": sum(all(indexed[(s["participant_code"], c)]["completed"] for c in CONDITIONS) for s in usable),
            "complete_pairs_by_outcome": {metric: sum(any(p["participant_code"] == s["participant_code"] for p in paired[metric]["pairs"]) for s in usable) for metric in OUTCOMES}})
    return {"analysis_version": "hll04.remote.analysis.v1", "config_version": VERSION,
        "unit": "participant; six synthetic tasks per condition; 24 required metadata cells",
        "counts": {"exported_sessions": len(sessions), "included_human_sessions": len(included),
            "synthetic_sessions_excluded": sum(s["synthetic"] for s in audit),
            "withdrawn_sessions_excluded": sum(s["withdrawn"] for s in audit),
            "excluded_sessions": sum(not s["included"] for s in audit),
            "sessions_with_any_attempt": len({r["participant_code"] for r in observations if r["attempted"]}),
            "attempted_conditions": sum(r["attempted"] for r in observations),
            "completed_conditions": sum(r["completed"] for r in observations)},
        "sessions": audit, "observations": observations, "order_flow": order_flow,
        "descriptive_by_condition": descriptive, "paired": paired,
        "caveats": ["No human identity authentication is inferred from a session or participant code.",
            "Synthetic and withdrawn sessions are excluded. All raw input files remain unchanged.",
            "Quality includes observed attempted blocks, including incomplete blocks; drafts are separate and never counted as saved records.",
            "Time requires a completed block, a reported generated artifact, valid client start/end and 0..900000 integer elapsed milliseconds; capped/abandoned times remain raw only.",
            "SUS eligibility is independent of time and quality, but requires an attempted block and ten actual valid answers marked completed.",
            "Client timing and environmental/interruption reports are unmoderated; no elapsed time is silently reduced for interruptions.",
            "Raw blur is not an interruption/exclusion by itself: a legitimate iframe focus change can cause it. Hidden/reload/offline flags are reported separately without automatic exclusion.",
            "Image matches compare reported selection hashes with frozen truth, not independently received image bytes or scene truth.",
            "Export generation is a client report, download_requested is a browser request, and opened_confirmed is participant self-report; none proves receipt by itself.",
            "Condition summaries can use different participants. Each outcome pairs only its own eligible complete pairs. No imputation, p-values or grade prediction.",
            "Retained task events may be truncated; client start timestamps are the primary recorded order evidence."]}


def safe_csv_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, allow_nan=False)
    if not isinstance(value, str):
        return value
    return "'" + value if re.match(r"^[\t\r\n']|^\s*[=+\-@]", value) else value


def write_outputs(result, output):
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ("analysis.json", "observations.csv", "paired-outcomes.csv"):
        if (output / name).exists():
            raise ValueError("Refusing to overwrite existing analysis output: " + str(output / name))
    (output / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    columns = ["participant_code", "session_id", "condition", "assigned_position", "actual_position_from_client_starts", "actual_order_from_client_starts", "order_deviation", "session_status", "status", "attempted", "completed",
               *OUTCOMES, "raw_elapsed_ms", "quality_eligible", "identity_flags", "quality_flags", "time_ineligibility", "sus_ineligibility",
               "raw_sus", "comments", "draft_present", "export_generated_reported", "export_download_requested",
               "export_opened_confirmed_self_report", "environment", "session_interruption_counts", "flags", "raw_records"]
    with (output / "observations.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in result["observations"]:
            writer.writerow({column: safe_csv_value(row.get(column)) for column in columns})
    with (output / "paired-outcomes.csv").open("w", newline="", encoding="utf-8") as handle:
        columns = ["outcome", "participant_code", "baseline", "guided", "guided_minus_baseline", "unit"]
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for metric, data in result["paired"].items():
            for pair in data["pairs"]:
                writer.writerow({k: safe_csv_value(v) for k, v in {"outcome": metric, **pair, "unit": data["unit"]}.items()})
    for name in ("analysis.json", "observations.csv", "paired-outcomes.csv"):
        os.chmod(output / name, 0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export_directory", type=Path, help="Private export directory containing sessions.json")
    parser.add_argument("--out", required=True, type=Path, help="New private analysis directory, outside the raw export")
    parser.add_argument("--truth", type=Path, default=Path(__file__).resolve().parents[1] / "eval" / "truth.json")
    args = parser.parse_args()
    root, output = args.export_directory.resolve(), args.out.resolve()
    if output == root or root in output.parents:
        parser.error("Analysis output must be outside the preserved raw export directory")
    source = root / "sessions.json"
    if digest(args.truth) != FROZEN_TRUTH_SHA256:
        parser.error("Truth SHA256 differs from the six frozen v3-reused task labels/images; do not remap silently")
    result = analyze_sessions(read_json(source), read_json(args.truth))
    result["generated_at"] = datetime.now(timezone.utc).isoformat()
    result["sources"] = {"sessions_json": str(source), "sessions_sha256": digest(source),
                         "truth_json": str(args.truth.resolve()), "truth_sha256": digest(args.truth)}
    write_outputs(result, output)
    print(json.dumps({"counts": result["counts"], "complete_pairs_by_outcome": {k: v["n"] for k, v in result["paired"].items()}, "output_directory": str(output)}))


if __name__ == "__main__":
    main()
