// Pure logic: schema, validation, records, export. No DOM — unit-tested in Node.

export const SCHEMA = [
  { key: "scenario", label: "Scenario / task label", type: "select", required: true,
    options: ["indoor", "outdoor", "vehicle", "equipment", "document", "other"] },
  { key: "location", label: "Location (site / area)", type: "text", required: true, minLength: 2 },
  { key: "subject_id", label: "Subject / asset ID", type: "text", required: true, pattern: "^[A-Z]{2,4}-\\d{3,6}$",
    hint: "2–4 capital letters, dash, 3–6 digits (e.g. EQ-1234)" },
  { key: "condition", label: "Condition", type: "select", required: true, options: ["good", "fair", "poor", "unknown"] },
  { key: "notes", label: "Notes", type: "textarea", required: false, maxLength: 500 },
];

export function validateField(field, value) {
  const v = typeof value === "string" ? value.trim() : value;
  if (v === undefined || v === null || v === "") return field.required ? `${field.label} is required` : null;
  if (field.type === "select" && !field.options.includes(v)) return `${field.label}: choose a listed option`;
  if (field.minLength && v.length < field.minLength) return `${field.label}: at least ${field.minLength} characters`;
  if (field.maxLength && v.length > field.maxLength) return `${field.label}: at most ${field.maxLength} characters`;
  if (field.pattern && !new RegExp(field.pattern).test(v)) return `${field.label}: ${field.hint || "invalid format"}`;
  return null;
}

export function validateRecord(rec, schema = SCHEMA) {
  const errors = {};
  if (!rec.image || !rec.image.sha256) errors.image = "An image must be captured or imported";
  for (const f of schema) {
    const e = validateField(f, rec.meta?.[f.key]);
    if (e) errors[f.key] = e;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function completeness(rec, schema = SCHEMA) {
  const req = schema.filter(f => f.required);
  const filled = req.filter(f => validateField(f, rec.meta?.[f.key]) === null).length + (rec.image ? 1 : 0);
  return filled / (req.length + 1);
}

export function newSession(operator, device, now = new Date()) {
  if (!operator || !operator.trim()) throw new Error("operator required");
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  return { session_id: `S-${stamp}`, operator: operator.trim(), device, started: now.toISOString(), records: [], events: [] };
}

export function makeRecord(session, image, meta, now = new Date()) {
  const n = session.records.length + 1;
  return {
    record_id: `${session.session_id}-${String(n).padStart(3, "0")}`,
    timestamp: now.toISOString(),
    session_id: session.session_id, operator: session.operator, device: session.device,
    image, meta: { ...meta },
  };
}

// Refuse-to-save gate: returns {saved, errors}
export function trySave(session, rec, now = new Date()) {
  const v = validateRecord(rec);
  logEvent(session, v.ok ? "save_ok" : "save_blocked", { record_id: rec.record_id, errors: Object.keys(v.errors) }, now);
  if (!v.ok) return { saved: false, errors: v.errors };
  if (session.records.some(r => r.image.sha256 === rec.image.sha256))
    return { saved: false, errors: { image: "Duplicate image already in this session" } };
  session.records.push(rec);
  return { saved: true, errors: {} };
}

export function logEvent(session, type, data = {}, now = new Date()) {
  session.events.push({ t: now.toISOString(), type, ...data });
}

const CSV_COLS = ["record_id", "timestamp", "session_id", "operator", "device", "file", "sha256", "source"];
const esc = s => { s = s == null ? "" : String(s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCSV(session, schema = SCHEMA) {
  const cols = [...CSV_COLS, ...schema.map(f => f.key)];
  const rows = session.records.map(r => cols.map(c =>
    esc(c in r ? r[c] : c === "file" ? r.image.file : c === "sha256" ? r.image.sha256 : c === "source" ? r.image.source : r.meta[c])).join(","));
  return [cols.join(","), ...rows].join("\n") + "\n";
}

export function toManifest(session, schema = SCHEMA) {
  return {
    format: "hll04-collection/1",
    session_id: session.session_id, operator: session.operator, device: session.device, started: session.started,
    exported: new Date().toISOString(),
    schema, records: session.records.map(r => ({ ...r, image: { ...r.image, dataUrl: undefined } })),
    events: session.events,
  };
}

// ---- minimal STORE-only ZIP writer (no deps) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (const b of u8) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zip(files) { // files: [{name, data: Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + sz;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// Evaluation scoring vs ground-truth task sheet (works for both conditions)
export function scoreAgainstTruth(records, truth, schema = SCHEMA) {
  const req = schema.filter(f => f.required);
  let cells = 0, filled = 0, correct = 0;
  for (const t of truth) {
    const r = records.find(x => x.task_id === t.task_id) || { meta: {} };
    for (const f of req) {
      cells++;
      const v = (r.meta[f.key] ?? "").toString().trim();
      if (v) filled++;
      if (v.toLowerCase() === String(t[f.key]).toLowerCase()) correct++;
    }
  }
  return { completeness: filled / cells, accuracy: correct / cells, cells };
}
