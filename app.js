/* Study Hub core — window.SH.
   Supabase session, the SHARED school row (same keys as the main Dashboard, merged
   entry by entry so neither app overwrites the other), study tables, uploads, the
   api() helper, demo data and a small UI kit.
   Sync recipe (from the main Dashboard, do NOT regress): getSession() before every
   read/write; write = read cloud row → merge only the keys changed here, entry by
   entry by id → stamp _pushAt → save; read = overlay onto local, never wipe. */
(function () {
'use strict';

const VERSION = '0.2.0';
const SB_URL = 'https://mtuoqwbrujxutofhyahb.supabase.co';
const SB_KEY = 'sb_publishable_tYgBycEksvhfB-2sBenWHA_dLTeVO9F';
const DEMO = /[?&]demo\b/.test(location.search);
const BUCKET = 'study';
const K = { subj: 'dashboard:school:v1:subjects', as: 'dashboard:school:v1:assignments', te: 'dashboard:school:v1:tests',
  tt: 'dashboard:school:v1:timetable', // owned by the main Dashboard: read only here ({cls, mine:["subject|teacher"]})
  set: 'study:v1:settings' };          // owned by Study Hub: {cls} when the Dashboard has no class set

/* ================= helpers ================= */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stamp = () => new Date().toISOString();
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
const qs = k => new URLSearchParams(location.search).get(k);
const wait = ms => new Promise(r => setTimeout(r, ms));
const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeJSON = (k, v) => { if (DEMO) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const link = (path, params) => { const p = new URLSearchParams(params || {}); if (DEMO) p.set('demo', ''); const s = p.toString().replace(/demo=(&|$)/, 'demo$1'); return path + (s ? '?' + s : ''); };
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 6l-6 6 6 6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>', chev: '<path d="M9 6l6 6-6 6"/>'
};
const ic = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

/* dates (Israel time) */
const TZ = 'Asia/Jerusalem';
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const dayNum = k => Math.round(Date.parse(String(k).slice(0, 10) + 'T00:00:00Z') / 864e5);
const daysUntil = k => k ? dayNum(k) - dayNum(todayKey()) : null;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(k) {
  if (!k) return '';
  const d = new Date(String(k).slice(0, 10) + 'T12:00:00Z');
  return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
}
function rel(k) {
  const n = daysUntil(k);
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return -n + ' days ago';
  if (n < 7) return 'in ' + n + ' days';
  return fmtDay(k);
}
const addDays = (k, n) => new Date(Date.parse(k + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/* ================= UI kit ================= */
let toastT = null;
function toast(msg, undo) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
  if (undo) el.querySelector('button').onclick = () => { el.classList.remove('on'); undo(); };
  requestAnimationFrame(() => el.classList.add('on'));
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), undo ? 5000 : 3200);
}
function sheet(html, onReady) {
  closeSheet(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
  const s = document.createElement('div'); s.className = 'sheet'; s.id = 'sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
  s.innerHTML = '<div class="grab"></div>' + html;
  document.body.append(scrim, s);
  scrim.onclick = () => closeSheet();
  requestAnimationFrame(() => { scrim.classList.add('on'); s.classList.add('on'); });
  if (onReady) onReady(s);
  return s;
}
function closeSheet(now) {
  const s = $('#sheet'), sc = $('#scrim');
  if (!s) return;
  if (now) { s.remove(); sc && sc.remove(); return; }
  s.classList.remove('on'); sc && sc.classList.remove('on');
  setTimeout(() => { s.remove(); sc && sc.remove(); }, 260);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// crashes are visible on a phone without a console
function errorBanner() {
  const show = m => {
    let b = $('#err-banner');
    if (!b) { b = document.createElement('div'); b.id = 'err-banner'; b.className = 'err-banner'; b.onclick = () => b.remove(); document.body.appendChild(b); }
    b.textContent = 'Something broke (tap to hide): ' + m;
  };
  window.addEventListener('error', e => show(e.message || String(e)));
  window.addEventListener('unhandledrejection', e => show((e.reason && e.reason.message) || String(e.reason)));
}

/* ================= Supabase + session ================= */
let _sb = null, uid = null, user = null;
const sb = () => _sb || (_sb = window.supabase.createClient(SB_URL, SB_KEY));
async function fresh() { try { await sb().auth.getSession(); } catch (e) {} }
async function session(opt) {
  if (DEMO) { uid = 'demo'; user = { id: 'demo', email: 'demo@example.com' }; return uid; }
  let s = null;
  for (let i = 0; i < 3 && !s; i++) {
    try { const r = await sb().auth.getSession(); s = r.data && r.data.session; } catch (e) {}
    if (!s && i < 2) await wait(600);
  }
  if (!s) { if (!(opt && opt.optional)) location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); return null; }
  uid = s.user.id; user = s.user;
  return uid;
}
async function token() { if (DEMO) return 'demo'; const r = await sb().auth.getSession(); return r.data && r.data.session ? r.data.session.access_token : ''; }
async function signOut() { if (!DEMO) await sb().auth.signOut(); location.href = '/login.html'; }

/* ================= the shared school row (uid:school) ================= */
function mergeById(base, inc) { // identical to the main Dashboard's v3/school.js
  if (!Array.isArray(base)) return Array.isArray(inc) ? inc : [];
  if (!Array.isArray(inc)) return base;
  const when = x => String((x && (x.updatedAt || x.createdAt)) || '');
  const m = new Map();
  base.forEach(x => { if (x && x.id != null) m.set(x.id, x); });
  inc.forEach(x => { if (!x || x.id == null) return; const a = m.get(x.id); if (!a || when(x) >= when(a)) m.set(x.id, x); });
  const out = [], seen = new Set();
  base.concat(inc).forEach(x => { if (!x || x.id == null || seen.has(x.id)) return; seen.add(x.id); out.push(m.get(x.id)); });
  return out;
}
const school = { data: {}, ready: false, subs: [] };
const schoolLS = () => 'sh:school:' + uid;
school.on = f => school.subs.push(f);
const emit = () => school.subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
school.get = k => Array.isArray(school.data[k]) ? school.data[k] : [];
school.load = async () => {
  if (DEMO) { school.data = demoSchool(); school.ready = true; emit(); return; }
  const cached = readJSON(schoolLS());
  if (isObj(cached)) { school.data = cached; emit(); }
  try {
    await fresh();
    const res = await sb().from('app_state').select('data').eq('key', uid + ':school').maybeSingle();
    if (res.error) throw res.error;
    const cloud = isObj(res.data && res.data.data) ? res.data.data : {};
    [K.subj, K.as, K.te].forEach(k => { school.data[k] = mergeById(school.data[k], cloud[k]); });
    [K.tt, K.set].forEach(k => { if (isObj(cloud[k])) school.data[k] = cloud[k]; });
    school.ready = true;
    writeJSON(schoolLS(), school.data);
    emit();
  } catch (e) { console.warn('school load failed', e); toast('Offline: showing the last saved copy.'); }
};
// save the keys changed here: read the cloud row, merge entry by entry, write back
school.save = async keys => {
  writeJSON(schoolLS(), school.data); emit();
  if (DEMO) return;
  try {
    await fresh();
    const key = uid + ':school';
    const res = await sb().from('app_state').select('data').eq('key', key).maybeSingle();
    if (res.error) throw res.error;
    const cloud = isObj(res.data && res.data.data) ? res.data.data : {};
    const patch = { _pushAt: Date.now() };
    keys.forEach(k => {
      if (k === K.tt) return; // never written from here
      patch[k] = Array.isArray(school.data[k]) ? mergeById(cloud[k], school.data[k]) : school.data[k];
      school.data[k] = patch[k];
    });
    const rpc = await sb().rpc('app_state_patch', { p_key: key, p_patch: patch });
    if (rpc.error) {
      const up = await sb().from('app_state').upsert({ key, data: Object.assign({}, cloud, patch), updated_at: stamp() }, { onConflict: 'key' });
      if (up.error) throw up.error;
    }
    writeJSON(schoolLS(), school.data);
  } catch (e) { console.warn('school save failed', e); toast('Couldn’t save to the cloud. Try again when online.'); }
};
const subjects = () => school.get(K.subj).filter(s => s && !s.hidden);
const subject = id => school.get(K.subj).find(s => s.id === id) || null;
const subjectName = id => { const s = subject(id); return s ? s.name : 'General'; };
function ensureSubject(name, fixedId) {
  name = String(name || '').trim();
  if (!name) return null;
  const low = name.toLowerCase();
  const hit = school.get(K.subj).find(s => s && String(s.name || '').trim().toLowerCase() === low);
  if (hit) return hit.id;
  const colors = ['#1F5AE0', '#6A43E8', '#FF5A2B', '#13B3C6', '#9BD23A', '#FFB21E', '#E0457B'];
  const s = { id: fixedId || newId(), name, color: colors[school.get(K.subj).length % colors.length], createdAt: stamp(), updatedAt: stamp() };
  school.data[K.subj] = school.get(K.subj).concat([s]);
  return s.id;
}
const openTests = () => school.get(K.te).filter(t => t && t.testDate && daysUntil(t.testDate) >= 0 && !t.hidden).sort((a, b) => a.testDate.localeCompare(b.testDate));
const openHomework = () => school.get(K.as).filter(a => a && a.status !== 'Done' && !a.hidden).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
function setHomeworkDone(id, done) {
  school.data[K.as] = school.get(K.as).map(a => a.id === id ? Object.assign({}, a, { status: done ? 'Done' : 'Not started', completedAt: done ? stamp() : null, updatedAt: stamp() }) : a);
  return school.save([K.as]);
}
function addHomework(subjectId, title, dueDate) {
  school.data[K.as] = school.get(K.as).concat([{ id: newId(), subjectId, title, type: 'Homework', dueDate, priority: 'Medium', status: 'Not started', notes: '', createdAt: stamp(), updatedAt: stamp() }]);
  return school.save([K.subj, K.as]);
}
function addTest(subjectId, name, testDate, topics) {
  school.data[K.te] = school.get(K.te).concat([{ id: newId(), subjectId, name, testDate, topics: topics || '', studyStatus: 'Not started', importance: 'Medium', notes: '', createdAt: stamp(), updatedAt: stamp() }]);
  return school.save([K.subj, K.te]);
}

/* ================= pulled in automatically: school calendar + Mashov =================
   Both write into the SHARED school row (tests, homework) with stable ids, so the main
   Dashboard shows them too and two devices never create duplicates. Teacher messages
   go to study_materials (kind teacher_message) so the tutor can learn from them. */
const HE_SUBJ = { 'מתמטיקה': 'math', 'אנגלית': 'english', 'פיזיקה': 'physics', 'פיסיקה': 'physics', 'ביולוגיה': 'biology', 'כימיה': 'chemistry', 'היסטוריה': 'history', 'ספרות': 'literature', 'תנך': 'bible', 'תנ"ך': 'bible', 'אזרחות': 'civics', 'לשון': 'hebrew', 'עברית': 'hebrew', 'גאוגרפיה': 'geography', 'גיאוגרפיה': 'geography', 'מדעי המחשב': 'computerscience', 'ערבית': 'arabic', 'חינוך גופני': 'physicaleducation', 'רובוטיקה': 'robotics' };
const heNorm = s => String(s || '').replace(/["״׳']/g, '').replace(/\d+|יח"?ל|יחידות|מואץ|טכניונית|מעבדת|מעבדה|הקבצה|קבוצה/g, ' ').replace(/\s+/g, ' ').trim();
// Hebrew subject (calendar / Mashov) → one of the school subjects; creates it when nothing fits
function subjectFromHe(he) {
  const n = heNorm(he);
  if (!n) return ensureSubject('General');
  const key = HE_SUBJ[n] || Object.keys(HE_SUBJ).filter(k => n.indexOf(k) >= 0).map(k => HE_SUBJ[k])[0];
  const flat = x => String(x || '').toLowerCase().replace(/[^a-z֐-׿]/g, '');
  const subs = school.get(K.subj);
  const hit = subs.find(s => key && (s.id === key || flat(s.name) === key)) || subs.find(s => flat(s.name) === flat(n));
  if (hit) return hit.id;
  // a stable id from the name, so two devices importing the same subject don't create two
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ensureSubject(n, 'he-' + h.toString(36));
}
// teacher name → subject, from the timetable the main Dashboard keeps ("מתמטיקה|צפריר דלית")
function subjectFromTeacher(name) {
  const mine = (school.data[K.tt] && school.data[K.tt].mine) || [];
  const last = String(name || '').trim().split(/\s+/).pop();
  const row = last && mine.find(m => String(m).split('|')[1] && String(m).split('|')[1].indexOf(last) >= 0);
  return row ? subjectFromHe(String(row).split('|')[0]) : null;
}
const myClass = () => (school.data[K.tt] && school.data[K.tt].cls) || (school.data[K.set] && school.data[K.set].cls) || '';
async function setMyClass(cls) {
  school.data[K.set] = Object.assign({}, school.data[K.set] || {}, { cls, updatedAt: stamp() });
  await school.save([K.set]);
}
const syncState = { calendar: null, mashov: null }; // null = not tried, else 'ok' | message

async function syncCalendar() {
  const cls = myClass();
  if (!cls) { syncState.calendar = 'no class'; return 0; }
  const r = await fetch('/api/calendar?cls=' + encodeURIComponent(cls));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { syncState.calendar = j.error || 'school site unreachable'; return 0; }
  let added = 0, changed = false;
  const tests = school.get(K.te).slice();
  j.tests.forEach(c => {
    const linked = tests.findIndex(t => t && t.calUid === c.uid);
    if (linked >= 0) { // the school moved or renamed it: follow
      const t = tests[linked];
      if (t.source === 'calendar' && (t.testDate !== c.date || t.name !== c.title)) { tests[linked] = Object.assign({}, t, { testDate: c.date, name: c.title, updatedAt: stamp() }); changed = true; }
      return;
    }
    const sid = subjectFromHe(c.subject || c.title);
    const sameDay = tests.findIndex(t => t && !t.calUid && t.testDate === c.date && t.subjectId === sid);
    if (sameDay >= 0) { tests[sameDay] = Object.assign({}, tests[sameDay], { calUid: c.uid, updatedAt: stamp() }); changed = true; return; }
    tests.push({ id: 'cal-' + String(c.uid).replace(/[^\w-]/g, '').slice(0, 60), subjectId: sid, name: c.title, testDate: c.date, topics: c.details || '', type: c.quiz ? 'Quiz' : 'Test', calUid: c.uid, source: 'calendar', studyStatus: 'Not started', importance: 'Medium', notes: '', createdAt: stamp(), updatedAt: stamp() });
    added++; changed = true;
  });
  if (changed) { school.data[K.te] = tests; await school.save([K.subj, K.te]); }
  syncState.calendar = 'ok';
  return added;
}

async function syncMashov() {
  let j;
  try { j = await api('mashov'); }
  catch (e) { syncState.mashov = e.message; return 0; }
  let added = 0;
  const as = school.get(K.as).slice(), have = new Set(as.map(a => a.id));
  const cutoff = addDays(todayKey(), -14);
  (j.homework || []).forEach(h => {
    if (have.has(h.ref) || (h.given && h.given < cutoff && !h.due)) return;
    const first = h.text.split('\n')[0];
    as.push({ id: h.ref, subjectId: subjectFromHe(h.subject), title: first.length > 120 ? first.slice(0, 117) + '…' : first, type: 'Homework', dueDate: h.due || null, givenDate: h.given || null, priority: 'Medium', status: 'Not started', notes: h.text, source: 'mashov', createdAt: stamp(), updatedAt: stamp() });
    added++;
  });
  if (added) { school.data[K.as] = as; await school.save([K.subj, K.as]); }
  const msgs = (j.messages || []).map(m => ({
    subject_id: subjectFromTeacher(m.sender) || 'inbox', kind: 'teacher_message', source_ref: m.ref,
    title: (m.subject || 'Message') + (m.sender ? ' · ' + m.sender : ''),
    content: (m.body || '') + (m.files && m.files.length ? '\n\n[attached files: ' + m.files.join(', ') + ']' : ''),
    status: 'ready', taken_at: m.date ? m.date + 'T12:00:00Z' : stamp()
  }));
  if (msgs.length && !DEMO) {
    await fresh();
    const r = await sb().from(T.materials).upsert(msgs, { onConflict: 'user_id,source_ref', ignoreDuplicates: true }).select('id');
    if (r.error) { syncState.mashov = /source_ref/.test(r.error.message || '') ? 'run the updated supabase/schema.sql' : r.error.message; return added; }
    added += (r.data || []).length;
  }
  if (j.problems && j.problems.length) console.warn('mashov', j.problems);
  syncState.mashov = 'ok';
  return added;
}

// Runs when the home page opens (at most every 30 minutes), or when asked.
async function syncAll(force) {
  if (DEMO) return 0;
  const LS = 'sh:sync:' + uid, last = Number(localStorage.getItem(LS) || 0);
  if (!force && Date.now() - last < 30 * 60e3) return 0;
  try { localStorage.setItem(LS, String(Date.now())); } catch (e) {}
  const n = (await syncCalendar().catch(e => { syncState.calendar = e.message; return 0; })) + (await syncMashov().catch(e => { syncState.mashov = e.message; return 0; }));
  try { localStorage.setItem(LS + ':state', JSON.stringify({ at: Date.now(), calendar: syncState.calendar, mashov: syncState.mashov })); } catch (e) {}
  if (n) { toast(n + ' new from school'); emitStudy(); }
  return n;
}
const lastSync = () => readJSON('sh:sync:' + uid + ':state');

/* ================= study tables ================= */
const T = { lessons: 'study_lessons', materials: 'study_materials', topics: 'study_topics', attempts: 'study_attempts', chats: 'study_chats' };
async function rows(table, filter, order, limit) {
  if (DEMO) return demoRows(table, filter);
  await fresh();
  let q = sb().from(table).select('*');
  Object.keys(filter || {}).forEach(k => { q = q.eq(k, filter[k]); });
  if (order) q = q.order(order, { ascending: false });
  if (limit) q = q.limit(limit);
  const r = await q;
  if (r.error) { if (/relation .* does not exist|study_/i.test(r.error.message || '')) throw new Error('The study tables are missing: run supabase/schema.sql in Supabase.'); throw r.error; }
  return r.data || [];
}
async function insert(table, values) {
  if (DEMO) return Object.assign({ id: uuid(), created_at: stamp() }, values);
  await fresh();
  const r = await sb().from(table).insert(values).select().single();
  if (r.error) throw r.error;
  return r.data;
}
async function update(table, id, values) {
  if (DEMO) return;
  await fresh();
  const r = await sb().from(table).update(Object.assign({ updated_at: stamp() }, values)).eq('id', id);
  if (r.error) throw r.error;
}
async function setTopicState(subjectId, name, state) {
  if (DEMO || !name) return;
  await fresh();
  const cur = await sb().from(T.topics).select('id,state').eq('subject_id', subjectId).eq('name', name).maybeSingle();
  const rank = { new: 0, with_help: 1, alone: 2 };
  if (cur.data) {
    if (rank[state] > rank[cur.data.state]) await update(T.topics, cur.data.id, { state, last_practiced: stamp() });
    else await update(T.topics, cur.data.id, { last_practiced: stamp() });
  } else await insert(T.topics, { subject_id: subjectId, name, state, last_practiced: stamp() });
}
async function upload(kind, file, ext) {
  const path = uid + '/' + kind + '/' + uuid() + '.' + (ext || 'bin');
  if (DEMO) return path;
  await fresh();
  const r = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (r.error) throw r.error;
  return path;
}
async function api(name, payload) {
  if (DEMO) return demoApi(name, payload);
  const tok = await token();
  const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload || {}) });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || ('Server error ' + r.status));
  return j;
}

