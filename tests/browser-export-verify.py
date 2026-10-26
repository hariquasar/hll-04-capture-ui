"""Independent stdlib verification of actual downloaded ZIP bytes. No app imports.

Engineering assertions only; the synthetic correctness exercise deliberately
contains one allowed-but-wrong condition before correction. It does not estimate
human performance or the reliability of a deployed industrial application.
"""
from pathlib import Path
import json, zipfile, csv, io, hashlib, base64, re, sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.test-artifacts')
run=json.loads((root/'browser-results.json').read_text())
truth={str(t['task_id']):t for t in json.loads((root/'six-task-truth.json').read_text())['tasks']}
fixture_bytes={hashlib.sha256(p.read_bytes()).hexdigest():p.read_bytes() for p in (root/'fixtures').glob('*.png')}
results=[]
def raw_record_value(record,column):
    if column in record: return record[column]
    if column in ('file','sha256','source'): return record['image'][column]
    return record['meta'].get(column)
def encoded_text(value):
    text='' if value is None else str(value)
    return "'"+text if re.match(r"^[\t\r\n']|^\s*[=+\-@]",text) else text
for entry in run['exports']:
    expected=json.loads((root/entry['expected']).read_text())
    with zipfile.ZipFile(root/entry['archive']) as z:
        assert z.testzip() is None, 'CRC failure'
        paths=z.namelist()
        assert len(paths)==len(set(paths)), 'Duplicate ZIP paths'
        assert all(not p.startswith('/') and '..' not in Path(p).parts for p in paths), 'Unsafe ZIP path'
        manifest=json.loads(z.read('manifest.json'))
        assert manifest['csv_text_policy']=='prefix-apostrophe-v1'
        rows=list(csv.DictReader(io.StringIO(z.read('records.csv').decode('utf8'),newline='')))
        records=manifest['records']
        assert len(rows)==len(records)==len(expected['session']['records'])
        image_matches=csv_cells=encoded_cells=0
        filled=correct=0
        mismatches=[]
        for record,row,golden in zip(records,rows,expected['session']['records']):
            assert record['record_id']==golden['record_id']
            assert record['meta']==golden['meta']
            assert record['task_id']==golden['task_id']
            for column,value in row.items():
                raw=raw_record_value(golden,column)
                assert value==encoded_text(raw),(entry['archive'],column,value,raw)
                decoded=value[1:] if value.startswith("'") else value
                assert decoded==('' if raw is None else str(raw)), 'CSV policy is not reversible'
                csv_cells+=1
                encoded_cells+=value!=('' if raw is None else str(raw))
            data=z.read('images/'+record['image']['file'])
            h=hashlib.sha256(data).hexdigest()
            assert h==record['image']['sha256']==golden['image']['sha256']
            assert data==base64.b64decode(golden['image']['dataUrl'].split(',',1)[1])
            assert data==fixture_bytes[h]
            image_matches+=1
            if entry['archive'].startswith('six-record-'):
                for key in ['scenario','location','subject_id','condition']:
                    actual=record['meta'][key]
                    filled+=bool(actual.strip())
                    matches=actual.strip().lower()==truth[str(record['task_id'])][key].lower()
                    correct+=matches
                    if not matches:mismatches.append({'task_id':record['task_id'],'field':key,'actual':actual,'expected':truth[str(record['task_id'])][key]})
        draft_expected=expected.get('draft')
        has_draft=bool(draft_expected and draft_expected.get('image'))
        assert manifest['draft_included']==has_draft
        draft_images=0
        if has_draft:
            draft=json.loads(z.read('draft.json'))
            assert draft['meta']==draft_expected['meta']
            assert draft.get('editRecordId')==draft_expected.get('editRecordId')
            data=z.read('draft-images/'+draft['image']['file'])
            h=hashlib.sha256(data).hexdigest()
            assert h==draft['image']['sha256']==draft_expected['image']['sha256']
            assert data==base64.b64decode(draft_expected['image']['dataUrl'].split(',',1)[1])==fixture_bytes[h]
            draft_images=1
        expected_paths={'records.csv','manifest.json'}|{'images/'+r['image']['file'] for r in records}
        if has_draft:expected_paths|={'draft.json','draft-images/'+draft['image']['file']}
        assert set(paths)==expected_paths
        result={'archive':entry['archive'],'saved_records':len(records),'saved_image_exact_matches':image_matches,'draft_image_exact_matches':draft_images,'unique_zip_members':len(paths),'crc':'pass','csv_cells_exactly_verified':csv_cells,'csv_cells_escaped_and_reconstructed':encoded_cells,'storage_at_export':manifest['storage_at_export'],'snapshot_source':manifest['snapshot_source']}
        if entry['archive'].startswith('six-record-'):
            assert filled==24
            assert correct==(23 if 'initial-known-error' in entry['archive'] else 24)
            result.update(required_metadata_cells=24,filled=filled,correct=correct,mismatches=mismatches)
        results.append(result)
report={'label':'Independent Python audit of synthetic engineering downloads, not human results','archives':results,'summary':{'archives':len(results),'saved_images_exactly_verified':sum(r['saved_image_exact_matches'] for r in results),'draft_images_exactly_verified':sum(r['draft_image_exact_matches'] for r in results),'all_crc_unique_paths_sha256_exact_bytes_and_csv_roundtrips_pass':True}}
(root/'independent-export-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
