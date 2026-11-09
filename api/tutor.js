// POST {subjectId, subjectName, mode:'teach'|'test', topic, test, messages:[{role, text, image?}]}
// One tutor turn. The subject's material (old tests, lesson transcripts, board photos,
// notes, teacher summaries) is loaded here, never sent by the page, and goes in a cached
// system block so follow-up turns in the same session are cheap.
const { HttpError, send, body, auth, db, claude, checkBudget, bumpUsage, handler } = require('./_lib');

const CONTEXT_CHARS = () => Number(process.env.CONTEXT_CHARS || 90000);
const enc = encodeURIComponent;

const RULES = `You are a private tutor for one Israeli high-school student (11th grade). You teach the way THEIR teacher teaches, from the teacher's own material below, so the student is ready for that teacher's tests.

Language and form:
- Write in Hebrew (the tests are in Hebrew). Short messages: one idea at a time, a few lines, then let the student act.
- Math in LaTeX: inline $...$, display $$...$$. Use the teacher's notation and symbols from the material.
- No long preambles, no praise padding, no lists of what you are about to do.

Use the material:
- Follow the teacher's order, examples and wording from the lesson transcripts. When you use one, say which lesson (by date or title).
- The OLD TESTS show the level and style of the real test. Your test questions must match them in difficulty, length and style (multi-part questions, real numbers, graphs where the teacher uses graphs).
- If the material doesn't cover something, say so in one line and teach it from general knowledge, marked "(לא מהחומר של המורה)".
- Never invent what the teacher said or wrote.

MODE_RULES

Checking an attempt:
- Judge only what the student wrote or photographed. If a photo is unreadable, ask for a clearer one.
- Say exactly where the solution broke: reading the question, choosing the idea/model, setting up the equations, algebra, units, or the graph. Then show the correct step, not the whole solution unless they ask.
- When you have judged a complete attempt at a question, end your message with exactly one tag on its own line: [[VERDICT:correct]] or [[VERDICT:partial]] or [[VERDICT:wrong]]. Never use the tag otherwise.

The goal is that the student can solve test questions ALONE. Understanding an explanation is not enough; always move toward a question they solve without help.`;

const MODES = {
  teach: `Mode: TEACH FROM ZERO.
1. Find out in one short question what they already know about the topic (skip if they said they know nothing).
2. Teach in small steps, the teacher's way. After each idea ask ONE quick check question and wait for the answer before going on.
3. Show one full worked example from class (from a transcript or board photo).
4. Then give a test-level question on the topic and tell them to solve it alone on paper and send a photo or type it. Do not give hints until they've sent an attempt.`,
  test: `Mode: TEST ME.
- Give ONE question at a time, in the style and difficulty of the teacher's old tests (multi-part if the old tests are).
- Give NO hints, formulas or first steps until the student has sent an attempt. If they ask for a hint before trying, tell them to try first and write whatever they can, even if they get stuck.
- After an attempt: verdict and exactly where it broke (see "Checking an attempt"). Then, if it wasn't correct, a NEW similar question so they can try again alone. If it was correct, a harder or different-topic question.`
};

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '\n[...]' : s; }
const day = s => String(s || '').slice(0, 10);