/* photos: shrink to a JPEG the AI can read (and that uploads fast on mobile data) */
function shrinkImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, (maxSide || 1800) / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', quality || 0.82);
      c.toBlob(blob => blob ? resolve({ blob: new File([blob], 'photo.jpg', { type: 'image/jpeg' }), dataUrl }) : reject(new Error('Could not read the photo')), 'image/jpeg', quality || 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo this phone can open. Try a screenshot of it.')); };
    img.src = url;
  });
}

/* markdown + math for AI text (raw HTML from the model is never rendered) */
function renderRich(el, text) {
  const safe = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // keep math away from markdown (underscores and asterisks inside formulas)
  const math = [];
  const held = safe.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => { math.push(m); return '\u0000' + (math.length - 1) + '\u0000'; });
  let html = window.marked ? window.marked.parse(held, { breaks: true, gfm: true }) : '<p>' + held.replace(/\n/g, '<br>') + '</p>';
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => math[+i]);
  el.innerHTML = html;
  el.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  if (window.renderMathInElement) {
    try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) {}
  }
}

/* ================= + Add sheet (home and subject pages) ================= */
const ADD = [
  { k: 'lesson', t: 'Lesson recording', d: 'Audio from class → transcript' },
  { k: 'board', t: 'Board photo', d: 'What the teacher wrote' },
  { k: 'teacher_summary', t: 'Teacher summary', d: 'Paste from WhatsApp / Mashov' },
  { k: 'notes', t: 'Notes / worksheet', d: 'Photo or PDF' },
  { k: 'old_test', t: 'Old test', d: 'Sets the tutor’s level' },
  { k: 'homework', t: 'Homework', d: 'Shows in your Dashboard too' },
  { k: 'test', t: 'Test date', d: 'Shows in your Dashboard too' }
];
function subjectField(sel) {
  const list = subjects();
  const last = sel || readJSON('sh:lastSubject');
  return '<label class="field"><span>Subject</span><select name="subject">' +
    list.map(s => '<option value="' + esc(s.id) + '"' + (s.id === last ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
    '<option value="__new">+ New subject…</option></select></label>' +
    '<label class="field" data-new-subj ' + (list.length ? 'hidden' : '') + '><span>New subject name</span><input name="newSubject" placeholder="e.g. Physics" autocomplete="off"></label>';
}
function wireSubject(s) {
  const sel = s.querySelector('select[name=subject]'), box = s.querySelector('[data-new-subj]');
  if (!sel) return;
  const sync = () => { box.hidden = sel.value !== '__new' && subjects().length > 0; };
  if (!subjects().length) sel.value = '__new';
  sel.onchange = sync; sync();
}
async function pickedSubject(form) {
  let id = form.subject ? form.subject.value : '';
  if (id === '__new' || !id) {
    const name = (form.newSubject && form.newSubject.value || '').trim();
    if (!name) throw new Error('Pick a subject or type a new one.');
    id = ensureSubject(name);
    await school.save([K.subj]);
  }
  writeJSON('sh:lastSubject', id);
  return id;
}
function openAdd(subjectId, onDone) {
  sheet('<h2>Add</h2><div class="add-grid">' + ADD.map(a => '<button class="add-opt" data-k="' + a.k + '"><b>' + esc(a.t) + '</b><span>' + esc(a.d) + '</span></button>').join('') + '</div>', s => {
    s.querySelectorAll('.add-opt').forEach(b => { b.onclick = () => openAddForm(b.dataset.k, subjectId, onDone); });
  });
}
function openAddForm(kind, subjectId, onDone) {
  const meta = ADD.find(a => a.k === kind);
  const today = todayKey();
  let inner = subjectField(subjectId);
  if (kind === 'lesson') inner += '<label class="field"><span>Lesson date</span><input type="date" name="date" value="' + today + '"></label>' +
    '<label class="file-pick"><input type="file" name="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm">Choose the recording</label>' +
    '<p class="hint">iPhone: Voice Memos → the recording → Share → Save to Files, then pick it here. Up to 25 MB (about 45 min at “Compressed” quality).</p>';
  else if (kind === 'teacher_summary') inner += '<label class="field"><span>Paste the text</span><textarea name="text" dir="auto" placeholder="Paste what the teacher sent…"></textarea></label>';
  else if (kind === 'homework') inner += '<label class="field"><span>What</span><input name="title" dir="auto" placeholder="e.g. Questions 4–7, page 112" autocomplete="off"></label><label class="field"><span>Due</span><input type="date" name="date" value="' + addDays(today, 1) + '"></label>';
  else if (kind === 'test') inner += '<label class="field"><span>Test name</span><input name="title" dir="auto" placeholder="e.g. Kinematics test" autocomplete="off"></label><label class="field"><span>Date</span><input type="date" name="date" value="' + addDays(today, 7) + '"></label><label class="field"><span>Topics (optional)</span><input name="topics" dir="auto" placeholder="e.g. free fall, two bodies meeting" autocomplete="off"></label>';
  else inner += '<label class="file-pick"><input type="file" name="file" accept="image/*,application/pdf"' + (kind === 'board' ? ' capture="environment"' : '') + '>' + (kind === 'board' ? 'Take or choose a photo' : 'Choose a photo or PDF') + '</label><label class="field"><span>Title (optional)</span><input name="title" dir="auto" autocomplete="off"></label>' +
    (kind === 'old_test' ? '<p class="hint">Old tests teach the tutor your teacher’s level. Add every one you can get.</p>' : '');
  sheet('<h2>' + esc(meta.t) + '</h2><form class="form" novalidate>' + inner + '<button class="btn primary block" type="submit">Save</button></form>', s => {
    wireSubject(s);
    const f = s.querySelector('form');
    const fileIn = f.querySelector('input[type=file]');
    if (fileIn) fileIn.onchange = () => { if (fileIn.files[0]) fileIn.parentElement.lastChild.textContent = fileIn.files[0].name; };
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const sid = await pickedSubject(f);
        await saveAdd(kind, sid, f);
        closeSheet();
        if (onDone) onDone(sid);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Save';
        toast(err.message || String(err));
      }
    };
  });
}
async function saveAdd(kind, sid, f) {
  if (kind === 'homework') {
    const title = f.title.value.trim(); if (!title) throw new Error('Write what the homework is.');
    await addHomework(sid, title, f.date.value || null); toast('Homework added'); return;
  }
  if (kind === 'test') {
    const title = f.title.value.trim(); if (!title) throw new Error('Name the test.');
    if (!f.date.value) throw new Error('Pick the test date.');
    await addTest(sid, title, f.date.value, f.topics.value.trim()); toast('Test added'); return;
  }
  if (kind === 'teacher_summary') {
    const text = f.text.value.trim(); if (!text) throw new Error('Paste the text first.');
    await insert(T.materials, { subject_id: sid, kind, title: text.split('\n')[0].slice(0, 80), content: text, status: 'ready' });
    toast('Saved. The tutor will use it.'); return;
  }
  const file = f.file && f.file.files[0];
  if (!file) throw new Error('Choose a file first.');
  if (kind === 'lesson') {
    if (file.size > 25 * 1024 * 1024) throw new Error('That recording is ' + Math.round(file.size / 1048576) + ' MB. The limit is 25 MB: record in two parts, or use “Compressed” quality.');
    const ext = (file.name.split('.').pop() || 'm4a').toLowerCase();
    const path = await upload('audio', file, ext);
    const lesson = await insert(T.lessons, { subject_id: sid, lesson_date: f.date.value || todayKey(), status: 'uploaded', audio_path: path });
    toast('Uploaded. Transcribing (about a minute)…');
    api('transcribe', { lessonId: lesson.id, subjectName: subjectName(sid) })
      .then(() => { toast('Lesson ready'); emitStudy(); })
      .catch(err => { toast('Transcription failed: ' + err.message); emitStudy(); });
    return;
  }
  // photo or PDF material
  let blob = file, ext = 'pdf', mime = 'application/pdf';
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { blob = (await shrinkImage(file, 2000, 0.85)).blob; ext = 'jpg'; mime = 'image/jpeg'; }
  if (blob.size > 30 * 1024 * 1024) throw new Error('That file is too big (max 30 MB).');
  const path = await upload(kind, blob, ext);
  const m = await insert(T.materials, { subject_id: sid, kind, title: (f.title && f.title.value.trim()) || null, file_path: path, mime, status: 'uploaded', taken_at: file.lastModified ? new Date(file.lastModified).toISOString() : stamp() });
  toast('Uploaded. Reading it…');
  api('read-file', { materialId: m.id, subjectName: subjectName(sid) })
    .then(() => { toast('Read and saved'); emitStudy(); })
    .catch(err => { toast('Couldn’t read it: ' + err.message); emitStudy(); });
}
const studySubs = [];
const onStudy = f => studySubs.push(f);
const emitStudy = () => studySubs.forEach(f => { try { f(); } catch (e) {} });

