// Score a study run.  node eval/score.mjs <truth.json> <results-dir>
// results-dir contains per participant: P01-guided.zip (or extracted manifest.json) and P01-baseline.csv
// Baseline CSV columns: task_id,file,scenario,location,subject_id,condition,notes
// Guided records are matched to tasks by the order participants did them (task_order in truth.json).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { scoreAgainstTruth, SCHEMA, validateField } from "../src/core.mjs";

const [truthPath, dir] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const tasks = truth.tasks;

function parseCSV(t) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...b] = rows.filter(r => r.some(x => x.trim()));
  return b.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

const formatErrors = recs => recs.reduce((n, r) => n + SCHEMA.filter(f => f.required && r.meta[f.key] && validateField(f, r.meta[f.key])).length, 0);
const ids = [...new Set(readdirSync(dir).map(f => f.match(/^(P\d+)-/)?.[1]).filter(Boolean))].sort();
const rows = [];
for (const pid of ids) {
  for (const cond of ["baseline", "guided"]) {
    let recs = [];
    if (cond === "baseline") {
      const p = join(dir, `${pid}-baseline.csv`); if (!existsSync(p)) continue;
      recs = parseCSV(readFileSync(p, "utf8")).map(r => ({ task_id: Number(r.task_id), file: r.file, meta: r }));
    } else {
      const z = join(dir, `${pid}-guided.zip`); if (!existsSync(z)) continue;
      const m = JSON.parse(execFileSync("unzip", ["-p", z, "manifest.json"]).toString());
      recs = m.records.map((r, i) => ({ task_id: tasks[i]?.task_id, file: r.image.file, meta: r.meta }));
    }
    const s = scoreAgainstTruth(recs, tasks);
    const missingImg = tasks.filter(t => !recs.find(r => r.task_id === t.task_id)?.file).length;
    rows.push({ pid, cond, records: recs.length, completeness: +(s.completeness * 100).toFixed(1), accuracy: +(s.accuracy * 100).toFixed(1), format_errors: formatErrors(recs), missing_image_links: missingImg });
  }
}
console.table(rows);
for (const cond of ["baseline", "guided"]) {
  const r = rows.filter(x => x.cond === cond); if (!r.length) continue;
  const mean = k => (r.reduce((a, x) => a + x[k], 0) / r.length).toFixed(1);
  console.log(`${cond}: n=${r.length} completeness=${mean("completeness")}% accuracy=${mean("accuracy")}% format_errors=${mean("format_errors")} missing_images=${mean("missing_image_links")}`);
}
console.log("Task time + SUS: enter in eval/timing-sus.csv and run eval/sus.mjs");
