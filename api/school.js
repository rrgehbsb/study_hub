// Handasaim Herzliya timetable for one class, from the school's own public sources:
//   daily timetable  – public Firestore docs the school site reads (schedule-563fd/schedules/<date>),
//                      published around 20:00 the evening before
//   weekly timetable – the school site's /weekly page (one table per class)
//   class calendar   – https://handasaim.co.il/calendar/<class>.ics (tests, events, holidays)
// The day is compared with the weekly plan to mark changed / cancelled / added lessons.
//
// GET /api/school?classes=1       -> { ok, classes:[{ id:"11-3", name:"יא3" }] }
// GET /api/school?cls=11-3        -> { ok, cls, name, days:{ "YYYY-MM-DD": {...} }, week:{...}, calendar:{...} }
const SITE = 'https://handasaim.co.il';
const FS = 'https://firestore.googleapis.com/v1/projects/schedule-563fd/databases/(default)/documents/schedules/';
const FS_KEY = 'AIzaSyAvQsZA3O4WAlSn1JOetQ2bQDBb3YViI7g'; // the school site's public web key
const UA = 'Mozilla/5.0 (DashboardApp school timetable; personal use)';
const GRADES = { 7: 'ז', 8: 'ח', 9: 'ט', 10: 'י', 11: 'יא', 12: 'יב' };
// The school's bell schedule (לוח צלצולים, handasaim.co.il/students). The daily docs leave
// late lessons (10, 11) without times; later lessons are 45 minutes each.
const BELLS = { 0: ['07:45', '08:30'], 1: ['08:30', '09:15'], 2: ['09:15', '10:00'], 3: ['10:15', '11:00'], 4: ['11:00', '11:45'], 5: ['12:10', '12:55'], 6: ['12:55', '13:40'], 7: ['13:50', '14:35'], 8: ['14:35', '15:20'], 9: ['15:30', '16:10'], 10: ['16:10', '16:55'] };
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function bell(n) {
  if (BELLS[n]) return BELLS[n];
  if (n > 10) { const s = 16 * 60 + 55 + (n - 11) * 45; return [hm(s), hm(s + 45)]; }
  return [null, null];
}

const cache = new Map(); // per warm instance: url -> { at, val }
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}
async function get(url, asJson) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: asJson ? 'application/json' : 'text/html,text/calendar,*/*' }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
    return asJson ? r.json() : r.text();
  } finally { clearTimeout(t); }
}

