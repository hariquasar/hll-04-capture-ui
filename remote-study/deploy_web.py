"""Deploy the separate study host. Never updates the original prototype app."""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess, tempfile, urllib.request, zipfile

ROOT = Path(__file__).resolve().parent


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--host-state', type=Path, required=True)
    p.add_argument('--api-base', required=True)
    p.add_argument('--evidence-dir', type=Path, required=True)
    p.add_argument('--profile', default='my-aws')
    args = p.parse_args()
    state = json.loads(args.host_state.read_text())
    if state['app_id'] == 'd2wgs3nlrx1uri':
        raise SystemExit('Refusing to update the original frozen prototype host')
    if not args.api_base.startswith('https://') or '.lambda-url.us-east-1.on.aws' not in args.api_base:
        raise SystemExit('Expected the deployed study Lambda HTTPS origin')
    evidence = args.evidence_dir.resolve(); evidence.mkdir(parents=True, exist_ok=True)
    def aws(*a):
        r = subprocess.run(['aws', '--profile', args.profile, '--region', 'us-east-1',
                            '--output', 'json', '--no-cli-pager', *a], capture_output=True,
                           text=True, timeout=120)
        if r.returncode: raise RuntimeError(r.stderr.strip())
        return json.loads(r.stdout) if r.stdout.strip() else {}
    actual = aws('amplify', 'get-app', '--app-id', state['app_id'])['app']
    if actual['name'] != 'hll04-remote-study': raise SystemExit('Study app identity mismatch')
    api = args.api_base.rstrip('/')
    headers = f'''customHeaders:
  - pattern: '**/*'
    headers:
      - key: X-Content-Type-Options
        value: nosniff
      - key: Referrer-Policy
        value: no-referrer
      - key: X-Frame-Options
        value: SAMEORIGIN
      - key: Permissions-Policy
        value: 'camera=(), microphone=(), geolocation=()'
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' data: {api}; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self';"
      - key: Cache-Control
        value: 'public, max-age=0, must-revalidate'
      - key: X-Robots-Tag
        value: 'noindex, nofollow'
'''
    (evidence/'custom-headers.yaml').write_text(headers)
    with tempfile.TemporaryDirectory(prefix='hll04-study-static-') as tmp:
        stage = Path(tmp)/'static'; shutil.copytree(ROOT/'web', stage)
        config = {'apiBase': api, 'protocolVersion': 'HLL04-remote-table-v3'}
        (stage/'config.json').write_text(json.dumps(config, indent=2)+'\n')
        if not (stage/'index.html').is_file(): raise SystemExit('Study entry point is absent')
        files = sorted(x for x in stage.rglob('*') if x.is_file())
        manifest = {str(x.relative_to(stage)): hashlib.sha256(x.read_bytes()).hexdigest() for x in files}
        (evidence/'deployed-files.json').write_text(json.dumps(manifest, indent=2))
        archive = evidence/'study-static.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in files: z.write(f, f.relative_to(stage))
        aws('amplify', 'update-app', '--app-id', state['app_id'], '--custom-headers', headers)
        deployment = aws('amplify', 'create-deployment', '--app-id', state['app_id'],
                         '--branch-name', state['branch'])
        private = evidence/'deployment-private.json'
        private.write_text(json.dumps(deployment, indent=2)); os.chmod(private, 0o600)
        req = urllib.request.Request(deployment['zipUploadUrl'], data=archive.read_bytes(),
                                     method='PUT', headers={'Content-Type': 'application/zip'})
        with urllib.request.urlopen(req, timeout=120) as r:
            if r.status not in (200, 201, 204): raise RuntimeError('Study upload failed')
        started = aws('amplify', 'start-deployment', '--app-id', state['app_id'],
                      '--branch-name', state['branch'], '--job-id', deployment['jobId'])
        receipt = {'app_id': state['app_id'], 'origin': state['origin'],
                   'job_id': deployment['jobId'], 'file_count': len(files),
                   'status': started['jobSummary']['status']}
        (evidence/'deployment.json').write_text(json.dumps(receipt, indent=2))
        print(json.dumps(receipt))


if __name__ == '__main__': main()
