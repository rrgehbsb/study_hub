// POST {lessonId}: the lesson's uploaded audio -> Groq Whisper (Hebrew) -> transcript,
// then a short summary + topic list (Gemini, optional), then the audio is deleted.
const { HttpError, send, body, auth, one, db, patch, download, remove, geminiJSON, handler } = require('./_lib');

const GROQ_MAX = 25 * 1024 * 1024; // Groq's free-tier file limit

async function groq(buf, filename, type) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(503, 'Setup not finished: GROQ_API_KEY is not set in Vercel.');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: type || 'audio/mp4' }), filename);
  form.append('model', process.env.WHISPER_MODEL || 'whisper-large-v3');
  form.append('language', 'he');
  form.append('temperature', '0');
  form.append('response_format', 'json');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'Transcription failed: ' + ((j.error && j.error.message) || r.status));
  return String(j.text || '').trim();
}

module.exports = handler(async (req, res) => {
  const { token } = await auth(req);
  const { lessonId, subjectName } = await body(req);
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
    const transcript = await groq(buf, 'lesson.' + ext, type);
    if (!transcript) throw new HttpError(422, 'The recording came back empty. Was the microphone covered?');

    const ai = await geminiJSON(
      'You get the transcript of a high-school lesson in Hebrew' + (subjectName ? ' (subject: ' + subjectName + ')' : '') + '.\n' +
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
