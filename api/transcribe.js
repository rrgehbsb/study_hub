// POST {lessonId}: the lesson's uploaded audio -> Groq Whisper (Hebrew) -> transcript,
// then a short summary + topic list (Gemini, optional), then the audio is deleted.
const { HttpError, send, body, auth, one, db, patch, download, remove, geminiJSON, handler } = require('./_lib');

const GROQ_MAX = 25 * 1024 * 1024; // Groq's free-tier file limit

async function groq(buf, filename, type, lang) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(503, 'Setup not finished: GROQ_API_KEY is not set in Vercel.');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: type || 'audio/mp4' }), filename);
  form.append('model', process.env.WHISPER_MODEL || 'whisper-large-v3');
  form.append('language', lang === 'en' ? 'en' : 'he'); // English lessons are transcribed in English
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json'); // segments with times, so marks and board photos can be placed
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'Transcription failed: ' + ((j.error && j.error.message) || r.status));
  return { text: String(j.text || '').trim(), segments: Array.isArray(j.segments) ? j.segments : [] };
}

const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// The transcript with a time stamp about every 2 minutes, the student's "On the test!" marks
// and the moments board photos were taken, so the tutor knows what was said when.
function annotate(tx, marks, photos) {
  if (!tx.segments.length) return tx.text;
  const events = [];
  (marks || []).forEach(t => events.push({ t: +t, s: '[MARKED BY STUDENT: on the test]' }));
  (photos || []).forEach((t, i) => events.push({ t: +t, s: '[BOARD PHOTO ' + (i + 1) + ' taken here]' }));
  events.sort((a, b) => a.t - b.t);
  let out = '', nextStamp = 0, e = 0;
  tx.segments.forEach(seg => {
    while (e < events.length && events[e].t <= seg.start + 1) { out += '\n' + events[e].s + '\n'; e++; }
    if (seg.start >= nextStamp) { out += '\n[' + mmss(seg.start) + '] '; nextStamp = seg.start + 120; }
    out += String(seg.text || '').trim() + ' ';
  });
  while (e < events.length) { out += '\n' + events[e].s; e++; }
  return out.trim();
}

module.exports = handler(async (req, res) => {
  const { token } = await auth(req);
  const { lessonId, subjectName } = await body(req);
  const lang = /english|אנגלית/i.test(String(subjectName || '')) ? 'en' : 'he';
  if (!lessonId) throw new HttpError(400, 'lessonId missing');
  const lesson = await one(token, 'study_lessons?id=eq.' + encodeURIComponent(lessonId) + '&select=*');
  if (!lesson) throw new HttpError(404, 'Lesson not found.');
  if (lesson.status === 'ready' && lesson.transcript) return send(res, 200, { lesson });
  if (!lesson.audio_path) throw new HttpError(400, 'This lesson has no audio.');

  await patch(token, 'study_lessons', lessonId, { status: 'transcribing', error: null });
  try {
    const { buf, type } = await download(token, lesson.audio_path);
    if (buf.length > GROQ_MAX) throw new HttpError(413, 'The recording is ' + Math.round(buf.length / 1048576) + ' MB; the free transcriber takes up to 25 MB. Record in two parts, or set Voice Memos to "Compressed".');
    const ext = (lesson.audio_path.split('.').pop() || 'm4a').toLowerCase();
    const tx = await groq(buf, 'lesson.' + ext, type, lang);
    if (!tx.text) throw new HttpError(422, 'The recording came back empty. Was the microphone covered?');
    // board photos taken during this lesson in the app: their seconds from the start
    let photoTimes = [];
    if (lesson.started_at) {
      const boards = await db(token, 'study_materials?lesson_id=eq.' + encodeURIComponent(lessonId) + '&kind=eq.board&select=taken_at&order=taken_at.asc').catch(() => []);
      const t0 = Date.parse(lesson.started_at);
      photoTimes = (boards || []).map(b => (Date.parse(b.taken_at) - t0) / 1000).filter(x => x >= 0);
    }
    const transcript = annotate(tx, lesson.marks, photoTimes);

    const ai = await geminiJSON(
      'You get the transcript of a high-school lesson' + (lang === 'en' ? ' (an English class)' : ' in Hebrew') + (subjectName ? ' (subject: ' + subjectName + ')' : '') + '.\n' +
      'Return JSON: {"title": short Hebrew title of what was taught, "summary": a Hebrew summary as 4-8 short bullet lines starting with "- " (definitions, formulas in LaTeX $...$, worked examples, what the teacher stressed or said will be on the test), "topics": 1-4 short Hebrew topic names}.\n' +
      'Only use what is in the transcript.\n\nTRANSCRIPT:\n' + transcript.slice(0, 120000)
    );
    const topics = Array.isArray(ai && ai.topics) ? ai.topics.map(t => String(t).trim()).filter(Boolean).slice(0, 4) : [];
    const values = { status: 'ready', transcript, summary: ai && ai.summary ? String(ai.summary) : null, topics, audio_path: null, error: null };
    if (!lesson.title && ai && ai.title) values.title = String(ai.title).slice(0, 120);
    await patch(token, 'study_lessons', lessonId, values);
    await remove(token, lesson.audio_path); // keep the text, not the teacher's voice

    if (topics.length) {
      try {
        await db(token, 'study_topics?on_conflict=user_id,subject_id,name', {
          method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
          body: topics.map(name => ({ subject_id: lesson.subject_id, name }))
        });
      } catch (e) { console.warn('topics', e.message); }
    }
    send(res, 200, { lesson: Object.assign({}, lesson, values) });
  } catch (e) {
    await patch(token, 'study_lessons', lessonId, { status: 'error', error: e.message }).catch(() => {});
    throw e;
  }
});

module.exports.config = { maxDuration: 60 };
module.exports.annotate = annotate; // for tests
