import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {TASKS,PRACTICE,FIELDS} from '../web/core.mjs';
const base=process.env.HLL04_STUDY_TEST_URL||'http://127.0.0.1:18771';
let invite=process.env.HLL04_STUDY_INVITE||'local-synthetic';if(process.env.HLL04_STUDY_INVITE_FILE){const secret=(await fs.readFile(process.env.HLL04_STUDY_INVITE_FILE,'utf8')).trim();try{const v=JSON.parse(secret);invite=v.synthetic_invite||v.syntheticInvite||v.invite_code;if(!invite)throw Error('Missing synthetic invite field');}catch(e){if(secret.startsWith('{'))throw e;invite=secret;}}if(!base.startsWith('http://127.0.0.1')&&invite==='local-synthetic')throw Error('Remote testing requires an explicit synthetic invite.');
const out=path.resolve(process.env.HLL04_STUDY_TEST_DIR||'remote-study/frontend/evidence');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});let checks=[];
const ok=(name,value)=>{assert(value,name);checks.push(name);};
async function fillGuided(page,t){await page.locator(`[data-image="${t.image_file}"]`).click();const f=page.frameLocator('#guidedFrame');await f.locator('#toMeta').click();for(const k of FIELDS){const e=f.locator('#field-'+k);if(['scenario','condition'].includes(k))await e.selectOption(t[k]);else await e.fill(t[k]);}await f.locator('#saveBtn').click();await f.locator('#review').waitFor({state:'visible'});return f;}
async function create(){const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base.replace(/\/$/,'')+'/#invite='+encodeURIComponent(invite)+'&synthetic=1');await page.locator('#adultConsent').check();await page.locator('#agreeConsent').check();await page.locator('#firstParticipation').check();await page.locator('#beginStudy').click();await page.locator('#startPractice').waitFor();return {page,context,errors};}
try{
for(let run=0;run<2;run++){
 const {page,context,errors}=await create();const order=await page.evaluate(()=>window.__hll04study.state.session.order);ok('server assigned two distinct conditions '+run,new Set(order).size===2);
 let uploads=[];page.on('request',r=>{if(/\/(checkpoint|submit)$/.test(r.url()))uploads.push(r.postDataJSON());});
 for(const c of order){
  await page.locator('#startPractice').click();await page.waitForFunction(()=>window.__hll04study.ready);await page.waitForFunction(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[window.__hll04study.state.payload.condition_index]].practice.started_at);
  ok('practice finish disabled before 120s '+run+c,await page.locator('#finishPractice').isDisabled());
  if(c==='guided'){await fillGuided(page,PRACTICE);ok('practice guided record exists locally '+run,await page.frameLocator('#guidedFrame').locator('#recTable tbody tr').count()===1);}else{await page.locator('[data-row="0"][data-field="task_id"]').fill('practice only');await page.locator('[data-image="practice.png"]').click();}
  await page.clock.fastForward(120100);await page.locator('#finishPractice').click();await page.locator('#startBlock').click();await page.waitForFunction(()=>window.__hll04study.ready);await page.waitForFunction(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[window.__hll04study.state.payload.condition_index]].started_at);
  ok('measured state empty after practice '+run+c,(await page.evaluate(c=>window.__hll04study.state.payload.conditions[c].records,c)).length===0);
  if(c==='guided'){
    ok('measured guided has no practice records '+run,await page.frameLocator('#guidedFrame').locator('#recTable tbody tr').count()===0);
    const before=await page.evaluate(()=>window.__hll04study.state.payload.interruption_counts.blur);
    const f=await fillGuided(page,TASKS[0]);
    await page.waitForTimeout(50);
    ok('internal iframe click does not count blur '+run,(await page.evaluate(()=>window.__hll04study.state.payload.interruption_counts.blur))===before);
    const [download]=await Promise.all([page.waitForEvent('download'),f.locator('#exportBtn').click()]);await download.saveAs(path.join(out,`run${run}-guided.zip`));
    await page.waitForFunction(()=>window.__hll04study.state.payload.conditions.guided.export.sha256);
    ok('actual guided manifest captured exact raw label '+run,(await page.evaluate(()=>window.__hll04study.state.payload.conditions.guided.records[0].location))===TASKS[0].location);
    await page.screenshot({path:path.join(out,`run${run}-guided.png`),fullPage:true});
  }else{
    for(const k of FIELDS)await page.locator(`[data-row="0"][data-field="${k}"]`).fill(k==='task_id'?'wrong-id':k==='notes'?"=1+1\n'raw":TASKS[0][k]);
    await page.locator('[data-image="task-02.png"]').click();
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#baselineExport').click()]);await download.saveAs(path.join(out,`run${run}-baseline.zip`));
    ok('baseline retains wrong ID and wrong image without correction '+run,await page.evaluate(()=>{const r=window.__hll04study.state.payload.conditions.baseline.records[0];return r.task_id==='wrong-id'&&r.image_file==='task-02.png';}));
    await page.screenshot({path:path.join(out,`run${run}-baseline.png`),fullPage:true});
  }
  ok('file-open not inferred from export '+run+c,!(await page.locator('#openedConfirmed').isChecked()));
  await page.locator('#downloadConfirmed').check();await page.locator('#openedConfirmed').check();await page.locator('#finishBlock').click();await page.locator('#susForm').waitFor();
  ok('whole-block timer stopped before questionnaire/upload '+run+c,(await page.evaluate(c=>window.__hll04study.state.payload.conditions[c].ended_at,c))!==null);
  await page.locator('input[name="sus0"][value="4"]').check();await page.locator('#skipQuestionnaire').click();
 }
 await page.locator('#submitStudy').waitFor();await page.locator('#submitStudy').click();await page.locator('#saveFinalReceipt').waitFor();ok('server ACK received before completion '+run,await page.evaluate(()=>window.__hll04study.state.session.lastReceipt.status==='submitted'));
 const submission=uploads.findLast(r=>r.payload.phase==='complete');ok('submitted payload has no image bytes or token '+run,!!submission&&!JSON.stringify(submission).includes('data:image')&&!JSON.stringify(submission).includes('token'));
 ok('partial SUS retained as nulls '+run,submission.payload.conditions.baseline.sus[0]===4&&submission.payload.conditions.baseline.sus[1]===null);
 ok('one of six records remains partial, no hidden task completion '+run,submission.payload.conditions.baseline.records.length===1&&submission.payload.conditions.guided.records.length===1);
 ok('no runtime page errors '+run,errors.length===0);await fs.writeFile(path.join(out,`run${run}-submitted.json`),JSON.stringify(submission,null,2));await context.close();
}
const {page,context,errors}=await create();await page.locator('#startPractice').click();await page.waitForFunction(()=>window.__hll04study.ready);await page.waitForFunction(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[0]].practice.started_at);await page.clock.fastForward(120100);await page.locator('#finishPractice').click();await page.locator('#startBlock').click();await page.waitForFunction(()=>window.__hll04study.ready);await page.waitForFunction(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[0]].started_at);const started=await page.evaluate(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[0]].started_at);
const second=await context.newPage();await second.goto(base);await second.locator('#readOnlyGate').waitFor({state:'visible'});ok('second tab is blocked from mutating',await second.locator('#main').evaluate(e=>e.inert));let secondPosts=0;second.on('request',r=>{if(r.method()==='POST')secondPosts++;});await second.locator('#retrySync').click();await second.waitForTimeout(100);ok('second tab retry cannot send a write',secondPosts===0);await second.close();
await page.reload();await page.waitForFunction(()=>window.__hll04study.ready);ok('reload preserves original measured start',await page.evaluate(started=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[0]].started_at===started,started));
await page.setViewportSize({width:390,height:844});await page.locator('#deviceGate').waitFor({state:'visible'});ok('phone-size window gated',await page.locator('#deviceGate').isVisible());await page.setViewportSize({width:1440,height:1000});await page.clock.fastForward(900100);await page.locator('#susForm').waitFor();ok('15-minute cap ends unfinished block',await page.evaluate(()=>window.__hll04study.state.payload.conditions[window.__hll04study.state.session.order[0]].status==='capped'));
await page.locator('#withdrawStudy').click();await page.locator('#saveFinalReceipt').waitFor();ok('withdrawal acknowledged',await page.evaluate(()=>window.__hll04study.state.session.status==='withdrawn'));ok('cap/resume scenario no runtime errors',errors.length===0);await context.close();
console.log(JSON.stringify({passed:checks.length,checks},null,2));await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify({passed:checks.length,checks,synthetic_only:true,physical_camera_tested:false},null,2));
}finally{await browser.close();}
