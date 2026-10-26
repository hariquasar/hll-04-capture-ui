// Synthetic engineering regressions, not a usability experiment or physical-device test.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runDiscardRace } from './browser-discard-race.mjs';
import { scratch } from './paths.mjs';

const out = resolve(process.argv[2] || scratch);
const base = process.env.HLL04_BASE_URL || 'http://127.0.0.1:8765';
const fixtures = resolve(process.env.HLL04_FIXTURES || join(out, 'fixtures'));
const taskTruth = JSON.parse(readFileSync(new URL('../eval/truth.json', import.meta.url), 'utf8')).tasks;
mkdirSync(out, { recursive: true });
if (!existsSync(join(fixtures,'large-1.png'))) execFileSync(process.env.PYTHON || 'python3',[fileURLToPath(new URL('./browser-fixtures.py',import.meta.url)),fixtures]);
const report = { label:'SYNTHETIC ENGINEERING CHECKS; NOT HUMAN USABILITY RESULTS', started:new Date().toISOString(), base, browser:null, checks:[], scenarios:[], exports:[], observations:{}, limitations:['No physical camera tested','No physical phone tested','No human task times or SUS responses collected','Viewport checks use desktop Chrome at 390×844','Fault injection and browser quota override are separate from natural disk exhaustion'] };
const b = await chromium.launch({ channel:'chrome', headless:true });
report.browser = b.version();
const contexts = [];
let activeScenario = '';
const check = (value, name, detail) => { const item={scenario:activeScenario,name,passed:!!value,...(detail===undefined?{}:{detail})}; report.checks.push(item); console.log(`${value?'PASS':'FAIL'} ${name}`); if(!value) throw new Error(name); };
const flush = p => p.evaluate(async()=>{await window.__hll04.ready; await window.__hll04.flush();});
const state = p => p.evaluate(()=>({session:window.__hll04.session,draft:window.__hll04.draft,failed:window.__hll04.persistenceFailed,status:window.__hll04.storageStatus,lock:window.__hll04.hasWriterLock}));
async function ready(p) { await p.waitForFunction(()=>window.__hll04?.ready); await p.evaluate(async()=>await window.__hll04.ready); }
async function fresh(viewport={width:1280,height:900}) { const ctx=await b.newContext({acceptDownloads:true,viewport}); contexts.push(ctx); const p=await ctx.newPage(); p.setDefaultTimeout(6000); p.on('pageerror', e=>{report.observations.pageErrors??=[];report.observations.pageErrors.push({scenario:activeScenario,message:e.message});}); p.on('dialog',d=>d.accept()); await p.goto(base+'/index.html'); await ready(p); return {ctx,p}; }
async function durable(p) { return p.evaluate(()=>new Promise((res,rej)=>{const q=indexedDB.open('hll04-collection-db');q.onerror=()=>rej(q.error.message);q.onsuccess=()=>{const db=q.result;const t=db.transaction('state','readonly');const r=t.objectStore('state').get('current');r.onsuccess=()=>res(r.result??null);r.onerror=()=>rej(r.error.message);t.oncomplete=()=>db.close();};})); }
async function start(p,study=true) { await p.fill('#operator','Synthetic engineering operator'); await p.fill('#device','Automated desktop Chrome — not a physical phone'); if(study) await p.check('#studyMode'); await p.click('#startBtn'); await p.waitForSelector('#capture:visible'); await flush(p); }
async function importFile(p,n=1,size='small') { await p.setInputFiles('#fileIn',join(fixtures,`${size}-${n}.png`)); await p.waitForFunction(()=>!document.querySelector('#toMeta').disabled); await flush(p); }
async function fields(p,{task_id='1',scenario='indoor',location='Lab B5',subject_id='EQ-1234',condition='good',notes=''}={}) { await p.fill('[name=task_id]',task_id); await p.selectOption('[name=scenario]',scenario); await p.fill('[name=location]',location); await p.fill('[name=subject_id]',subject_id); await p.selectOption('[name=condition]',condition); await p.fill('[name=notes]',notes); }
async function save(p) { await p.click('#saveBtn'); await p.waitForSelector('#review:visible'); await flush(p); }
async function collect(p,n=1,meta={},size='small') { await importFile(p,n,size); await p.click('#toMeta'); await fields(p,{task_id:String(n),...meta}); await save(p); }
async function resume(p) { await p.waitForSelector('#resumePanel:visible'); await p.click('#resumeBtn'); await flush(p); }
async function exportZip(p,name,button='#exportBtn') { await flush(p); const expected=await state(p); const [d]=await Promise.all([p.waitForEvent('download'),p.click(button)]); const path=join(out,name+'.zip');await d.saveAs(path);writeFileSync(join(out,name+'-expected.json'),JSON.stringify(expected,null,2));report.exports.push({archive:name+'.zip',expected:name+'-expected.json',suggestedFilename:d.suggestedFilename()});return path; }
function readManifest(path) { return JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c','import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read("manifest.json").decode())',path],{encoding:'utf8'})); }
async function noOverflow(p,name) { const dims=await p.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));check(dims.page<=dims.viewport,name,dims); }
async function scenario(name,run){activeScenario=name;const start=Date.now();try{await run();report.scenarios.push({name,passed:true,automationElapsedMs:Date.now()-start});}catch(e){report.scenarios.push({name,passed:false,error:e.stack,automationElapsedMs:Date.now()-start});console.error('SCENARIO FAILED',name,e.message);}finally{for(const ctx of contexts.splice(0)) await ctx.close();writeFileSync(join(out,'browser-results.json'),JSON.stringify(report,null,2));}}

