// POST {materialId}: a board photo, notes, worksheet or old test (image or PDF) -> Claude
// reads it -> the text is saved on the material, so the tutor can teach from it.
const { HttpError, send, body, auth, one, patch, download, claude, checkBudget, bumpUsage, handler } = require('./_lib');

const WHAT = {
  board: 'a photo of the classroom whiteboard',
  notes: 'handwritten or typed class notes',
  worksheet: 'a worksheet / homework sheet',
  old_test: 'a test the teacher gave in the past',
  teacher_summary: 'a summary the teacher sent'
};

module.exports = handler(async (req, res) => {
  const { token } = await auth(req);
  const { materialId, subjectName } = await body(req);
  if (!materialId) throw new HttpError(400, 'materialId missing');
  const m = await one(token, 'study_materials?id=eq.' + encodeURIComponent(materialId) + '&select=*');
  if (!m) throw new HttpError(404, 'Not found.');
  if (!m.file_path) throw new HttpError(400, 'Nothing to read.');
  await checkBudget(token);
  await patch(token, 'study_materials', materialId, { status: 'reading', error: null });
  try {
    const { buf, type } = await download(token, m.file_path);
    const mime = m.mime || type || '';
    const data = buf.toString('base64');
    let block;
    if (/pdf/i.test(mime)) block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    else if (/^image\/(jpeg|png|gif|webp)$/i.test(mime)) block = { type: 'image', source: { type: 'base64', media_type: mime.toLowerCase(), data } };
    else throw new HttpError(415, 'Use a photo (JPEG/PNG) or a PDF.');

    const prompt =
      'This is ' + (WHAT[m.kind] || 'school material') + (subjectName ? ' for the subject ' + subjectName : '') + ', from an Israeli high school (mostly Hebrew).\n' +
      'Write out EVERYTHING on it as text, exactly, in its original language and order, so a tutor who cannot see the image can teach from it:\n' +
      '- all words, numbers and formulas (formulas in LaTeX between $...$)\n' +
      '- for a test: keep question numbers, sub-question letters and points\n' +
      '- graphs, drawings and diagrams: a short description in [brackets] with axes, labels and values\n' +
      '- anything unreadable: [unreadable]\n' +
      'No commentary before or after.';
    const out = await claude({ max_tokens: 4000, system: 'You transcribe school material precisely. You never solve or add anything.', messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] });
    await bumpUsage(token, out.input, out.output);
    await patch(token, 'study_materials', materialId, { status: 'ready', content: out.text });
    send(res, 200, { material: Object.assign({}, m, { status: 'ready', content: out.text }) });
  } catch (e) {
    await patch(token, 'study_materials', materialId, { status: 'error', error: e.message }).catch(() => {});
    throw e;
  }
});

module.exports.config = { maxDuration: 60 };
