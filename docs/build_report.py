from pathlib import Path
import subprocess,re,json,sys
from docx import Document
from docx.shared import Inches,Pt,Mm,RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
ROOT=Path(__file__).parent; E=ROOT/'report-evidence'; S='/Users/hoyinshum/.hermes/skills/research/grounded-citations/scripts/sources.py'
base=[sys.executable,S,'--ledger',str(E/'citation-ledger.json')]
quotes=[(1,'odk-paper','Collect is a mobile platform that renders application logic'),(2,'odk-logic','To make a question required,'),(3,'guidelines-full','Guideline 16: Always show error messages after the form has been filled and sent.'),(4,'sus','SUS scores have a range of 0 to 100.')]
for n,f,q in quotes: subprocess.run(base+['quote',str(n),'--text',q,'--from',str(E/(f+'.txt'))],check=True)
md=ROOT/'report-chapters-draft.md'
subprocess.run(base+['render','--replace-in',str(md)],check=True)
r=subprocess.run(base+['verify',str(md),'--strict','--evidence'],capture_output=True,text=True);(E/'citation-verification.txt').write_text(r.stdout+r.stderr);print(r.stdout,r.stderr);r.check_returncode()
d=Document();sec=d.sections[0];sec.page_width=Mm(210);sec.page_height=Mm(297);sec.top_margin=sec.bottom_margin=Inches(1.5);sec.left_margin=sec.right_margin=Inches(1)
for name in ['Normal','Title','Heading 1','Heading 2','Heading 3']:
 st=d.styles[name];st.font.name='Times New Roman';st.font.size=Pt(12 if name=='Normal' else 16 if name in ['Title','Heading 1'] else 14)
 st.font.color.rgb=RGBColor(0,0,0)
 st.paragraph_format.space_after=Pt(8);st.paragraph_format.line_spacing=1.5
 if name!='Normal':st.font.bold=True
# Word's built-in theme font attributes override explicit fonts in some renderers.
# Apply the university font to paragraph and linked character styles consistently.
for name in ['Normal','Title','Title Char','Heading 1','Heading 1 Char','Heading 2','Heading 2 Char','Heading 3','Heading 3 Char','Caption','Header','Footer']:
 if name not in d.styles:continue
 st=d.styles[name];st.font.name='Times New Roman'
 fonts=st.element.get_or_add_rPr().get_or_add_rFonts()
 for attr in list(fonts.attrib):
  if 'theme' in attr.lower():del fonts.attrib[attr]
 for attr in ['ascii','hAnsi','eastAsia','cs']:fonts.set(qn('w:'+attr),'Times New Roman')
 st.font.color.rgb=RGBColor(0,0,0)
footer=sec.footer.paragraphs[0];footer.alignment=1
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
sec.header.paragraphs[0].text='HLL-04 | UI design for data collection'
body_count=0;inbody=False;previous_table=False
paragraphs=[]
for block in md.read_text().split('\n\n'):
 if block.startswith('[1] '): paragraphs.extend(block.splitlines())
 else: paragraphs.append(block)
