import * as C from "./core.mjs";

const $ = id => document.getElementById(id);
const STORE = "hll04-session";
let session = null, current = null, stream = null;

// ---------- persistence (survives reload) ----------
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(session)); } catch { toast("Storage full — export now"); } };
function restore() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }

function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }

function show(step) {
  const order = ["session", "capture", "meta", "review"];
  for (const s of order) $(s).hidden = s !== step;
  document.querySelectorAll("#steps li").forEach(li => {
    const i = order.indexOf(li.dataset.step), j = order.indexOf(step);
    li.className = i === j ? "active" : i < j ? "done" : "";
  });
  if (session) C.logEvent(session, "step", { step });
  if (step !== "capture") stopCam();
  if (step === "review") renderReview();
}

// ---------- session ----------
$("device").value = navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? "browser";
$("startBtn").onclick = () => {
  try { session = C.newSession($("operator").value, $("device").value); }
  catch { $("sessionErr").textContent = "Enter the operator name"; $("operator").focus(); return; }
  persist(); newRecord();
};

function newRecord() { current = { image: null, meta: {} }; $("preview").hidden = true; $("toMeta").disabled = true; $("capErr").textContent = ""; show("capture"); }

// ---------- capture / import ----------
async function sha256(buf) { const h = await crypto.subtle.digest("SHA-256", buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }
const toDataUrl = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });

async function setImage(blob, source, name) {
  const buf = await blob.arrayBuffer();
  const hash = await sha256(buf);
  if (session.records.some(r => r.image.sha256 === hash)) { $("capErr").textContent = "This image is already in the session"; return; }
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  current.image = { file: `${hash.slice(0, 12)}.${ext}`, sha256: hash, source, original_name: name || null, bytes: buf.byteLength, dataUrl: await toDataUrl(blob) };
  $("preview").src = current.image.dataUrl; $("preview").hidden = false; $("video").hidden = true;
  $("capErr").textContent = ""; $("toMeta").disabled = false;
  C.logEvent(session, "image_set", { source, sha256: hash });
}

$("camBtn").onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("video").srcObject = stream; $("video").hidden = false; $("preview").hidden = true; $("snapBtn").disabled = false;
  } catch (e) { $("capErr").textContent = `Camera unavailable (${e.name}). Use Import file instead.`; C.logEvent(session, "camera_error", { name: e.name }); }
};
$("snapBtn").onclick = () => {
  const v = $("video"), c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(b => setImage(b, "camera"), "image/jpeg", 0.92);
};
function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = null; $("snapBtn").disabled = true; }
$("fileIn").onchange = e => { const f = e.target.files[0]; if (f) setImage(f, "import", f.name); e.target.value = ""; };
$("toMeta").onclick = () => { buildForm(); show("meta"); };

// ---------- metadata form with inline validation (on blur, then live once touched) ----------
function buildForm() {
  const form = $("metaForm"); form.innerHTML = "";
  for (const f of C.SCHEMA) {
    const wrap = document.createElement("label"); wrap.dataset.key = f.key;
    const title = document.createElement("span"); title.textContent = f.label; if (f.required) title.className = "req"; else title.textContent += " (optional)";
    let el;
    if (f.type === "select") { el = document.createElement("select"); el.innerHTML = `<option value="">— choose —</option>` + f.options.map(o => `<option>${o}</option>`).join(""); }
    else el = document.createElement(f.type === "textarea" ? "textarea" : "input");
    el.name = f.key; el.value = current.meta[f.key] ?? "";
    const hint = document.createElement("span"); hint.className = "hint"; hint.textContent = f.hint || "";
    const err = document.createElement("span"); err.className = "field-err"; err.id = `err-${f.key}`; el.setAttribute("aria-describedby", err.id);
    const check = () => { current.meta[f.key] = el.value; const m = C.validateField(f, el.value); err.textContent = m || ""; wrap.classList.toggle("invalid", !!m); el.setAttribute("aria-invalid", !!m); };
    el.addEventListener("blur", () => { el.dataset.touched = 1; check(); });
    for (const ev of ["input", "change"]) el.addEventListener(ev, () => { current.meta[f.key] = el.value; if (el.dataset.touched) check(); });
    wrap.append(title, el, hint, err); form.append(wrap);
  }
}
$("backCap").onclick = () => show("capture");
$("saveBtn").onclick = () => {
  const rec = C.makeRecord(session, current.image, current.meta);
  const res = C.trySave(session, rec);
  if (!res.saved) {
    document.querySelectorAll("#metaForm [name]").forEach(el => { el.dataset.touched = 1; });
    for (const [k, m] of Object.entries(res.errors)) { const e = $(`err-${k}`); if (e) { e.textContent = m; e.parentElement.classList.add("invalid"); e.previousElementSibling.previousElementSibling.setAttribute("aria-invalid", true); } }
    $("saveErr").textContent = `Not saved: ${Object.keys(res.errors).length} problem(s) to fix.`;
    document.querySelector(".invalid select, .invalid input, .invalid textarea")?.focus();
    persist(); return;
  }
  $("saveErr").textContent = ""; persist(); toast(`Saved ${rec.record_id}`); show("review");
};

// ---------- review / export ----------
function renderReview() {
  $("sid").textContent = session.session_id;
  const blocked = session.events.filter(e => e.type === "save_blocked").length;
  $("summary").textContent = `${session.records.length} record(s) saved · ${blocked} save attempt(s) blocked by validation · operator ${session.operator}`;
  const tb = $("recTable").querySelector("tbody"); tb.innerHTML = "";
  session.records.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><img alt=""></td><td>${r.record_id.slice(-3)}</td><td></td><td></td><td></td><td></td><td><button>Delete</button></td>`;
    tr.querySelector("img").src = r.image.dataUrl;
    ["scenario", "subject_id", "location", "condition"].forEach((k, j) => tr.children[j + 2].textContent = r.meta[k]);
    tr.querySelector("button").onclick = () => { if (confirm(`Delete ${r.record_id}?`)) { session.records.splice(i, 1); C.logEvent(session, "delete", { record_id: r.record_id }); persist(); renderReview(); } };
    tb.append(tr);
  });
  $("exportBtn").disabled = session.records.length === 0;
}
$("addMore").onclick = newRecord;
$("exportBtn").onclick = async () => {
  const enc = new TextEncoder();
  const files = [];
  for (const r of session.records) files.push({ name: `images/${r.image.file}`, data: new Uint8Array(await (await fetch(r.image.dataUrl)).arrayBuffer()) });
  C.logEvent(session, "export", { n: session.records.length });
  files.push({ name: "records.csv", data: enc.encode(C.toCSV(session)) });
  files.push({ name: "manifest.json", data: enc.encode(JSON.stringify(C.toManifest(session), null, 2)) });
  const url = URL.createObjectURL(new Blob([C.zip(files)], { type: "application/zip" }));
  Object.assign(document.createElement("a"), { href: url, download: `${session.session_id}.zip` }).click();
  persist(); toast("Exported");
};

// ---------- resume ----------
const saved = restore();
if (saved?.session_id && confirm(`Resume session ${saved.session_id} (${saved.records.length} records)?`)) { session = saved; show("review"); }
else { localStorage.removeItem(STORE); show("session"); }

window.__hll04 = { get session() { return session; } }; // test hook
