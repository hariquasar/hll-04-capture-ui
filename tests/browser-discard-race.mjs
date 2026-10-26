// Hold a genuine IndexedDB tombstone transaction open while exercising public Retry/flush.
// This tests transaction ordering, not a delay placed in application code.
import { chromium } from 'playwright-core';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync,writeFileSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export async function runDiscardRace({browser,base,out,fixtures}) {
 const checks=[],check=(passed,name)=>checks.push({passed:!!passed,name});
 const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});
 const p=await ctx.newPage();p.setDefaultTimeout(6000);p.on('dialog',d=>d.accept());
 const ready=async()=>{await p.waitForFunction(()=>window.__hll04?.ready);await p.evaluate(async()=>await window.__hll04.ready);};
 const flush=()=>p.evaluate(async()=>await window.__hll04.flush());
 const read=()=>p.evaluate(()=>new Promise((res,rej)=>{const q=indexedDB.open('hll04-collection-db');q.onsuccess=()=>{const db=q.result,t=db.transaction('state','readonly'),r=t.objectStore('state').get('current');r.onsuccess=()=>res(r.result);t.oncomplete=()=>db.close();t.onabort=()=>rej(t.error);};}));
 try {
  await p.goto(base+'/index.html');await ready();await p.fill('#operator','Synthetic discard-race operator');await p.click('#startBtn');await p.waitForSelector('#capture:visible');await p.setInputFiles('#fileIn',join(fixtures,'small-1.png'));await p.waitForFunction(()=>!document.querySelector('#toMeta').disabled);await p.click('#toMeta');
  await p.selectOption('[name=scenario]','equipment');await p.fill('[name=location]','Lab B5');await p.fill('[name=subject_id]','EQ-1021');await p.selectOption('[name=condition]','good');await p.click('#saveBtn');await p.waitForSelector('#review:visible');await flush();
  const original=await p.evaluate(()=>window.__hll04.session);
  await p.evaluate(legacy=>new Promise((res,rej)=>{localStorage.setItem('hll04-session',JSON.stringify(legacy));const q=indexedDB.open('hll04-collection-db');q.onsuccess=()=>{const db=q.result,t=db.transaction('state','readwrite');t.objectStore('state').delete('current');t.oncomplete=()=>{db.close();res();};t.onabort=()=>rej(t.error);};}),original);
  await p.addInitScript(()=>{
   if(sessionStorage.getItem('race-injection-finished'))return;
   const original=IDBObjectStore.prototype.put;window.__holdClear=true;window.__failNonEmpty=true;window.__staleWriteAttempts=0;
   IDBObjectStore.prototype.put=function(value,...args){
    const request=original.call(this,value,...args);
    if(value?.session){
     if(window.__clearPending)window.__staleWriteAttempts++;
     if(window.__failNonEmpty)this.transaction.abort();
    }else if(value?.session===null){
     window.__clearPending=true;const store=this;
     const keepAlive=()=>{const q=store.get('current');q.onsuccess=()=>{if(window.__holdClear)keepAlive();};};keepAlive();
     this.transaction.addEventListener('complete',()=>window.__clearCommitted=true);
    }
    return request;
   };
  });
  await p.reload();await ready();
  check(await p.isVisible('#resumePanel')&&await p.isVisible('#storageWarning'),'Discard-race setup has a recoverable legacy session and visible storage failure');
  await p.click('#discardSessionBtn');await p.waitForFunction(()=>window.__clearPending===true);
  check(!await p.evaluate(()=>!!window.__clearCommitted),'Discard tombstone is held inside a genuine incomplete IndexedDB transaction');
  check(await p.isDisabled('#retryStorage'),'Retry is disabled while the permanent discard transaction is pending');
  await p.screenshot({path:join(out,'discard-pending-race.png'),fullPage:true});
  // Let subsequent writes succeed. An implementation that captured the old session
  // during Retry/flush will therefore visibly resurrect it after the tombstone.
  await p.evaluate(()=>{window.__failNonEmpty=false;});
  if(await p.isEnabled('#retryStorage'))await p.click('#retryStorage');
  await p.evaluate(()=>{window.__publicFlushDone=false;window.__hll04.flush().then(()=>window.__publicFlushDone=true,()=>window.__publicFlushDone=true);});
  await p.evaluate(()=>{window.__holdClear=false;});await p.waitForFunction(()=>window.__clearCommitted&&window.__publicFlushDone);await p.waitForSelector('#startForm:visible');
  const observations=await p.evaluate(()=>({staleWriteAttempts:window.__staleWriteAttempts,tombstoneCompleted:window.__clearCommitted}));
  const durable=await read();
  check(observations.staleWriteAttempts===0,'Public Retry/flush cannot queue an old-session write behind the tombstone');
  check(durable?.session===null,'Committed empty-session tombstone remains durable after public Retry/flush attempts');
  check(await p.evaluate(()=>localStorage.getItem('hll04-session')===null),'Successful discard removes the legacy source after the tombstone commits');
  await p.evaluate(()=>sessionStorage.setItem('race-injection-finished','yes'));await p.reload();await ready();
  check(await p.evaluate(()=>window.__hll04.session===null)&&await p.isVisible('#startForm'),'Reload after pending-discard Retry attempts cannot resurrect the discarded session');
  return {checks,observations};
 } finally {await ctx.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=resolve(process.env.HLL04_TEST_DIR||'.test-artifacts/discard-race');mkdirSync(out,{recursive:true});const fixtures=resolve(process.env.HLL04_FIXTURES||join(out,'fixtures'));
 if(!existsSync(join(fixtures,'small-1.png')))execFileSync(process.env.PYTHON||'python3',[fileURLToPath(new URL('./browser-fixtures.py',import.meta.url)),fixtures]);
 const browser=await chromium.launch({channel:'chrome',headless:true});const report={label:'Synthetic engineering transaction-order regression',browser:browser.version(),base:process.env.HLL04_BASE_URL||'http://127.0.0.1:8765',started:new Date().toISOString()};
 try{Object.assign(report,await runDiscardRace({browser,base:report.base,out,fixtures}));report.passed=report.checks.every(c=>c.passed);for(const c of report.checks)console.log(`${c.passed?'PASS':'FAIL'} ${c.name}`);if(!report.passed)process.exitCode=1;}catch(error){report.error=error.stack;report.passed=false;process.exitCode=1;}finally{await browser.close();report.completed=new Date().toISOString();writeFileSync(join(out,'discard-race-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
