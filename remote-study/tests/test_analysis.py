"""Synthetic unit fixtures only. No live participant data or AWS calls.

Some fabricated fixtures set synthetic=False solely to exercise the human-analysis
branch. They are created in memory/temporary directories and never study exports.
"""
import copy
import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "remote-study" / "analyze.py"
SPEC = importlib.util.spec_from_file_location("remote_analysis", SCRIPT)
analysis = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(analysis)
TRUTH = json.loads((ROOT / "eval" / "truth.json").read_text())


def records():
    return [{"record_id": "synthetic-record-" + task["task_id"],
             **{key: task[key] for key in ("task_id", *analysis.FIELDS, "image_file", "image_sha256")},
             "notes": "Synthetic unit fixture; not a participant observation."}
            for task in TRUTH["tasks"]]


def block(condition):
    minute = "00" if condition == "baseline" else "03"
    end = "01" if condition == "baseline" else "04"
    return {"status": "completed", "started_at": f"2026-10-21T00:{minute}:00Z",
            "ended_at": f"2026-10-21T00:{end}:00Z", "elapsed_ms": 60000,
            "records": records(), "draft": None,
            "sus": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1],
            "questionnaire_status": "completed", "comments": "Synthetic unit fixture only.",
            "export": {"requested_at": "2026-10-21T00:04:00Z", "sha256": "a" * 64,
                       "bytes": 123, "download_requested": True, "opened_confirmed": False}}


def session(number=1, synthetic=False):
    pid = ("S" if synthetic else "P") + f"{number:03}"
    sid = f"synthetic-unit-session-{number}"
    order = ["baseline", "guided"] if number % 2 else ["guided", "baseline"]
    environment = {"user_agent": "SYNTHETIC_UNIT_TEST", "platform": "fixture", "viewport_width": 1280}
    consent = {"agreed": True, "adult": True, "version": "HLL04-remote-consent-v1"}
    snapshot = {"schema": analysis.SCHEMA, "config_version": analysis.VERSION,
                "session_id": sid, "participant_code": pid, "synthetic": synthetic,
                "order": order, "consent": consent, "environment": environment,
                "sequence": 3, "server_received_at": "2026-10-21T00:05:00Z",
                "payload": {"phase": "complete", "conditions": {c: block(c) for c in analysis.CONDITIONS},
                            "events": [], "interruption_counts": {"hidden": 0, "reload": 0}}}
    return {"session_id": sid, "participant_code": pid, "synthetic": synthetic,
            "order": order, "status": "submitted", "config_version": analysis.VERSION,
            "consent": consent, "environment": environment, "latest_sequence": 3,
            "latest": snapshot, "withdrawal": None}


def get_block(item, condition="baseline"):
    return item["latest"]["payload"]["conditions"][condition]


def run(item):
    return analysis.analyze_sessions(item if isinstance(item, list) else [item], TRUTH)


