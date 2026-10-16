// SUS + time summary.  node eval/sus.mjs eval/timing-sus.csv
// CSV: pid,cond,seconds,q1,...,q10   (q = 1..5, Brooke 1996)
import { readFileSync } from "node:fs";
export const sus = q => 2.5 * q.reduce((a, v, i) => a + (i % 2 === 0 ? v - 1 : 5 - v), 0);
if (process.argv[2]) {
  const [h, ...rows] = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).map(l => l.split(","));
  const data = rows.map(r => ({ pid: r[0], cond: r[1], seconds: +r[2], sus: sus(r.slice(3, 13).map(Number)) }));
  console.table(data);
  for (const c of ["baseline", "guided"]) {
    const d = data.filter(x => x.cond === c); if (!d.length) continue;
    const m = k => d.reduce((a, x) => a + x[k], 0) / d.length;
    const med = [...d.map(x => x.seconds)].sort((a, b) => a - b)[Math.floor(d.length / 2)];
    console.log(`${c}: n=${d.length} mean_time=${m("seconds").toFixed(0)}s median_time=${med}s mean_SUS=${m("sus").toFixed(1)}`);
  }
}