try {
await scenario('narrow pointer validation, six-image workload and safe exports',async()=>{
 const {p,ctx}=await fresh({width:390,height:844});
 await p.click('#startBtn');check(!!(await p.textContent('#sessionErr')),'Operator is required');
 await start(p);check(await p.isDisabled('#toMeta'),'Next is disabled before an image');
 await p.setInputFiles('#fileIn',{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await p.waitForFunction(()=>!!document.querySelector('#capErr').textContent);check(await p.isDisabled('#toMeta'),'Undecodable image cannot enable Next');
 await importFile(p,1,'large');await p.click('#toMeta');await p.click('#saveBtn');
 check((await state(p)).session.records.length===0,'Empty form cannot create a saved record');
 check(!!(await p.textContent('#err-task_id')),'Study mode requires task ID');
 await fields(p,{task_id:'outside',subject_id:'bad'});await p.locator('[name=subject_id]').blur();
 check((await p.textContent('#err-subject_id')).includes('3–6'),'Invalid subject ID has an inline error');
 await p.fill('[name=subject_id]','EQ-1234');check(!(await p.textContent('#err-subject_id')),'Corrected subject clears inline error');
 await p.click('#saveBtn');check((await state(p)).session.records.length===0,'Unknown study task ID is blocked before save');
 await p.screenshot({path:join(out,'validation-narrow.png'),fullPage:true});
 await p.setViewportSize({width:1280,height:1000});await p.locator('#meta').screenshot({path:join(out,'validation-desktop-element.png')});await p.setViewportSize({width:390,height:844});
 const notes=['=1+1',"'=1+1",'+SUM(1,1)','-1+1',' @SUM(1,1)','\t=1+1\ncomma, quote " preserved'];
 await fields(p,{...taskTruth[0],task_id:'1',notes:notes[0]});await save(p);
 check((await state(p)).session.records.length===1,'First narrow-viewport pointer Save succeeds');
 await p.click('#addMore');await importFile(p,2,'large');await p.click('#toMeta');await fields(p,{...taskTruth[1],task_id:'1',condition:'good',notes:notes[1]});
 await p.click('#saveBtn');check((await state(p)).session.records.length===1,'Duplicate study task ID is blocked before save');
 await p.fill('[name=task_id]','2');await save(p);check((await state(p)).session.records.length===2,'Second consecutive narrow-viewport pointer Save succeeds');
 await noOverflow(p,'Narrow review has no horizontal page overflow');
 for(let i=3;i<=6;i++){await p.click('#addMore');await collect(p,i,{...taskTruth[i-1],task_id:String(i),notes:notes[i-1]},'large');}
 const initial=await state(p);const persisted=await durable(p);
 check(initial.session.records.length===6 && persisted.session.records.length===6,'Six distinct 1,080,993-byte PNG records are committed');
 report.observations.workload={records:6,imageBytes:initial.session.records.reduce((n,r)=>n+Math.floor(r.image.dataUrl.split(',')[1].length*3/4)-((r.image.dataUrl.endsWith('==')?2:r.image.dataUrl.endsWith('=')?1:0)),0),envelopeJsonCharacters:JSON.stringify(persisted).length};
 await p.screenshot({path:join(out,'six-record-review-narrow.png'),fullPage:true});const healthyManifest=readManifest(await exportZip(p,'six-record-initial-known-error'));
 check(healthyManifest.storage_at_export==='browser commit completed before export event','Healthy export labels the data commit before its new audit event');
 check(healthyManifest.snapshot_source==='live-writer-memory' && healthyManifest.data_revision_before_export===healthyManifest.browser_committed_revision_before_export && Number.isFinite(Date.parse(healthyManifest.snapshot_loaded_at)),'Healthy export records writer source, load time and matching committed data revision');
 const wrong=initial.session.records[1];await p.locator(`[data-action=edit][data-record-id="${wrong.record_id}"]`).click();await p.selectOption('[name=condition]',taskTruth[1].condition);await save(p);
 const corrected=(await state(p)).session.records[1];check(corrected.record_id===wrong.record_id&&corrected.image.sha256===wrong.image.sha256,'Correcting an allowed but wrong condition preserves record ID and image');
 await exportZip(p,'six-record-corrected');writeFileSync(join(out,'six-task-truth.json'),JSON.stringify({label:'Predeclared synthetic task metadata; random PNG engineering fixtures are not human task observations',tasks:taskTruth},null,2));
 await p.close(); const reopened=await ctx.newPage();reopened.setDefaultTimeout(6000);reopened.on('dialog',d=>d.accept());await reopened.goto(base+'/index.html');await ready(reopened);await resume(reopened);
 const restored=await state(reopened);check(restored.session.records.length===6,'Page close after commit and reopening restores six records');
 check(restored.session.records.every((r,i)=>r.image.sha256===initial.session.records[i].image.sha256 && r.meta.notes===notes[i]),'Reopened workload retains all image hashes and exact notes');
 await reopened.reload();await ready(reopened);await reopened.click('#cancelResume');
 check((await durable(reopened)).session.records.length===6,'Cancel resume retains all durable records');
 check(await reopened.isVisible('#resumeBtn') && !await reopened.isVisible('#startForm'),'Cancel leaves a usable resume path without overwriting the session');
 await reopened.click('#resumeBtn');await flush(reopened);await reopened.setViewportSize({width:1280,height:1000});await reopened.screenshot({path:join(out,'six-record-review-desktop.png'),fullPage:true});await reopened.locator('#review').screenshot({path:join(out,'six-record-review-element.png')});
});

await scenario('draft recovery, safe replacement, metadata editing and deletion IDs',async()=>{
 const {p}=await fresh();await start(p);await importFile(p,1);await p.click('#toMeta');await fields(p,{task_id:'1',notes:'Unfinished draft, preserved'});await flush(p);
 const before=await state(p);await p.reload();await ready(p);await resume(p);
 check((await state(p)).draft.image.sha256===before.draft.image.sha256,'Reload restores draft image');
 check((await p.inputValue('[name=notes]'))==='Unfinished draft, preserved','Reload restores exact unfinished metadata');
 await p.click('#backCap');await p.click('#reviewCapture');await p.click('#addMore');
 const mid=await state(p);check(mid.draft.image.sha256===before.draft.image.sha256 && mid.draft.meta.notes==='Unfinished draft, preserved','Review then Add retains the active draft');
 if(await p.isVisible('#meta'))await p.click('#backCap');
 await p.setInputFiles('#fileIn',{name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});await p.waitForFunction(()=>!!document.querySelector('#capErr').textContent);
 check((await state(p)).draft.image.sha256===before.draft.image.sha256,'Invalid replacement retains the valid draft image');
 check(!await p.isDisabled('#toMeta'),'Invalid replacement keeps the existing valid image usable');
 await p.click('#toMeta');await save(p);const original=(await state(p)).session.records[0];
 await p.locator('[data-action=edit]').first().click();await p.fill('[name=notes]','Edited full metadata =1+1');await p.fill('[name=location]','Lab C6');await p.fill('[name=subject_id]','bad');await p.click('#saveBtn');
 check((await state(p)).session.records[0].meta.location===original.meta.location,'Invalid edit does not mutate the saved record');
 await p.fill('[name=subject_id]','EQ-4321');await save(p);const edited=(await state(p)).session.records[0];
 check(edited.record_id===original.record_id && edited.image.sha256===original.image.sha256,'Editing preserves record ID and image hash');
 check(edited.meta.notes==='Edited full metadata =1+1' && edited.meta.location==='Lab C6','Editing updates all metadata fields');
 await p.locator('#recTable details summary').first().click();check(await p.getByText('Edited full metadata =1+1',{exact:true}).isVisible(),'Expanded review visibly exposes full notes');
 await p.screenshot({path:join(out,'edited-record-review.png'),fullPage:true});await p.locator('#review').screenshot({path:join(out,'review-details-element.png')});await exportZip(p,'edited-record');
 await p.reload();await ready(p);await resume(p);check((await state(p)).session.records[0].meta.subject_id==='EQ-4321','Edited metadata survives reload');
 await p.click('#addMore');await importFile(p,2);await p.click('#toMeta');await fields(p,{task_id:'2',notes:'Discard only this draft'});await flush(p);await p.click('#backCap');await p.click('#discardDraft');await flush(p);
 check(!(await state(p)).draft?.image && (await state(p)).session.records.length===1,'Explicit discard removes the draft while preserving saved records');
 await p.reload();await ready(p);await resume(p);check(!(await state(p)).draft?.image,'Discarded draft does not reappear after reload');
 await p.locator('[data-action=delete]').first().click();await flush(p);check((await state(p)).session.records.length===0,'Delete removes only the saved record');
 await p.reload();await ready(p);await resume(p);await p.click('#addMore');await collect(p,3,{task_id:'3'});
 check(Number((await state(p)).session.records[0].record_id.split('-').at(-1))>Number(original.record_id.split('-').at(-1)),'Delete, reload and add never reuse the record ID');
 await p.click('#addMore');await p.setInputFiles('#fileIn',join(fixtures,'small-3.png'));await p.waitForFunction(()=>document.querySelector('#capErr').textContent.includes('already'));
 check(await p.isDisabled('#toMeta'),'Duplicate image cannot start another record');
});

await scenario('genuine IndexedDB transaction abort and recovery export',async()=>{
 const {p}=await fresh();await start(p);await collect(p,1);const prior=await durable(p);await p.click('#addMore');await flush(p);
 await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.__originalPut.apply(this,args);this.transaction.abort();return request;};});
 await importFile(p,2);await p.click('#toMeta');await fields(p,{task_id:'2',notes:'Recovered in-memory record'});await save(p);
 check(await p.isVisible('#storageWarning'),'Aborted transaction shows persistent storage warning');
 check((await state(p)).session.records.length===2 && (await durable(p)).session.records.length===1,'Aborted transaction leaves prior durable snapshot intact and preserves new record in memory');
 check((await p.textContent('#storageStatus')).toLowerCase().includes('memory'),'Status distinguishes memory-only changes from committed records');
 await p.click('#addMore');await importFile(p,3);await p.click('#toMeta');await fields(p,{task_id:'3',notes:'Recover this unfinished draft too'});await flush(p);await p.click('#backCap');await p.click('#reviewCapture');
 await p.screenshot({path:join(out,'transaction-failure-recovery.png'),fullPage:true});await p.locator('#storageWarning').screenshot({path:join(out,'storage-warning-element.png')});await p.locator('#storageStatus').screenshot({path:join(out,'storage-status-element.png')});const failedManifest=readManifest(await exportZip(p,'transaction-failure-recovery'));
 check(failedManifest.storage_at_export==='memory-only changes before export event' && failedManifest.data_revision_before_export>failedManifest.browser_committed_revision_before_export,'Recovery manifest labels memory-only data and the older committed revision');
 check(await p.isVisible('#storageWarning'),'Export does not falsely clear storage failure');
 await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});await p.click('#retryStorage');await flush(p);
 check(!await p.isVisible('#storageWarning'),'Retry after removing failure commits changes and clears warning');
 const now=await durable(p);check(now.session.records.length===2 && !!now.draft?.image && now.draft.meta.notes==='Recover this unfinished draft too','Retry commits saved records and unfinished draft atomically');
 await p.reload();await ready(p);await resume(p);check((await state(p)).session.records.length===2 && (await state(p)).draft.meta.task_id==='3','Reload after retry recovers records and unfinished draft');
 report.observations.abort={priorDurableRecords:prior.session.records.length,recoverySavedRecords:2,recoveryDrafts:1,mechanism:'IDBObjectStore.put followed by transaction.abort; real IndexedDB atomic rollback'};
});

