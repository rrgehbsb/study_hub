// POST {mode:'week'|'tonight', lang, messages:[{role,text}], week, prefs, school, today, tonight}
// The owner describes his week (or tonight) in his own words, like talking to a person;
// the AI turns it into the planner's settings and asks one short question when something's missing.
const { HttpError, send, body, auth, claude, checkBudget, bumpUsage, handler } = require('./_lib');

const WEEK = `You help an Israeli 11th-grade student set up his week for a study planner app. He tells you about his week in his own words (Hebrew or English, maybe messy, maybe by voice dictation).
Turn it into fixed weekly activities and planner preferences. Days are numbers: 0=Sunday 1=Monday 2=Tuesday 3=Wednesday 4=Thursday 5=Friday 6=Saturday. School is Sunday–Thursday (the app already knows school hours from the timetable; do NOT add school as an activity).
Things worth knowing, ask about them only if he hasn't said and they matter: training/practice times (volleyball, robotics, gym…), how long the way home takes, how late he can study, how long he can focus in one evening.
Rules:
- Keep everything he already has unless he changes or removes it.
- Times as "HH:MM" 24h. "after school" without a time → don't guess: ask.
- Ask at most ONE short question per reply. If you have enough, don't ask anything.
- Reply in the language he wrote in, 1–2 short sentences, friendly, no lists.
Return ONLY a JSON object, no other text:
{"reply":"…","question":"…" or null,"week":[{"name":"…","days":[1,2],"start":"17:00","end":"19:00"}] or null if unchanged,"studyMins":number or null,"latest":"HH:MM" or null,"commuteMins":number or null}`;

const TONIGHT = `You help an Israeli 11th-grade student adjust TONIGHT's study block in his planner app. He tells you what's going on ("I'm wiped", "practice ends late", "I have time now", "can we do it at 9?").
Decide a small, realistic change. Prefer a shorter session over skipping when a test is close; skipping is fine when he's really done for the day.
Return ONLY a JSON object, no other text:
{"reply":"1 short sentence in his language","skip":true or false,"start":"HH:MM" or null,"mins":number or null}`;

function parseJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
const hhmm = v => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null;

module.exports = handler(async (req, res) => {
  const { token } = await auth(req);
  const b = await body(req);
  const msgs = Array.isArray(b.messages) ? b.messages.slice(-16) : [];
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'Say something first.');
  await checkBudget(token);
  const tonight = b.mode === 'tonight';
  const ctx = 'Today: ' + String(b.today || '') + '.\n' +
    'School hours from his timetable: ' + JSON.stringify(b.school || {}) + '\n' +
    'His current weekly activities: ' + JSON.stringify(b.week || []) + '\n' +
    'Current preferences: ' + JSON.stringify(b.prefs || {}) + '\n' +
    (tonight ? 'Tonight as planned now: ' + JSON.stringify(b.tonight || null) + '\n' : '');
  const messages = [];
  msgs.forEach(m => {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m.text || '').slice(0, 3000) || '…';
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += '\n' + text;
    else messages.push({ role, content: text });
  });
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const out = await claude({ system: [{ type: 'text', text: tonight ? TONIGHT : WEEK }, { type: 'text', text: ctx }], messages, max_tokens: 900 });
  await bumpUsage(token, out.input, out.output);
  const j = parseJSON(out.text);
  if (!j) return send(res, 200, { reply: out.text.slice(0, 400), unparsed: true });
  if (tonight) return send(res, 200, { reply: String(j.reply || ''), skip: !!j.skip, start: hhmm(j.start), mins: Number(j.mins) > 0 ? Math.min(180, Math.round(Number(j.mins))) : null });
  const week = Array.isArray(j.week) ? j.week.map(a => ({
    name: String(a.name || '').slice(0, 40), days: (Array.isArray(a.days) ? a.days : []).map(Number).filter(d => d >= 0 && d <= 6),
    start: hhmm(a.start), end: hhmm(a.end)
  })).filter(a => a.name && a.days.length && a.start && a.end && a.end > a.start) : null;
  send(res, 200, {
    reply: String(j.reply || ''), question: j.question ? String(j.question) : null, week,
    studyMins: Number(j.studyMins) > 0 ? Math.min(180, Math.round(Number(j.studyMins))) : null,
    latest: hhmm(j.latest), commuteMins: Number(j.commuteMins) >= 0 && j.commuteMins !== null ? Math.min(180, Math.round(Number(j.commuteMins))) : null
  });
});

module.exports.config = { maxDuration: 30 };