for para in paragraphs:
 para=para.strip()
 if not para:continue
 if para.startswith('# '):d.add_paragraph(para[2:],style='Title');continue
 if para.startswith('## '):
  title=para[3:];h=d.add_heading(title,1)
  if re.match(r'[1-6] ',title): h.paragraph_format.page_break_before=True
  inbody=bool(re.match(r'[1-6] ',title));continue
 if para.startswith('### '):d.add_heading(para[4:],2);continue
 if re.match(r'^Table [1-6]\. ',para):
  p=d.add_paragraph(para,style='Caption');p.paragraph_format.keep_with_next=True
  p.paragraph_format.line_spacing=1;p.paragraph_format.space_before=Pt(8);p.paragraph_format.space_after=Pt(6)
  for rr in p.runs:rr.font.name='Times New Roman';rr.font.size=Pt(11);rr.font.color.rgb=RGBColor(0,0,0)
  continue
 if para.startswith('![Figure '):
  match=re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)',para)
  if not match: raise ValueError('Invalid figure: '+para)
  figure_width=5.5 if match[2]=='repair-20261021/review-details.png' else 6.1
  d.add_picture(str(ROOT/match[2]),width=Inches(figure_width))
  picture_paragraph=d.paragraphs[-1]
  picture_paragraph.paragraph_format.keep_with_next=True
  if match[2]=='repair-20261021/review-details.png':
   picture_paragraph.alignment=1
   picture_paragraph.paragraph_format.line_spacing=1
  cap=d.add_paragraph(match[1],style='Caption');cap.paragraph_format.keep_with_next=False
  for rr in cap.runs:rr.font.size=Pt(11)
  continue
 if para.startswith('|'):
  rows=[[cell.strip() for cell in line.strip().strip('|').split('|')] for line in para.splitlines()]
  rows=[row for row in rows if not all(re.fullmatch(r'[-:]+',cell) for cell in row)]
  table=d.add_table(rows=0,cols=len(rows[0]));table.style='Table Grid';table.alignment=WD_TABLE_ALIGNMENT.CENTER
  pr=table._tbl.tblPr;borders=OxmlElement('w:tblBorders')
  for edge in ['top','left','bottom','right','insideH','insideV']:
   border=OxmlElement('w:'+edge);border.set(qn('w:val'),'single');border.set(qn('w:sz'),'4');border.set(qn('w:color'),'D9D9D9');borders.append(border)
  pr.append(borders)
  for i,row in enumerate(rows):
   cells=table.add_row().cells
   for cell,text in zip(cells,row):
    cell.text=text
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
    tcp=cell._tc.get_or_add_tcPr();margins=OxmlElement('w:tcMar')
    for edge in ['top','bottom','left','right']:
     margin=OxmlElement('w:'+edge);margin.set(qn('w:w'),'80');margin.set(qn('w:type'),'dxa');margins.append(margin)
    tcp.append(margins)
    if i==0:
     shading=OxmlElement('w:shd');shading.set(qn('w:fill'),'E8EDF1');tcp.append(shading)
    for pp in cell.paragraphs:
     pp.paragraph_format.line_spacing=1;pp.paragraph_format.space_after=Pt(4)
     for rr in pp.runs:rr.font.size=Pt(10);rr.bold=(i==0)
   trpr=table.rows[-1]._tr.get_or_add_trPr();trpr.append(OxmlElement('w:cantSplit'))
   if i==0:trpr.append(OxmlElement('w:tblHeader'))
  previous_table=True
  continue
 if inbody:body_count+=len(para.split())
 p=d.add_paragraph()
 if previous_table:p.paragraph_format.space_before=Pt(6)
 previous_table=False
 if not inbody and 'title' in locals() and title=='Use of Generative AI Tools — draft disclosure':
  p.paragraph_format.line_spacing=1.15
 ref=re.match(r'^(\[\d+\]) (https?://\S+) — (.*)$',para)
 if ref:
  para=f'{ref[1]} {ref[3]}. [Source text]({ref[2]})'
  p.paragraph_format.line_spacing=1
  p.paragraph_format.keep_together=True
  p.paragraph_format.space_after=Pt(6)
 # Render Markdown source links as live clickable hyperlinks.
 parts=re.split(r'(\[[^\]]+\]\(https?://[^\s]+\))',para)
 for part in parts:
  m=re.fullmatch(r'\[([^\]]+)\]\((https?://[^\s]+)\)',part)
  if not m:p.add_run(part);continue
  rel=d.part.relate_to(m[2],'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
  h=OxmlElement('w:hyperlink');h.set(qn('r:id'),rel);run=OxmlElement('w:r');props=OxmlElement('w:rPr');color=OxmlElement('w:color');color.set(qn('w:val'),'0563C1');props.append(color);run.append(props);text=OxmlElement('w:t');text.text=m[1];run.append(text);h.append(run);p._p.append(h)
 if para.startswith('- ['):p.paragraph_format.left_indent=Inches(.25);p.paragraph_format.first_line_indent=Inches(-.25)
out=ROOT/'report-chapters-draft.docx';d.save(out)
# Compute body count from final Word XML including ordinary text only, excluding headings and front/end matter.
loaded=Document(out);active=False;count=0
for p in loaded.paragraphs:
 if p.style.name=='Heading 1':active=bool(re.match(r'[1-6] ',p.text))
 elif active and not p.style.name.startswith('Heading') and p.style.name!='Caption':count+=len(p.text.split())
assert count==body_count
(E/'document-statistics.json').write_text(json.dumps({'body_words_whitespace':count,'rule':'Chapters 1–6 prose only; excludes headings, tables, identity, draft notice, AI disclosure, references, header/footer','docx_paragraphs':len(loaded.paragraphs)},indent=2))
print('BODY WORDS',count,'DOCX',out)
