"""Deterministic synthetic study illustrations. No photographs or participant data."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, json
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'prepared-images'
OUT.mkdir(exist_ok=True)
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
F = lambda size: ImageFont.truetype(FONT, size)
navy, blue, red, bg = '#203546', '#527C9B', '#9E4545', '#F7F5EF'
labels = ['EQ-1021', 'FL-20417', 'BK-3307', 'DOC-5512', 'SL-884', 'FE-1093', 'PR-1001']
names = ['Projector', 'Floor tile', 'Bicycle', 'Delivery note', 'Street lamp', 'Fire extinguisher', 'Practice box']
for i in range(1, 8):
    im = Image.new('RGB', (800, 500), bg); d = ImageDraw.Draw(im)
    d.rectangle((0,0,800,83),fill=navy)
    title = f'SYNTHETIC ILLUSTRATION  |  TASK {i}' if i < 7 else 'SYNTHETIC ILLUSTRATION  |  PRACTICE'
    d.text((32,28), title, font=F(24), fill='white')
    if i == 1:
        d.rounded_rectangle((200,175,600,325),radius=20,fill=blue,outline=navy,width=4)
        d.ellipse((450,200,550,300),fill=bg,outline=navy,width=6)
        d.ellipse((475,225,525,275),fill=navy)
        for x in range(235,365,22):d.line((x,210,x,285),fill=navy,width=5)
        d.line((245,325,235,350),fill=navy,width=10);d.line((555,325,565,350),fill=navy,width=10)
    elif i == 2:
        d.rectangle((250,120,550,365),fill='#D9DEE0',outline=navy,width=5)
        d.line([(410,123),(380,185),(425,215),(385,260),(430,305),(405,362)],fill=red,width=7)
    elif i == 3:
        for x in [265,535]:d.ellipse((x-78,230,x+78,386),outline=navy,width=7)
        d.line([(265,308),(350,205),(435,308),(265,308),(330,260),(490,260),(535,308)],fill=blue,width=9)
        d.line([(435,308),(490,180),(525,180)],fill=navy,width=8)
        d.line((330,205,380,205),fill=navy,width=9)
    elif i == 4:
        d.rectangle((275,110,525,380),fill='white',outline=navy,width=4)
        d.text((300,140),'DELIVERY',font=F(26),fill=navy)
        for y in range(205,345,32):d.line((305,y,490,y),fill=blue,width=4)
    elif i == 5:
        d.line((390,370,390,145),fill=navy,width=12)
        d.arc((385,110,510,190),180,360,fill=navy,width=12)
        d.ellipse((450,165,540,200),fill=blue,outline=navy,width=3)
        d.line((345,375,440,375),fill=navy,width=9)
    elif i == 6:
        d.rounded_rectangle((330,180,470,380),radius=26,fill=red,outline=navy,width=4)
        d.rectangle((365,140,435,180),fill=navy)
        d.line([(400,150),(480,150),(500,240)],fill=navy,width=9)
        d.ellipse((375,205,425,255),fill='white',outline=navy,width=3)
        d.line((400,230,418,219),fill=red,width=4)
        d.rectangle((350,280,450,330),fill='white')
    else:
        d.rectangle((265,160,535,355),fill=blue,outline=navy,width=5)
        d.line((400,160,400,355),fill=bg,width=9)
        d.line((265,215,535,215),fill=bg,width=9)
    d.text((32,410), f'{names[i-1]}  |  {labels[i-1]}',font=F(28),fill=navy)
    d.text((32,458), 'Prepared task material - not a photograph or real asset observation',font=F(18),fill=navy)
    im.save(OUT / (f'task-{i:02}.png' if i < 7 else 'practice.png'))
truth = json.loads((ROOT/'truth.json').read_text())
truth['version'] = 'HLL04-desktop-transcription-v2'
truth['note'] = 'Six controlled synthetic illustration-and-label transcription tasks. Same exact prepared PNGs and cards in both conditions on one laptop; no claim of industrial representativeness or physical condition assessment. No human observations.'
truth['scoring'] = {'required_fields': ['scenario','location','subject_id','condition'], 'normalization': 'trim surrounding whitespace and compare case-insensitively', 'synonyms': {}, 'metadata_cells_per_condition': 24}
for i,task in enumerate(truth['tasks'],1):
    task['task_id'] = str(i)
    task['image_file'] = f'task-{i:02}.png'
    task['image_sha256'] = hashlib.sha256((OUT/task['image_file']).read_bytes()).hexdigest()
    task['card'] = f'Import/copy the prepared synthetic illustration {task["image_file"]}; enter the exact labels printed on Task {i}. Do not take a photograph or infer condition.'
(ROOT/'truth.json').write_text(json.dumps(truth,indent=2)+'\n')
lines=['# Task cards: controlled synthetic transcription study','',
'These cards and the exact same prepared PNG files are supplied in both conditions. Copy the labels; do not infer real-world condition. The six images are synthetic illustrations, not photographs. Each task needs one record. Notes are optional. No field or task ID is prefilled in either condition.','']
for t in truth['tasks']:
    lines += [f'## Task {t["task_id"]}', '', '| Field | Exact entry |', '|---|---|']
    for label,key in [('task_id','task_id'),('Image file','image_file'),('scenario','scenario'),('location','location'),('subject_id','subject_id'),('condition','condition')]:
        lines.append(f'| {label} | {t[key]} |')
    lines += ['']
lines += ['## Separate unscored practice item','',
'Use `prepared-images/practice.png` in a separate practice session/template. Enter task ID `1`, scenario `equipment`, location `Practice desk`, subject_id `PR-1001`, condition `unknown`. Notes may be blank. The ID is reused only in a separate, unscored practice session. Preserve/finish that practice before the empty measured session. Practice is excluded from truth, recorded study times and participant outcomes.','',
'Acceptance rules for the measured labels are frozen in truth: surrounding whitespace and letter case are ignored for metadata scoring; no other synonym substitution. Task IDs are exact strings. These are copying tasks, not a semantic assessment of the illustrations.','']
(ROOT/'TASK_CARDS.md').write_text('\n'.join(lines))
print('Created six scored synthetic illustrations plus one separate practice image; truth hashes and cards agree.')