/* ---------- names ---------- */
const clsName = id => { const [g, n] = String(id).split('-'); return (GRADES[g] || g) + n; };          // 11-3 -> יא3
const dailyName = id => { const [g, n] = String(id).split('-'); return (GRADES[g] || g) + ' ' + n; };   // 11-3 -> "יא 3"
// Same normalisation idea as the school site, so the weekly and daily names compare equal.
const ALIAS = { 'מעבדת פיזיקה': 'פיזיקה', 'מעבדת פיסיקה': 'פיזיקה', 'פיסיקה': 'פיזיקה', 'שעת מחנך': 'חינוך', 'מתמטיקה טכניונית': 'מתמטיקה מואץ' };
function norm(s) {
  let t = String(s || '').replace(/["״׳']/g, '').replace(/(^|\s)תלן(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+\d+$/, '');                       // "סייבר 1" -> "סייבר"
  return ALIAS[t] || t;
}

/* ---------- weekly page ---------- */
const decodeHtml = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
async function weekly() {
  return cached('weekly', 6 * 3600e3, async () => {
    const html = await get(SITE + '/weekly');
    if (!html) return { classes: [], tables: {} };
    const out = { classes: [], tables: {} };
    const re = /data-class="(\d{1,2}-\d{1,2})"/g; let m;
    const marks = [];
    while ((m = re.exec(html))) marks.push({ id: m[1], at: m.index });
    marks.forEach((mk, k) => {
      if (out.tables[mk.id]) return;
      const seg = html.slice(mk.at, k + 1 < marks.length ? marks[k + 1].at : html.length);
      const tStart = seg.indexOf('<table'); if (tStart < 0) return;
      const table = seg.slice(tStart, seg.indexOf('</table>', tStart) + 8);
      const rows = table.split(/<tr[\s>]/).slice(1);
      const week = { 0: [], 1: [], 2: [], 3: [], 4: [] };
      rows.forEach(r => {
        const cells = r.split(/<t[dh][\s>]/).slice(1);
        if (cells.length < 6) return;
        const head = decodeHtml('<x ' + cells[0]);
        const n = parseInt(head, 10); if (isNaN(n)) return;
        const tm = head.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
        for (let d = 0; d < 5; d++) {
          const cell = cells[d + 1] || '';
          const subs = (cell.match(/<b[^>]*>([\s\S]*?)<\/b>/g) || []).map(b => decodeHtml(b)).filter(Boolean);
          if (!subs.length) { const txt = decodeHtml('<x ' + cell); if (txt) subs.push(txt); }
          if (subs.length) week[d].push({ n, start: tm ? tm[1] : bell(n)[0], end: tm ? tm[2] : bell(n)[1], items: subs });
        }
      });
      out.tables[mk.id] = week;
      out.classes.push({ id: mk.id, name: clsName(mk.id) });
    });
    return out;
  });
}

/* ---------- daily docs ---------- */
const dec = v => v == null ? null : ('stringValue' in v) ? v.stringValue : ('integerValue' in v) ? +v.integerValue : ('doubleValue' in v) ? v.doubleValue
  : ('booleanValue' in v) ? v.booleanValue : ('nullValue' in v) ? null : ('timestampValue' in v) ? v.timestampValue
  : ('arrayValue' in v) ? (v.arrayValue.values || []).map(dec) : ('mapValue' in v) ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
async function daily(date) {
  return cached('day:' + date, 5 * 60e3, async () => {
    const j = await get(FS + date + '?key=' + FS_KEY, true);
    if (!j || !j.fields) return null;
    return Object.fromEntries(Object.entries(j.fields).map(([k, v]) => [k, dec(v)]));
  });
}
function dayFor(doc, cls, base) {
  const name = dailyName(cls);
  const periods = [], seen = new Set();
  (doc.lessons || []).forEach(l => {
    const n = +l.lesson_num; if (isNaN(n)) return;
    const items = ((l.classes || {})[name] || []).filter(e => e && (e.subject || e.teacher)).map(e => ({ subject: String(e.subject || '').trim(), teacher: String(e.teacher || '').trim() }));
    const w = (base || []).find(x => x.n === n);
    const was = w ? w.items : [];
    let status = 'same';
    const a = [...new Set(items.map(e => norm(e.subject)))].sort().join('|'), b = [...new Set(was.map(norm))].sort().join('|');
    if (!items.length && was.length) status = 'cancelled';
    else if (items.length && !was.length) status = base ? 'added' : 'same';
    else if (a !== b) status = 'changed';
    if (!items.length && !was.length) return;
    seen.add(n);
    periods.push({ n, start: l.time_start || (w && w.start) || bell(n)[0], end: l.time_end || (w && w.end) || bell(n)[1], items, was: status === 'same' ? undefined : was, status });
  });
  // weekly lessons that the day doesn't list at all → cancelled
  (base || []).forEach(w => { if (!seen.has(w.n) && (doc.lessons || []).some(l => +l.lesson_num === w.n)) periods.push({ n: w.n, start: w.start || bell(w.n)[0], end: w.end || bell(w.n)[1], items: [], was: w.items, status: 'cancelled' }); });
  periods.sort((x, y) => x.n - y.n);
  const notes = (doc.dropped_cells || []).filter(c => c && c.class === name && c.raw_text).map(c => ({ n: c.lesson_num, text: String(c.raw_text).replace(/\s*\n\s*/g, ' · ').trim(), full: c.kind === 'full' }));
  return { published: true, dayName: doc.day_name || '', uploadedAt: doc.uploaded_at || null, periods, notes };
}

/* ---------- class calendar (.ics) ---------- */
function icsDate(v) {
  const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  return m ? { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] ? m[4] + ':' + m[5] : null } : null;
}
async function calendar(cls) {
  return cached('ics:' + cls, 30 * 60e3, async () => {
    const txt = await get(SITE + '/calendar/' + encodeURIComponent(cls) + '.ics');
    const out = { tests: [], events: [], holidays: [] };
    if (!txt) return out;
    const body = txt.replace(/\r?\n[ \t]/g, '');
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const lo = new Date(today.getTime() - 2 * 864e5).toISOString().slice(0, 10), hi = new Date(today.getTime() + 120 * 864e5).toISOString().slice(0, 10);
    body.split('BEGIN:VEVENT').slice(1).forEach(b => {
      const g = k => { const m = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm').exec(b); return m ? m[1].replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\;/g, ';').trim() : ''; };
      const s = icsDate(g('DTSTART')), e = icsDate(g('DTEND')); if (!s) return;
      let end = e ? e.date : s.date;
      if (e && !e.time && end > s.date) end = new Date(Date.parse(end + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10); // all-day DTEND is exclusive
      if (end < lo || s.date > hi) return;
      const sum = g('SUMMARY'), desc = g('DESCRIPTION');
      const item = { date: s.date, end, time: s.time, title: sum.replace(/^📝\s*,?\s*/, '').trim(), uid: g('UID') || (s.date + sum) };
      if (/📝|מבחן|בוחן/.test(sum + ' ' + desc.split('\n')[0])) {
        const m = desc.match(/📝\s*(מבחן|בוחן)\s*·\s*([^\n]+)/);
        item.subject = m ? m[2].trim() : '';
        item.quiz = /בוחן/.test(sum + desc.split('\n')[0]);
        out.tests.push(item);
      } else if (/חופש|חג |^חג|ראש השנה|יום כיפור|סוכות|פסח|חנוכה/.test(sum) && /כל בית הספר/.test(desc)) out.holidays.push(item);
      else out.events.push(item);
    });
    ['tests', 'events', 'holidays'].forEach(k => out[k].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))));
    return out;
  });
}

