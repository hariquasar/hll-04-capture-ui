import * as C from './core.mjs';
import { createStorage, STUDY_SCOPE } from './storage.mjs';

const $ = id => document.getElementById(id);
const storage = createStorage(), LEGACY = 'hll04-remote-legacy-' + STUDY_SCOPE;
let session = null, current = null, stream = null, step = 'session';
let persistenceFailed = false, storageStatus = 'Opening browser storage…', hasWriterLock = false;
let revision = 0, committedRevision = 0, writeTail = Promise.resolve(), saveTimer = null;
let loadedFrom = 'none', snapshotLoadedAt = null, indexedDbUnreadable = false;
let imageToken = 0, imageBusy = false, cameraToken = 0, toastTimer, startupDone = false, destructivePending = false;
function invalidateImages() { imageToken++; imageBusy = false; }
const clone = value => structuredClone(value);
const hasDraft = draft => !!(draft && (draft.image || draft.editRecordId || Object.values(draft.meta || {}).some(v => v !== '')));
const envelope = () => ({ version: 2, session: clone(session), draft: clone(current), revision });
const writable = () => hasWriterLock && startupDone && !destructivePending;
function status() {
  $('storageStatus').textContent = storageStatus;
  $('storageWarning').hidden = !persistenceFailed;
  $('retryStorage').disabled = !hasWriterLock || destructivePending;
}
function dirty() {
  if (!writable()) return;
  revision++; storageStatus = 'Saving changes to this browser…'; status();
  clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; void persistNow(); }, 250);
}
function persistNow(force = false, internalDiscardFlush = false) {
  // Public retries must not queue an old session behind a pending discard tombstone.
  if (destructivePending && !internalDiscardFlush) return Promise.resolve(false);
  clearTimeout(saveTimer); saveTimer = null;
  if (!hasWriterLock) return Promise.resolve(false);
  if (!force && revision <= committedRevision && !persistenceFailed) return writeTail.then(() => true);
  const snapshot = envelope(), target = revision;
  writeTail = writeTail.catch(() => {}).then(async () => {
    try {
      await storage.write(snapshot);
      committedRevision = Math.max(committedRevision, target);
      if (target === revision) { persistenceFailed = false; storageStatus = session ? 'Saved to this browser, including the current draft. Keep an exported backup.' : 'Ready. No active session.'; }
      status(); return true;
    } catch (error) {
      persistenceFailed = true; storageStatus = 'Changes are in memory only — export before closing or reloading.';
      $('storageWarningText').textContent = `Changes are in memory only. Export before closing or reloading, then retry saving. Browser storage: ${error.message || error.name}`;
      status(); return false;
    }
  });
  return writeTail;
}
async function flush(internalDiscardFlush = false) { if (saveTimer || revision > committedRevision || persistenceFailed) await persistNow(false, internalDiscardFlush); await writeTail; return !persistenceFailed && revision <= committedRevision; }
window.addEventListener('beforeunload', e => {
  if (hasWriterLock && (persistenceFailed || revision > committedRevision || imageBusy)) { e.preventDefault(); e.returnValue = ''; }
});
$('retryStorage').onclick = () => persistNow(true);
$('storageReview').onclick = () => session && show('review');
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2400);
}
function show(next) {
  step = next;
  const order = ['session', 'capture', 'meta', 'review'];
  for (const s of order) $(s).hidden = s !== next;
  document.querySelectorAll('#steps li').forEach(li => {
    const i = order.indexOf(li.dataset.step), j = order.indexOf(next);
    li.className = i === j ? 'active' : i < j ? 'done' : '';
    if (i === j) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  if (next !== 'capture') stopCam();
  if (next === 'capture') renderCapture();
  if (next === 'review') renderReview();
}
function renderStart() {
  $('resumePanel').hidden = !session;
  $('startForm').hidden = !!session || !hasWriterLock;
  $('resumeSummary').textContent = session ? `${session.records.length} saved record(s)${hasDraft(current) ? ' and an unfinished draft' : ''} are available. Nothing is deleted by choosing Not now.` : '';
  $('resumeBtn').disabled = !hasWriterLock;
  $('discardSessionBtn').disabled = !hasWriterLock;
  $('exportStored').disabled = !session || (!session.records.length && !current?.image);
  show('session');
}
$('device').value = navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? 'browser';
$('startBtn').onclick = async () => {
  if (!writable() || session) return;
  try { session = C.newSession($('operator').value, $('device').value); }
  catch { $('sessionErr').textContent = 'Enter the operator name'; $('operator').focus(); return; }
  loadedFrom='new-session'; snapshotLoadedAt=new Date().toISOString();
  session.study = { enabled: $('studyMode').checked, task_ids: ['1','2','3','4','5','6'] };
  $('sessionErr').textContent = ''; current = { image: null, meta: {}, stage: 'capture', editRecordId: null };
  dirty(); show('capture'); await persistNow();
};
$('resumeBtn').onclick = () => {
  if (!writable() || !session) return;
  if (current && hasDraft(current)) { if (current.stage === 'meta' && current.image) { buildForm(); show('meta'); } else show('capture'); }
  else show('review');
};
$('cancelResume').onclick = () => { $('resumeMessage').textContent = 'Your saved session and draft are kept. Resume or export whenever you are ready.'; };
$('discardSessionBtn').onclick = async () => {
  if (!writable() || !session || !confirm('Permanently discard this session and draft from this browser? Export first if you need them. Cancel keeps everything.')) return;
  // Freeze mutations until the deletion transaction settles; exports may still read the snapshot.
  destructivePending=true; status(); $('discardSessionBtn').disabled=true; $('resumeBtn').disabled=true;
  await flush(true); const target = ++revision;
  $('discardSessionBtn').disabled = true;
  const cleared = { version: 2, session: null, draft: null, revision: target };
  writeTail = writeTail.catch(() => {}).then(() => storage.write(cleared));
  try {
    await writeTail; session = null; current = null; invalidateImages(); committedRevision = target;
    persistenceFailed = false; storageStatus = 'Ready. No active session.';
    try { localStorage.removeItem(LEGACY); } catch {}
    destructivePending=false; status(); renderStart();
  } catch (error) {
    persistenceFailed = true; storageStatus = 'Discard failed. Your session remains available in this page; export it.';
    $('storageWarningText').textContent = `The discard did not commit. Export your session before closing. ${error.message}`;
    destructivePending=false; status(); $('discardSessionBtn').disabled = false; $('resumeBtn').disabled=false;
  }
};

function renderCapture() {
  const image = current?.image;
  $('preview').hidden = !image; if (image) $('preview').src = image.dataUrl;
  $('toMeta').disabled = !image || imageBusy || !hasWriterLock;
  $('discardDraft').disabled = !hasDraft(current) || !hasWriterLock;
  $('camBtn').disabled = !hasWriterLock || !!current?.editRecordId;
  $('fileIn').disabled = !hasWriterLock || !!current?.editRecordId;
}
function continueOrNew() {
  if (!writable() || !session) return;
  if (hasDraft(current)) {
    if (current.stage === 'meta' && current.image) { buildForm(); show('meta'); } else show('capture');
    return;
  }
  if (session.records.length >= 6) { toast('This prototype supports six records per session. Edit or delete an existing record.'); return; }
  invalidateImages(); current = { image: null, meta: {}, stage: 'capture', editRecordId: null };
  $('capErr').textContent = ''; dirty(); show('capture');
}
async function discardDraft() {
  if (!writable() || !current || !confirm('Discard this unfinished draft? Saved records are kept.')) return;
  invalidateImages(); current = null; dirty(); show('review'); await persistNow();
}
$('discardDraft').onclick = discardDraft;
$('cancelEdit').onclick = discardDraft;
$('addMore').onclick = continueOrNew;
$('reviewCapture').onclick = () => show('review');
const sha256 = async buffer => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2,'0')).join('');
const toDataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.onabort = () => reject(new Error('Image read cancelled')); r.readAsDataURL(blob); });
async function setImage(blob, source, name) {
  if (!writable() || !current || current.editRecordId) return;
  const token = ++imageToken, draft = current; imageBusy = true; renderCapture();
  try {
    if (!blob || !['image/png','image/jpeg','image/webp'].includes(blob.type) || !blob.size || blob.size > 10*1024*1024) throw new Error('Choose a valid PNG, JPEG or WebP image, up to 10 MiB.');
    let decoded;
    try { decoded = await createImageBitmap(blob); if (!decoded.width || !decoded.height) throw new Error('empty'); }
    catch { throw new Error('Choose a valid PNG, JPEG or WebP image, up to 10 MiB.'); }
    finally { decoded?.close(); }
    const bytes = await blob.arrayBuffer(), hash = await sha256(bytes);
    if (session.records.some(r => r.image.sha256 === hash)) throw new Error('This image is already in the session. Your current draft image has been kept.');
    const dataUrl = await toDataUrl(blob);
    if (token !== imageToken || current !== draft) return;
    const ext = blob.type.split('/')[1].replace('jpeg','jpg');
    draft.image = { file: `${hash}.${ext}`, sha256: hash, source, original_name: name || null, bytes: bytes.byteLength, dataUrl };
    $('capErr').textContent = ''; C.logEvent(session,'image_set',{source,sha256:hash}); dirty();
  } catch (error) {
    if (token === imageToken && current === draft) $('capErr').textContent = error.message + (draft.image ? ' The previous image is still available.' : '');
  } finally {
    if (token === imageToken) { imageBusy = false; if (step === 'capture') renderCapture(); }
  }
}
$('fileIn').onchange = e => { const file = e.target.files[0]; if (file) void setImage(file,'import',file.name); e.target.value = ''; };
$('camBtn').onclick = async () => {
  if (!writable() || !current || current.editRecordId) return;
  stopCam(); const token = ++cameraToken;
  try {
    const next = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    if (token !== cameraToken || step !== 'capture') { next.getTracks().forEach(t=>t.stop()); return; }
    stream = next; $('video').srcObject = next; $('video').hidden = false; $('preview').hidden = true;
    $('video').onloadedmetadata = () => { if (stream === next) $('snapBtn').disabled = !$('video').videoWidth; };
    if ($('video').videoWidth) $('snapBtn').disabled = false;
  } catch (error) { if (token === cameraToken) $('capErr').textContent = `Camera unavailable (${error.name}). Import a file instead.`; }
};
$('snapBtn').onclick = () => {
  const v = $('video'); if (!v.videoWidth || !v.videoHeight || !stream) return;
  const canvas = document.createElement('canvas'); canvas.width=v.videoWidth; canvas.height=v.videoHeight; canvas.getContext('2d').drawImage(v,0,0);
  const draft=current,token=++imageToken; imageBusy=true; renderCapture();
  canvas.toBlob(blob => {
    if(token!==imageToken||current!==draft||step!=='capture') { if(token===imageToken) imageBusy=false; return; }
    void setImage(blob,'camera');
  },'image/jpeg',0.92);
};
function stopCam() { cameraToken++; stream?.getTracks().forEach(t=>t.stop()); stream=null; $('video').srcObject=null; $('video').hidden=true; $('snapBtn').disabled=true; }
$('toMeta').onclick = () => { if (!current?.image || imageBusy) return; current.stage='meta'; dirty(); buildForm(); show('meta'); };
$('backCap').onclick = () => { if (current?.editRecordId) { show('review'); return; } if (current) { current.stage='capture'; dirty(); } show('capture'); };

