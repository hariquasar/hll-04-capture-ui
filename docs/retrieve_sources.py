from pathlib import Path
import urllib.request, concurrent.futures, re, subprocess
import fitz
from html.parser import HTMLParser
ROOT=Path(__file__).parent/'report-evidence'; ROOT.mkdir(exist_ok=True)
SOURCES=[('odk-paper','https://homes.cs.washington.edu/~anderson/papers/ICTD/ICTD2010.pdf'),('odk-logic','https://docs.getodk.org/form-logic/'),('guidelines-full','https://api.intechopen.com/chapter/pdf-download/10814.pdf'),('timing','https://academic.oup.com/iwc/article-abstract/19/3/330/798898'),('sus','https://digital.ahrq.gov/sites/default/files/docs/survey/systemusabilityscale%2528sus%2529_comp%255B1%255D.pdf')]
class Text(HTMLParser):
 def __init__(self): super().__init__(); self.parts=[]; self.skip=0
 def handle_starttag(self,t,a):
  if t in ('script','style'): self.skip+=1
 def handle_endtag(self,t):
  if t in ('script','style'): self.skip=max(0,self.skip-1)
 def handle_data(self,d):
  if not self.skip and d.strip(): self.parts.append(d.strip())
def get(item):
 name,url=item
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=45); b=r.read()
  if b.startswith(b'\x1f\x8b'):
   import gzip
   b=gzip.decompress(b)
  if b.startswith(b'%PDF'):
   (ROOT/(name+'.pdf')).write_bytes(b); text='\n'.join(p.get_text() for p in fitz.open(stream=b,filetype='pdf'))
  else:
   h=Text();h.feed(b.decode('utf-8',errors='replace'));text='\n'.join(h.parts)
  (ROOT/(name+'.txt')).write_text(text)
  return name,url,len(text),text[:1000]
 except Exception as e:return name,url,str(e)
for result in concurrent.futures.ThreadPoolExecutor().map(get,SOURCES):print(result)