await scenario('legacy migration commits before deleting the source',async()=>{
 const {p}=await fresh();await start(p,false);await collect(p,1);const legacy=(await state(p)).session;
 await p.close(); const ctx=contexts.at(-1); const q=await ctx.newPage();q.on('dialog',d=>d.accept());await q.goto(base+'/index.html');await ready(q);
 await q.evaluate(async legacy=>{localStorage.setItem('hll04-session',JSON.stringify(legacy));await new Promise((res,rej)=>{const r=indexedDB.open('hll04-collection-db');r.onsuccess=()=>{const db=r.result;const t=db.transaction('state','readwrite');t.objectStore('state').delete('current');t.oncomplete=()=>{db.close();res();};t.onerror=()=>rej(t.error);};});},legacy);
 await q.evaluate(()=>sessionStorage.setItem('fail-migration-once','yes'));
 await q.addInitScript(()=>{if(sessionStorage.getItem('fail-migration-once')==='yes'){sessionStorage.removeItem('fail-migration-once');const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);this.transaction.abort();return request;};}});
 await q.reload();await ready(q);check(!!await q.evaluate(()=>localStorage.getItem('hll04-session')),'Failed migration retains the original legacy source');check(!(await durable(q)),'Failed migration leaves no partially committed target');
 await q.reload();await ready(q);check((await durable(q)).session.records.length===1,'Legacy localStorage session migrates to committed IndexedDB');
 check(await q.evaluate(()=>localStorage.getItem('hll04-session')===null),'Legacy source is removed after successful migration');
 await resume(q);check((await state(q)).session.records[0].image.sha256===legacy.records[0].image.sha256,'Migration preserves the original image hash');
});

