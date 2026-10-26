// One transactional envelope. A resolved write means IndexedDB transaction completion.
// Study instrumentation: namespace only; no storage behavior changes.
export const STUDY_SCOPE = new URLSearchParams(location.search).get('scope');
if (!/^[A-Za-z0-9_-]{1,120}$/.test(STUDY_SCOPE || '')) throw new Error('Valid study scope required');
export const DATABASE = 'hll04-remote-' + STUDY_SCOPE;
export function createStorage() {
  let opening, db, closed = false;
  const open = () => {
    if (closed) return Promise.reject(new Error('Storage version changed. Reload this page before editing.'));
    if (db) return Promise.resolve(db);
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1); let settled = false;
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
      request.onblocked = () => { settled = true; opening = null; reject(new Error('Browser storage upgrade is blocked by another page. Close the other page and retry.')); };
      request.onerror = () => { settled = true; opening = null; reject(request.error || new Error('Cannot open browser storage')); };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => { db.close(); db = null; closed = true; };
        resolve(db);
      };
    });
    return opening;
  };
  return {
    async read() {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction('state', 'readonly'), req = tx.objectStore('state').get('current'); let value;
        req.onsuccess = () => { value = req.result; };
        tx.oncomplete = () => resolve({ exists: value !== undefined, envelope: value });
        tx.onabort = () => reject(tx.error || new Error('Storage read aborted'));
        tx.onerror = () => {};
      });
    },
    async write(envelope) {
      const d = await open();
      return new Promise((resolve, reject) => {
        let tx;
        try { tx = d.transaction('state', 'readwrite', { durability: 'strict' }); }
        catch (e) { reject(e); return; }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
        tx.onerror = () => {};
        try { tx.objectStore('state').put(envelope, 'current'); }
        catch (e) { try { tx.abort(); } catch {} reject(e); }
      });
    },
  };
}
