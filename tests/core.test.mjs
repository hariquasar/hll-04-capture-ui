import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { scratch } from "./paths.mjs";
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
  assert.equal(s.events.at(-1).type, "save_blocked");
  assert.deepEqual(s.events.at(-1).errors, ["image"]);
});

test("blocked and ok saves are logged as events", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, null, good)); C.trySave(s, C.makeRecord(s, img(), good));
  assert.deepEqual(s.events.map(e => e.type), ["save_blocked", "save_ok"]);
});

test("ids are sequential and session needs operator", () => {
  const s = C.newSession("h", "t", new Date("2026-10-20T01:02:03Z"));
  assert.match(s.session_id, /^S-20261020T010203-[0-9a-f-]{36}$/);
  C.trySave(s, C.makeRecord(s, img("a"), good));
  assert.equal(C.makeRecord(s, img("b"), good).record_id, `${s.session_id}-002`);
  assert.throws(() => C.newSession("  ", "t"));
});

test("IDs survive deletion and JSON reload", () => {
  let s = C.newSession("h", "t");
  for (const h of ["a", "b", "c"]) C.trySave(s, C.makeRecord(s, img(h), good));
  s.records.pop(); s = JSON.parse(JSON.stringify(s));
  assert.match(C.makeRecord(s, img("d"), good).record_id, /-004$/);
});

test("optional evaluation task ID survives exports", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, img(), { ...good, task_id: "6" }));
  assert.equal(C.toManifest(s).records[0].task_id, "6");
  assert.ok(C.toCSV(s).split("\n")[0].includes("task_id"));
});

test("evaluation IDs reject whitespace and punctuation rather than normalize", () => {
 for (const task_id of [' 1', '1 ', 'task/1']) {
  const s = C.newSession('h', 't');
  assert.equal(C.trySave(s, C.makeRecord(s, img(), { ...good, task_id })).saved, false);
 }
});
test("completeness metric", () => {
  assert.equal(C.completeness({ image: img(), meta: good }), 1);
  assert.equal(C.completeness({ image: null, meta: {} }), 0);
});

test("CSV escapes commas/quotes/newlines", () => {
  const s = C.newSession("h", "t");
  C.trySave(s, C.makeRecord(s, img(), { ...good, notes: 'a,"b"\nc' }));
  const csv = C.toCSV(s);
  assert.ok(csv.includes('"a,""b""\nc"')); assert.equal(csv.split("\n")[0].split(",").length, 14);
});

test("zip output is valid (unzip -t)", () => {
  const z = C.zip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "img/b.bin", data: new Uint8Array([1, 2, 3]) }]);
  const p = join(mkdtempSync(join(scratch, "hll-zip-")), "t.zip"); writeFileSync(p, z);
  assert.match(execFileSync("unzip", ["-t", p]).toString(), /No errors/);
});

test("scoring vs ground truth", () => {
  const truth = [{ task_id: 1, ...good }];
  assert.deepEqual(C.scoreAgainstTruth([{ task_id: 1, meta: good }], truth), { completeness: 1, accuracy: 1, cells: 4 });
  const r = C.scoreAgainstTruth([{ task_id: 1, meta: { ...good, location: "", condition: "poor" } }], truth);
  assert.equal(r.completeness, 0.75); assert.equal(r.accuracy, 0.5);
});

test("sessions created in the same second have distinct identities", () => {
  const now = new Date("2026-10-20T01:02:03Z");
  assert.notEqual(C.newSession('h','t',now).session_id, C.newSession('h','t',now).session_id);
});

test("study mode requires a frozen task ID; ordinary mode keeps it optional", () => {
  const s = C.newSession('h','t'); s.study = { enabled:true, task_ids:['1','2','3','4','5','6'] };
  for (const task_id of ['', '7', '01']) assert.equal(C.trySave(s,C.makeRecord(s,img(task_id),{...good,task_id})).saved,false);
  assert.equal(C.trySave(s,C.makeRecord(s,img('one'),{...good,task_id:'1'})).saved,true);
  assert.equal(C.trySave(s,C.makeRecord(s,img('duplicate'),{...good,task_id:'1'})).saved,false);
  const normal=C.newSession('h','t');
  assert.equal(C.trySave(normal,C.makeRecord(normal,img('a'),good)).saved,true);
  assert.equal(C.trySave(normal,C.makeRecord(normal,img('b'),good)).saved,true);
});