await scenario('second tab is read only and can export the last committed snapshot',async()=>{
 const {p,ctx}=await fresh();await start(p);await collect(p,1);const first=await state(p);const q=await ctx.newPage();q.on('dialog',d=>d.accept());await q.goto(base+'/index.html');await ready(q);
 check(await q.isVisible('#writerBlocked'),'Second tab visibly reports that another tab owns editing');
 check(!(await state(q)).lock && (await state(p)).lock,'Exactly one tab holds the session writer lock');
 check(await q.isDisabled('#addMore') && await q.locator('[data-action=edit]').first().isDisabled() && await q.locator('[data-action=delete]').first().isDisabled(),'Second tab disables all visible mutation controls');
 const readonlyManifest=readManifest(await exportZip(q,'readonly-tab-export'));check((await state(q)).session.records[0].record_id===first.session.records[0].record_id,'Second tab can read and export the committed record');
 check(readonlyManifest.storage_at_export==='read-only snapshot; editing tab may contain newer changes' && readonlyManifest.snapshot_source==='indexeddb' && readonlyManifest.loaded_from==='indexeddb','Read-only export identifies the loaded database snapshot and warns that the editing tab may be newer');
});

await scenario('Chrome quota override exercise',async()=>{
 const {p,ctx}=await fresh();await start(p);await collect(p,1);const cdp=await ctx.newCDPSession(p);const origin=new URL(base).origin;
 try { await cdp.send('Storage.overrideQuotaForOrigin',{origin,quotaSize:1024}); } catch(e) { report.observations.quotaOverride={supported:false,error:e.message};return; }
 await p.click('#addMore');await importFile(p,2,'large');await p.click('#toMeta');await fields(p,{task_id:'2'});await save(p);
 const memory=await state(p);const disk=await durable(p);
 report.observations.quotaOverride={supported:true,failureObserved:memory.failed,committedRecords:disk?.session?.records?.length,memoryRecords:memory.session.records.length,quotaBytes:1024};
 if(memory.failed){check(disk.session.records.length===1,'Quota-exceeded write preserves the previous committed record');check(await p.isVisible('#storageWarning'),'Actual Chrome quota failure shows recovery warning');await exportZip(p,'quota-failure-recovery');await p.screenshot({path:join(out,'quota-failure.png'),fullPage:true});}
 report.observations.quotaOverride.browserQuota=await cdp.send('Storage.getUsageAndQuota',{origin});
 await cdp.send('Storage.overrideQuotaForOrigin',{origin});if(memory.failed){await p.click('#retryStorage');await flush(p);check((await durable(p)).session.records.length===2,'Removing quota override allows an explicit retry to commit both records');}else{check(disk.session.records.length===2,'Quota override did not force failure in this run; committed state remains readable');}
});

