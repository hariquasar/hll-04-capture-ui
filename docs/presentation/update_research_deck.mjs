/**
 * Update the existing presentation using @oai/artifact-tool.
 * Use the supplied Node runtime. Copy this helper into a private build directory
 * whose node_modules points to the runtime packages before running it.
 * Usage: node update_research_deck.mjs input.pptx build-directory [planned|verified]
 * Exported files are candidates. Validate and visually review before publication.
 * This script never edits the input and never publishes or deploys the application.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const [input, outputDir, appStatus = 'planned'] = process.argv.slice(2);
if (!input || !outputDir || !['planned', 'verified'].includes(appStatus)) {
  throw new Error('Expected input.pptx build-directory [planned|verified]');
}
await fs.mkdir(outputDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(input));
const colors = { ink: '#19364C', accent: '#B22650', teal: '#176B68', muted: '#526471' };
const textOf = shape => String(shape.text);
const titleOf = slide => textOf(slide.shapes.items.find(s => s.name === 'Slide title' || s.name === 'Presentation title') ?? slide.shapes.items[0]);
const byTitle = title => presentation.slides.items.find(s => titleOf(s) === title);
const find = (slide, text) => slide.shapes.items.find(s => textOf(s) === text);
function replace(slide, oldText, newText) {
  const shape = find(slide, oldText);
  if (shape) shape.text = newText;
}
function addText(slide, name, text, x, y, w, h, size = 28, color = colors.ink, bold = false) {
  const shape = slide.shapes.add({ geometry: 'textbox', name,
    position: { left: x, top: y, width: w, height: h }, fill: 'none',
    line: { fill: 'none', width: 0 } });
  shape.text = text;
  shape.text.style = { typeface: 'Arial', fontSize: size, color, bold, alignment: 'left', insets: 0 };
  return shape;
}
async function freshSlide(title, index) {
  const existing = byTitle(title);
  const slide = existing ?? byTitle('Design foundations').duplicate();
  slide.moveTo(index);
  const records = (await presentation.inspect({ select: '$.slides[*]', include: ['id', 'elements.id', 'elements.name'] })).records;
  const record = records.find(r => r.id === `sl/${slide.id}`);
  presentation.delete(record.elements.filter(e => !['Slide title', 'Footer', 'Slide number'].includes(e.name)).map(e => e.id));
  slide.shapes.items.find(s => s.name === 'Slide title').text = title;
  return slide;
}

const foundation = byTitle('Design foundations');
replace(foundation,
  'Validation timing still needs evaluation. The sources establish prior art, not this prototype’s superiority.',
  'Human studies inform the design choices. This prototype’s comparative benefit still needs evaluation.');
foundation.speakerNotes.text = `Target: 60 seconds. Main talk target 890 seconds (14 minutes 50 seconds).

The design builds on established work. Hartung and colleagues describe Open Data Kit as a modular collection architecture. Bargas-Avila and colleagues give guidance on clear labels, required fields and error handling. The empirical studies on the next slide test related choices with people. They support the rationale for the design and identify limits to generalization. Frozen desktop v2 used blur feedback followed by a final save gate. The remote research revision changes the initial feedback timing while keeping that historical instrument intact. This project contributes a scoped image and metadata workflow, recovery behavior and reproducible export checks. Its own comparative human evidence is still pending.

Sources
[1] https://homes.cs.washington.edu/~anderson/papers/ICTD/ICTD2010.pdf
[2] https://doi.org/10.5772/9500
[8] https://doi.org/10.1145/2556288.2557265
[13] https://doi.org/10.1016/j.intcom.2007.01.003`;

const evidence = await freshSlide('Human evidence behind the design', 4);
const columns = [
  { x: 64, label: 'Form improvements [8]', body: '65 participants\nFewer submission attempts\nTwo forms completed faster', action: 'Supports a combined set\nof form improvements' },
  { x: 458, label: 'Format guidance [9]', body: '166 participants\nAdvance rules reduced errors\nand submission attempts', action: 'Keep explicit rules visible\nbefore entry' },
  { x: 852, label: 'Error location [10]', body: '303 participants\nFeedback beside fields\noutperformed top or bottom\nmessages', action: 'Keep corrections beside\nthe affected field' },
];
for (const c of columns) {
  addText(evidence, c.label, c.label, c.x, 170, 340, 48, 27, colors.accent, true);
  addText(evidence, c.label + ' result', c.body, c.x, 236, 340, 190, 27);
  addText(evidence, c.label + ' implication', c.action, c.x, 467, 340, 98, 27, colors.teal, true);
}
addText(evidence, 'Evidence boundary', 'External studies. [8] full text checked. [9–10] abstracts checked. Results depend on the tested tasks and designs.', 64, 619, 1148, 48, 20, colors.muted);
evidence.speakerNotes.text = `Target: 60 seconds. Main talk target 890 seconds (14 minutes 50 seconds).

Three human studies support related design choices. A study with 65 participants tested bundled form improvements and found fewer submission attempts. Two of three forms also showed significantly shorter completion times. Another study with 166 participants found that explicit format rules before entry reduced errors and attempts. A study with 303 participants found better performance when errors appeared beside the affected field. These findings support clear rules and local feedback in the guided interface. They concern other tasks and implementations, so the project's own comparison must establish whether the benefits transfer.

Additional panel answers
These are results from other researchers' human studies. Seckler and colleagues tested bundled web-form improvements with 65 participants in two groups. For two of three reconstructed registration forms, mean completion time fell from 113 to 85 seconds and from 105 to 70 seconds, with significant differences. The third time difference was not significant. Submission attempts decreased for all three forms. This supports testing the combined design rather than assigning the gains to a single control.

The 2011 format study involved 166 participants. Advance format specifications reduced errors and submission attempts. Explicit rules were the most efficient approach, and adding an example did not provide a further benefit. The 2012 location study involved 303 participants and six error-message positions. Messages near the erroneous field performed better than messages at the top or bottom. The right side was most satisfying and intuitive. Location evidence does not establish when a message should appear. I use these findings to justify visible asset-ID rules and feedback close to the relevant field.

Additional supporting evidence needs careful interpretation. Zeleke and colleagues compared electronic and paper collection through 12 interviewers and 1,246 questionnaires per method. Overall item error rates were 0.60% electronically and 1.67% on paper. Structured inputs and several checks changed together, and the paper comparator differs from this project's browser table. Nakamura and colleagues' 2026 abstract reports 20 therapists in a randomized crossover comparison. Their tested wizard had shorter entry times, fewer errors and lower workload. Navigation and input methods also differed, and the authors reject a universal wizard advantage. None of these papers directly proves better image–metadata matching in this application.

Sources and access limits
[8] Seckler, Heinz, Bargas-Avila, Opwis and Tuch (2014). Designing usable web forms: empirical evaluation of web form improvement guidelines. CHI, 1275–1284. https://doi.org/10.1145/2556288.2557265. Full-text methods/results checked using https://research.google.com/pubs/archive/42513.pdf. N=65, original n=32 and improved n=33. Improvements were bundled. Satisfaction effects varied.
[9] Bargas-Avila, Orsini, Piosczyk, Urwyler and Opwis (2011). Enhancing online forms: Use format specifications for fields with format restrictions to help respondents. Interacting with Computers 23(1), 33–39. https://doi.org/10.1016/j.intcom.2010.08.001. University abstract checked: https://edoc.unibas.ch/entities/publication/902d717d-b335-4297-a357-bd254f1834cf. No effect-size claim.
[10] Seckler, Tuch, Opwis and Bargas-Avila (2012). User-friendly locations of error messages in web forms: Put them on the right side of the erroneous input field. Interacting with Computers 24(3), 107–118. https://doi.org/10.1016/j.intcom.2012.03.002. University abstract checked: https://edoc.unibas.ch/entities/publication/be021efa-b63d-4451-a5e2-3cf9da3f0555. Location and timing are separate questions.
[11] Zeleke et al. (2019). Evaluation of Electronic and Paper-Pen Data Capturing Tools for Data Quality in a Public Health Survey in a Health and Demographic Surveillance Site, Ethiopia: Randomized Controlled Crossover Health Care Information Technology Evaluation. JMIR mHealth and uHealth 7(2), e10995. https://doi.org/10.2196/10995. Full text checked: https://mhealth.jmir.org/2019/2/e10995/. The number of questionnaires is not the number of interface users. Clinical and paper-comparison evidence is indirect here.
[12] Nakamura, Kasahara, Miura, Kinoshita and Asao (2026). Usability of Two Clinical Registry Data-Entry Interfaces: A Randomized Crossover Study. Informatics 13(10), 171. https://doi.org/10.3390/informatics13100171. Publisher abstract checked: https://www.mdpi.com/2227-9709/13/10/171. Published 14 October 2026. Complete methods/results not verified. No effect magnitude or general wizard-superiority claim.

Reference IDs match the report. External participant evidence remains separate from this project's synthetic engineering checks.`;

const revision = await freshSlide('Validation revision and hypotheses', 5);
addText(revision, 'Revision heading', appStatus === 'verified' ? 'Remote UI revision' : 'Planned remote UI revision', 64, 165, 525, 42, 27, colors.accent, true);
addText(revision, 'Revision behavior', 'First errors appear on Save\nExplicit rules remain visible\nCorrections stay beside fields', 64, 222, 525, 150, 28);
addText(revision, 'Hypotheses heading', 'Planned human comparison', 677, 165, 525, 42, 27, colors.accent, true);
addText(revision, 'Hypotheses', 'Expect fewer missing or format errors\nMeasure accuracy, time and SUS\nImage–metadata matching stays open', 677, 222, 525, 150, 27);
addText(revision, 'Timing evidence', 'Timing evidence is mixed [13]', 64, 421, 1100, 44, 28, colors.accent, true);
addText(revision, 'Timing hypothesis', 'Save-time feedback is a testable design choice', 64, 482, 1110, 95, 35, colors.ink, true);
addText(revision, 'Revision boundary', 'research-20261026-r1. Legacy sessions keep their original behavior. Human results remain pending.', 64, 619, 1148, 44, 20, colors.muted);
revision.speakerNotes.text = `Target: 60 seconds. Main talk target 890 seconds (14 minutes 50 seconds).

The remote revision delays initial metadata errors until Save while keeping the rules visible and corrective feedback beside each field. A 2007 study found fewer repeated errors with submission-time feedback than with blur feedback, but its artificial tasks limit generalization. This is therefore a design choice to test. The strongest expectations are fewer missing values and format errors. Accuracy, completion time and SUS remain empirical questions. New sessions carry a fixed UI revision, and existing sessions keep their original behavior. The study analyzes these revisions separately. Frozen desktop v2 retains its historical blur behavior.

Additional panel answers
The remote revision responds to mixed evidence on validation timing. Bargas-Avila and colleagues' 2007 paper reports two studies with 77 and 90 participants. In the second study, mean repeated errors were 3.48 with all errors at submission, 3.17 with one error at a time after submission, and 7.25 with onBlur feedback. The overall difference was significant at p<.03, while completion-time differences were not significant. The artificial tasks used undisclosed formatting obstacles, so this is a reason to test less interruptive initial feedback rather than a universal rule.

The ${appStatus === 'verified' ? 'implemented' : 'planned'} remote revision delays first metadata validation until Save. It retains visible explicit rules, required markers, nearby corrective feedback, review and recovery. A Save attempt can therefore identify problems without interrupting the first pass through the fields. No radio-control conversion is part of this revision. Frozen desktop v2 retains its original blur behavior.

The protocol name remains HLL04-remote-table-v3. New sessions carry the immutable ui_revision value research-20261026-r1. An existing session without a value belongs to legacy-v3 and keeps the old behavior. Exported revision provenance and analysis selection keep these groups separate. ${appStatus === 'verified' ? 'Local verification supports the implemented revision behavior. The revision was deployed on 26 October as Amplify job 6; detailed hosted verification is recorded in docs/research-ui-change-notes.md.' : 'Implementation and deployment verification remain pending at this draft stage.'}

The primary expectations are higher completeness and fewer format errors than the browser-table condition. Factual accuracy and image–metadata matching need separate checks because a valid value can still be wrong. Completion time and SUS may improve or worsen, and the study must report both possibilities. The combined comparison cannot isolate a causal effect of validation timing. Literature supplies rationale and hypotheses, while project-specific human results remain unavailable.

Sources
[9] https://doi.org/10.1016/j.intcom.2010.08.001. Abstract checked.
[10] https://doi.org/10.1016/j.intcom.2012.03.002. Abstract checked. Location evidence only.
[13] Bargas-Avila, Oberholzer, Schmutz, de Vito and Opwis (2007). Usable error message presentation in the World Wide Web: Do not show errors right away. Interacting with Computers 19(3), 330–341. https://doi.org/10.1016/j.intcom.2007.01.003. Full text checked: https://interruptions.net/private/misc/Bargas-Avila-IntCom07.pdf.
remote-study/PROTOCOL.md
remote-study/frontend/README.md
remote-study/backend/README.md
docs/research-ui-change-notes.md`;

const scope = byTitle('Project objective and scope');
replace(scope, 'Current scope\nPrepared images and metadata\nv2: folder + spreadsheet comparison\nv3: remote Guided + Table study\nStudy payloads omit image bytes', 'Current scope\nPrepared images and metadata\nPrimary: remote Guided + Table\nHistorical: frozen desktop v2\nStudy payloads omit image bytes');
replace(scope, 'Prototype form with synthetic data. Partner-specific requirements remain unconfirmed.', 'Working scope: image and metadata collection. The human comparison uses remote v3.');
scope.speakerNotes.text = String(scope.speakerNotes.text).replace('It retains the original guided validation and ZIP generation, with isolated browser storage.', 'It retains ZIP generation and isolated browser storage. The research revision changes initial validation timing for new remote sessions and preserves legacy behavior for existing sessions.');
scope.speakerNotes.text = String(scope.speakerNotes.text).replace('There are now two separate evaluation instruments. The frozen desktop version, v2, compares the guided interface with a folder and spreadsheet. Remote-table-v3 instead compares the guided interface with a basic browser table.', 'The working direction is image and metadata collection, and the primary comparison is remote-table-v3: guided collection versus a basic browser table. Frozen desktop v2 provides a historical or alternate folder-and-spreadsheet protocol and the standalone feature demonstration.');
const flow = byTitle('The collection workflow');
replace(flow, 'Frozen v2 review screen, 21 Oct. Remote v3 reuses the guided prototype.', 'Frozen v2 review screen, 21 Oct. Remote v3 retains this review and export workflow.');
flow.speakerNotes.text = String(flow.speakerNotes.text).replace('Remote v3 reuses that guided implementation inside a study wrapper.', 'The optional 90-second feature demonstration uses frozen desktop v2 and its historical blur feedback. The primary human comparison uses remote v3 with versioned validation timing inside the study wrapper.');
const validation = byTitle('Validation at the point of entry') ?? byTitle('Validation and data accuracy');
replace(validation, 'Validation at the point of entry', 'Validation and data accuracy');
const comparison = byTitle('Remote workflow comparison (v3)');
replace(comparison, 'Original validation, review and ZIP\nSame task cards and image choices', 'Versioned validation, review and ZIP\nSame task cards and image choices');
replace(comparison, 'v3 uses each person’s desktop Chrome. The frozen v2 folder/spreadsheet protocol remains separate.', 'Analyze one UI revision at a time. The frozen v2 folder/spreadsheet protocol remains separate.');
comparison.speakerNotes.text = String(comparison.speakerNotes.text).replace('The guided condition retains its validation and review.', 'The guided condition retains validation and review, with the immutable UI revision determining when initial errors appear. Legacy and revised sessions are analyzed separately.');
const contribution = byTitle('Current contribution and remaining work');
contribution.speakerNotes.text = String(contribution.speakerNotes.text).replace('End the main talk here. Slides 13–17 are backup slides for questions.', 'End the main talk here. Slides 15–19 are backup slides for questions.');
const refs = byTitle('Selected references');
if (!refs.shapes.items.some(s => s.name === 'Empirical reference pointer')) addText(refs, 'Empirical reference pointer', 'Empirical sources [8–13]: full citations and access limits in the research slide notes and report.', 64, 632, 1148, 32, 18, colors.muted);
if (!String(refs.speakerNotes.text).includes('Empirical research: [8]')) refs.speakerNotes.text = String(refs.speakerNotes.text) + '\n\nEmpirical research: [8] https://doi.org/10.1145/2556288.2557265; [9] https://doi.org/10.1016/j.intcom.2010.08.001; [10] https://doi.org/10.1016/j.intcom.2012.03.002; [11] https://doi.org/10.2196/10995; [12] https://doi.org/10.3390/informatics13100171; [13] https://doi.org/10.1016/j.intcom.2007.01.003. Full citations and source-access limits accompany slides 5 and 6. Reference IDs match the report.';

// Keep public documents free of local user paths. Preserve repository evidence pointers.
function publicNotes(text) {
  return text
    .replace(/Main talk target 770 seconds \(12 minutes 50 seconds\)/g, 'Main talk target 890 seconds (14 minutes 50 seconds)')
    .replace(/\/Users\/[^/\s]+\/projects\/hll-04-capture-ui\//g, '')
    .replace(/\/Users\/[^\n]+\/FYP-AWS-test-report-2026-10-26\.md/g, 'docs/verification-2026-10-26.md (summary of the 26 October remote walkthrough)');
}
const notes = [];
const mainTargets = [40, 45, 55, 45, 60, 60, 60, 55, 65, 55, 75, 45, 65, 45];
const susCell = byTitle('Evaluation measures').tables.items[0].getCell(4, 0);
if (String(susCell.text) === 'SUS [3]') susCell.value = 'SUS [4]';
// Preserve the report's source IDs across slides, tables, and embedded notes.
// Report [2] is ODK documentation, [3] web-form guidance, and [4] SUS.
function alignReferenceIds(text) {
  return text
    .replace(/Web form design \[2\]/g, 'Web form design [3]')
    .replace(/\[2\](\s+Bargas-Avila)/g, '[3]$1')
    .replace(/\[2\](\s+https:\/\/doi\.org\/10\.5772\/9500)/g, '[3]$1')
    .replace(/SUS \[3\]/g, 'SUS [4]')
    .replace(/\[3\](\s+Brooke)/g, '[4]$1')
    .replace(/\[3\](\s+https:\/\/digital\.ahrq\.gov\/)/g, '[4]$1');
}
for (const [index, slide] of presentation.slides.items.entries()) {
  for (const shape of slide.shapes.items) {
    const before = String(shape.text);
    const after = alignReferenceIds(before);
    if (after !== before) shape.text = after;
    shape.name = alignReferenceIds(shape.name);
  }
  const num = slide.shapes.items.find(s => s.name === 'Slide number');
  if (num) num.text = String(index + 1).padStart(2, '0');
  slide.speakerNotes.text = alignReferenceIds(publicNotes(String(slide.speakerNotes.text)));
  if (index < mainTargets.length) slide.speakerNotes.text = String(slide.speakerNotes.text).replace(/^Target: \d+ seconds\. Main talk target \d+ seconds \([^)]*\)\./, `Target: ${mainTargets[index]} seconds. Main talk target 770 seconds (12 minutes 50 seconds).`);
  notes.push(`SLIDE ${index + 1}: ${titleOf(slide).replace(/\n/g, ' ')}\n${slide.speakerNotes.text}`);
}
if (presentation.slides.items.length !== 19) throw new Error('Expected 19 slides');
const noteText = notes.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
if (/\/Users\//.test(noteText)) throw new Error('A local user path remains in public notes');
await fs.writeFile(path.join(outputDir, 'HLL-04_Presentation_Speaker_Notes.txt'), noteText);
await (await PresentationFile.exportPptx(presentation)).save(path.join(outputDir, 'candidate.pptx'));
await fs.writeFile(path.join(outputDir, 'inspection.ndjson'), (await presentation.inspect({select:'$.slides[*]',include:['id','index','elements.id','elements.kind','elements.name','elements.text','elements.position','elements.style','notes.text']})).ndjson);
await fs.mkdir(path.join(outputDir, 'render'), { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, '0')}`;
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(outputDir, 'render', `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({format:'layout'});
  await fs.writeFile(path.join(outputDir, 'render', `${stem}.layout.json`), await layout.text());
}
// Create the PDF companion from the validated PPTX in a presentation renderer.
// This also checks how the exported package renders outside Artifact Tool.
console.log(JSON.stringify({slides:presentation.slides.items.length,appStatus,outputDir}));
