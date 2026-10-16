import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as C from "../src/core.mjs";

const img = (h = "abc") => ({ file: `${h}.jpg`, sha256: h, source: "import" });
const good = { scenario: "indoor", location: "Lab B5", subject_id: "EQ-1234", condition: "good" };

test("complete record passes the gate", () => {
  const s = C.newSession("harry", "test");
  const r = C.trySave(s, C.makeRecord(s, img(), good));
  assert.equal(r.saved, true); assert.equal(s.records.length, 1);
});

test("missing image is blocked", () => {
  const s = C.newSession("harry", "test");
  const r = C.trySave(s, C.makeRecord(s, null, good));
  assert.equal(r.saved, false); assert.ok(r.errors.image);
});

test("each missing required field is blocked", () => {
  for (const k of Object.keys(good)) {
    const s = C.newSession("h", "t"); const m = { ...good, [k]: "" };
    const r = C.trySave(s, C.makeRecord(s, img(), m));
    assert.equal(r.saved, false, k); assert.ok(r.errors[k], k);
  }
});

test("invalid format / option / whitespace rejected", () => {
  const s = C.newSession("h", "t");
  assert.ok(C.trySave(s, C.makeRecord(s, img(), { ...good, subject_id: "eq1234" })).errors.subject_id);
  assert.ok(C.trySave(s, C.makeRecord(s, img(), { ...good, scenario: "space" })).errors.scenario);
  assert.ok(C.trySave(s, C.makeRecord(s, img(), { ...good, location: "   " })).errors.location);
  assert.ok(C.trySave(s, C.makeRecord(s, img(), { ...good, notes: "x".repeat(501) })).errors.notes);
});

test("optional notes may be empty", () => {
  const s = C.newSession("h", "t");
  assert.equal(C.trySave(s, C.makeRecord(s, img(), { ...good, notes: "" })).saved, true);
});

test("duplicate image hash rejected", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, img("x"), good));
  assert.equal(C.trySave(s, C.makeRecord(s, img("x"), good)).saved, false);
});

test("blocked and ok saves are logged as events", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, null, good)); C.trySave(s, C.makeRecord(s, img(), good));
  assert.deepEqual(s.events.map(e => e.type), ["save_blocked", "save_ok"]);
});

test("ids are sequential and session needs operator", () => {
  const s = C.newSession("h", "t", new Date("2026-10-20T01:02:03Z"));
  assert.equal(s.session_id, "S-20261020T010203");
  C.trySave(s, C.makeRecord(s, img("a"), good));
  assert.equal(C.makeRecord(s, img("b"), good).record_id, "S-20261020T010203-002");
  assert.throws(() => C.newSession("  ", "t"));
});

test("completeness metric", () => {
  assert.equal(C.completeness({ image: img(), meta: good }), 1);
  assert.equal(C.completeness({ image: null, meta: {} }), 0);
});

test("CSV escapes commas/quotes/newlines", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, img(), { ...good, notes: 'a,"b"\nc' }));
  const csv = C.toCSV(s);
  assert.ok(csv.includes('"a,""b""\nc"')); assert.equal(csv.split("\n")[0].split(",").length, 13);
});

test("zip output is valid (unzip -t)", () => {
  const z = C.zip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "img/b.bin", data: new Uint8Array([1, 2, 3]) }]);
  const p = join(mkdtempSync(join(tmpdir(), "z")), "t.zip"); writeFileSync(p, z);
  assert.match(execFileSync("unzip", ["-t", p]).toString(), /No errors/);
});

test("scoring vs ground truth", () => {
  const truth = [{ task_id: 1, ...good }];
  assert.deepEqual(C.scoreAgainstTruth([{ task_id: 1, meta: good }], truth), { completeness: 1, accuracy: 1, cells: 4 });
  const r = C.scoreAgainstTruth([{ task_id: 1, meta: { ...good, location: "", condition: "poor" } }], truth);
  assert.equal(r.completeness, 0.75); assert.equal(r.accuracy, 0.5);
});
