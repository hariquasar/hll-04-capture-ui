// Synthetic diagnostic fixtures only; no participant observations.
import * as C from '../src/core.mjs';
const good={scenario:'indoor',location:'Lab B5',subject_id:'EQ-1234',condition:'good'};
const s=C.newSession('synthetic-audit','test',new Date('2026-10-16T00:00:00Z'));
const image=h=>({file:h+'.jpg',sha256:h,source:'import'});
for(const h of ['a','b','c']) C.trySave(s,C.makeRecord(s,image(h),good));
s.records.splice(0,1);
C.trySave(s,C.makeRecord(s,image('d'),good));
console.log('After delete + save IDs:',JSON.stringify(s.records.map(r=>r.record_id)));
console.log('Unique IDs:',new Set(s.records.map(r=>r.record_id)).size,'records:',s.records.length);
const result=C.trySave(s,C.makeRecord(s,image('d'),good));
console.log('Duplicate result:',JSON.stringify(result),'last event:',JSON.stringify(s.events.at(-1)));
const times=[10,20];
console.log('Synthetic even median: current expression=',times[Math.floor(times.length/2)],'correct=',(times[0]+times[1])/2);
