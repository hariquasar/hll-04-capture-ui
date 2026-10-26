"""Deterministic SYNTHETIC engineering images; no people or user-study data."""
from pathlib import Path
import struct, zlib, random, json, hashlib, sys

root = Path(sys.argv[1]) if len(sys.argv)>1 else Path('.test-artifacts/fixtures')
root.mkdir(exist_ok=True, parents=True)
def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
def png(width, height, seed):
    rng = random.Random(seed)
    raw = b''.join(b'\0' + rng.randbytes(width * 3) for _ in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
rows=[]
for size, width, height in [('large',600,600), ('small',32,32)]:
    for number in range(1,9):
        payload = png(width,height,number)
        name=f'{size}-{number}.png'
        (root/name).write_bytes(payload)
        rows.append({'file':name,'bytes':len(payload),'width':width,'height':height,'sha256':hashlib.sha256(payload).hexdigest()})
(root/'manifest.json').write_text(json.dumps({'label':'Synthetic engineering fixtures, not human data','images':rows},indent=2))
print(json.dumps(rows,indent=2))
