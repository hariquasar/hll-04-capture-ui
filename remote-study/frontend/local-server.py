#!/usr/bin/env python3
"""Loopback-only synthetic frontend integration server. Not a deployment."""
import sys,json,time,os
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from handler import App,digest
from test_handler import MemoryStore
PORT=int(os.environ.get('HLL04_STUDY_TEST_PORT','18771'))
ORIGIN=f'http://127.0.0.1:{PORT}'
store=MemoryStore()
app=App(store,{'ALLOWED_ORIGIN':ORIGIN,'TOKEN_SECRET':'synthetic-local-secret-'+'a'*64,'RATE_SALT':'synthetic-only-'+'b'*64,'INVITE_HASH':digest('disabled-local-human'),'SYNTHETIC_INVITE_HASH':digest('local-synthetic'),'RETENTION_DAYS':90},time.time)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'web'),**kw)
 def do_GET(self):
  if self.path=='/config.json':
   body=json.dumps({'apiBase':ORIGIN+'/api','protocolVersion':'HLL04-remote-table-v3'}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
  else:super().do_GET()
 def do_POST(self):
  raw=self.rfile.read(int(self.headers.get('Content-Length',0))).decode()
  if self.path=='/api/session' and not json.loads(raw).get('synthetic'):
   self.send_response(403);self.end_headers();self.wfile.write(b'{"error":{"message":"Local server accepts synthetic sessions only"}}');return
  result=app.handle({'rawPath':self.path.removeprefix('/api'),'requestContext':{'http':{'method':'POST','sourceIp':'192.0.2.1'}},'headers':dict(self.headers.items())|{'origin':ORIGIN,'content-type':'application/json','authorization':self.headers.get('Authorization',''),'x-study-session':self.headers.get('X-Study-Session','')},'body':raw})
  self.send_response(result['statusCode']);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(result.get('body','').encode())
 def log_message(self,*a):pass
print(f'Synthetic integration server at {ORIGIN}/#invite=local-synthetic&synthetic=1',flush=True)
ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