await scenario('unreadable and corrupt stored state fail closed',async()=>{
 const {p,ctx}=await fresh();await start(p);await collect(p,1);const original=(await state(p)).session.records[0].record_id;await p.close();
 const q=await ctx.newPage();await q.addInitScript(()=>{window.__realGet=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(){throw new DOMException('Synthetic startup read failure','UnknownError');};});await q.goto(base+'/index.html');await ready(q);
 check(!(await state(q)).lock && !await q.isVisible('#startForm'),'Startup read failure hides Start and prevents writing unknown existing state');
 check(await q.isVisible('#writerBlocked') && await q.isDisabled('#retryStorage'),'Startup read failure clearly blocks editing and retry overwrite');
 await q.evaluate(()=>{IDBObjectStore.prototype.get=window.__realGet;});check((await durable(q)).session.records[0].record_id===original,'Startup read failure leaves original durable record unchanged');await q.close();
 const seed=await ctx.newPage();seed.on('dialog',d=>d.accept());await seed.goto(base+'/index.html');await ready(seed);await resume(seed);await seed.evaluate(legacy=>localStorage.setItem('hll04-session',JSON.stringify(legacy)),(await state(seed)).session);await seed.click('#addMore');await collect(seed,2);await seed.close();
 const fallback=await ctx.newPage();await fallback.addInitScript(()=>{window.__realGet=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(){throw new DOMException('Synthetic unreadable newer IndexedDB','UnknownError');};});await fallback.goto(base+'/index.html');await ready(fallback);
 check(!(await state(fallback)).lock && (await state(fallback)).session.records.length===1,'Unreadable newer database exposes the older legacy copy only as a read-only recovery snapshot');
 check((await fallback.textContent('#writerReason')).includes('newer') && (await fallback.textContent('#storageWarningText')).includes('newer'),'Legacy recovery visibly warns that newer IndexedDB work could not be read');
 const legacyManifest=readManifest(await exportZip(fallback,'legacy-recovery-snapshot'));
 check(legacyManifest.storage_at_export==='legacy recovery snapshot; newer IndexedDB work could not be read' && legacyManifest.snapshot_source==='legacy-localStorage' && legacyManifest.loaded_from==='legacy-localStorage','Legacy recovery export explicitly identifies its older source and unreadable newer work');
 await fallback.evaluate(()=>{IDBObjectStore.prototype.get=window.__realGet;});check((await durable(fallback)).session.records.length===2,'Exporting the legacy recovery snapshot does not overwrite the newer two-record database');await fallback.close();
 report.observations.legacyFallback={legacyRecords:1,newerUnreadableDatabaseRecords:2,exportSource:legacyManifest.snapshot_source};
 const r=await ctx.newPage();await r.goto(base+'/index.html');await ready(r);const corrupt={version:2,session:{session_id:'invalid-envelope',records:'not-an-array',events:[]},draft:null,revision:88};
 await r.evaluate(value=>new Promise((res,rej)=>{const req=indexedDB.open('hll04-collection-db');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'current');tx.oncomplete=()=>{db.close();res();};tx.onabort=()=>rej(tx.error);};}),corrupt);
 await r.reload();await ready(r);check(!(await state(r)).lock && !await r.isVisible('#startForm'),'Corrupt envelope prevents starting a replacement session');
 check(JSON.stringify(await durable(r))===JSON.stringify(corrupt),'Corrupt envelope is preserved without a silent overwrite');
 await r.evaluate(()=>new Promise(res=>{const req=indexedDB.open('hll04-collection-db');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('current');tx.oncomplete=()=>{db.close();localStorage.setItem('hll04-session','{broken legacy JSON');res();};};}));
 await r.reload();await ready(r);check(!(await state(r)).lock && !await r.isVisible('#startForm'),'Malformed legacy JSON prevents starting a replacement session');
 check(await r.evaluate(()=>localStorage.getItem('hll04-session')==='{broken legacy JSON'),'Malformed legacy source is retained verbatim');
});