function buildForm() {
  if (!current) return;
  $('metaTitle').textContent = current.editRecordId ? 'Edit saved metadata' : 'Describe this record';
  $('editDescription').hidden = !current.editRecordId; $('cancelEdit').hidden = !current.editRecordId;
  $('saveBtn').textContent = current.editRecordId ? 'Save changes' : 'Save record';
  $('backCap').textContent = current.editRecordId ? 'Review without discarding edit' : 'Back';
  $('saveErr').textContent=''; const form=$('metaForm'); form.replaceChildren();
  for (const field of C.SCHEMA) {
    const f={...field,required:field.required || (field.key==='task_id' && session.study?.enabled)};
    const wrap=document.createElement('label'), title=document.createElement('span');wrap.dataset.key=f.key;
    title.textContent=f.label+(f.required?'':' (optional)');if(f.required)title.className='req';
    let el;
    if(f.type==='select') {el=document.createElement('select');for(const value of ['',...f.options]){const op=document.createElement('option');op.value=value;op.textContent=value||'— choose —';el.append(op);}}
    else el=document.createElement(f.type==='textarea'?'textarea':'input');
    el.name=f.key;el.value=current.meta[f.key]??'';el.required=f.required;el.id=`field-${f.key}`;
    const hint=document.createElement('span');hint.className='hint';hint.id=`hint-${f.key}`;hint.textContent=f.key==='task_id'&&session.study?.enabled?'Required in study mode: exact task ID 1, 2, 3, 4, 5 or 6':f.hint||'';
    const err=document.createElement('span');err.className='field-err';err.id=`err-${f.key}`;el.setAttribute('aria-describedby',`${hint.id} ${err.id}`);
    const check=()=>{const errors=C.validateForSession(session,{image:current.image,meta:current.meta},current.editRecordId).errors;const msg=errors[f.key]||'';err.textContent=msg;wrap.classList.toggle('invalid',!!msg);el.setAttribute('aria-invalid',String(!!msg));};
    el.addEventListener('blur',()=>{el.dataset.touched='1';check();});
    for(const type of ['input','change'])el.addEventListener(type,()=>{if(!writable()||!current)return;current.meta[f.key]=el.value;dirty();if(el.dataset.touched)check();if($('saveErr').textContent){const n=Object.keys(C.validateForSession(session,{image:current.image,meta:current.meta},current.editRecordId).errors).length;$('saveErr').textContent=n?`Not saved: ${n} problem(s) to fix.`:'';}});
    wrap.append(title,el,hint,err);form.append(wrap);
  }
  form.onsubmit=e=>e.preventDefault();
}
$('saveBtn').onclick = async () => {
  if(!writable()||!current||imageBusy)return;
  let result,recordId;
  if(current.editRecordId){recordId=current.editRecordId;result=C.updateRecord(session,recordId,current.meta);}
  else if(session.records.length>=6){result={saved:false,errors:{record:'This prototype supports six records per session.'}};}
  else {const rec=C.makeRecord(session,current.image,current.meta);recordId=rec.record_id;result=C.trySave(session,rec);}
  if(!result.saved){
    document.querySelectorAll('#metaForm [name]').forEach(el=>{const message=result.errors[el.name]||'';el.dataset.touched='1';el.setAttribute('aria-invalid',String(!!message));$(`err-${el.name}`).textContent=message;el.closest('label').classList.toggle('invalid',!!message);});
    $('saveErr').textContent=`Not saved: ${Object.keys(result.errors).length} problem(s) to fix. ${result.errors.record||result.errors.image||''}`;
    document.querySelector('#metaForm .invalid input,#metaForm .invalid select,#metaForm .invalid textarea')?.focus();dirty();await persistNow();return;
  }
  current=null;invalidateImages();dirty();show('review');const durable=await persistNow();toast(`${durable?'Saved to browser':'In memory only'}: ${recordId}`);
};
function startEdit(id){
  if(!writable())return;
  if(hasDraft(current)&&!confirm('Replace the current unfinished draft with this edit? Cancel keeps the draft.'))return;
  const record=session.records.find(r=>r.record_id===id);if(!record)return;
  invalidateImages();current={image:clone(record.image),meta:clone(record.meta),editRecordId:id,stage:'meta'};
  dirty();buildForm();show('meta');
}
function renderReview(){
  if(!session)return;
  $('sid').textContent=session.session_id;
  const blocked=session.events.filter(e=>e.type==='save_blocked'||e.type==='edit_blocked').length;
  $('summary').textContent=`${session.records.length} record(s) in this session · ${blocked} blocked save/edit attempt(s) · operator ${session.operator}${session.study?.enabled?' · Study mode: IDs 1–6':''}`;
  $('draftSummary').textContent=hasDraft(current)?'An unfinished draft is kept. Continue it below, or export it separately with your records.':'';
  $('addMore').textContent=hasDraft(current)?'Continue unfinished draft':'Add another record';
  $('addMore').disabled=!hasWriterLock||(!hasDraft(current)&&session.records.length>=6);
  const body=$('recTable').querySelector('tbody');body.replaceChildren();
  for(const record of session.records){
    const row=document.createElement('tr'),photo=document.createElement('td'),id=document.createElement('td'),metadata=document.createElement('td'),actions=document.createElement('td');
    const img=document.createElement('img');img.src=record.image.dataUrl;img.alt=`Image for record ${record.record_id.split('-').at(-1)}`;photo.append(img);
    id.textContent=`Record ${record.record_id.split('-').at(-1)}`;
    const details=document.createElement('details'),summary=document.createElement('summary'),dl=document.createElement('dl');summary.textContent=`${record.meta.subject_id} · ${record.meta.condition} — inspect all fields`;
    for(const field of C.SCHEMA){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=field.label;dd.textContent=record.meta[field.key]||'(empty)';dl.append(dt,dd);}
    const identifier=document.createElement('p');identifier.className='hint wrap';identifier.textContent=`Record ID: ${record.record_id}\nImage SHA-256: ${record.image.sha256}`;
    details.append(summary,dl,identifier);metadata.append(details);
    const edit=document.createElement('button');edit.textContent='Edit metadata';edit.dataset.action='edit';edit.dataset.recordId=record.record_id;edit.disabled=!hasWriterLock;edit.onclick=()=>startEdit(record.record_id);
    const del=document.createElement('button');del.textContent='Delete';del.dataset.action='delete';del.dataset.recordId=record.record_id;del.disabled=!hasWriterLock;
    del.onclick=async()=>{if(!writable()||!confirm(`Delete saved record ${record.record_id}? Export first if you need it.`))return;session.records=session.records.filter(r=>r.record_id!==record.record_id);if(current?.editRecordId===record.record_id){current=null;invalidateImages();}C.logEvent(session,'delete',{record_id:record.record_id});dirty();renderReview();await persistNow();};
    actions.append(edit,del);row.append(photo,id,metadata,actions);body.append(row);
  }
  $('exportBtn').disabled=!session.records.length&&!current?.image;
}
async function exportWork(){
  if(!session||(!session.records.length&&!current?.image))return;
  // Describe record/draft durability before this export adds its own audit event.
  const exportState={
    source:hasWriterLock?'live-writer-memory':loadedFrom,
    loadedFrom,loadedAt:snapshotLoadedAt,dataRevision:revision,committedRevision,
    label:!hasWriterLock
      ?(loadedFrom==='legacy-localStorage'&&indexedDbUnreadable?'legacy recovery snapshot; newer IndexedDB work could not be read':'read-only snapshot; editing tab may contain newer changes')
      :persistenceFailed?'memory-only changes before export event':revision>committedRevision?'pending changes before export event':'browser commit completed before export event',
  };
  if(writable()){C.logEvent(session,'export',{n:session.records.length,draft:hasDraft(current)});dirty();}
  const snapshot=envelope(),s=snapshot.session,draft=hasDraft(snapshot.draft)?snapshot.draft:null;
  const encoder=new TextEncoder(),files=[];
  $('exportBtn').disabled=true;$('exportStored').disabled=true;
  try{
    for(const record of s.records)files.push({name:`images/${record.image.file}`,data:new Uint8Array(await(await fetch(record.image.dataUrl)).arrayBuffer())});
    const manifest=C.toManifest(s);manifest.draft_included=!!draft;manifest.storage_at_export=exportState.label;
    manifest.snapshot_source=exportState.source;manifest.loaded_from=exportState.loadedFrom;manifest.snapshot_loaded_at=exportState.loadedAt;
    manifest.data_revision_before_export=exportState.dataRevision;manifest.browser_committed_revision_before_export=exportState.committedRevision;
    files.push({name:'records.csv',data:encoder.encode(C.toCSV(s))},{name:'manifest.json',data:encoder.encode(JSON.stringify(manifest,null,2))});
    if(draft){
      const descriptor={...draft,image:draft.image?{...draft.image,dataUrl:undefined}:null};
      files.push({name:'draft.json',data:encoder.encode(JSON.stringify(descriptor,null,2))});
      if(draft.image)files.push({name:`draft-images/${draft.image.file}`,data:new Uint8Array(await(await fetch(draft.image.dataUrl)).arrayBuffer())});
    }
    const url=URL.createObjectURL(new Blob([C.zip(files)],{type:'application/zip'}));
    const link=document.createElement('a');link.href=url;link.download=`${s.session_id}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    toast('ZIP download requested. Keep and inspect the downloaded file.');
    if(writable())await persistNow();
  }catch(error){toast(`Export failed: ${error.message}. Keep this page open and retry.`);}
  finally{$('exportBtn').disabled=!session?.records.length&&!current?.image;$('exportStored').disabled=$('exportBtn').disabled;}
}
$('exportBtn').onclick=exportWork;$('exportStored').onclick=exportWork;

async function acquireWriter(){
  if(!navigator.locks?.request){$('writerReason').textContent='This browser does not support the required single-writer lock. Use current desktop Chrome. Stored work may still be exported.';return false;}
  return new Promise(resolve=>{
    navigator.locks.request('hll04-remote-writer-' + STUDY_SCOPE,{mode:'exclusive',ifAvailable:true},async lock=>{resolve(!!lock);if(lock)await new Promise(()=>{});}).catch(()=>resolve(false));
  });
}
function validState(value){
  if(!value||typeof value!=='object')return false;
  if(value.session===null)return true;
  const s=value.session,d=value.draft;
  const imageOK=image=>image&&typeof image.dataUrl==='string'&&image.dataUrl.startsWith('data:image/')&&typeof image.sha256==='string'&&typeof image.file==='string';
  const recordOK=r=>r&&typeof r.record_id==='string'&&imageOK(r.image)&&r.meta&&typeof r.meta==='object';
  return !!(s?.session_id&&Array.isArray(s.records)&&s.records.every(recordOK)&&Array.isArray(s.events)&&(!s.study?.enabled||Array.isArray(s.study.task_ids))&&(!d||(d.meta&&typeof d.meta==='object'&&(!d.image||imageOK(d.image)))));
}
const ready=(async()=>{
  hasWriterLock=await acquireWriter();$('writerBlocked').hidden=hasWriterLock;
  let found,legacy,unreadable=false;
  try{found=await storage.read();if(found.exists&&!validState(found.envelope))throw new Error('Stored collection has an unsupported structure. It was not overwritten.');}
  catch(error){unreadable=true;indexedDbUnreadable=true;found=null;persistenceFailed=true;$('storageWarningText').textContent=`Browser storage could not be read. Existing stored bytes have not been replaced. ${error.message}`;}
  if(found?.exists){loadedFrom='indexeddb';snapshotLoadedAt=new Date().toISOString();const state=found.envelope;session=state.session;current=state.draft||null;revision=Number.isSafeInteger(state.revision)?state.revision:0;committedRevision=revision;}
  else{
    try{const text=localStorage.getItem(LEGACY);if(text){legacy=JSON.parse(text);if(!validState({session:legacy,draft:null}))throw new Error('Legacy session structure is invalid');session=legacy;loadedFrom='legacy-localStorage';snapshotLoadedAt=new Date().toISOString();}}
    catch(error){unreadable=true;persistenceFailed=true;$('storageWarningText').textContent=`Legacy storage could not be read; it has not been deleted. ${error.message}`;}
    if(legacy&&hasWriterLock&&!unreadable){
      const migration={version:2,session:clone(legacy),draft:null,revision:1};
      try{await storage.write(migration);const check=await storage.read();if(!check.exists||JSON.stringify(check.envelope)!==JSON.stringify(migration))throw new Error('Migration readback did not match');revision=committedRevision=1;loadedFrom='indexeddb-migrated-from-legacy';snapshotLoadedAt=new Date().toISOString();try{localStorage.removeItem(LEGACY);}catch{}persistenceFailed=false;}
      catch(error){persistenceFailed=true;$('storageWarningText').textContent=`Legacy session retained. Migration did not commit and verify: ${error.message}. Export before closing, or retry saving.`;}
    }
  }
  if(unreadable){hasWriterLock=false;$('writerBlocked').hidden=false;$('writerReason').textContent='Stored state could not be read safely. Editing is disabled to avoid replacing unknown saved work. Close other pages and reload; export any recovered legacy snapshot below.';}
  if(indexedDbUnreadable&&session&&loadedFrom==='legacy-localStorage'){
    $('writerReason').textContent='Legacy recovery snapshot: newer IndexedDB work could not be read. This older legacy snapshot may omit later records or edits. Editing is disabled; export it as a separately labelled recovery copy.';
    $('storageWarningText').textContent=$('writerReason').textContent;
  }
  startupDone=true;
  if(!hasWriterLock)for(const id of ['startBtn','studyMode','operator','device','resumeBtn','discardSessionBtn','retryStorage','camBtn','snapBtn','fileIn','toMeta','discardDraft','saveBtn','cancelEdit','addMore'])$(id).disabled=true;
  storageStatus=!hasWriterLock?'Read-only: last committed snapshot. The editing tab may contain newer changes.':persistenceFailed?'Storage is unavailable. Export before closing or reloading.':session?'Saved session and draft are available in this browser.':'Ready. Start a session.';
  status();
  if(!hasWriterLock&&session)show('review');else renderStart();
})();
window.__hll04={ready,flush:()=>flush(),get session(){return session;},get draft(){return current;},get persistenceFailed(){return persistenceFailed;},get storageStatus(){return storageStatus;},get hasWriterLock(){return hasWriterLock;}};
