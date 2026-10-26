import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.HLL04_STUDY_TEST_URL||'http://127.0.0.1:18771';
let invite=process.env.HLL04_STUDY_INVITE||'local-synthetic';
if(process.env.HLL04_STUDY_INVITE_FILE){const raw=(await fs.readFile(process.env.HLL04_STUDY_INVITE_FILE,'utf8')).trim();try{const p=JSON.parse(raw);invite=p.synthetic_invite||p.syntheticInvite||p.invite_code;if(!invite)throw Error('Synthetic invitation missing');}catch(e){if(raw.startsWith('{'))throw e;invite=raw;}}
if(!base.startsWith('http://127.0.0.1')&&invite==='local-synthetic')throw Error('Remote run requires a synthetic invitation');
const output=path.resolve(process.env.HLL04_STUDY_TEST_DIR||'remote-study/frontend/evidence');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{
for(const target of ['submit','withdraw']){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('dialog',d=>d.accept());await page.clock.install();
 await page.goto(base.replace(/\/$/,'')+'/#invite='+encodeURIComponent(invite)+'&synthetic=1');for(const id of ['adultConsent','agreeConsent','firstParticipation'])await page.locator('#'+id).check();await page.locator('#beginStudy').click();await page.locator('#startPractice').waitFor();
 let release;const gate=new Promise(r=>release=r);let held;const heldPromise=new Promise(r=>held=r);const paths=[];
 page.on('request',r=>{if(r.method()==='POST'&&/\/(checkpoint|submit|withdraw)$/.test(r.url()))paths.push(new URL(r.url()).pathname.split('/').at(-1));});
 let first=true;await page.route('**/checkpoint',async route=>{if(first){first=false;const response=await route.fetch();held();await gate;await route.fulfill({response});}else await route.continue();});
 await page.locator('#retrySync').click();await heldPromise;
 // Hold below the 20-second request timeout; explicit retries and transition/debounce saves must coalesce.
 for(let i=0;i<3;i++){await page.clock.fastForward(4000);await page.locator('#retrySync').click();}
 if(target==='submit'){
  for(let i=0;i<2;i++){await page.locator('#skipCondition').click();await page.locator('#skipQuestionnaire').click();}
  await page.locator('#submitStudy').click();
 }else await page.locator('#withdrawStudy').click();
 assert.deepEqual(paths,['checkpoint'],'Only one network checkpoint may be in flight before the held ACK is released');
 release();await page.locator('#saveFinalReceipt').waitFor({timeout:15000});
 assert.deepEqual(paths,['checkpoint',target],target+' must be next, without a backlog of stale snapshots');
 const snapshot=await page.evaluate(()=>({status:window.__hll04study.state.session.status,payload:window.__hll04study.state.payload}));
 assert.equal(snapshot.status,target==='submit'?'submitted':'withdrawn');
 if(target==='submit'){assert.equal(snapshot.payload.conditions.baseline.status,'skipped');assert.equal(snapshot.payload.conditions.guided.status,'skipped');}
 results.push({scenario:target,passed:true,network_sequence:paths,latest_state_preserved:true,synthetic_only:true});await context.close();
}
await fs.writeFile(path.join(output,'slow-network-results.json'),JSON.stringify({passed:results.length,scenarios:results},null,2));console.log(JSON.stringify({passed:results.length,scenarios:results},null,2));
}finally{await browser.close();}