class AnalysisTests(unittest.TestCase):
    def test_six_tasks_have_24_cells_and_separate_image_hashes(self):
        report = run(session())
        row = report["observations"][0]
        self.assertEqual((row["metadata_nonempty"], row["metadata_correct"], row["metadata_denominator"]), (24, 24, 24))
        self.assertEqual(row["reported_image_hash_matches"], 6)
        self.assertEqual(report["paired"]["accuracy_pct"]["n"], 1)
        self.assertEqual(report["counts"]["attempted_conditions"], 2)
        self.assertIn("not collected", row["image_trust"])

    def test_missing_task_and_draft_do_not_shrink_denominator(self):
        item = session()
        b = get_block(item)
        b["draft"] = b["records"].pop()
        row = run(item)["observations"][0]
        self.assertEqual(row["metadata_denominator"], 24)
        self.assertEqual(row["metadata_correct"], 20)
        self.assertEqual(row["missing_task_ids"], ["6"])
        self.assertAlmostEqual(row["accuracy_pct"], 100 * 20 / 24)
        self.assertEqual(row["reported_image_hash_matches"], 5)
        self.assertTrue(row["draft_present"])

    def test_wrong_valid_answer_and_format_error_are_distinct_and_raw_preserved(self):
        item = session()
        record = get_block(item)["records"][0]
        record["condition"] = "poor"
        record["subject_id"] = "  eq-1021  "
        before = copy.deepcopy(item)
        row = run(item)["observations"][0]
        self.assertEqual(row["metadata_correct"], 23)
        self.assertEqual(row["format_errors"], 1)
        self.assertEqual(row["raw_records"][0]["subject_id"], "  eq-1021  ")
        self.assertEqual(item, before)

    def test_ambiguous_ids_are_not_guessed_and_do_not_remove_time_or_sus(self):
        for value in ("01", " 1", "", 1, None, "2"):
            with self.subTest(value=value):
                item = session()
                get_block(item)["records"][0]["task_id"] = value
                row = run(item)["observations"][0]
                self.assertFalse(row["quality_eligible"])
                self.assertIsNone(row["accuracy_pct"])
                self.assertTrue(row["identity_flags"])
                self.assertEqual(row["seconds"], 60)
                self.assertEqual(row["sus"], 100)

    def test_missing_field_is_missing_cell_but_nonstrings_are_unscorable(self):
        item = session()
        del get_block(item)["records"][0]["location"]
        row = run(item)["observations"][0]
        self.assertEqual(row["metadata_nonempty"], 23)
        get_block(item)["records"][0]["location"] = 42
        row = run(item)["observations"][0]
        self.assertIsNone(row["completeness_pct"])
        self.assertIn("task_1:location:not_string", row["quality_flags"])

    def test_image_hash_mismatch_is_not_inferred_from_filename(self):
        item = session()
        get_block(item)["records"][0]["image_sha256"] = "b" * 64
        row = run(item)["observations"][0]
        self.assertEqual(row["accuracy_pct"], 100)
        self.assertEqual(row["reported_image_hash_matches"], 5)
        self.assertEqual(row["image_diagnostics"][0]["status"], "reported_mismatch_or_invalid")

    def test_completed_time_bounds_and_strict_integer_type(self):
        for value, eligible in ((0, True), (900000, True), (-1, False), (900001, False), (True, False), (123.5, False), ("100", False), (None, False)):
            with self.subTest(value=value):
                item = session()
                get_block(item)["elapsed_ms"] = value
                row = run(item)["observations"][0]
                self.assertEqual(row["time_eligible"], eligible)
                self.assertEqual(row["accuracy_pct"], 100)

    def test_capped_time_excluded_but_quality_and_valid_sus_remain(self):
        item = session()
        b = get_block(item)
        b["status"] = "capped"
        b["elapsed_ms"] = 900000
        b["records"] = b["records"][:2]
        report = run(item)
        row = report["observations"][0]
        self.assertIsNone(row["seconds"])
        self.assertEqual(row["raw_elapsed_ms"], 900000)
        self.assertEqual(row["metadata_correct"], 8)
        self.assertEqual(row["sus"], 100)
        self.assertEqual(report["paired"]["seconds"]["n"], 0)
        self.assertEqual(report["paired"]["sus"]["n"], 1)
        self.assertEqual(report["descriptive_by_condition"]["baseline"]["status_counts"], {"capped": 1})

    def test_incomplete_sus_preserves_valid_time_and_quality(self):
        item = session()
        b = get_block(item)
        b["sus"][3] = None
        b["questionnaire_status"] = "skipped"
        report = run(item)
        self.assertEqual(report["paired"]["seconds"]["n"], 1)
        self.assertEqual(report["paired"]["accuracy_pct"]["n"], 1)
        self.assertEqual(report["paired"]["sus"]["n"], 0)
        self.assertEqual(report["descriptive_by_condition"]["guided"]["outcomes"]["sus"]["n"], 1)

    def test_sus_rejects_bool_string_and_out_of_range_and_scores_original_rule(self):
        self.assertEqual(analysis.sus_score([3] * 10), 50)
        self.assertEqual(analysis.sus_score([1, 5] * 5), 0)
        for value in (True, "3", 0, 6, 2.5, None):
            answers = [3] * 10
            answers[0] = value
            self.assertIsNone(analysis.sus_score(answers))

    def test_active_partial_and_empty_enrolment_stay_in_flow(self):
        partial = session(1)
        partial["status"] = "active"
        partial["latest"]["payload"]["phase"] = "task"
        get_block(partial)["status"] = "in_progress"
        get_block(partial)["records"] = []
        partial["latest"]["payload"]["conditions"].pop("guided")
        enrolled = session(2)
        enrolled["status"] = "active"
        enrolled["latest"] = None
        result = run([partial, enrolled])
        self.assertEqual(result["counts"]["included_human_sessions"], 2)
        self.assertEqual(result["counts"]["sessions_with_any_attempt"], 1)
        self.assertEqual(result["counts"]["attempted_conditions"], 1)
        self.assertEqual(result["observations"][0]["accuracy_pct"], 0)
        self.assertIsNone(result["observations"][2]["accuracy_pct"])

    def test_synthetic_withdrawn_and_wrong_versions_never_count_as_participants(self):
        synthetic = session(1, synthetic=True)
        withdrawn = session(2)
        withdrawn.update(status="withdrawn", latest=None, withdrawal={"cleanup_pending": False})
        wrong_version = session(3)
        wrong_version["config_version"] = "old-build"
        report = run([synthetic, withdrawn, wrong_version])
        self.assertEqual(report["counts"]["exported_sessions"], 3)
        self.assertEqual(report["counts"]["included_human_sessions"], 0)
        self.assertEqual(report["observations"], [])
        self.assertEqual(report["counts"]["synthetic_sessions_excluded"], 1)
        self.assertEqual(report["counts"]["withdrawn_sessions_excluded"], 1)

    def test_duplicate_session_or_participant_excludes_all_ambiguous_entries(self):
        for key in ("session_id", "participant_code"):
            items = [session(1), session(2)]
            items[1][key] = items[0][key]
            items[1]["latest"][key] = items[0][key]
            report = run(items)
            self.assertEqual(report["counts"]["included_human_sessions"], 0)
            self.assertTrue(all("duplicate_" + key in entry["exclusion_reasons"] for entry in report["sessions"]))

    def test_latest_metadata_mismatch_and_missing_consent_are_explicit(self):
        item = session()
        item["latest"]["config_version"] = "old-build"
        item["consent"]["agreed"] = False
        entry = run(item)["sessions"][0]
        self.assertIn("latest_metadata_disagreement:config_version", entry["exclusion_reasons"])
        self.assertIn("consent_not_confirmed", entry["exclusion_reasons"])

    def test_actual_order_and_interruptions_do_not_invent_observation_or_adjust_time(self):
        item = session(2)
        item["latest"]["payload"]["interruption_counts"] = {"hidden": 2, "offline": 1}
        report = run(item)
        self.assertTrue(report["sessions"][0]["order_deviation"])
        self.assertEqual(report["sessions"][0]["actual_order_from_client_starts"], ["baseline", "guided"])
        self.assertEqual(report["observations"][0]["session_interruption_counts"]["hidden"], 2)
        self.assertEqual(report["observations"][0]["seconds"], 60)
        get_block(item)["ended_at"] = "2026-10-20T00:00:00Z"
        self.assertIsNone(run(item)["observations"][0]["seconds"])

    def test_export_generation_download_request_and_open_selfreport_are_distinct(self):
        item = session()
        row = run(item)["observations"][0]
        self.assertTrue(row["export_generated_reported"])
        self.assertTrue(row["export_download_requested"])
        self.assertFalse(row["export_opened_confirmed_self_report"])
        get_block(item)["export"]["bytes"] = 0
        get_block(item)["export"]["opened_confirmed"] = True
        row = run(item)["observations"][0]
        self.assertFalse(row["export_generated_reported"])
        self.assertTrue(row["export_opened_confirmed_self_report"])
        self.assertIsNone(row["seconds"])
        self.assertIn("completed_without_generated_artifact", row["flags"])
        self.assertEqual(row["accuracy_pct"], 100)
        self.assertEqual(row["sus"], 100)

    def test_iframe_blur_is_not_an_eligibility_filter_and_order_flow_keeps_dropouts(self):
        first, second = session(1), session(2)
        first["latest"]["payload"]["interruption_counts"] = {"blur": 12, "hidden": 0, "reload": 0}
        second["status"] = "active"
        second["latest"]["payload"]["conditions"]["guided"]["status"] = "abandoned"
        report = run([first, second])
        self.assertEqual(report["observations"][0]["seconds"], 60)
        self.assertNotIn("blur", report["observations"][0]["flags"])
        self.assertEqual(report["order_flow"][1]["included_sessions"], 1)
        self.assertEqual(report["order_flow"][1]["both_blocks_completed"], 0)
        self.assertEqual(report["order_flow"][1]["complete_pairs_by_outcome"]["seconds"], 0)

    def test_each_outcome_pairs_its_own_people_and_percentage_points(self):
        first, second = session(1), session(2)
        get_block(first, "baseline")["records"][0]["condition"] = "poor"
        get_block(second, "guided")["status"] = "capped"
        get_block(second, "baseline")["sus"] = []
        report = run([first, second])
        self.assertEqual(report["paired"]["accuracy_pct"]["n"], 2)
        self.assertEqual(report["paired"]["seconds"]["n"], 1)
        self.assertEqual(report["paired"]["sus"]["n"], 1)
        self.assertEqual(report["paired"]["accuracy_pct"]["unit"], "percentage points")
        self.assertAlmostEqual(report["paired"]["accuracy_pct"]["mean"], 100 / 24 / 2)

    def test_truth_rejects_missing_fields_bad_ids_and_bad_hash(self):
        for change in ("field", "id", "hash"):
            truth = copy.deepcopy(TRUTH)
            if change == "field":
                del truth["tasks"][0]["location"]
            elif change == "id":
                truth["tasks"][0]["task_id"] = 1
            else:
                truth["tasks"][0]["image_sha256"] = "invalid"
            with self.assertRaises(ValueError):
                analysis.analyze_sessions([], truth)

    def test_csv_formula_escape_without_changing_json_or_numeric_differences(self):
        for value in ("=1+1", "  +sum(1)", "-evil", "@SUM(1)", "\tvalue", "\rvalue", "\nvalue", "'literal"):
            self.assertEqual(analysis.safe_csv_value(value), "'" + value)
        self.assertEqual(analysis.safe_csv_value(-12.5), -12.5)
        item = session()
        get_block(item)["comments"] = '=HYPERLINK("https://example.invalid","fixture")'
        with tempfile.TemporaryDirectory(prefix="hll04-synthetic-analysis-") as tmp:
            path = Path(tmp) / "analysis"
            report = run(item)
            analysis.write_outputs(report, path)
            loaded = json.loads((path / "analysis.json").read_text())
            self.assertEqual(loaded["observations"][0]["comments"], get_block(item)["comments"])
            with (path / "observations.csv").open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["comments"], "'" + get_block(item)["comments"])
            with self.assertRaises(ValueError):
                analysis.write_outputs(report, path)

    def test_cli_uses_latest_only_and_keeps_raw_bytes(self):
        with tempfile.TemporaryDirectory(prefix="hll04-synthetic-analysis-") as tmp:
            root = Path(tmp)
            raw = root / "private-export"
            raw.mkdir()
            source = raw / "sessions.json"
            source.write_text(json.dumps([session()], ensure_ascii=False))
            # Historical/synthetic fixture files must not become extra participants.
            history = raw / "sessions" / "fixture" / "checkpoints"
            history.mkdir(parents=True)
            (history / "old.json").write_text(json.dumps(session()["latest"]))
            before = source.read_bytes()
            command = [sys.executable, str(SCRIPT), str(raw), "--out", str(root / "analysis")]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)["counts"]["included_human_sessions"], 1)
            self.assertEqual(source.read_bytes(), before)
            refused = subprocess.run([sys.executable, str(SCRIPT), str(raw), "--out", str(raw / "analysis")], capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            invalid = root / "invalid.json"
            invalid.write_text('{"value":NaN}')
            with self.assertRaises(ValueError):
                analysis.read_json(invalid)


if __name__ == "__main__":
    unittest.main()