async function buildContext(token, subjectId, topic) {
  const sid = enc(subjectId);
  const [lessons, mats] = await Promise.all([
    db(token, 'study_lessons?subject_id=eq.' + sid + '&status=eq.ready&select=id,lesson_date,title,summary,topics,transcript&order=lesson_date.desc&limit=40'),
    db(token, 'study_materials?subject_id=eq.' + sid + '&status=eq.ready&content=not.is.null&select=id,kind,title,content,lesson_id,created_at&order=created_at.desc&limit=80')
  ]);
  const t = String(topic || '').trim().toLowerCase();
  const about = x => !t || JSON.stringify(x).toLowerCase().includes(t);
  let budget = CONTEXT_CHARS();
  const parts = [];
  const add = (head, text, cap) => {
    if (budget <= 500 || !text) return;
    const s = clip(text, Math.min(cap, budget));
    parts.push('### ' + head + '\n' + s);
    budget -= s.length + head.length + 6;
  };
  // 1. old tests: the level and style of the real test (always, up to about a third of the budget)
  const tests = mats.filter(m => m.kind === 'old_test');
  const testCap = Math.floor(CONTEXT_CHARS() / 3);
  let used = 0;
  tests.forEach(m => { if (used < testCap) { const before = budget; add('OLD TEST: ' + (m.title || day(m.created_at)), m.content, testCap - used); used += before - budget; } });
  // 2. lessons about the topic first (full transcripts), then the rest
  const byLesson = {};
  mats.filter(m => m.lesson_id && m.kind === 'board').forEach(m => { (byLesson[m.lesson_id] = byLesson[m.lesson_id] || []).push(m); });
  const ordered = lessons.filter(about).concat(lessons.filter(l => !about(l)));
  ordered.forEach(l => {
    const boards = (byLesson[l.id] || []).map(b => '[BOARD PHOTO] ' + b.content).join('\n');
    add('LESSON ' + day(l.lesson_date) + (l.title ? ' — ' + l.title : '') + (l.topics && l.topics.length ? ' (topics: ' + l.topics.join(', ') + ')' : ''), 'TRANSCRIPT:\n' + l.transcript + (boards ? '\n' + boards : ''), 30000);
  });
  // 3. everything else: teacher summaries, notes, worksheets, loose board photos
  const rest = mats.filter(m => m.kind !== 'old_test' && !(m.lesson_id && m.kind === 'board'));
  rest.filter(about).concat(rest.filter(m => !about(m))).forEach(m => {
    add(m.kind.toUpperCase().replace('_', ' ') + ' ' + day(m.created_at) + (m.title ? ' — ' + m.title : ''), m.content, 8000);
  });
  return { text: parts.join('\n\n'), counts: { oldTests: tests.length, lessons: lessons.length, other: rest.length } };
}

module.exports = handler(async (req, res) => {
  const { token } = await auth(req);
  const b = await body(req);
  const mode = b.mode === 'test' ? 'test' : 'teach';
  if (!b.subjectId) throw new HttpError(400, 'subjectId missing');
  const msgs = Array.isArray(b.messages) ? b.messages.slice(-30) : [];
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'The last message must be from the student.');
  await checkBudget(token);

  const ctx = await buildContext(token, b.subjectId, b.topic);
  const test = b.test && b.test.name ? 'Their next test in this subject: ' + b.test.name + (b.test.testDate ? ' on ' + b.test.testDate : '') + (b.test.topics ? ' — topics: ' + b.test.topics : '') + '.' : '';
  const head = 'Subject: ' + (b.subjectName || b.subjectId) + '. ' + (b.topic ? 'Topic for this session: ' + b.topic + '. ' : '') + test;
  const material = ctx.text
    ? 'THE TEACHER\'S MATERIAL (' + ctx.counts.oldTests + ' old tests, ' + ctx.counts.lessons + ' lessons, ' + ctx.counts.other + ' other items):\n\n' + ctx.text
    : 'There is NO material from the teacher yet. Tell the student once, briefly, that you are teaching from general knowledge until they upload lessons and old tests, and mark it "(לא מהחומר של המורה)".';
  const system = [
    { type: 'text', text: RULES.replace('MODE_RULES', MODES[mode]) },
    { type: 'text', text: material, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: head }
  ];

  // only the last two photos travel as images; older ones become a note (saves tokens)
  let photos = 0;
  const messages = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m.text || '').slice(0, 8000);
    if (role === 'user' && m.image && photos < 2) {
      photos++;
      messages.unshift({ role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(m.image).replace(/^data:[^,]+,/, '') } }, { type: 'text', text: text || '(my solution)' }] });
    } else {
      messages.unshift({ role, content: (m.image || m.hadImage ? '[photo of my solution, sent earlier] ' : '') + (text || '…') });
    }
  }
  while (messages.length && messages[0].role !== 'user') messages.shift(); // the API wants a user turn first

  const out = await claude({ system, messages, max_tokens: 1500 });
  await bumpUsage(token, out.input, out.output);
  const m = out.text.match(/\[\[VERDICT:(correct|partial|wrong)\]\]/);
  const text = out.text.replace(/\s*\[\[VERDICT:(correct|partial|wrong)\]\]\s*/g, '\n').trim();
  send(res, 200, { text, verdict: m ? m[1] : null, material: ctx.counts });
});

module.exports.config = { maxDuration: 60 };