/* ---------- handler ---------- */
const isoIL = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

module.exports = async function handler(req, res) {
  const q = req.query || {};
  try {
    const wk = await weekly();
    if (q.classes) {
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ ok: true, classes: wk.classes });
    }
    const cls = String(q.cls || '');
    if (!/^\d{1,2}-\d{1,2}$/.test(cls)) return res.status(400).json({ ok: false, error: 'Give a class, e.g. ?cls=11-3' });
    const base = wk.tables[cls] || null;
    const now = isoIL(new Date());
    // ?groups=1: the subjects that split into groups for this class, with each group's
    // teacher, from the last two weeks of daily timetables (the weekly page has no teachers)
    if (q.groups) {
      const G = await cached('groups:' + cls, 6 * 3600e3, async () => {
        const past = []; for (let i = -14; i <= 3; i++) past.push(ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
        const docs = await Promise.all(past.map(d => daily(d).catch(() => null)));
        const name = dailyName(cls), map = {};
        docs.forEach(doc => (doc && doc.lessons || []).forEach(l => {
          const items = ((l.classes || {})[name] || []).filter(e => e && e.subject);
          if (items.length < 2) return; // whole-class lessons aren't groups
          items.forEach(e => { const s = norm(e.subject); if (!s) return; const g = map[s] = map[s] || { s, name: s, teachers: new Set() }; if (e.teacher) g.teachers.add(String(e.teacher).trim()); });
        }));
        (base ? Object.values(base) : []).forEach(day => day.forEach(p => { if (p.items.length > 1) p.items.forEach(x => { const s = norm(x); if (s && !map[s]) map[s] = { s, name: s, teachers: new Set() }; }); }));
        return Object.values(map).map(g => ({ s: g.s, name: g.name, teachers: Array.from(g.teachers).sort((a, b) => a.localeCompare(b, 'he')) })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
      });
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ ok: true, cls, groups: G });
    }
    const dates = [0, 1, 2, 3].map(i => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
    const [docs, cal] = await Promise.all([Promise.all(dates.map(d => daily(d).catch(() => null))), calendar(cls).catch(() => ({ tests: [], events: [], holidays: [] }))]);
    const days = {};
    dates.forEach((d, i) => {
      const wd = new Date(d + 'T12:00:00').getDay();
      const b = base && wd <= 4 ? base[wd] : null;
      days[d] = docs[i] ? dayFor(docs[i], cls, b) : { published: false };
    });
    // short cache: the school can post or change the day at any time
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, cls, name: clsName(cls), fetchedAt: new Date().toISOString(), days, week: base, calendar: cal });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Couldn’t reach the school website right now.', detail: String(e && e.message || e).slice(0, 120) });
  }
};