/* ================= demo data (?demo: no login, no network, no storage writes) ================= */
function demoSchool() {
  const t = todayKey();
  return {
    [K.subj]: [{ id: 'phys', name: 'Physics', color: '#1F5AE0' }, { id: 'math', name: 'Maths', color: '#6A43E8' }, { id: 'eng', name: 'English', color: '#FF5A2B' }],
    [K.te]: [
      { id: 't1', subjectId: 'math', name: 'Maths retest', testDate: addDays(t, 3), topics: 'Derivatives, tangent lines' },
      { id: 't2', subjectId: 'phys', name: 'Kinematics test', testDate: addDays(t, 12), topics: 'Free fall, two bodies meeting, graphs', source: 'calendar', calUid: 'x' }
    ],
    [K.as]: [
      { id: 'a1', subjectId: 'phys', title: 'Questions 4–7, page 112', dueDate: addDays(t, 1), status: 'Not started' },
      { id: 'a2', subjectId: 'eng', title: 'Essay draft', dueDate: addDays(t, 4), status: 'Not started' },
      { id: 'a3', subjectId: 'math', title: 'Worksheet 3', dueDate: addDays(t, -1), status: 'Not started' },
      { id: 'mashov-hw-1', subjectId: 'phys', title: 'דף עבודה 4, שאלות 1–3', givenDate: addDays(t, -1), status: 'Not started', source: 'mashov' }
    ]
  };
}
const DEMO_ROWS = {
  study_lessons: [
    { id: 'l1', subject_id: 'phys', lesson_date: addDays(todayKey(), -1), title: 'נפילה חופשית', status: 'ready', topics: ['נפילה חופשית'], summary: '- גוף שנזרק כלפי מטה: $v_0<0$ כשהציר כלפי מעלה\n- $y(t)=y_0+v_0t-\\frac{1}{2}gt^2$\n- המורה: "במבחן תמיד יש שאלה עם שני גופים"', transcript: 'המורה: טוב, היום נדבר על נפילה חופשית. ניקח ציר כלפי מעלה, ואז התאוצה היא מינוס g…' },
    { id: 'l2', subject_id: 'phys', lesson_date: addDays(todayKey(), -3), title: null, status: 'transcribing', topics: [] },
    { id: 'l3', subject_id: 'math', lesson_date: addDays(todayKey(), -2), title: 'נגזרת ומשיק', status: 'ready', topics: ['נגזרות', 'משיק'], summary: '- משוואת משיק: $y-y_0=f\'(x_0)(x-x_0)$', transcript: 'המורה: מה זה משיק? ישר שנוגע בגרף בנקודה אחת…' }
  ],
  study_materials: [
    { id: 'm1', subject_id: 'phys', kind: 'old_test', title: 'מבחן קינמטיקה תשפ״ו', status: 'ready', content: 'שאלה 1 (35 נק׳)…', created_at: addDays(todayKey(), -20) },
    { id: 'm2', subject_id: 'phys', kind: 'board', title: null, status: 'ready', content: '$v=v_0+at$', created_at: addDays(todayKey(), -1), lesson_id: 'l1' },
    { id: 'm3', subject_id: 'phys', kind: 'teacher_summary', title: 'סיכום שיעור – נפילה חופשית', status: 'ready', content: 'סיכום…', created_at: addDays(todayKey(), -1) },
    { id: 'm4', subject_id: 'math', kind: 'board', title: null, status: 'reading', created_at: addDays(todayKey(), 0) },
    { id: 'm5', subject_id: 'phys', kind: 'teacher_message', title: 'חומר למבחן · דנה כהן', status: 'ready', content: 'שלום לכולם,\nהמבחן יכלול: נפילה חופשית, מפגש שני גופים, גרפים.\nבהצלחה!', taken_at: addDays(todayKey(), -1) + 'T12:00:00Z', created_at: addDays(todayKey(), -1) }
  ],
  study_topics: [
    { id: 'tp1', subject_id: 'phys', name: 'נפילה חופשית', state: 'with_help' },
    { id: 'tp2', subject_id: 'phys', name: 'מפגש שני גופים', state: 'new' },
    { id: 'tp3', subject_id: 'phys', name: 'גרפים של תנועה', state: 'alone' },
    { id: 'tp4', subject_id: 'math', name: 'נגזרות', state: 'with_help' },
    { id: 'tp5', subject_id: 'math', name: 'משיק', state: 'new' }
  ],
  study_attempts: [], study_chats: []
};
function demoRows(table, filter) {
  return (DEMO_ROWS[table] || []).filter(r => Object.keys(filter || {}).every(k => r[k] === filter[k]));
}
async function demoApi(name, p) {
  await wait(700);
  if (name === 'mashov') return { homework: [{ ref: 'mashov-hw-9', subject: 'מתמטיקה 5 יח"ל', text: 'שאלות 1-5 עמוד 40', given: todayKey(), due: null }], messages: [] };
  if (name !== 'tutor') return {};
  const last = (p.messages || []).slice(-1)[0] || {};
  if (p.mode === 'test' && (last.image || (p.messages || []).length > 2)) {
    return { text: 'קראתי את הפתרון שלך.\n\nההצבה ב־$y(t)$ נכונה, אבל **הסימן של $v_0$** הפוך: בחרת ציר כלפי מעלה, ולכן אבן שנזרקת כלפי מטה מקבלת $v_0=-5\\,\\text{m/s}$.\n\nתתקן את המשוואה ותמשיך משם לבד.', verdict: 'partial' };
  }
  if (p.mode === 'test') return { text: '**שאלה 1** (בסגנון המבחן של המורה, 20 נק׳)\n\nאבן נזרקת כלפי מטה במהירות $5\\,\\text{m/s}$ מגג בגובה $45\\,\\text{m}$. שנייה אחר כך משחררים אבן שנייה ממנוחה מאותו גג.\n\nא. כתוב את משוואות המקום של שתי האבנים.\nב. מתי האבן הראשונה פוגעת בקרקע?\nג. שרטט גרף $y(t)$ של שתי האבנים על אותם צירים.\n\nפתור לבד על דף, ואז שלח צילום.' };
  return { text: 'בוא נתחיל מאפס, כמו שהמורה עשה בשיעור מאתמול.\n\nבנפילה חופשית הגוף נע רק בהשפעת כוח הכובד, ולכן התאוצה קבועה: $a=-g$ כשהציר כלפי מעלה.\n\n**שאלה קטנה לבדיקה:** אם זורקים אבן כלפי מעלה, מה התאוצה שלה בנקודה הכי גבוהה?' };
}

window.SH = {
  VERSION, DEMO, K, T, $, $$, esc, ic, qs, wait, link, stamp, newId, uuid, readJSON, writeJSON,
  todayKey, daysUntil, fmtDay, rel, addDays, toast, sheet, closeSheet, errorBanner,
  sb, session, token, signOut, user: () => user, uid: () => uid,
  school, mergeById, subjects, subject, subjectName, ensureSubject, openTests, openHomework, setHomeworkDone, addHomework, addTest,
  rows, insert, update, setTopicState, upload, api, shrinkImage, renderRich, openAdd, onStudy, emitStudy,
  syncAll, lastSync, myClass, setMyClass, subjectFromHe,
  _test: { syncCalendar, syncMashov, subjectFromTeacher } // used by tools/shot.js
};
errorBanner();
if ('serviceWorker' in navigator && !DEMO && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
