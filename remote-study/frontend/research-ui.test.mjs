// Synthetic local regressions only. No human observations or study data reads.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {UI_REVISION,LEGACY_UI_REVISION,TASKS,manifestFromZip} from '../web/core.mjs';
const base=process.env.HLL04_STUDY_TEST_URL||'http://127.0.0.1:18771';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('This regression seeds synthetic local state and requires the isolated loopback server.');
const out=path.resolve(process.env.HLL04_STUDY_TEST_DIR||'remote-study/frontend/evidence/research-ui');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
const check=(name,value)=>{assert(value,name);checks.push(name);};
async function frameRecord(page){await page.locator('#fileIn').setInputFiles(new URL('../web/assets/task-01.png',import.meta.url).pathname);await page.locator('#toMeta').click();}
async function fill(page){for(const [key,value] of Object.entries(TASKS[0])){if(!['task_id','scenario','location','subject_id','condition'].includes(key))continue;const input=page.locator('#field-'+key);if(['scenario','condition'].includes(key))await input.selectOption(value);else await input.fill(value);}}
try{
 for(const revision of [UI_REVISION,LEGACY_UI_REVISION]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const scope='synthetic-validation-'+crypto.randomUUID();
  await page.goto(base+`/app/index.html?scope=${scope}&ui_revision=${revision}`);await page.waitForFunction(()=>window.__hll04?.hasWriterLock);await page.locator('#operator').fill('SYNTHETIC_UI_CHECK');await page.locator('#studyMode').check();await page.locator('#startBtn').click();await frameRecord(page);
  check(revision+' pins iframe revision',await page.evaluate(()=>window.__hll04.uiRevision)===revision);
  await page.locator('#field-subject_id').fill('bad');await page.locator('#field-location').focus();
  check(revision+' expected first-blur behavior',(await page.locator('#err-subject_id').innerText()).length>0===(revision===LEGACY_UI_REVISION));
  if(revision===UI_REVISION){
   check('required labels and pre-entry rules visible',await page.locator('[data-key="location"]').innerText().then(x=>x.includes('(required)')&&x.includes('At least 2 characters')));
   check('asset rule visible before save',(await page.locator('#hint-subject_id').innerText()).includes('2–4 capital letters'));
   check('untouched fields have no errors before save',await page.locator('#err-task_id').innerText()==='');
   check('hint and error linked to control',await page.locator('#field-subject_id').getAttribute('aria-describedby')==='hint-subject_id err-subject_id');
  }
  await page.locator('#saveBtn').click();check(revision+' invalid save focuses first invalid field',await page.evaluate(()=>document.activeElement.id)==='field-task_id');check(revision+' all invalid fields revealed on save',await page.locator('#metaForm [aria-invalid="true"]').count()===5);
  if(revision===UI_REVISION)await page.screenshot({path:path.join(out,'revised-form-errors.png'),fullPage:true});
  await fill(page);check(revision+' shown errors clear when corrected',await page.locator('#metaForm [aria-invalid="true"]').count()===0);
  // A previously valid optional field stays quiet until the next explicit Save in revised UI.
  await page.locator('#field-notes').fill('x'.repeat(501));await page.locator('#field-location').focus();
  if(revision===UI_REVISION)check('untouched-field error not introduced while fixing other fields',await page.locator('#err-notes').innerText()==='');
  await page.locator('#field-notes').fill('Synthetic saved record');await page.locator('#saveBtn').click();await page.locator('#review').waitFor({state:'visible'});
  const identity=await page.evaluate(()=>({id:window.__hll04.session.records[0].record_id,hash:window.__hll04.session.records[0].image.sha256}));
  await page.locator('[data-action="edit"]').click();await page.locator('#field-subject_id').fill('bad-again');await page.locator('#field-location').focus();
  if(revision===UI_REVISION)check('saved-record edit also waits for save',await page.locator('#err-subject_id').innerText()==='');
  await page.locator('#saveBtn').click();check(revision+' invalid edit keeps original record',await page.evaluate(()=>window.__hll04.session.records[0].meta.subject_id)==='EQ-1021');await page.locator('#field-subject_id').fill('EQ-1021');await page.locator('#field-location').fill('Synthetic recovered edit');await page.evaluate(()=>window.__hll04.flush());await page.reload();await page.locator('#resumeBtn').click();
  check(revision+' unfinished edit restored',await page.locator('#field-location').inputValue()==='Synthetic recovered edit');await page.locator('#saveBtn').click();await page.locator('#review').waitFor({state:'visible'});check(revision+' edit preserves record and image identity',await page.evaluate(expected=>window.__hll04.session.records[0].record_id===expected.id&&window.__hll04.session.records[0].image.sha256===expected.hash,identity));
  const downloadPromise=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await downloadPromise,zipPath=path.join(out,revision+'.zip');await download.saveAs(zipPath);const manifest=await manifestFromZip(new Blob([await fs.readFile(zipPath)]));check(revision+' downloaded manifest carries provenance',manifest.ui_revision===revision&&manifest.remote_protocol==='HLL04-remote-table-v3');
  await page.screenshot({path:path.join(out,revision+'-review.png'),fullPage:true});
  if(revision===UI_REVISION){
   await page.goto(base+`/app/index.html?scope=${scope}&ui_revision=${LEGACY_UI_REVISION}`);await page.waitForFunction(()=>!!window.__hll04);await page.evaluate(()=>window.__hll04.ready);check('cross-revision IndexedDB open is read-only',!await page.evaluate(()=>window.__hll04.hasWriterLock));
   await page.goto(base+`/app/index.html?scope=${scope}&ui_revision=${UI_REVISION}`);await page.locator('#resumeBtn').click();await page.locator('#review').waitFor({state:'visible'});check('mismatched revision does not destroy existing records',await page.evaluate(()=>window.__hll04.session.records.length)===1);
  }
  check(revision+' no uncaught errors',errors.length===0);await context.close();
 }
 // New wrapper enrolment records revision in server assignment, checkpoints and private receipt.
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();await page.goto(base+'/#invite=local-synthetic&synthetic=1');for(const id of ['adultConsent','agreeConsent','firstParticipation'])await page.locator('#'+id).check();await page.locator('#beginStudy').click();await page.locator('#startPractice').waitFor();check('new wrapper session is revised',await page.evaluate(()=>window.__hll04study.state.session.ui_revision)===UI_REVISION);
 const saved=page.waitForResponse(r=>r.url().endsWith('/checkpoint'));await page.locator('#retrySync').click();const response=await saved;check('server checkpoint acknowledgement pins revision',(await response.json()).ui_revision===UI_REVISION);
 const receiptDownload=page.waitForEvent('download');await page.locator('#downloadReceipt').click();const receipt=await receiptDownload,receiptPath=path.join(out,'synthetic-PRIVATE-receipt.json');await receipt.saveAs(receiptPath);const contents=JSON.parse(await fs.readFile(receiptPath));check('private receipt and contained session identify revision',contents.ui_revision===UI_REVISION&&contents.session.ui_revision===UI_REVISION);await fs.unlink(receiptPath);
 // A genuine legacy-shaped creation/local state resumes as legacy without being promoted.
 await page.close({runBeforeUnload:false});const seed=await context.newPage();await seed.goto(base+'/core.mjs');
 await seed.evaluate(async()=>{const {newPayload}=await import('./core.mjs');const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),config_version:'HLL04-remote-table-v3',invite_code:'local-synthetic',synthetic:true,consent:{agreed:true,adult:true,version:'HLL04-remote-consent-v1'},environment:{user_agent:'Synthetic legacy regression',platform:'test',language:'en',viewport_width:1440,viewport_height:1000}})});if(!response.ok)throw Error('Synthetic legacy allocation failed');const session=await response.json();delete session.ui_revision;localStorage.setItem('hll04-remote-table-v3-client',JSON.stringify({session,payload:newPayload(),pending:null,practiceRows:{baseline:[],guided:[]},downloadConfirmed:{baseline:false,guided:false}}));});
 // Close before reload so the active prior wrapper cannot overwrite seeded synthetic state on unload.
 await seed.close({runBeforeUnload:false});const resumed=await context.newPage();await resumed.goto(base);await resumed.locator('#startPractice').waitFor();check('legacy wrapper resume stays legacy',await resumed.evaluate(()=>window.__hll04study.state.session.ui_revision)===LEGACY_UI_REVISION);if(await resumed.evaluate(()=>window.__hll04study.state.session.order[0])!=='guided'){resumed.on('dialog',d=>d.accept());await resumed.locator('#skipCondition').click();await resumed.locator('#skipQuestionnaire').click();}await resumed.locator('#startPractice').click();await resumed.waitForFunction(()=>window.__hll04study.ready);check('legacy wrapper mounts legacy guided behavior',await resumed.evaluate(()=>document.querySelector('#guidedFrame').contentWindow.__hll04.uiRevision)===LEGACY_UI_REVISION);await context.close();
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({synthetic_only:true,passed:checks.length,checks},null,2));console.log(JSON.stringify({synthetic_only:true,passed:checks.length}));
}finally{await browser.close();}
