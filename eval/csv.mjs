// Strict CSV readback for study instruments; values are not silently trimmed.
export function readCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const table = [];
  let row = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some(v => v !== '')) table.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',') endCell();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting');
      cell += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (cell || row.length || closed) endRow();
  const [header, ...rows] = table;
  if (!header || header.some(k => !k || k !== k.trim()) || new Set(header).size !== header.length)
    throw new Error('Missing or ambiguous CSV header (including task ID)');
  if (rows.some(r => r.length !== header.length)) throw new Error('CSV row length does not match header');
  return { header, rows, records: rows.map(r => Object.fromEntries(header.map((k, i) => [k, r[i]]))) };
}
export function requireColumns(header, expected) {
  if (header.length !== expected.length || expected.some(k => !header.includes(k)))
    throw new Error('Unexpected CSV columns; expected ' + expected.join(','));
}