await scenario('late image import cannot replace an edit or discarded draft',async()=>{
 const {p}=await fresh();await start(p);await collect(p,1);const original=(await state(p)).session.records[0];await p.click('#addMore');await importFile(p,2);
 const delay=()=>{window.__realBitmap=window.createImageBitmap;window.createImageBitmap=async(...args)=>{await new Promise(resolve=>window.__releaseBitmap=resolve);const bitmap=await window.__realBitmap(...args);window.__bitmapDone=true;return bitmap;};};
 await p.evaluate(delay);await p.setInputFiles('#fileIn',join(fixtures,'small-3.png'));await p.waitForFunction(()=>!!window.__releaseBitmap);await p.click('#reviewCapture');await p.locator('[data-action=edit]').first().click();await p.evaluate(()=>window.__releaseBitmap());await p.waitForFunction(()=>window.__bitmapDone);await p.waitForTimeout(300);
 check((await state(p)).draft.editRecordId===original.record_id && (await state(p)).draft.image.sha256===original.image.sha256,'Late import cannot replace the selected edit image');
 await p.fill('[name=notes]','Edit still saves after cancelled import');await save(p);check((await state(p)).session.records[0].meta.notes==='Edit still saves after cancelled import','Cancelled import does not leave Save stuck busy');
 await p.evaluate(()=>{window.createImageBitmap=window.__realBitmap;delete window.__releaseBitmap;delete window.__bitmapDone;});await p.click('#addMore');await importFile(p,2);await p.evaluate(delay);await p.setInputFiles('#fileIn',join(fixtures,'small-3.png'));await p.waitForFunction(()=>!!window.__releaseBitmap);await p.click('#discardDraft');await p.evaluate(()=>window.__releaseBitmap());await p.waitForFunction(()=>window.__bitmapDone);await p.waitForTimeout(300);
 check(!(await state(p)).draft?.image && (await state(p)).session.records.length===1,'Late import does not resurrect an explicitly discarded draft');
 await p.evaluate(()=>{window.createImageBitmap=window.__realBitmap;});await p.click('#addMore');await collect(p,4,{task_id:'4'});check((await state(p)).session.records.length===2,'A new draft can be saved after discarding an in-flight import');
});

