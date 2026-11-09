// GET /api/calendar?cls=11-3 -> tests and events from the class calendar on the Handasaim
// website (https://handasaim.co.il/calendar/<class>.ics). Public school data, no login.
// The parser is the main Dashboard's api/school.js calendar(), kept the same on purpose.
const SITE = 'https://handasaim.co.il';
const UA = 'Mozilla/5.0 (StudyHub; personal use)';

function icsDate(v) {
  const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] ? m[4] + ':' + m[5] : null };
}

async function calendar(cls) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  let txt = '';
  try {
    const r = await fetch(SITE + '/calendar/' + encodeURIComponent(cls) + '.ics', { headers: { 'User-Agent': UA, Accept: 'text/calendar,*/*' }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('school site ' + r.status);
    txt = await r.text();
  } finally { clearTimeout(t); }
  const out = { tests: [], events: [] };
  const body = txt.replace(/\r?\n[ \t]/g, '');
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const lo = new Date(today.getTime() - 2 * 864e5).toISOString().slice(0, 10), hi = new Date(today.getTime() + 120 * 864e5).toISOString().slice(0, 10);
  body.split('BEGIN:VEVENT').slice(1).forEach(b => {
    const g = k => { const m = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm').exec(b); return m ? m[1].replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\;/g, ';').trim() : ''; };
    const s = icsDate(g('DTSTART')); if (!s) return;
    if (s.date < lo || s.date > hi) return;
    const sum = g('SUMMARY'), desc = g('DESCRIPTION');
    const item = { date: s.date, time: s.time, title: sum.replace(/^📝\s*,?\s*/, '').trim(), uid: g('UID') || (s.date + sum) };
    if (/📝|מבחן|בוחן/.test(sum + ' ' + desc.split('\n')[0])) {
      const m = desc.match(/📝\s*(מבחן|בוחן)\s*·\s*([^\n]+)/);
      item.subject = m ? m[2].trim() : '';
      item.quiz = /בוחן/.test(sum + desc.split('\n')[0]);
      item.details = desc.split('\n').slice(1).join('\n').trim().slice(0, 500);
      out.tests.push(item);
    } else out.events.push(item);
  });
  out.tests.sort((a, b) => a.date.localeCompare(b.date));
  out.events.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

module.exports = async (req, res) => {
  const cls = String((req.query && req.query.cls) || '').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!/^\d{1,2}-\d{1,2}$/.test(cls)) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, error: 'Class looks like 11-3.' })); }
  try {
    const cal = await calendar(cls);
    if (!cal) { res.statusCode = 404; return res.end(JSON.stringify({ ok: false, error: 'No calendar for class ' + cls + ' on the school website.' })); }
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.end(JSON.stringify(Object.assign({ ok: true, cls, fetchedAt: new Date().toISOString() }, cal)));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: 'Couldn’t reach the school website right now.' }));
  }
};
