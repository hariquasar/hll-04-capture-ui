// Synthetic-only six-record integration. Numeric SUS inputs below are fixture values, not human ratings.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {TASKS,FIELDS,UI_REVISION,VERSION,manifestFromZip} from '../web/core.mjs';
const base=process.env.HLL04_STUDY_TEST_URL||'http://127.0.0.1:18771';
let invite=process.env.HLL04_STUDY_INVITE||'local-synthetic';
if(process.env.HLL04_STUDY_INVITE_FILE){const raw=(await fs.readFile(process.env.HLL04_STUDY_INVITE_FILE,'utf8')).trim();try{const p=JSON.parse(raw);invite=p.synthetic_invite||p.syntheticInvite||p.invite_code;if(!invite)throw Error('Synthetic invitation missing');}catch(e){if(raw.startsWith('{'))throw e;invite=raw;}}
if(!base.startsWith('http://127.0.0.1')&&invite==='local-synthetic')throw Error('Remote run requires a synthetic invitation');
const out=path.resolve(process.env.HLL04_STUDY_TEST_DIR||'remote-study/frontend/evidence/hosted-six-record');await fs.mkdir(out,{recursive:true});
const checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let submission;page.on('request',r=>{if(r.url().endsWith('/submit'))submission=r.postDataJSON();});
 await page.clock.install();
 await page.goto(base.replace(/\/$/,'')+'/#invite='+encodeURIComponent(invite)+'&synthetic=1');
 try{for(const id of ['adultConsent','agreeConsent','firstParticipation'])await page.locator('#'+id).check();}catch{throw Error('Synthetic consent screen unavailable. Main: '+await page.locator('#main').innerText()+'; browser errors: '+errors.join('; '));}
 await page.locator('#beginStudy').click();await page.locator('#startPractice').waitFor();
 const identity=await page.evaluate(()=>({session_id:window.__hll04study.state.session.session_id,code:window.__hll04study.state.session.participant_code,ui_revision:window.__hll04study.state.session.ui_revision,order:window.__hll04study.state.session.order}));
 check('server synthetic allocation never P-code',identity.code.startsWith('S'));
 check('server pins expected UI revision',identity.ui_revision===UI_REVISION);
 for(const condition of identity.order){
  await page.locator('#startPractice').click();
  await page.waitForFunction(()=>window.__hll04study.ready);
  await page.waitForFunction(c=>!!window.__hll04study.state.payload.conditions[c].practice.started_at,condition);
  await page.clock.fastForward(120100);await page.locator('#finishPractice').click();
  await page.locator('#startBlock').click();await page.waitForFunction(()=>window.__hll04study.ready);
  await page.waitForFunction(c=>!!window.__hll04study.state.payload.conditions[c].started_at,condition);
  for(let i=0;i<TASKS.length;i++){
   const task=TASKS[i];await page.locator(`[data-task="${i}"]`).click();
   if(condition==='baseline'){
    await page.locator(`input[name="selectedRow"][value="${i}"]`).check();
    await page.locator(`[data-image="${task.image_file}"]`).click();
    for(const key of FIELDS)await page.locator(`[data-row="${i}"][data-field="${key}"]`).fill(task[key]);
   }else{
    const frame=page.frameLocator('#guidedFrame');if(i)await frame.locator('#addMore').click();
    await page.locator(`[data-image="${task.image_file}"]`).click();await frame.locator('#toMeta').click();
    for(const key of FIELDS){const input=frame.locator('#field-'+key);if(['scenario','condition'].includes(key))await input.selectOption(task[key]);else await input.fill(task[key]);}
    await frame.locator('#saveBtn').click();await frame.locator('#review').waitFor({state:'visible'});
   }
  }
  const exportButton=condition==='baseline'?page.locator('#baselineExport'):page.frameLocator('#guidedFrame').locator('#exportBtn');
  const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);
  const zipPath=path.join(out,condition+'-six-records.zip');await download.saveAs(zipPath);
  const manifest=await manifestFromZip(new Blob([await fs.readFile(zipPath)]));
  check(condition+' downloaded ZIP carries expected protocol and UI revision',manifest.ui_revision===UI_REVISION&&(manifest.remote_protocol||manifest.protocol)===VERSION);
  await page.waitForFunction(c=>!!window.__hll04study.state.payload.conditions[c].export.sha256,condition);
  const block=await page.evaluate(c=>window.__hll04study.state.payload.conditions[c],condition);
  check(condition+' six raw records retained',block.records.length===6);
  check(condition+' explicit image selection hashes match all cards',TASKS.every(t=>block.records.some(r=>r.task_id===t.task_id&&r.image_sha256===t.image_sha256)));
  check(condition+' exact raw metadata retained',TASKS.every(t=>block.records.some(r=>r.task_id===t.task_id&&['scenario','location','subject_id','condition'].every(k=>r[k]===t[k]))));
  check(condition+' original study code never participant name',condition==='baseline'||(await page.frameLocator('#guidedFrame').locator('#operator').inputValue())===identity.code);
  await page.screenshot({path:path.join(out,condition+'-six-records.png'),fullPage:true});
  await page.locator('#downloadConfirmed').check();await page.locator('#openedConfirmed').check();await page.locator('#finishBlock').click();await page.locator('#susForm').waitFor();
  for(let i=0;i<10;i++)await page.locator(`input[name="sus${i}"][value="${i%2?1:5}"]`).check();
  await page.locator('#comments').fill('Synthetic engineering test only. Not a participant comment.');
  await page.locator('#saveQuestionnaire').click();
 }
 await page.locator('#submitStudy').click();await page.locator('#saveFinalReceipt').waitFor();
 check('final API receipt acknowledged',await page.evaluate(()=>window.__hll04study.state.session.lastReceipt.status==='submitted'));
 check('final server receipt pins UI revision',await page.evaluate(()=>window.__hll04study.state.session.lastReceipt.ui_revision)===UI_REVISION);
 check('final submission pins UI revision',submission?.ui_revision===UI_REVISION);
 const receiptDownload=page.waitForEvent('download');await page.locator('#saveFinalReceipt').click();
 const privatePath=path.join(out,'synthetic-PRIVATE-receipt.json');await (await receiptDownload).saveAs(privatePath);await fs.chmod(privatePath,0o600);
 try{const receipt=JSON.parse(await fs.readFile(privatePath,'utf8'));check('downloaded private receipt and contained session identify UI revision',receipt.ui_revision===UI_REVISION&&receipt.session.ui_revision===UI_REVISION);}finally{await fs.unlink(privatePath);}
 check('no image bytes or credentials in submitted response',submission&&!JSON.stringify(submission).includes('data:image')&&!JSON.stringify(submission).includes('token'));
 for(const c of ['baseline','guided']){
  check(c+' six records reached final submission',submission.payload.conditions[c].records.length===6);
  check(c+' all ten SUS responses retained',submission.payload.conditions[c].sus.length===10&&submission.payload.conditions[c].sus.every(x=>Number.isInteger(x)));
  check(c+' complete timer and artifact recorded',submission.payload.conditions[c].status==='completed'&&submission.payload.conditions[c].elapsed_ms>0&&!!submission.payload.conditions[c].export.sha256);
 }
 check('no uncaught browser runtime errors',errors.length===0);
 await fs.writeFile(out+'/submitted-payload.json',JSON.stringify(submission,null,2));
 await fs.writeFile(out+'/results.json',JSON.stringify({synthetic_only:true,identity,passed:checks.length,checks},null,2));
 console.log(JSON.stringify({synthetic_only:true,code:identity.code,passed:checks.length}));await context.close();
}finally{await browser.close();}