await scenario('explicit discard cancellation, failed commit and successful tombstone',async()=>{
 const {p}=await fresh();await start(p);await collect(p,1);const original=(await state(p)).session;await p.reload();await ready(p);
 p.removeAllListeners('dialog');p.once('dialog',d=>d.dismiss());await p.click('#discardSessionBtn');check((await durable(p)).session.session_id===original.session_id,'Cancelling permanent discard preserves the durable session');p.on('dialog',d=>d.accept());
 await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.__originalPut.apply(this,args);this.transaction.abort();return request;};});await p.click('#discardSessionBtn');await p.waitForFunction(()=>document.querySelector('#storageStatus').textContent.includes('Discard failed'));
 check((await durable(p)).session.session_id===original.session_id && (await state(p)).session.records.length===1,'Failed discard transaction preserves both memory and original committed session');
 check(!await p.isVisible('#startForm') && await p.isEnabled('#resumeBtn'),'Failed discard leaves a usable resume path without starting a replacement');
 await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});await p.click('#discardSessionBtn');await p.waitForSelector('#startForm:visible');
 check((await durable(p)).session===null && !(await state(p)).session,'Confirmed successful discard commits an empty-session tombstone');
 await p.evaluate(legacy=>localStorage.setItem('hll04-session',JSON.stringify(legacy)),original);await p.reload();await ready(p);
 check(!(await state(p)).session && await p.isVisible('#startForm'),'Committed tombstone prevents stale legacy data from resurrecting');
});
await scenario('Retry cannot resurrect a session behind a pending discard transaction',async()=>{
 const result=await runDiscardRace({browser:b,base,out,fixtures});report.observations.pendingDiscardRace=result.observations;
 for(const item of result.checks)check(item.passed,item.name);
});
check(!(report.observations.pageErrors||[]).length,'No browser page errors',report.observations.pageErrors||[]);
} finally {
 await b.close();report.completed=new Date().toISOString();report.summary={passedChecks:report.checks.filter(x=>x.passed).length,failedChecks:report.checks.filter(x=>!x.passed).length,passedScenarios:report.scenarios.filter(x=>x.passed).length,failedScenarios:report.scenarios.filter(x=>!x.passed).length};
 writeFileSync(join(out,'browser-results.json'),JSON.stringify(report,null,2));
 if(report.exports.length&&existsSync(join(out,'six-task-truth.json'))){try{execFileSync(process.env.PYTHON||'python3',[fileURLToPath(new URL('./browser-export-verify.py',import.meta.url)),out]);report.independentExportVerification={passed:true};console.log('PASS independent Python ZIP/CSV/image verification');}catch(error){const message=error.stderr?.toString()||error.message;report.independentExportVerification={passed:false,error:message};console.error('FAIL independent export verification',message);process.exitCode=1;}}
 writeFileSync(join(out,'browser-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.summary));if(report.summary.failedChecks||report.summary.failedScenarios)process.exitCode=1;
}
