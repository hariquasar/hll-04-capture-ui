#!/usr/bin/env python3
"""Independent standard-library audit of synthetic browser download artifacts."""
import argparse,csv,hashlib,io,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args();results=[]
for archive in sorted(args.directory.glob('*.zip')):
 with zipfile.ZipFile(archive) as z:
  assert z.testzip() is None,(archive.name,'CRC failure')
  assert len(z.namelist())==len(set(z.namelist())),(archive.name,'duplicate paths')
  assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
  manifest=json.loads(z.read('manifest.json'));rows=list(csv.DictReader(io.StringIO(z.read('records.csv').decode())))
  assert len(rows)==len(manifest['records'])
  image_count=0
  for r,row in zip(manifest['records'],rows):
   if 'image' in r:
    im=r['image'];file=im['file'];digest=im['sha256']
   else:file=r['image_file'];digest=r['image_sha256']
   if file:
    data=z.read('images/'+file);assert hashlib.sha256(data).hexdigest()==digest;image_count+=1
   for key,value in row.items():
    if 'image' in r:
     expected=r.get(key) if key in r else r['image']['file'] if key=='file' else r['image']['sha256'] if key=='sha256' else r['image']['source'] if key=='source' else r['meta'].get(key)
    else:expected=r.get(key)
    if manifest.get('csv_text_policy')=='prefix-apostrophe-v1' and value.startswith("'"):value=value[1:]
    assert value==('' if expected is None else str(expected)),(archive.name,key,repr(value),repr(expected))
  results.append({'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'saved_records':len(rows),'saved_image_occurrences':image_count,'crc':'pass','unique_safe_paths':'pass','exact_image_hashes':'pass','csv_manifest_roundtrip':'pass'})
assert results,'No ZIP downloads found'
output={'synthetic_artifact_audit':True,'archives_verified':len(results),'results':results}
(args.directory/'independent-zip-verification.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps(output,indent=2))
