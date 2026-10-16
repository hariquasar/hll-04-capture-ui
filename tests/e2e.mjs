// Browser E2E: node tests/e2e.mjs (needs server on :8765 and playwright-core)
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const out = process.argv[2] || "/tmp/hll04";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ acceptDownloads: true });
p.on("dialog", d => d.dismiss());
await p.goto("http://127.0.0.1:8765/index.html");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

await p.click("#startBtn");
ok(await p.textContent("#sessionErr") !== "", "session needs operator");
await p.fill("#operator", "Harry"); await p.click("#startBtn");
ok(await p.isVisible("#capture"), "capture step shown");
ok(await p.isDisabled("#toMeta"), "next disabled before image");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
await p.setInputFiles("#fileIn", { name: "a.png", mimeType: "image/png", buffer: png });
await p.waitForSelector("#toMeta:not([disabled])");
ok(true, "import enables next");
await p.click("#toMeta");
await p.click("#saveBtn");
ok((await p.textContent("#saveErr")).startsWith("Not saved: 4"), "empty form blocked (4 problems)");
await p.selectOption("[name=scenario]", "indoor");
await p.fill("[name=location]", "Lab B5");
await p.fill("[name=subject_id]", "bad"); await p.locator("[name=subject_id]").blur();
ok((await p.textContent("#err-subject_id")).includes("3–6 digits"), "inline format error on blur");
await p.fill("[name=subject_id]", "EQ-1234");
ok((await p.textContent("#err-subject_id")) === "", "error clears live once fixed");
await p.click("#saveBtn");
await p.selectOption("[name=condition]", "good");
ok((await p.textContent("#err-condition")) === "", "save-time error clears when select fixed");
await p.screenshot({ path: `${out}-meta.png`, fullPage: true });
await p.click("#saveBtn");
ok(await p.isVisible("#review"), "saved -> review");
ok((await p.textContent("#summary")).includes("1 record(s) saved · 2 save attempt(s) blocked"), "summary counts");

await p.click("#addMore");
await p.setInputFiles("#fileIn", { name: "a.png", mimeType: "image/png", buffer: png });
await p.waitForTimeout(300);
ok((await p.textContent("#capErr")).includes("already"), "duplicate image rejected");

ok(JSON.parse(await p.evaluate(() => localStorage.getItem("hll04-session"))).records.length === 1, "session persisted to localStorage");

await p.evaluate(() => { document.getElementById("capture").hidden = true; });
await p.evaluate(() => document.querySelector('[data-step="review"]') && document.getElementById("review").removeAttribute("hidden"));
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#exportBtn")]);
const zp = `${out}-export.zip`; await dl.saveAs(zp);
ok(dl.suggestedFilename().endsWith(".zip"), "export downloads zip " + dl.suggestedFilename());
writeFileSync(`${out}-path.txt`, zp);
await b.close();