test("nonempty ordinary task IDs cannot collide", () => {
  const s=C.newSession('h','t');
  assert.equal(C.trySave(s,C.makeRecord(s,img('a'),{...good,task_id:'task1'})).saved,true);
  assert.equal(C.trySave(s,C.makeRecord(s,img('b'),{...good,task_id:'task1'})).saved,false);
});

test("metadata editing preserves image and identity and records before/after", () => {
  const s=C.newSession('h','t'); const r=C.makeRecord(s,img(),{...good,task_id:'1',notes:'old'});C.trySave(s,r);
  const image=r.image,id=r.record_id,stamp=r.timestamp;
  assert.equal(C.updateRecord(s,id,{...good,task_id:'1',notes:'new'}).saved,true);
  assert.equal(s.records.length,1);assert.equal(r.image,image);assert.equal(r.record_id,id);assert.equal(r.timestamp,stamp);
  assert.equal(r.meta.notes,'new');assert.equal(s.events.at(-1).type,'edit_ok');
  assert.equal(s.events.at(-1).before.notes,'old');assert.equal(s.events.at(-1).after.notes,'new');
});

test("invalid edits and duplicate task IDs leave original metadata unchanged", () => {
  const s=C.newSession('h','t');for(const task_id of ['1','2'])C.trySave(s,C.makeRecord(s,img(task_id),{...good,task_id}));
  const r=s.records[0],before=JSON.stringify(r);
  assert.equal(C.updateRecord(s,r.record_id,{...good,task_id:'2'}).saved,false);assert.equal(JSON.stringify(r),before);
  assert.equal(C.updateRecord(s,r.record_id,{...good,task_id:'1',subject_id:'bad'}).saved,false);assert.equal(JSON.stringify(r),before);
});

test("CSV neutralizes formula-like text and original leading apostrophes while manifest stays raw", () => {
  for(const notes of ['=1+1',' +SUM(1,1)','-1+1','@SUM(1,1)','\t=1+1','\rtext',"'=1+1"]){
    const s=C.newSession('h','t');C.trySave(s,C.makeRecord(s,img(),{...good,notes}));
    assert.equal(C.spreadsheetSafeValue(notes),"'"+notes);
    assert.equal(C.toManifest(s).records[0].meta.notes,notes);
    assert.equal(C.toManifest(s).csv_text_policy,C.CSV_TEXT_POLICY);
  }
  assert.equal(C.spreadsheetSafeValue('ordinary text'),'ordinary text');
  assert.equal(C.spreadsheetSafeValue("a'b"),"a'b");
});

test("CSV quotes carriage returns in ordinary text", () => {
  const s=C.newSession('h','t');C.trySave(s,C.makeRecord(s,img(),{...good,notes:'a\rb'}));
  assert.ok(C.toCSV(s).includes('"a\rb"'));
});

test("scoring rejects missing, blank, malformed and non-text required truth fields", () => {
  for (const [field, value] of [['location',undefined],['location',''],['location','   '],['location',42],['location',true],['location',{}],['scenario','space'],['subject_id','bad'],['condition','broken']]) {
    assert.throws(() => C.scoreAgainstTruth([{task_id:'1',meta:good}],[{task_id:'1',...good,[field]:value}]), /Invalid truth task 1, field/);
  }
});

test("scoring normalizes comparison on both sides without modifying raw metadata or truth", () => {
  const records=[{task_id:'1',meta:{...good,location:'  LAB B5  '}}];
  const truth=[{task_id:'1',...good,location:' Lab B5 '}];
  const before=JSON.stringify({records,truth});
  assert.deepEqual(C.scoreAgainstTruth(records,truth),{completeness:1,accuracy:1,cells:4});
  assert.equal(JSON.stringify({records,truth}),before);
});
