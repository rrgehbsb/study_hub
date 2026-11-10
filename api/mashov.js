// POST /api/mashov -> the owner's homework and recent teacher messages from Mashov.
// Mashov has no official API. This uses the same endpoints as the Mashov web app
// (web.mashov.info), as the unofficial libraries do (mashovapi-js, node-mashov), so it
// can break if Mashov changes. It only READS. The login comes from Vercel env vars
// (MASHOV_USER, MASHOV_PASS, optional MASHOV_SCHOOL, MASHOV_YEAR); it never reaches the browser.
// The page merges the result into the shared school row and study_materials.
const { HttpError, send, auth, handler } = require('./_lib');

const BASE = 'https://web.mashov.info/api';
const VERSION = process.env.MASHOV_API_VERSION || '3.20210425';

function schoolYear() {
  if (process.env.MASHOV_YEAR) return Number(process.env.MASHOV_YEAR);
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  return m >= 9 ? y + 1 : y; // Sept 2026 – Aug 2027 is year 2027 (תשפ"ז)
}

async function login() {
  const username = process.env.MASHOV_USER, password = process.env.MASHOV_PASS;
  if (!username || !password) throw new HttpError(503, 'Mashov isn’t connected yet: add MASHOV_USER and MASHOV_PASS in Vercel.');
  const r = await fetch(BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      semel: Number(process.env.MASHOV_SCHOOL || 570358), year: schoolYear(), username, password,
      appName: 'info.mashov.students', apiVersion: VERSION, appVersion: VERSION, appBuild: VERSION,
      deviceUuid: 'chrome', devicePlatform: 'chrome', deviceManufacturer: 'win', deviceModel: 'desktop', deviceVersion: '120.0.0.0'
    })
  });
  const text = await r.text();
  if (r.status === 401 || r.status === 403) throw new HttpError(502, 'Mashov rejected the username or password in Vercel (MASHOV_USER / MASHOV_PASS).');
  if (!r.ok) throw new HttpError(502, 'Mashov login failed (' + r.status + '): ' + text.slice(0, 120));
  let body = {};
  try { body = JSON.parse(text); } catch (e) {}
  const csrf = r.headers.get('x-csrf-token') || '';
  const raw = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
  const jar = {};
  raw.join(',').split(/,(?=\s*[A-Za-z0-9_.-]+=)/).forEach(c => { const kv = c.split(';')[0].trim(); const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); });
  if (csrf && !jar['Csrf-Token']) jar['Csrf-Token'] = csrf;
  const cookie = Object.keys(jar).map(k => k + '=' + jar[k]).join('; ');
  const userId = (body.credential && (body.credential.userId || body.credential.id)) || (body.accessToken && body.accessToken.userId) || body.userId;
  if (!userId) throw new HttpError(502, 'Mashov login worked but returned no student id (the Mashov site may have changed).');
  return { userId, headers: { 'X-Csrf-Token': csrf, Cookie: cookie, Accept: 'application/json' } };
}

async function get(s, path) {
  const r = await fetch(BASE + path, { headers: s.headers });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

const strip = html => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };
const day = v => v ? String(v).slice(0, 10) : null;

module.exports = handler(async (req, res) => {
  await auth(req); // signed in AND in ALLOWED_EMAILS: it uses the owner's Mashov login
  const s = await login();
  const out = { ok: true, fetchedAt: new Date().toISOString(), homework: [], messages: [], grades: [], problems: [] };

  // homework
  try {
    const hw = await get(s, '/students/' + s.userId + '/homework');
    (Array.isArray(hw) ? hw : []).forEach(x => {
      const text = strip(pick(x, ['homework', 'text', 'description', 'remark']));
      if (!text) return;
      const id = pick(x, ['homeworkId', 'id']) || (pick(x, ['lessonId']) + '-' + text.slice(0, 20));
      out.homework.push({ ref: 'mashov-hw-' + id, subject: pick(x, ['subjectName', 'groupName', 'subject']) || '', text, given: day(pick(x, ['lessonDate', 'date'])), due: day(pick(x, ['dueDate', 'deadline'])) });
    });
    if (Array.isArray(hw) && hw[0]) out.homeworkFields = Object.keys(hw[0]); // to fix the mapping if Mashov renames fields
  } catch (e) { out.problems.push('homework: ' + e.message); }

  // grades (this school year)
  try {
    const gr = await get(s, '/students/' + s.userId + '/grades');
    (Array.isArray(gr) ? gr : []).forEach(g => {
      const value = Number(String(pick(g, ['grade', 'gradeValue']) ?? '').replace(/[^\d.]/g, ''));
      if (!isFinite(value) || String(pick(g, ['grade']) ?? '') === '') return;
      const id = pick(g, ['gradeId', 'id']) || [pick(g, ['groupId']), pick(g, ['eventDate']), pick(g, ['gradingEvent'])].join('-');
      out.grades.push({ ref: 'mashov-gr-' + String(id).replace(/[^\w-]/g, '').slice(0, 60), subject: pick(g, ['subjectName', 'groupName']) || '', event: pick(g, ['gradingEvent', 'gradeType']) || '', date: day(pick(g, ['eventDate', 'date'])), value, teacher: pick(g, ['teacherName']) || '' });
    });
  } catch (e) { out.problems.push('grades: ' + e.message); }

  // teacher messages (last 30 days, with their text)
  try {
    const conv = await get(s, '/mail/inbox/conversations?skip=0&take=20');
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const recent = (Array.isArray(conv) ? conv : []).filter(c => { const m = (c.messages || [])[0]; return m && String(m.sendTime || '') >= since; }).slice(0, 10);
    const full = await Promise.all(recent.map(c => get(s, '/mail/conversations/' + c.conversationId).catch(() => null)));
    full.forEach((c, i) => {
      if (!c) return;
      (c.messages || []).forEach(m => {
        const body = strip(m.body);
        if (!body && !(m.files || []).length) return;
        out.messages.push({
          ref: 'mashov-msg-' + m.messageId, subject: m.subject || recent[i].subject || '', sender: m.senderName || '', date: day(m.sendTime),
          body, files: (m.files || []).map(f => f.fileName).filter(Boolean)
        });
      });
    });
  } catch (e) { out.problems.push('messages: ' + e.message); }

  send(res, 200, out);
});
