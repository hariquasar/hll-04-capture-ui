export const VERSION='HLL04-remote-table-v3';
export const UI_REVISION='research-20261026-r1', LEGACY_UI_REVISION='legacy-v3';
// Missing provenance belongs to the original instrument, never the revised UI.
export function uiRevision(value){const revision=value?.ui_revision??LEGACY_UI_REVISION;if(![LEGACY_UI_REVISION,UI_REVISION].includes(revision))throw Object.assign(Error('Unsupported study UI revision. Existing work has been kept.'),{code:'ui_revision_mismatch'});return revision;}
export const PRACTICE_MS=120000, BLOCK_MS=900000;
export const FIELDS=['task_id','scenario','location','subject_id','condition','notes'];
export const TASKS=[
 {task_id:'1',scenario:'equipment',location:'Lab B5',subject_id:'EQ-1021',condition:'good',notes:'',image_file:'task-01.png',image_sha256:'af9590cc0c587e86b858e36ea73e5a5393be0a0d999910cfd822402d799e5ecb'},
 {task_id:'2',scenario:'indoor',location:'3/F Block A',subject_id:'FL-20417',condition:'poor',notes:'',image_file:'task-02.png',image_sha256:'0e2ebddde5a2d74e28d09ede885c09290153440ba06fec9597abd13e4ed3a9d2'},
 {task_id:'3',scenario:'vehicle',location:'North Gate',subject_id:'BK-3307',condition:'fair',notes:'',image_file:'task-03.png',image_sha256:'14a55895e423fc61e4307ab7085dc8378af4e1f4021c67cdc9b0542f8e9acb05'},
 {task_id:'4',scenario:'document',location:'Room 201',subject_id:'DOC-5512',condition:'good',notes:'',image_file:'task-04.png',image_sha256:'bd1a80935da824146d3264d0283831e55864b7a7c9e2c85ddba0729aaca7d9be'},
 {task_id:'5',scenario:'outdoor',location:'Canteen',subject_id:'SL-884',condition:'unknown',notes:'',image_file:'task-05.png',image_sha256:'a6f7cbb1a0ec5df45d29b51a449f6393002a0f5ee91b0a22f03d7ad1cf182480'},
 {task_id:'6',scenario:'equipment',location:'Block B stairwell',subject_id:'FE-1093',condition:'poor',notes:'',image_file:'task-06.png',image_sha256:'8bf6d82980c0dcd5f60847a7b2bfd45108e44fcbf496c4b42834f797995e770c'},
];
export const PRACTICE={task_id:'1',scenario:'equipment',location:'Practice desk',subject_id:'PR-1001',condition:'unknown',notes:'',image_file:'practice.png',image_sha256:'8b3e9812bfa773bf5c6ec2577626be61fbfe8f716c89bb85a3c1140f688f5043'};
export const SUS=[
'I think that I would like to use this system frequently.',
'I found the system unnecessarily complex.',
'I thought the system was easy to use.',
'I think that I would need the support of a technical person to be able to use this system.',
'I found the various functions in this system were well integrated.',
'I thought there was too much inconsistency in this system.',
'I would imagine that most people would learn to use this system very quickly.',
'I found the system very cumbersome to use.',
'I felt very confident using the system.',
'I needed to learn a lot of things before I could get going with this system.'
];
export const iso=()=>new Date().toISOString();
export function emptyRecord(id=''){return {record_id:id,...Object.fromEntries(FIELDS.map(k=>[k,''])),image_file:'',image_sha256:''};}
export function emptyBlock(){return {practice:{started_at:null,ended_at:null,status:'not_started',duration_ms:0},status:'not_started',started_at:null,ended_at:null,elapsed_ms:0,records:[],draft:null,export:{requested_at:null,sha256:null,bytes:0,download_requested:false,opened_confirmed:false,opened_confirmed_at:null},sus:[],questionnaire_status:'not_started',comments:''};}
export function newPayload(){return {phase:'instructions',condition_index:0,conditions:{baseline:emptyBlock(),guided:emptyBlock()},events:[],interruption_counts:{blur:0,hidden:0,reload:0,offline:0,resize:0},client_saved_at:iso()};}
export function event(payload,type,condition=null,detail=''){payload.events.push({type,at:iso(),condition,phase:payload.phase,detail:String(detail).slice(0,160)});payload.events=payload.events.slice(-80);}
export function elapsed(start,end=Date.now()){return start?Math.max(0,Math.min(14400000,Math.round(end-Date.parse(start)))):0;}
export function canonicalRecord(record){const meta=record.meta||record;const hash=record.image?.sha256||record.image_sha256||'';return {record_id:String(record.record_id||''),...Object.fromEntries(FIELDS.map(k=>[k,String(meta[k]??'')])),image_file:TASKS.find(t=>t.image_sha256===hash)?.image_file||'',image_sha256:hash};}
export function serializePayload(payload){const out=structuredClone(payload);out.client_saved_at=iso();for(const b of Object.values(out.conditions)){b.records=b.records.slice(0,6).map(canonicalRecord);b.draft=b.draft?canonicalRecord(b.draft):null;}while(new TextEncoder().encode(JSON.stringify(out)).length>60000&&out.events.length)out.events.shift();return out;}
export function nonempty(r){return FIELDS.some(k=>r[k]!== '')||!!r.image_sha256;}
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function manifestFromZip(blob){const b=new Uint8Array(await blob.arrayBuffer()),d=new DataView(b.buffer);let i=0;while(i+30<=b.length&&d.getUint32(i,true)===0x04034b50){const method=d.getUint16(i+8,true),size=d.getUint32(i+18,true),nameLength=d.getUint16(i+26,true),extraLength=d.getUint16(i+28,true);const name=new TextDecoder().decode(b.slice(i+30,i+30+nameLength));const start=i+30+nameLength+extraLength;if(start+size>b.length)throw Error('Incomplete ZIP');if(name==='manifest.json'){if(method!==0)throw Error('Unsupported compressed manifest');return JSON.parse(new TextDecoder().decode(b.slice(start,start+size)));}i=start+size;}throw Error('No manifest in generated ZIP');}
