/* Study Hub core — window.SH.
   Supabase session, the SHARED school row (same keys as the main Dashboard, merged
   entry by entry so neither app overwrites the other), automatic imports (school site,
   Mashov), study tables, uploads, the api() helper, the planner, English/Hebrew, graphs,
   navigation, demo data and a small UI kit.
   Sync recipe (from the main Dashboard, do NOT regress): getSession() before every
   read/write; write = read cloud row → merge only the keys changed here, entry by
   entry by id → stamp _pushAt → save; read = overlay onto local, never wipe. */
(function () {
'use strict';

const VERSION = '0.3.1';
const SB_URL = 'https://mtuoqwbrujxutofhyahb.supabase.co';
const SB_KEY = 'sb_publishable_tYgBycEksvhfB-2sBenWHA_dLTeVO9F';
const DEMO = /[?&]demo\b/.test(location.search);
const BUCKET = 'study';
const K = { subj: 'dashboard:school:v1:subjects', as: 'dashboard:school:v1:assignments', te: 'dashboard:school:v1:tests',
  gr: 'dashboard:school:v1:grades',
  tt: 'dashboard:school:v1:timetable', // owned by the main Dashboard: read only here ({cls, mine:["subject|teacher"]})
  set: 'study:v1:settings' };          // owned by Study Hub: {cls, lang, teachLang, week:[…], studyMins, commuteMins, latest}
const LISTS = [K.subj, K.as, K.te, K.gr];

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
const link = (path, params) => { const p = new URLSearchParams(); Object.keys(params || {}).forEach(k => { if (params[k] != null && params[k] !== '') p.set(k, params[k]); }); let s = p.toString(); if (DEMO) s += (s ? '&' : '') + 'demo'; return path + (s ? '?' + s : ''); };
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 6l-6 6 6 6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  hw: '<path d="M9 5h10M9 12h10M9 19h10"/><path d="M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/>', book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  inbox: '<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h4l1.5 2.5h5L16 13h4"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', flag: '<path d="M5 21V4h12l-2.5 4L17 12H5"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>', clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>', paste: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'
};
const ic = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

/* ================= English / Hebrew ================= */
// t('English text') returns the Hebrew when the app is in Hebrew. {n}-style holes are filled from vars.
const HE = {
  'Today': 'היום', 'Homework': 'שיעורי בית', 'Subjects': 'מקצועות', 'Teachers': 'מורים', 'From teachers': 'מהמורים', 'Progress': 'התקדמות', 'Settings': 'הגדרות',
  'Record lesson': 'הקלטת שיעור', 'Tonight': 'הערב', 'Next': 'הבא', 'Start': 'התחלה', 'Start · {n} min': 'התחלה · {n} דק׳', 'Move to tomorrow': 'להעביר למחר',
  'Back': 'חזרה', 'Sign out': 'התנתקות', 'Save': 'שמירה', 'Saving…': 'שומר…', 'Undo': 'ביטול', 'Add': 'הוספה', 'Cancel': 'ביטול',
  'In this session': 'בסשן הזה', 'Learn the idea': 'ללמוד את הרעיון', 'Example from class': 'דוגמה מהשיעור', '{n} questions alone': '{n} שאלות לבד', 'Check + fix': 'בדיקה ותיקון',
  'Your day': 'היום שלך', 'Your {d}': 'היום שלך · {d}', 'School': 'בית ספר', 'Way home': 'דרך הביתה', 'Free': 'פנוי', 'Study': 'למידה', 'Study: {x}': 'למידה: {x}',
  'Came in by itself': 'הגיע לבד', 'Coming up': 'בקרוב', 'Nothing due in the next two weeks.': 'אין הגשות בשבועיים הקרובים.',
  'in {n} days': 'בעוד {n} ימים', 'today': 'היום', 'tomorrow': 'מחר', 'yesterday': 'אתמול', '{n} days ago': 'לפני {n} ימים',
  'Solved alone': 'נפתר לבד', 'With help': 'עם עזרה', 'Not started': 'לא התחלת', 'Not yet': 'עוד לא',
  '{a} of {b} topics solved alone': '{a} מתוך {b} נושאים נפתרו לבד', 'No topics yet: they come from your lessons': 'עדיין אין נושאים: הם מגיעים מהשיעורים שלך',
  'For your {x}.': 'בשביל {x}.', 'Built from your teacher’s lessons and old tests.': 'בנוי מהשיעורים ומהמבחנים הישנים של המורה.',
  'Practice test': 'מבחן תרגול', 'From zero: {x}': 'מאפס: {x}', 'Review: {x}': 'חזרה: {x}', 'Homework: {x}': 'שיעורי בית: {x}',
  'No free time today': 'אין היום זמן פנוי', 'Tonight is off': 'הערב חופשי', 'Done for tonight': 'סיימת להערב', 'One more question': 'עוד שאלה',
  'Nothing planned tonight': 'אין משהו מתוכנן הערב', 'No tests in the next two weeks. Good time to get ahead.': 'אין מבחנים בשבועיים הקרובים. זמן טוב להתקדם.',
  'Moved to tomorrow': 'הועבר למחר', 'Your week isn’t set yet: tell Study when you have volleyball, robotics, gym.': 'השבוע שלך עוד לא מוגדר: ספר מתי יש כדורעף, רובוטיקה, חדר כושר.',
  'Set your week': 'להגדיר את השבוע', 'Teach me': 'למד אותי', 'Test me': 'בחן אותי', 'Topics': 'נושאים', 'Lessons': 'שיעורים', 'From the teacher': 'מהמורה',
  'Learn': 'ללמוד', 'Example': 'דוגמה', 'Your turn': 'תורך', 'Check': 'בדיקה', 'Got it → next': 'הבנתי ← הלאה', 'Got it → your turn': 'הבנתי ← תורי',
  'Explain differently': 'להסביר אחרת', 'Ask a question': 'לשאול שאלה', 'Snap your answer': 'לצלם את התשובה', 'Type it instead': 'להקליד במקום', 'Send': 'שליחה',
  'Correct': 'נכון', 'Almost': 'כמעט', 'Not yet ': 'עוד לא', 'Did you solve it on your own?': 'פתרת את זה לבד?', 'Alone': 'לבד', 'I had help': 'היתה לי עזרה',
  'Another question': 'עוד שאלה', 'Finish': 'סיום', 'Thinking…': 'חושב…', 'Checking…': 'בודק…', 'Try again': 'לנסות שוב', '{n} min left': 'נשארו {n} דק׳',
  'Your answer': 'התשובה שלך', 'Photo attached': 'תמונה צורפה', 'Remove photo': 'להסיר תמונה', 'Teaching language': 'שפת הלימוד',
  'To do': 'לעשות', 'Done': 'בוצע', 'Overdue': 'באיחור', 'This week': 'השבוע', 'Later': 'אחר כך', 'No date': 'בלי תאריך', 'Do it with the tutor': 'לעשות עם המורה הפרטי',
  'Ticked here = ticked in your Dashboard too.': 'מה שמסומן כאן מסומן גם בדשבורד.', 'Add homework': 'הוספת שיעורי בית', 'Mark done': 'לסמן כבוצע',
  'Paste from WhatsApp': 'הדבקה מוואטסאפ', 'Pick a subject': 'בחר מקצוע', 'The tutor uses this': 'המורה הפרטי משתמש בזה',
  'Solved alone this week': 'נפתרו לבד השבוע', 'Needed help': 'היה צריך עזרה', 'Ready for the test, per subject': 'מוכנות למבחן, לפי מקצוע',
  'Mistakes that keep coming back': 'טעויות שחוזרות', 'Practice just these': 'לתרגל רק אותן', 'Grades': 'ציונים', 'Counts only what you solved alone': 'נספר רק מה שפתרת לבד',
  'Where info comes from': 'מאיפה המידע מגיע', 'Your week (for the planner)': 'השבוע שלך (בשביל התכנון)', 'Add activity': 'הוספת פעילות', 'App language': 'שפת האפליקציה',
  'Sync now': 'לסנכרן עכשיו', 'Connected': 'מחובר', 'Not connected yet': 'עוד לא מחובר', 'Your class': 'הכיתה שלך', 'Most study per evening': 'הכי הרבה למידה בערב',
  'Way home after school': 'דרך הביתה אחרי בית ספר', 'Latest study time': 'הכי מאוחר ללמוד', 'minutes': 'דקות', 'Same as the test': 'כמו המבחן', 'Hebrew': 'עברית', 'English': 'אנגלית',
  'AI this month': 'בינה מלאכותית החודש', 'Recording': 'מקליט', 'Snap the board': 'לצלם את הלוח', '"On the test!"': '״זה במבחן!״', 'marks this moment': 'מסמן את הרגע',
  'Start recording': 'להתחיל להקליט', 'Stop': 'עצירה', 'Upload a recording instead': 'להעלות הקלטה במקום', 'Subject': 'מקצוע',
  'Keep this screen open: it stays on by itself.': 'השאר את המסך פתוח: הוא נשאר דולק לבד.', 'Transcribed in Hebrew or English by itself.': 'מתומלל לבד בעברית או באנגלית.',
  'Old test': 'מבחן ישן', 'Board photo': 'צילום לוח', 'Notes': 'סיכום', 'Teacher summary': 'סיכום מהמורה', 'Mashov message': 'הודעה ממשו״ב', 'Worksheet': 'דף עבודה',
  'Lesson recording': 'הקלטת שיעור', 'Test date': 'תאריך מבחן', 'Add material': 'הוספת חומר', 'Ready': 'מוכן', 'Transcribing…': 'מתמלל…', 'Reading…': 'קורא…', 'Failed · retry': 'נכשל · שוב',
  'Full transcript': 'תמלול מלא', 'Summary': 'סיכום', 'Study this lesson': 'ללמוד את השיעור', 'Lesson': 'שיעור', 'All subjects': 'כל המקצועות', 'Next test': 'מבחן הבא',
  'Which class are you in?': 'באיזו כיתה אתה?',
  'Change tonight': 'לשנות את הערב', 'Not tonight': 'לא הערב', 'Shorter · 20 min': 'קצר יותר · 20 דק׳', 'Later tonight': 'מאוחר יותר', 'Or tell me what’s going on…': 'או ספר מה קורה…',
  'Tell me about your week': 'ספר לי על השבוע שלך', 'Looks right': 'נראה נכון', 'Edit by hand': 'עריכה ידנית', 'Appearance': 'מראה', 'Light': 'בהיר', 'Dark': 'כהה', 'Auto': 'אוטומטי',
  'Like you’d tell a friend: practices, gym, how long the way home takes, how late you can study.': 'כמו שהיית מספר לחבר: אימונים, חדר כושר, כמה זמן הדרך הביתה, עד מתי אפשר ללמוד.',
  'e.g. Volleyball Mon and Tue 5–7, robotics Sunday after school till 8, I can study till 10': 'למשל: כדורעף בשני ובשלישי 17–19, רובוטיקה בראשון אחרי בית ספר עד 20, אני יכול ללמוד עד 22',
  'Tonight changed': 'הערב השתנה',
  'Plan my week with Claude': 'לתכנן את השבוע עם Claude', 'Import from Claude': 'ייבוא מ־Claude', 'Prompt copied: paste it in Claude.': 'הפרומפט הועתק: הדבק אותו ב־Claude.',
  'Paste what Claude gave you at the end (or upload the file).': 'הדבק את מה ש־Claude נתן לך בסוף (או העלה את הקובץ).', 'Import': 'ייבוא', 'Or choose the file': 'או לבחור את הקובץ',
  'That doesn’t look like a Study plan. Copy the whole block Claude gave you.': 'זה לא נראה כמו תוכנית. העתק את כל הבלוק ש־Claude נתן.', 'Plan imported': 'התוכנית יובאה',
  'Quick change in your own words': 'שינוי מהיר במילים שלך', 'Signed in as {x}': 'מחובר בתור {x}', 'Sun': 'א׳', 'Mon': 'ב׳', 'Tue': 'ג׳', 'Wed': 'ד׳', 'Thu': 'ה׳', 'Fri': 'ו׳', 'Sat': 'ש׳'
};
let LANG = (() => { try { return localStorage.getItem('sh:lang') === 'he' ? 'he' : 'en'; } catch (e) { return 'en'; } })();
function t(s, v) { let out = LANG === 'he' && HE[s] != null ? HE[s] : s; if (v) Object.keys(v).forEach(k => { out = out.split('{' + k + '}').join(v[k]); }); return out; }
const lang = () => LANG;
function setLang(l) {
  LANG = l === 'he' ? 'he' : 'en';
  try { localStorage.setItem('sh:lang', LANG); } catch (e) {}
  if (uid && !DEMO) saveSettings({ lang: LANG });
  location.reload();
}
const langToggle = () => '<div class="seg" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="' + (LANG === 'en') + '">EN</button><button type="button" data-lang="he" aria-pressed="' + (LANG === 'he') + '">עב</button></div>';
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-lang]'); if (b && b.dataset.lang !== LANG) setLang(b.dataset.lang); });

/* light / dark / auto (follows the phone) */
const theme = () => { try { const v = localStorage.getItem('sh:theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } };
function applyTheme(v) {
  if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
  try { if (v === 'light' || v === 'dark') localStorage.setItem('sh:theme', v); else localStorage.removeItem('sh:theme'); } catch (e) {}
}
function setTheme(v) { applyTheme(v); if (uid && !DEMO) saveSettings({ theme: v }); }

/* dates (Israel time) */
const TZ = 'Asia/Jerusalem';
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const nowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':'); return (+p[0]) * 60 + (+p[1]); };
const dayNum = k => Math.round(Date.parse(String(k).slice(0, 10) + 'T00:00:00Z') / 864e5);
const daysUntil = k => k ? dayNum(k) - dayNum(todayKey()) : null;
const dow = k => new Date(String(k).slice(0, 10) + 'T12:00:00Z').getUTCDay();
const addDays = (k, n) => new Date(Date.parse(k + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDay(k, long) {
  if (!k) return '';
  const d = new Date(String(k).slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat(LANG === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'UTC', weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short' }).format(d);
}
function rel(k) {
  const n = daysUntil(k);
  if (n == null) return '';
  if (n === 0) return t('today');
  if (n === 1) return t('tomorrow');
  if (n === -1) return t('yesterday');
  if (n < 0) return t('{n} days ago', { n: -n });
  if (n < 7) return t('in {n} days', { n });
  return fmtDay(k);
}
const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0');

/* ================= UI kit ================= */
let toastT = null;
function toast(msg, undo) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">' + esc(t('Undo')) + '</button>' : '');
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
function errorBanner() {
  const show = m => {
    let b = $('#err-banner');
    if (!b) { b = document.createElement('div'); b.id = 'err-banner'; b.className = 'err-banner'; b.onclick = () => b.remove(); document.body.appendChild(b); }
    b.textContent = 'Something broke (tap to hide): ' + m;
  };
  window.addEventListener('error', e => show(e.message || String(e)));
  window.addEventListener('unhandledrejection', e => show((e.reason && e.reason.message) || String(e.reason)));
}

/* navigation: bottom tabs on a phone, a top bar on a computer */
const TABS = [['today', '/', 'today', 'Today'], ['homework', '/homework.html', 'hw', 'Homework'], ['subjects', '/subjects.html', 'book', 'Subjects'], ['teachers', '/teachers.html', 'inbox', 'Teachers'], ['progress', '/progress.html', 'chart', 'Progress']];
function nav(active) {
  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = '<a class="brand" href="' + link('/') + '">Study</a><nav aria-label="Main">' +
    TABS.map(x => '<a href="' + link(x[1]) + '"' + (x[0] === active ? ' aria-current="page"' : '') + '>' + esc(t(x[0] === 'teachers' ? 'From teachers' : x[3])) + '</a>').join('') + '</nav>' +
    langToggle() + '<a class="btn" href="' + link('/record.html') + '"><span class="dot" style="background:#D92D20"></span>' + esc(t('Record lesson')) + '</a>' +
    '<a class="icon-btn" href="' + link('/settings.html') + '" aria-label="' + esc(t('Settings')) + '">' + ic('gear', 'sm') + '</a>';
  document.body.prepend(top);
  const tabs = document.createElement('nav');
  tabs.className = 'tabs'; tabs.setAttribute('aria-label', 'Main');
  tabs.innerHTML = '<div class="tabs-in">' + TABS.map(x => '<a class="tab" href="' + link(x[1]) + '"' + (x[0] === active ? ' aria-current="page"' : '') + '><span class="tab-ic">' + ic(x[2]) + '</span>' + esc(t(x[3])) + '</a>').join('') + '</div>';
  document.body.appendChild(tabs);
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
// settings object: the newer of the two copies wins (updatedAt)
const mergeObj = (a, b) => !isObj(a) ? (isObj(b) ? b : {}) : !isObj(b) ? a : (String(b.updatedAt || '') >= String(a.updatedAt || '') ? b : a);
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
    LISTS.forEach(k => { school.data[k] = mergeById(school.data[k], cloud[k]); });
    if (isObj(cloud[K.tt])) school.data[K.tt] = cloud[K.tt];
    school.data[K.set] = mergeObj(school.data[K.set], cloud[K.set]);
    school.ready = true;
    writeJSON(schoolLS(), school.data);
    const l = school.data[K.set] && school.data[K.set].lang;
    if (l && l !== LANG) { try { localStorage.setItem('sh:lang', l); } catch (e) {} }
    const th = school.data[K.set] && school.data[K.set].theme;
    if (th && th !== theme()) applyTheme(th);
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
      patch[k] = Array.isArray(school.data[k]) ? mergeById(cloud[k], school.data[k]) : k === K.set ? mergeObj(cloud[k], school.data[k]) : school.data[k];
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
const settings = () => Object.assign({ studyMins: 40, commuteMins: 60, latest: '22:00', week: [], teachLang: 'auto' }, school.data[K.set] || {});
function saveSettings(p) {
  school.data[K.set] = Object.assign({}, school.data[K.set] || {}, p, { updatedAt: stamp() });
  return school.save([K.set]);
}
const subjects = () => school.get(K.subj).filter(s => s && !s.hidden);
const subject = id => school.get(K.subj).find(s => s.id === id) || null;
const subjectName = id => { const s = subject(id); return s ? s.name : (id === 'inbox' ? t('Pick a subject') : 'General'); };
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
const openTests = () => school.get(K.te).filter(x => x && x.testDate && daysUntil(x.testDate) >= 0 && !x.hidden && !x.deleted).sort((a, b) => a.testDate.localeCompare(b.testDate));
const openHomework = () => school.get(K.as).filter(a => a && a.status !== 'Done' && !a.hidden && !a.deleted).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
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

/* ================= pulled in automatically: school site + Mashov =================
   Both write into the SHARED school row (tests, homework, grades) with stable ids, so the
   main Dashboard shows them too and two devices never create duplicates. Teacher messages
   go to study_materials (kind teacher_message) so the tutor can learn from them. */
const HE_SUBJ = { 'מתמטיקה': 'math', 'אנגלית': 'english', 'פיזיקה': 'physics', 'פיסיקה': 'physics', 'ביולוגיה': 'biology', 'כימיה': 'chemistry', 'היסטוריה': 'history', 'ספרות': 'literature', 'תנך': 'bible', 'תנ"ך': 'bible', 'אזרחות': 'civics', 'לשון': 'hebrew', 'עברית': 'hebrew', 'גאוגרפיה': 'geography', 'גיאוגרפיה': 'geography', 'מדעי המחשב': 'computerscience', 'ערבית': 'arabic', 'חינוך גופני': 'physicaleducation', 'רובוטיקה': 'robotics' };
const heNorm = s => String(s || '').replace(/["״׳']/g, '').replace(/\d+|יח"?ל|יחידות|מואץ|טכניונית|מעבדת|מעבדה|הקבצה|קבוצה/g, ' ').replace(/\s+/g, ' ').trim();
function subjectFromHe(he) {
  const n = heNorm(he);
  if (!n) return ensureSubject('General');
  const key = HE_SUBJ[n] || Object.keys(HE_SUBJ).filter(k => n.indexOf(k) >= 0).map(k => HE_SUBJ[k])[0];
  const flat = x => String(x || '').toLowerCase().replace(/[^a-z֐-׿]/g, '');
  const subs = school.get(K.subj);
  const hit = subs.find(s => key && (s.id === key || flat(s.name) === key || flat(s.name).indexOf(key.slice(0, 5)) === 0)) || subs.find(s => flat(s.name) === flat(n));
  if (hit) return hit.id;
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; // stable id: two devices never create two
  return ensureSubject(n, 'he-' + h.toString(36));
}
function subjectFromTeacher(name) {
  const mine = (school.data[K.tt] && school.data[K.tt].mine) || [];
  const last = String(name || '').trim().split(/\s+/).pop();
  const row = last && mine.find(m => String(m).split('|')[1] && String(m).split('|')[1].indexOf(last) >= 0);
  return row ? subjectFromHe(String(row).split('|')[0]) : null;
}
function subjectByName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  const hit = subjects().find(x => String(x.name).toLowerCase() === n) || subjects().find(x => { const a = String(x.name).toLowerCase(); return a.indexOf(n) === 0 || n.indexOf(a) === 0; });
  return hit ? hit.id : subjectFromHe(name);
}
const myClass = () => (school.data[K.tt] && school.data[K.tt].cls) || (school.data[K.set] && school.data[K.set].cls) || '';
const setMyClass = cls => saveSettings({ cls });
const syncState = { calendar: null, mashov: null };

async function syncCalendar() {
  const cls = myClass();
  if (!cls) { syncState.calendar = 'no class'; return 0; }
  const r = await fetch('/api/calendar?cls=' + encodeURIComponent(cls));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { syncState.calendar = j.error || 'school site unreachable'; return 0; }
  let added = 0, changed = false;
  const tests = school.get(K.te).slice();
  j.tests.forEach(c => {
    const linked = tests.findIndex(x => x && x.calUid === c.uid);
    if (linked >= 0) {
      const x = tests[linked];
      if (x.source === 'calendar' && (x.testDate !== c.date || x.name !== c.title)) { tests[linked] = Object.assign({}, x, { testDate: c.date, name: c.title, updatedAt: stamp() }); changed = true; }
      return;
    }
    const sid = subjectFromHe(c.subject || c.title);
    const sameDay = tests.findIndex(x => x && !x.calUid && x.testDate === c.date && x.subjectId === sid);
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
  try { j = await api('mashov'); } catch (e) { syncState.mashov = e.message; return 0; }
  let added = 0;
  const as = school.get(K.as).slice(), have = new Set(as.map(a => a.id));
  const cutoff = addDays(todayKey(), -14);
  (j.homework || []).forEach(h => {
    if (have.has(h.ref) || (h.given && h.given < cutoff && !h.due)) return;
    const first = h.text.split('\n')[0];
    as.push({ id: h.ref, subjectId: subjectFromHe(h.subject), title: first.length > 120 ? first.slice(0, 117) + '…' : first, type: 'Homework', dueDate: h.due || null, givenDate: h.given || null, priority: 'Medium', status: 'Not started', notes: h.text, source: 'mashov', createdAt: stamp(), updatedAt: stamp() });
    added++;
  });
  const gr = school.get(K.gr).slice(), haveG = new Set(gr.map(g => g.id));
  let newGrades = 0;
  (j.grades || []).forEach(g => {
    if (haveG.has(g.ref)) return;
    gr.push({ id: g.ref, subjectId: subjectFromHe(g.subject), type: 'Test', gradeValue: g.value, maxGrade: 100, date: g.date, weight: 1, notes: g.event || '', source: 'mashov', createdAt: stamp(), updatedAt: stamp() });
    newGrades++;
  });
  if (added || newGrades) { school.data[K.as] = as; school.data[K.gr] = gr; await school.save([K.subj, K.as, K.gr]); }
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
  return added + newGrades;
}
async function syncAll(force) {
  if (DEMO) return 0;
  const LS = 'sh:sync:' + uid, last = Number(localStorage.getItem(LS) || 0);
  if (!force && Date.now() - last < 30 * 60e3) return 0;
  try { localStorage.setItem(LS, String(Date.now())); } catch (e) {}
  const n = (await syncCalendar().catch(e => { syncState.calendar = e.message; return 0; })) + (await syncMashov().catch(e => { syncState.mashov = e.message; return 0; }));
  try { localStorage.setItem(LS + ':state', JSON.stringify({ at: Date.now(), calendar: syncState.calendar, mashov: syncState.mashov })); } catch (e) {}
  if (n) { toast(n + (LANG === 'he' ? ' חדשים מבית הספר' : ' new from school')); emitStudy(); }
  return n;
}
const lastSync = () => readJSON('sh:sync:' + uid + ':state');

/* the class timetable from the school site (today + 3 days, and the regular week) */
async function timetable() {
  const cls = myClass();
  if (DEMO) return demoTimetable();
  if (!cls) return null;
  const LS = 'sh:tt:' + cls, c = readJSON(LS);
  if (c && c.day === todayKey() && Date.now() - c.at < 3 * 3600e3) return c.data;
  try {
    const r = await fetch('/api/school?cls=' + encodeURIComponent(cls));
    const j = await r.json();
    if (j && j.ok) { writeJSON(LS, { at: Date.now(), day: todayKey(), data: j }); return j; }
  } catch (e) {}
  return c ? c.data : null;
}
function schoolPeriods(tt, dk) {
  if (!tt) return null;
  const d = tt.days && tt.days[dk];
  if (d && d.published) return d.periods.filter(p => p.status !== 'cancelled' && p.items && p.items.length).map(p => ({ start: p.start, end: p.end, subjects: p.items.map(x => x.subject || x) }));
  const base = tt.week && tt.week[dow(dk)];
  return base && base.length ? base.map(p => ({ start: p.start, end: p.end, subjects: p.items })) : [];
}
// the subject being taught right now, from the timetable ("Physics lesson 3, 10:15–11:00")
function currentLesson(tt) {
  const ps = schoolPeriods(tt, todayKey()) || [], m = nowMin();
  const mine = (school.data[K.tt] && school.data[K.tt].mine) || [];
  const p = ps.find(x => toMin(x.start) - 10 <= m && m < toMin(x.end)) || null;
  if (!p) return null;
  let he = p.subjects[0];
  if (p.subjects.length > 1) { const hit = p.subjects.find(s => mine.some(x => heNorm(String(x).split('|')[0]) === heNorm(s))); if (hit) he = hit; }
  return { he, subjectId: subjectFromHe(he), start: p.start, end: p.end };
}

/* ================= the planner =================
   Tonight's study block: the free time after school, the way home and your activities,
   spent on the topic of the nearest test you can't yet solve alone. */
function dayItems(dk, tt) {
  const s = settings(), items = [];
  const ps = schoolPeriods(tt, dk);
  const wd = dow(dk);
  if (ps && ps.length) items.push({ kind: 'school', start: toMin(ps[0].start), end: toMin(ps[ps.length - 1].end), label: t('School') });
  else if (!tt && wd <= 4) items.push({ kind: 'school', start: 465, end: 920, label: t('School') }); // no class set yet: 07:45–15:20
  const sch = items[0];
  if (sch && s.commuteMins > 0) items.push({ kind: 'way', start: sch.end + 10, end: sch.end + 10 + s.commuteMins, label: t('Way home') });
  (s.week || []).forEach(a => { if ((a.days || []).indexOf(wd) >= 0 && toMin(a.start) != null && toMin(a.end) != null) items.push({ kind: 'act', start: toMin(a.start), end: toMin(a.end), label: a.name }); });
  return items.sort((a, b) => a.start - b.start);
}
function freeWindows(items, from, to) {
  const busy = items.map(i => [i.start, i.end + (i.kind === 'act' ? 30 : 0)]).sort((a, b) => a[0] - b[0]);
  const out = []; let cur = from;
  busy.forEach(([a, b]) => { if (b <= cur) return; if (a > cur) out.push([cur, Math.min(a, to)]); cur = Math.max(cur, b); });
  if (cur < to) out.push([cur, to]);
  return out.filter(w => w[1] - w[0] >= 15);
}
function pickTarget(ctx) {
  const tests = openTests().filter(x => daysUntil(x.testDate) <= 14);
  for (const x of tests) {
    const tps = (ctx.topicsBySubj && ctx.topicsBySubj[x.subjectId]) || [];
    const todo = tps.filter(p => p.state === 'with_help').concat(tps.filter(p => p.state === 'new'));
    if (todo.length) return { kind: 'topic', test: x, subjectId: x.subjectId, topic: todo[0].name, state: todo[0].state, title: todo[0].name };
    if (tps.length) return { kind: 'practice', test: x, subjectId: x.subjectId, topic: '', title: t('Practice test') };
    const first = String(x.topics || '').split(/[,،;\n]/)[0].trim();
    return { kind: 'zero', test: x, subjectId: x.subjectId, topic: first, title: first || t('From zero: {x}', { x: x.name }) };
  }
  const hw = openHomework().find(a => a.dueDate && daysUntil(a.dueDate) <= 2 && daysUntil(a.dueDate) >= 0);
  if (hw) return { kind: 'homework', hw, subjectId: hw.subjectId, topic: hw.title, title: t('Homework: {x}', { x: hw.title }) };
  const last = (ctx.lessons || []).filter(l => l.status === 'ready').sort((a, b) => String(b.lesson_date).localeCompare(a.lesson_date))[0];
  if (last) return { kind: 'review', subjectId: last.subject_id, topic: (last.topics || [])[0] || last.title || '', title: t('Review: {x}', { x: last.title || subjectName(last.subject_id) }) };
  return null;
}
function plan(dk, tt, ctx) {
  const s = settings(), items = dayItems(dk, tt);
  const ov = (s.overrides || {})[dk] || {};
  const target = pickTarget(ctx || {});
  const close = target && target.test && daysUntil(target.test.testDate) <= 2;
  const want = ov.mins || ((+s.studyMins || 40) + (close ? 20 : 0));
  const start = Math.max(dk === todayKey() ? nowMin() + 5 : 0, 14 * 60);
  const latest = toMin(s.latest) || 1320;
  let block = null;
  if (ov.skip) return { dk, items: items.slice(), block: null, target, want, skipped: true, ov };
  // a study session planned with Claude for this day wins over the automatic pick
  const ses = (s.sessions || []).find(x => x.date === dk && toMin(x.start) != null);
  if (ses) {
    const sid = subjectByName(ses.subject), test = openTests().find(x => x.subjectId === sid);
    const tgt = { kind: 'planned', subjectId: sid, topic: ses.topic || '', title: ses.topic || ses.subject || t('Study'), test, goal: ses.goal || '' };
    const st = ov.start ? toMin(ov.start) : toMin(ses.start), len = ov.mins || Math.max(15, (toMin(ses.end) || st + 40) - toMin(ses.start));
    const all = items.concat([{ kind: 'study', start: st, end: st + len, label: t('Study: {x}', { x: tgt.title }) }]).sort((a, b) => a.start - b.start);
    const lastEnd = Math.max.apply(null, all.map(i => i.end));
    if (lastEnd < latest - 30) all.push({ kind: 'free', start: lastEnd, end: latest, label: t('Free') });
    return { dk, items: all, block: { start: st, end: st + len, mins: len }, target: tgt, want: len, ov };
  }
  if (ov.start && target && toMin(ov.start) != null) {
    const st = toMin(ov.start);
    block = { start: st, end: st + want, mins: want };
  } else {
    const wins = freeWindows(items, start, latest);
    const fit = wins.find(w => w[1] - w[0] >= want) || wins.find(w => w[1] - w[0] >= 20);
    if (fit && target) {
      const st = Math.ceil(fit[0] / 10) * 10, len = Math.min(want, fit[1] - st);
      if (len >= 15) block = { start: st, end: st + len, mins: len };
    }
  }
  const all = items.slice();
  if (block) all.push({ kind: 'study', start: block.start, end: block.end, label: t('Study: {x}', { x: target.title }) });
  all.sort((a, b) => a.start - b.start);
  const lastEnd = all.length ? Math.max.apply(null, all.map(i => i.end)) : null;
  if (lastEnd != null && lastEnd < (toMin(s.latest) || 1320) - 30) all.push({ kind: 'free', start: lastEnd, end: toMin(s.latest) || 1320, label: t('Free') });
  return { dk, items: all, block, target, want, ov };
}
// tonight's change ("not tonight", "shorter", "at 21:00"), synced; old days are pruned
function setTonight(dk, ov) {
  const all = Object.assign({}, settings().overrides || {}), from = addDays(todayKey(), -3);
  Object.keys(all).forEach(k => { if (k < from) delete all[k]; });
  if (ov) all[dk] = ov; else delete all[dk];
  return saveSettings({ overrides: all });
}
// school hours per weekday, for the week assistant
function schoolHours(tt) {
  const out = {};
  [0, 1, 2, 3, 4, 5].forEach(d => { const base = tt && tt.week && tt.week[d]; if (base && base.length) out[DOWS[d]] = base[0].start + '–' + base[base.length - 1].end; });
  return out;
}
const skipKey = dk => 'sh:skip:' + uid + ':' + dk;
const doneKey = dk => 'sh:done:' + uid + ':' + dk;

/* ================= study tables ================= */
const T = { lessons: 'study_lessons', materials: 'study_materials', topics: 'study_topics', attempts: 'study_attempts', chats: 'study_chats' };
async function rows(table, filter, order, limit, extra) {
  if (DEMO) return demoRows(table, filter);
  await fresh();
  let q = sb().from(table).select('*');
  Object.keys(filter || {}).forEach(k => { q = Array.isArray(filter[k]) ? q.in(k, filter[k]) : q.eq(k, filter[k]); });
  if (extra && extra.since) q = q.gte(extra.since[0], extra.since[1]);
  if (order) q = q.order(order, { ascending: false });
  if (limit) q = q.limit(limit);
  const r = await q;
  if (r.error) { if (/relation .* does not exist|column .* does not exist/i.test(r.error.message || '')) throw new Error('Run the updated supabase/schema.sql in Supabase.'); throw r.error; }
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

/* ================= graphs: ```plot {json} blocks from the tutor =================
   A tiny safe formula reader (no eval): numbers, x or t, + - * / ^, ( ), pi, e,
   sqrt abs sin cos tan ln log exp, implicit multiplication like 2x or 3(x+1). */
const FN = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp };
function compile(src) {
  const s = String(src).replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\s+/g, '').toLowerCase();
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ n: parseFloat(s.slice(i, j)) }); i = j; continue; }
    if (/[a-z]/.test(c)) { let j = i; while (j < s.length && /[a-z]/.test(s[j])) j++; let w = s.slice(i, j);
      // split runs like "xsin" or "2pix" into known words
      while (w) { const k = ['sqrt', 'abs', 'sin', 'cos', 'tan', 'exp', 'log', 'ln', 'pi', 'x', 't', 'e'].find(z => w.indexOf(z) === 0); if (!k) throw new Error('unknown ' + w); toks.push({ w: k }); w = w.slice(k.length); }
      i = j; continue; }
    if ('+-*/^()'.indexOf(c) >= 0) { toks.push({ o: c }); i++; continue; }
    throw new Error('bad char ' + c);
  }
  let p = 0;
  const peek = () => toks[p], take = () => toks[p++];
  const startsPrimary = tk => tk && (tk.n != null || tk.w || tk.o === '(');
  function expr() { let a = term(); while (peek() && (peek().o === '+' || peek().o === '-')) { const o = take().o, b = term(), A = a; a = o === '+' ? x => A(x) + b(x) : x => A(x) - b(x); } return a; }
  function term() { let a = unary(); for (;;) { const tk = peek(); if (tk && (tk.o === '*' || tk.o === '/')) { const o = take().o, b = unary(), A = a; a = o === '*' ? x => A(x) * b(x) : x => A(x) / b(x); } else if (startsPrimary(tk)) { const b = power(), A = a; a = x => A(x) * b(x); } else return a; } }
  function unary() { if (peek() && peek().o === '-') { take(); const a = unary(); return x => -a(x); } if (peek() && peek().o === '+') { take(); return unary(); } return power(); }
  function power() { const a = primary(); if (peek() && peek().o === '^') { take(); const b = unary(); return x => Math.pow(a(x), b(x)); } return a; }
  function primary() {
    const tk = take(); if (!tk) throw new Error('end');
    if (tk.n != null) { const v = tk.n; return () => v; }
    if (tk.o === '(') { const a = expr(); if (!peek() || peek().o !== ')') throw new Error(')'); take(); return a; }
    if (tk.w === 'x' || tk.w === 't') return x => x;
    if (tk.w === 'pi') return () => Math.PI;
    if (tk.w === 'e') return () => Math.E;
    if (FN[tk.w]) { const f = FN[tk.w], a = (peek() && peek().o === '(') ? primary() : power(); return x => f(a(x)); }
    throw new Error('?');
  }
  const f = expr();
  if (p !== toks.length) throw new Error('extra');
  return f;
}
function niceStep(range) { const r = range / 5, e = Math.pow(10, Math.floor(Math.log10(r))), m = r / e; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * e; }
function plotSVG(spec) {
  const W = 360, H = 240, L = 36, R = 12, Tp = 14, B = 28;
  const fns = (spec.fns || []).map(f => typeof f === 'string' ? { f } : f).filter(f => f && f.f);
  const comp = fns.map(f => { try { return compile(f.f); } catch (e) { return null; } });
  let x0 = +((spec.x || [])[0]), x1 = +((spec.x || [])[1]);
  if (!isFinite(x0) || !isFinite(x1) || x1 <= x0) { x0 = -5; x1 = 5; }
  const N = 160, samples = comp.map(f => { const pts = []; for (let k = 0; k <= N; k++) { const x = x0 + (x1 - x0) * k / N; let y = NaN; try { y = f ? f(x) : NaN; } catch (e) {} pts.push([x, y]); } return pts; });
  let y0 = +((spec.y || [])[0]), y1 = +((spec.y || [])[1]);
  if (!isFinite(y0) || !isFinite(y1) || y1 <= y0) {
    const ys = [].concat.apply([], samples.map(s => s.map(p => p[1]))).filter(isFinite);
    (spec.points || []).forEach(q => ys.push(+q.y)); (spec.segs || []).forEach(g => ys.push(+g[1], +g[3]));
    ys.sort((a, b) => a - b);
    y0 = ys.length ? ys[Math.floor(ys.length * 0.02)] : -5; y1 = ys.length ? ys[Math.ceil(ys.length * 0.98) - 1] : 5;
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  }
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => Tp + (y1 - y) / (y1 - y0) * (H - Tp - B);
  const ax = Math.min(Math.max(0, y0), y1), ay = Math.min(Math.max(0, x0), x1);
  const colors = ['var(--ink)', 'var(--accent)', '#2F6FE0', '#2E7D4F'];
  const cid = 'pc' + Math.random().toString(36).slice(2, 8);
  let g = '<defs><clipPath id="' + cid + '"><rect x="' + L + '" y="' + Tp + '" width="' + (W - L - R) + '" height="' + (H - Tp - B) + '"/></clipPath></defs>';
  const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0), fmt = v => String(Math.round(v * 1000) / 1000);
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) g += '<line x1="' + X(v) + '" x2="' + X(v) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="var(--line)"/>' + '<text x="' + X(v) + '" y="' + (H - B + 16) + '" font-size="11" text-anchor="middle" fill="var(--ink-3)">' + fmt(v) + '</text>';
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/>' + '<text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" font-size="11" text-anchor="end" fill="var(--ink-3)">' + fmt(v) + '</text>';
  g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(ax) + '" y2="' + Y(ax) + '" stroke="var(--ink-3)" stroke-width="1.3"/><line x1="' + X(ay) + '" x2="' + X(ay) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="var(--ink-3)" stroke-width="1.3"/>';
  samples.forEach((pts, k) => {
    let d = '', pen = false;
    pts.forEach(([x, y]) => { if (!isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); pen = true; });
    if (d) g += '<path d="' + d + '" fill="none" stroke="' + colors[k % 4] + '" stroke-width="2.4" stroke-linejoin="round" clip-path="url(#' + cid + ')"/>';
    const lab = fns[k].label; if (lab) { const last = pts.filter(p => isFinite(p[1]) && p[1] >= y0 && p[1] <= y1).pop(); if (last) g += '<text x="' + Math.min(X(last[0]), W - R - 4) + '" y="' + Math.max(Y(last[1]) - 6, Tp + 10) + '" font-size="12" font-weight="700" text-anchor="end" fill="' + colors[k % 4] + '">' + esc(lab) + '</text>'; }
  });
  (spec.segs || []).forEach(sg => { if (sg && sg.length >= 4) g += '<line x1="' + X(+sg[0]) + '" y1="' + Y(+sg[1]) + '" x2="' + X(+sg[2]) + '" y2="' + Y(+sg[3]) + '" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" clip-path="url(#' + cid + ')"/>'; });
  (spec.points || []).forEach(q => { if (!isFinite(+q.x) || !isFinite(+q.y)) return; g += '<circle cx="' + X(+q.x) + '" cy="' + Y(+q.y) + '" r="5" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.6"/>'; if (q.label) g += '<text x="' + (X(+q.x) + 8) + '" y="' + (Y(+q.y) + 15) + '" font-size="12" font-weight="600" fill="var(--ink)">' + esc(q.label) + '</text>'; });
  if (spec.xlabel) g += '<text x="' + (W - R) + '" y="' + (H - 4) + '" font-size="12" text-anchor="end" fill="var(--ink-2)">' + esc(spec.xlabel) + '</text>';
  if (spec.ylabel) g += '<text x="' + (L + 4) + '" y="' + (Tp - 2) + '" font-size="12" fill="var(--ink-2)">' + esc(spec.ylabel) + '</text>';
  const alt = (fns.map(f => f.label || f.f).concat((spec.points || []).map(q => q.label || '')).filter(Boolean).join(', ')) || 'graph';
  return '<svg class="plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Graph: ' + alt) + '" font-family="Rubik, sans-serif">' + g + '</svg>';
}

/* markdown + math + graphs for AI text (raw HTML from the model is never rendered) */
function renderRich(el, text) {
  const plots = [];
  let src = String(text || '').replace(/```plot\s*\n?([\s\S]*?)```/g, (_, j) => { plots.push(j); return '\n\nPLOTBLOCK' + (plots.length - 1) + '\n\n'; });
  const safe = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const math = [];
  const held = safe.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => { math.push(m); return '\u0000' + (math.length - 1) + '\u0000'; });
  let html = window.marked ? window.marked.parse(held, { breaks: true, gfm: true }) : '<p>' + held.replace(/\n/g, '<br>') + '</p>';
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => math[+i]);
  html = html.replace(/(?:<p>)?PLOTBLOCK(\d+)(?:<\/p>)?/g, (_, i) => { try { return plotSVG(JSON.parse(plots[+i])); } catch (e) { return ''; } });
  el.innerHTML = html;
  el.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  if (window.renderMathInElement) {
    try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, ignoredTags: ['svg', 'script', 'noscript', 'style', 'textarea', 'pre', 'code'] }); } catch (e) {}
  }
}

/* ================= + Add sheet ================= */
const ADD = [
  { k: 'lesson', t: 'Lesson recording', d: 'Upload a recording' },
  { k: 'board', t: 'Board photo', d: 'What the teacher wrote' },
  { k: 'teacher_summary', t: 'Teacher summary', d: 'Paste from WhatsApp' },
  { k: 'notes', t: 'Notes', d: 'Photo or PDF' },
  { k: 'old_test', t: 'Old test', d: 'Sets the tutor’s level' },
  { k: 'worksheet', t: 'Worksheet', d: 'Photo or PDF' },
  { k: 'homework', t: 'Homework', d: 'Shows in your Dashboard too' },
  { k: 'test', t: 'Test date', d: 'Shows in your Dashboard too' }
];
function subjectField(sel) {
  const list = subjects();
  const last = sel || readJSON('sh:lastSubject');
  return '<label class="field"><span>' + esc(t('Subject')) + '</span><select name="subject">' +
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
function openAdd(subjectId, onDone, only) {
  const list = only ? ADD.filter(a => only.indexOf(a.k) >= 0) : ADD;
  if (list.length === 1) return openAddForm(list[0].k, subjectId, onDone);
  sheet('<h2>' + esc(t('Add')) + '</h2><div class="add-grid">' + list.map(a => '<button class="add-opt" data-k="' + a.k + '"><b>' + esc(t(a.t)) + '</b><span>' + esc(a.d) + '</span></button>').join('') + '</div>', s => {
    s.querySelectorAll('.add-opt').forEach(b => { b.onclick = () => openAddForm(b.dataset.k, subjectId, onDone); });
  });
}
function openAddForm(kind, subjectId, onDone) {
  const meta = ADD.find(a => a.k === kind);
  const today = todayKey();
  let inner = subjectField(subjectId);
  if (kind === 'lesson') inner += '<label class="field"><span>Lesson date</span><input type="date" name="date" value="' + today + '"></label>' +
    '<label class="file-pick"><input type="file" name="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm">Choose the recording</label>' +
    '<p class="hint">Up to 25 MB (about 45 min of Voice Memos at “Compressed” quality). Or record straight in Study: Record lesson.</p>';
  else if (kind === 'teacher_summary') inner += '<label class="field"><span>Paste the text</span><textarea name="text" dir="auto" placeholder="Long-press the teacher’s message in WhatsApp → Copy, then paste here"></textarea></label>';
  else if (kind === 'homework') inner += '<label class="field"><span>What</span><input name="title" dir="auto" placeholder="e.g. Questions 4–7, page 112" autocomplete="off"></label><label class="field"><span>Due</span><input type="date" name="date" value="' + addDays(today, 1) + '"></label>';
  else if (kind === 'test') inner += '<label class="field"><span>Test name</span><input name="title" dir="auto" placeholder="e.g. Kinematics test" autocomplete="off"></label><label class="field"><span>Date</span><input type="date" name="date" value="' + addDays(today, 7) + '"></label><label class="field"><span>Topics (optional)</span><input name="topics" dir="auto" placeholder="e.g. free fall, two bodies meeting" autocomplete="off"></label>';
  else inner += '<label class="file-pick"><input type="file" name="file" accept="image/*,application/pdf"' + (kind === 'board' ? ' capture="environment"' : '') + '>' + (kind === 'board' ? 'Take or choose a photo' : 'Choose a photo or PDF') + '</label><label class="field"><span>Title (optional)</span><input name="title" dir="auto" autocomplete="off"></label>' +
    (kind === 'old_test' ? '<p class="hint">Old tests teach the tutor your teacher’s level. Add every one you can get.</p>' : '');
  sheet('<h2>' + esc(t(meta.t)) + '</h2><form class="form" novalidate>' + inner + '<button class="btn accent block" type="submit">' + esc(t('Save')) + '</button></form>', s => {
    wireSubject(s);
    const f = s.querySelector('form');
    const fileIn = f.querySelector('input[type=file]');
    if (fileIn) fileIn.onchange = () => { if (fileIn.files[0]) fileIn.parentElement.lastChild.textContent = fileIn.files[0].name; };
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = t('Saving…');
      try {
        const sid = await pickedSubject(f);
        await saveAdd(kind, sid, f);
        closeSheet();
        if (onDone) onDone(sid);
      } catch (err) {
        btn.disabled = false; btn.textContent = t('Save');
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
    await uploadLessonAudio(file, sid, f.date.value || todayKey());
    return;
  }
  await uploadMaterial(kind, sid, file, (f.title && f.title.value.trim()) || null);
}
async function uploadLessonAudio(file, sid, date, extra) {
  if (file.size > 25 * 1024 * 1024) throw new Error('That recording is ' + Math.round(file.size / 1048576) + ' MB. The limit is 25 MB: record in two parts, or use “Compressed” quality.');
  const ext = (file.type && /mp4|m4a|aac/.test(file.type)) ? 'm4a' : (file.type && /webm/.test(file.type)) ? 'webm' : (file.name && file.name.split('.').pop() || 'm4a').toLowerCase();
  const path = await upload('audio', file, ext);
  let lesson;
  if (extra && extra.lessonId) { await update(T.lessons, extra.lessonId, { status: 'uploaded', audio_path: path }); lesson = { id: extra.lessonId }; }
  else lesson = await insert(T.lessons, { subject_id: sid, lesson_date: date, status: 'uploaded', audio_path: path });
  toast('Uploaded. Transcribing (about a minute)…');
  api('transcribe', { lessonId: lesson.id, subjectName: subjectName(sid) })
    .then(() => { toast('Lesson ready'); emitStudy(); })
    .catch(err => { toast('Transcription failed: ' + err.message); emitStudy(); });
  return lesson;
}
async function uploadMaterial(kind, sid, file, title, extra) {
  let blob = file, ext = 'pdf', mime = 'application/pdf';
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name || '')) { blob = (await shrinkImage(file, 2000, 0.85)).blob; ext = 'jpg'; mime = 'image/jpeg'; }
  if (blob.size > 30 * 1024 * 1024) throw new Error('That file is too big (max 30 MB).');
  const path = await upload(kind, blob, ext);
  const m = await insert(T.materials, Object.assign({ subject_id: sid, kind, title, file_path: path, mime, status: 'uploaded', taken_at: stamp() }, extra || {}));
  if (!(extra && extra.quiet)) toast('Uploaded. Reading it…');
  api('read-file', { materialId: m.id, subjectName: subjectName(sid) })
    .then(() => { if (!(extra && extra.quiet)) toast('Read and saved'); emitStudy(); })
    .catch(err => { toast('Couldn’t read it: ' + err.message); emitStudy(); });
  return m;
}
/* ================= talk to the planner =================
   "Tell me about your week" and "Change tonight": he says it in his own words, the AI turns it
   into settings and asks one question when something's missing. */
function chatSheet(opts) {
  const msgs = [];
  sheet('<h2>' + esc(opts.title) + '</h2>' + (opts.intro ? '<p class="hint" style="margin-bottom:10px">' + esc(opts.intro) + '</p>' : '') +
    '<div id="cs-top"></div><div id="cs-log" style="display:flex;flex-direction:column;gap:10px;margin:10px 0"></div>' +
    '<form class="ask" id="cs-f"><textarea id="cs-in" rows="2" dir="auto" placeholder="' + esc(opts.placeholder) + '" aria-label="' + esc(opts.title) + '"></textarea><button class="icon-btn" type="submit" aria-label="' + esc(t('Send')) + '" style="background:var(--ink);color:var(--ground)">' + ic('send', 'flip') + '</button></form>' +
    '<div id="cs-end" style="margin-top:12px"></div>', sh => {
    const log = sh.querySelector('#cs-log'), inp = sh.querySelector('#cs-in');
    if (opts.top) opts.top(sh.querySelector('#cs-top'), say);
    const add = (role, text) => { const d = document.createElement('div'); d.dir = 'auto'; if (role === 'user') { d.className = 'me-line'; d.textContent = text; } else { d.className = 'card'; d.style.fontSize = '15px'; d.textContent = text; } log.appendChild(d); };
    async function say(text) {
      text = String(text || '').trim(); if (!text) return;
      msgs.push({ role: 'user', text }); add('user', text); inp.value = '';
      const wait = document.createElement('div'); wait.className = 'thinking'; wait.textContent = t('Thinking…'); log.appendChild(wait);
      try {
        const r = await api('week', Object.assign({ mode: opts.mode, lang: LANG, messages: msgs, today: fmtDay(todayKey(), true) + ' ' + todayKey() }, opts.context()));
        wait.remove();
        const reply = [r.reply, r.question].filter(Boolean).join(' ');
        msgs.push({ role: 'assistant', text: reply }); add('assistant', reply);
        await opts.apply(r);
        const end = sh.querySelector('#cs-end');
        end.innerHTML = '<button class="btn big dark block" id="cs-ok">' + esc(t('Looks right')) + '</button>';
        end.querySelector('#cs-ok').onclick = () => { closeSheet(); if (opts.done) opts.done(); };
      } catch (e) { wait.remove(); toast(e.message); }
    }
    sh.querySelector('#cs-f').onsubmit = e => { e.preventDefault(); say(inp.value); };
    if (opts.first) say(opts.first);
  });
}
/* ================= plan the week in Claude (no API cost) =================
   The app writes a prompt with everything it knows; Claude interviews him and ends with a
   ```studyhub JSON block; he pastes it back here (or uploads it as a file). */
function claudePrompt(tt, ctx) {
  ctx = ctx || {};
  const s = settings(), he = LANG === 'he';
  const tests = openTests().filter(x => daysUntil(x.testDate) <= 21).map(x => ({
    subject: subjectName(x.subjectId), name: x.name, date: x.testDate, topics: x.topics || '',
    readiness: ((ctx.topicsBySubj || {})[x.subjectId] || []).map(p => p.name + ': ' + ({ alone: 'solved alone', with_help: 'only with help', new: 'not started' }[p.state] || p.state))
  }));
  const hw = openHomework().filter(a => a.dueDate && daysUntil(a.dueDate) >= 0 && daysUntil(a.dueDate) <= 7).map(a => ({ subject: subjectName(a.subjectId), what: a.title, due: a.dueDate }));
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(todayKey(), i); days.push(d + ' (' + DOWS[dow(d)] + ')'); }
  return [
    'You are my study planner. I\'m an 11th-grade student in Israel (school Sunday–Thursday). I train and have robotics, I come home tired, and I keep failing tests because I study too late and too guided. Help me build a realistic plan for this week.',
    he ? 'Talk to me in Hebrew.' : 'Talk to me in English.',
    '',
    'First ASK ME questions, one or two at a time, until you really know my week: my fixed activities and their times, how long my way home takes, when I\'m too tired to study, how late I can study, how long I can focus, and anything special this week. Don\'t write the plan before you\'ve asked.',
    '',
    'Then plan study sessions for the next 7 days: short (20–60 min), in my free time, more as a test gets closer, starting with the topics I can\'t yet solve alone. Rest is allowed. Show me the plan as a short readable list and let me change it.',
    '',
    'What my study app already knows:',
    '- Today: ' + todayKey() + ' (' + DOWS[dow(todayKey())] + '). The next 7 days: ' + days.join(', '),
    '- School hours by weekday: ' + JSON.stringify(schoolHours(tt)),
    '- My fixed activities so far: ' + JSON.stringify((s.week || []).map(a => ({ name: a.name, days: a.days, start: a.start, end: a.end }))),
    '- Preferences so far: ' + JSON.stringify({ studyMins: s.studyMins, latest: s.latest, commuteMins: s.commuteMins }),
    '- Upcoming tests: ' + JSON.stringify(tests),
    '- Homework due this week: ' + JSON.stringify(hw),
    '',
    'When I say the plan is good, END with exactly one code block in this format, so I can import it into my app (days: 0=Sunday … 6=Saturday, times HH:MM 24h, subject names as I wrote them above):',
    '```studyhub',
    '{"version":1,"week":[{"name":"Volleyball","days":[1,2],"start":"17:00","end":"19:00"}],"studyMins":40,"latest":"22:00","commuteMins":60,"sessions":[{"date":"' + todayKey() + '","start":"19:30","end":"20:10","subject":"Maths","topic":"tangent lines","goal":"solve 2 test questions alone"}]}',
    '```'
  ].join('\n');
}
function openClaude(tt, ctx) {
  const text = claudePrompt(tt, ctx);
  let copied = false;
  try { if (navigator.clipboard) { navigator.clipboard.writeText(text); copied = true; } } catch (e) {}
  if (!copied) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  toast(t('Prompt copied: paste it in Claude.'));
  window.open(text.length < 6000 ? 'https://claude.ai/new?q=' + encodeURIComponent(text) : 'https://claude.ai/new', '_blank', 'noopener');
}
const hh = v => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null;
function parsePlan(text) {
  const src = String(text || '');
  const m = src.match(/```studyhub\s*([\s\S]*?)```/) || src.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[1]); } catch (e) { return null; }
  if (!isObj(j)) return null;
  const out = {};
  if (Array.isArray(j.week)) out.week = j.week.map(a => ({ id: newId(), name: String(a.name || '').slice(0, 40), days: (a.days || []).map(Number).filter(d => d >= 0 && d <= 6), start: hh(a.start), end: hh(a.end) })).filter(a => a.name && a.days.length && a.start && a.end && a.end > a.start);
  if (+j.studyMins > 0) out.studyMins = Math.min(180, Math.round(+j.studyMins));
  if (hh(j.latest)) out.latest = hh(j.latest);
  if (j.commuteMins != null && +j.commuteMins >= 0) out.commuteMins = Math.min(180, Math.round(+j.commuteMins));
  if (Array.isArray(j.sessions)) out.sessions = j.sessions.map(x => ({ date: String(x.date || '').slice(0, 10), start: hh(x.start), end: hh(x.end), subject: String(x.subject || '').slice(0, 40), topic: String(x.topic || '').slice(0, 80), goal: String(x.goal || '').slice(0, 120) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.start && x.end && x.end > x.start);
  return Object.keys(out).length ? out : null;
}
async function importPlan(p) {
  const patch = Object.assign({}, p);
  if (p.sessions) {
    const dates = new Set(p.sessions.map(x => x.date)), from = addDays(todayKey(), -1);
    patch.sessions = (settings().sessions || []).filter(x => x.date >= from && !dates.has(x.date)).concat(p.sessions);
  }
  await saveSettings(patch);
}
function importSheet(done) {
  sheet('<h2>' + esc(t('Import from Claude')) + '</h2><p class="hint" style="margin-bottom:10px">' + esc(t('Paste what Claude gave you at the end (or upload the file).')) + '</p>' +
    '<form class="form" id="imp-f"><label class="field"><textarea name="text" dir="ltr" placeholder="```studyhub&#10;{ … }&#10;```" style="font-family:ui-monospace,monospace;font-size:14px"></textarea></label>' +
    '<label class="file-pick"><input type="file" name="file" accept=".json,.txt,.md,application/json,text/plain">' + esc(t('Or choose the file')) + '</label>' +
    '<div id="imp-prev"></div><button class="btn big dark block" type="submit">' + esc(t('Import')) + '</button></form>', sh => {
    const f = sh.querySelector('#imp-f'), prev = sh.querySelector('#imp-prev');
    const show = () => {
      const p = parsePlan(f.text.value);
      prev.innerHTML = p ? '<div class="card" style="font-size:14px">' + (p.week ? '<div>' + p.week.length + (LANG === 'he' ? ' פעילויות קבועות' : ' fixed activities') + ': ' + esc(p.week.map(a => a.name).join(', ')) + '</div>' : '') +
        (p.sessions ? '<div>' + p.sessions.length + (LANG === 'he' ? ' זמני למידה' : ' study sessions') + ': ' + esc(p.sessions.slice(0, 4).map(x => DOWS[dow(x.date)] + ' ' + x.start + ' ' + (x.topic || x.subject)).join(' · ')) + (p.sessions.length > 4 ? '…' : '') + '</div>' : '') + '</div>' : '';
    };
    f.text.addEventListener('input', show);
    f.file.onchange = () => { const file = f.file.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { f.text.value = String(r.result || ''); show(); }; r.readAsText(file); };
    f.onsubmit = async e => {
      e.preventDefault();
      const p = parsePlan(f.text.value);
      if (!p) return toast(t('That doesn’t look like a Study plan. Copy the whole block Claude gave you.'));
      await importPlan(p);
      closeSheet(); toast(t('Plan imported')); if (done) done();
    };
  });
}

function weekSummary(el) {
  const wk = settings().week || [];
  el.innerHTML = wk.length ? '<div class="list" style="box-shadow:none;background:var(--surface)">' + wk.map(a => '<div class="item"><span class="body"><span class="ttl" dir="auto">' + esc(a.name) + '</span><span class="meta">' + esc((a.days || []).map(d => t(DOWS[d])).join(', ')) + ' · <span dir="ltr">' + esc(a.start + '–' + a.end) + '</span></span></span></div>').join('') + '</div>' : '';
}
let ctxForPrompt = {};
function weekChat(tt, done, ctx) {
  if (ctx) ctxForPrompt = ctx;
  chatSheet({
    mode: 'week', title: t('Tell me about your week'), intro: t('Like you’d tell a friend: practices, gym, how long the way home takes, how late you can study.'),
    placeholder: t('e.g. Volleyball Mon and Tue 5–7, robotics Sunday after school till 8, I can study till 10'),
    top: el => {
      el.innerHTML = '<div class="grid2" style="margin-bottom:10px"><button class="btn dark" id="wc-claude">' + esc(t('Plan my week with Claude')) + '</button><button class="btn" id="wc-imp">' + esc(t('Import from Claude')) + '</button></div><div id="wc-sum"></div><span class="label" style="display:block;margin-top:12px">' + esc(t('Quick change in your own words')) + '</span>';
      el.querySelector('#wc-claude').onclick = () => openClaude(tt, ctxForPrompt);
      el.querySelector('#wc-imp').onclick = () => importSheet(done);
      weekSummary(el.querySelector('#wc-sum'));
    },
    context: () => { const s = settings(); return { week: s.week || [], prefs: { studyMins: s.studyMins, latest: s.latest, commuteMins: s.commuteMins }, school: schoolHours(tt) }; },
    apply: async r => {
      const p = {};
      if (Array.isArray(r.week)) p.week = r.week.map(a => Object.assign({ id: newId() }, a));
      if (r.studyMins) p.studyMins = r.studyMins;
      if (r.latest) p.latest = r.latest;
      if (r.commuteMins != null) p.commuteMins = r.commuteMins;
      if (Object.keys(p).length) await saveSettings(p);
      const top = $('#wc-sum'); if (top) weekSummary(top);
    },
    done
  });
}
function tonightSheet(dk, p, done) {
  const quick = [[t('Not tonight'), { skip: true }], [t('Shorter · 20 min'), { mins: 20 }], [t('Later tonight'), { start: '21:00' }]];
  chatSheet({
    mode: 'tonight', title: t('Change tonight'), placeholder: t('Or tell me what’s going on…'),
    top: el => {
      el.innerHTML = '<div class="chips">' + quick.map((q, i) => '<button class="chip" data-q="' + i + '">' + esc(q[0]) + '</button>').join('') + (p.ov && Object.keys(p.ov).length ? '<button class="chip" data-q="reset">' + esc(t('Undo')) + '</button>' : '') + '</div>';
      el.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {
        await setTonight(dk, b.dataset.q === 'reset' ? null : quick[+b.dataset.q][1]);
        closeSheet(); toast(t('Tonight changed')); if (done) done();
      });
    },
    context: () => ({ tonight: p.block ? { start: hm(p.block.start), end: hm(p.block.end), topic: p.target && p.target.title, test: p.target && p.target.test ? p.target.test.testDate : null } : null }),
    apply: async r => { if (r.skip) await setTonight(dk, { skip: true }); else if (r.start || r.mins) await setTonight(dk, Object.assign({}, r.start ? { start: r.start } : {}, r.mins ? { mins: r.mins } : {})); },
    done
  });
}

const studySubs = [];
const onStudy = f => studySubs.push(f);
const emitStudy = () => studySubs.forEach(f => { try { f(); } catch (e) {} });

/* ================= demo data (?demo: no login, no network, no storage writes) ================= */
function demoSchool() {
  const d = todayKey();
  return {
    [K.subj]: [{ id: 'phys', name: 'Physics', color: '#1F5AE0' }, { id: 'math', name: 'Maths', color: '#6A43E8' }, { id: 'eng', name: 'English', color: '#FF5A2B' }],
    [K.te]: [
      { id: 't1', subjectId: 'math', name: 'Maths retest', testDate: addDays(d, 2), topics: 'Derivatives, tangent lines' },
      { id: 't2', subjectId: 'phys', name: 'Kinematics test', testDate: addDays(d, 12), topics: 'Free fall, two bodies meeting, graphs', source: 'calendar', calUid: 'x' }
    ],
    [K.as]: [
      { id: 'mashov-hw-1', subjectId: 'phys', title: 'דף עבודה 4, שאלות 1–3', dueDate: addDays(d, 1), givenDate: addDays(d, -1), status: 'Not started', source: 'mashov', notes: 'דף עבודה 4, שאלות 1–3. להגיש ביום רביעי.' },
      { id: 'a2', subjectId: 'eng', title: 'Essay draft', dueDate: addDays(d, 3), status: 'Not started', source: 'ofek' },
      { id: 'mashov-hw-2', subjectId: 'math', title: 'תרגילים 12–18 עמוד 40', dueDate: addDays(d, 2), status: 'Not started', source: 'mashov' },
      { id: 'a3', subjectId: 'math', title: 'Worksheet 3', dueDate: addDays(d, -1), status: 'Done', completedAt: stamp() }
    ],
    [K.gr]: [{ id: 'mashov-gr-1', subjectId: 'phys', gradeValue: 60, maxGrade: 100, date: addDays(d, -10), notes: 'מבחן קינמטיקה', source: 'mashov' }],
    [K.set]: { cls: '11-3', week: [{ id: 'w1', name: 'Volleyball', days: [1, 2], start: '17:00', end: '19:00' }, { id: 'w2', name: 'Robotics', days: [0, 3], start: '16:30', end: '19:30' }] }
  };
}
function demoTimetable() {
  const d = todayKey(), per = [['07:45', '08:30'], ['08:30', '09:15'], ['09:15', '10:00'], ['10:15', '11:00'], ['11:00', '11:45'], ['12:10', '12:55'], ['12:55', '13:40'], ['13:50', '14:35'], ['14:35', '15:20']];
  const subj = ['מתמטיקה', 'מתמטיקה', 'פיזיקה', 'פיזיקה', 'אנגלית', 'ספרות', 'היסטוריה', 'מדעי המחשב', 'מדעי המחשב'];
  const week = {}; [0, 1, 2, 3, 4].forEach(w => { week[w] = per.map((p, i) => ({ n: i, start: p[0], end: p[1], items: [subj[(i + w) % subj.length]] })); });
  return { ok: true, cls: '11-3', days: { [d]: { published: false } }, week };
}
const DEMO_ROWS = {
  study_lessons: [
    { id: 'l1', subject_id: 'phys', lesson_date: addDays(todayKey(), -2), title: 'נפילה חופשית', status: 'ready', topics: ['נפילה חופשית'], marks: [600], summary: '- גוף שנזרק כלפי מטה: $v_0<0$ כשהציר כלפי מעלה\n- $y(t)=y_0+v_0t-\\frac{1}{2}gt^2$\n- המורה: "במבחן תמיד יש שאלה עם שני גופים"', transcript: '[0:00] המורה: טוב, היום נדבר על נפילה חופשית. ניקח ציר כלפי מעלה, ואז התאוצה היא מינוס g…\n[MARKED BY STUDENT: on the test]\nבמבחן תמיד יש שאלה עם שני גופים…' },
    { id: 'l2', subject_id: 'phys', lesson_date: todayKey(), title: null, status: 'transcribing', topics: [] },
    { id: 'l3', subject_id: 'math', lesson_date: addDays(todayKey(), -2), title: 'נגזרת ומשיק', status: 'ready', topics: ['נגזרות', 'משיק'], summary: '- משוואת משיק: $y-y_0=f\'(x_0)(x-x_0)$', transcript: 'המורה: מה זה משיק? ישר שנוגע בגרף בנקודה אחת…' }
  ],
  study_materials: [
    { id: 'm1', subject_id: 'phys', kind: 'old_test', title: 'מבחן קינמטיקה תשפ״ו', status: 'ready', content: 'שאלה 1 (35 נק׳)…', created_at: addDays(todayKey(), -20) },
    { id: 'm2', subject_id: 'phys', kind: 'board', title: null, status: 'ready', content: '$v=v_0+at$', created_at: addDays(todayKey(), -2), lesson_id: 'l1' },
    { id: 'm3', subject_id: 'phys', kind: 'teacher_summary', title: 'סיכום שיעור – נפילה חופשית', status: 'ready', content: 'ציר כלפי מעלה, a = −g. אבן שנזרקת כלפי מטה: v₀ שלילי…', created_at: addDays(todayKey(), -2), taken_at: addDays(todayKey(), -2) + 'T15:00:00Z' },
    { id: 'm4', subject_id: 'math', kind: 'old_test', title: 'מועד א׳ · 3.11', status: 'ready', content: 'שאלה 1…', created_at: addDays(todayKey(), -7) },
    { id: 'm5', subject_id: 'math', kind: 'teacher_message', title: 'מועד ב׳ – מה ייכלל · צפריר דלית', status: 'ready', content: 'שלום לכולם, במועד ב׳ יהיו שתי שאלות, 20 נקודות כל אחת. החומר: נגזרות ומשיקים. בהצלחה!', taken_at: addDays(todayKey(), -1) + 'T12:00:00Z', created_at: addDays(todayKey(), -1) },
    { id: 'm6', subject_id: 'inbox', kind: 'teacher_message', title: 'טיול שנתי · מחנכת', status: 'ready', content: 'תזכורת: אישורי הורים לטיול עד יום חמישי.', taken_at: addDays(todayKey(), -3) + 'T12:00:00Z', created_at: addDays(todayKey(), -3) }
  ],
  study_topics: [
    { id: 'tp1', subject_id: 'phys', name: 'נפילה חופשית', state: 'with_help' },
    { id: 'tp2', subject_id: 'phys', name: 'מפגש שני גופים', state: 'new' },
    { id: 'tp3', subject_id: 'phys', name: 'גרפים של תנועה', state: 'alone' },
    { id: 'tp4', subject_id: 'math', name: 'נגזרות', state: 'alone' },
    { id: 'tp5', subject_id: 'math', name: 'משיק', state: 'with_help' },
    { id: 'tp6', subject_id: 'math', name: 'נקודות קיצון', state: 'new' }
  ],
  study_attempts: [
    { id: 'at1', subject_id: 'phys', verdict: 'partial', alone: true, mistake: 'sign of initial velocity', created_at: addDays(todayKey(), -1) },
    { id: 'at2', subject_id: 'phys', verdict: 'wrong', alone: false, mistake: 'sign of initial velocity', created_at: addDays(todayKey(), -2) },
    { id: 'at3', subject_id: 'math', verdict: 'correct', alone: true, created_at: addDays(todayKey(), -1) },
    { id: 'at4', subject_id: 'phys', verdict: 'partial', alone: true, mistake: 'km/h to m/s', created_at: addDays(todayKey(), -3) },
    { id: 'at5', subject_id: 'phys', verdict: 'wrong', alone: true, mistake: 'km/h to m/s', created_at: addDays(todayKey(), -4) },
    { id: 'at6', subject_id: 'math', verdict: 'correct', alone: true, created_at: addDays(todayKey(), -2) }
  ],
  study_chats: []
};
function demoRows(table, filter) {
  return (DEMO_ROWS[table] || []).filter(r => Object.keys(filter || {}).every(k => Array.isArray(filter[k]) ? filter[k].indexOf(r[k]) >= 0 : r[k] === filter[k]));
}
async function demoApi(name, p) {
  await wait(600);
  if (name === 'mashov') return { homework: [], messages: [], grades: [] };
  if (name === 'week' && p.mode === 'tonight') return { reply: p.lang === 'he' ? 'סבבה, נעשה 20 דקות קלות ב־21:00.' : 'OK: an easy 20 minutes at 21:00.', skip: false, start: '21:00', mins: 20 };
  if (name === 'week') return { reply: p.lang === 'he' ? 'שמרתי כדורעף ורובוטיקה. כמה זמן לוקחת לך הדרך הביתה?' : 'Saved volleyball and robotics.', question: p.lang === 'he' ? null : 'How long is your way home?', week: [{ name: 'Volleyball', days: [1, 2], start: '17:00', end: '19:00' }, { name: 'Robotics', days: [0], start: '16:30', end: '20:00' }], studyMins: null, latest: '22:00', commuteMins: null };
  if (name !== 'tutor') return {};
  const he = p.lang !== 'en';
  if (p.step === 'learn') return { text: he ? 'משיק הוא ישר שנוגע בגרף בנקודה אחת, ושם יש לו **אותו שיפוע** כמו לגרף. השיפוע הזה הוא הנגזרת בנקודה.\n\n```plot\n{"x":[-1,3],"y":[-2,9],"fns":[{"f":"x^2","label":"f(x)=x²"},{"f":"2x-1","label":"y=2x−1"}],"points":[{"x":1,"y":1,"label":"(1,1)"}]}\n```\n\n**שאלה קטנה:** מה השיפוע של המשיק ל־$f(x)=x^2$ בנקודה $x=3$?' : 'A tangent line (משיק) touches the graph at one point and has **the same slope** as the graph there. That slope is the derivative at that point.\n\n```plot\n{"x":[-1,3],"y":[-2,9],"fns":[{"f":"x^2","label":"f(x)=x²"},{"f":"2x-1","label":"y=2x−1"}],"points":[{"x":1,"y":1,"label":"(1,1)"}]}\n```\n\n**Quick check:** what is the slope of the tangent to $f(x)=x^2$ at $x=3$?' };
  if (p.step === 'example') return { text: he ? '**דוגמה מהשיעור של 8.11:** מצא את משוואת המשיק ל־$f(x)=x^2$ בנקודה $x=1$.\n\n1. שיפוע: $f\'(x)=2x \\Rightarrow f\'(1)=2$\n2. נקודה: $(1,1)$\n3. משוואה: $y-1=2(x-1) \\Rightarrow y=2x-1$' : '**Example from the 8 Nov lesson:** find the tangent line to $f(x)=x^2$ at $x=1$.\n\n1. Slope: $f\'(x)=2x \\Rightarrow f\'(1)=2$\n2. Point: $(1,1)$\n3. Line: $y-1=2(x-1) \\Rightarrow y=2x-1$' };
  if (p.step === 'turn') return { text: he ? '**שאלה 1** (בסגנון המבחן, 20 נק׳)\n\nנתונה הפונקציה $f(x)=x^3-3x^2+2$.\n\nא. מצא את משוואת המשיק בנקודה שבה $x=1$. (7 נק׳)\nב. מצא את נקודות הקיצון וקבע את סוגן. (8 נק׳)\nג. שרטט סקיצה. (5 נק׳)\n\nפתור לבד על דף, ואז צלם.' : '**Question 1** (test style, 20 pts)\n\nGiven $f(x)=x^3-3x^2+2$.\n\na. Find the tangent line at $x=1$. (7)\nb. Find the extreme points and their type. (8)\nc. Sketch the graph. (5)\n\nSolve it alone on paper, then snap it.' };
  return { text: he ? 'א׳ נכון: $y=-3x+3$.\n\nב׳: מצאת ש־$f\'(x)=0$ ב־$x=0$ וב־$x=2$, אבל **לא בדקת איזו נקודה היא מקסימום ואיזו מינימום**. תבדוק עם $f\'\'$ או עם טבלת סימנים.' : 'a is right: $y=-3x+3$.\n\nIn b you found $f\'(x)=0$ at $x=0$ and $x=2$, but **didn\'t check which is a max and which a min**. Use $f\'\'$ or a sign table.', verdict: 'partial', mistake: 'max/min type not checked' };
}

window.SH = {
  VERSION, DEMO, K, T, $, $$, esc, ic, qs, wait, link, stamp, newId, uuid, readJSON, writeJSON,
  t, lang, setLang, langToggle, nav,
  todayKey, nowMin, daysUntil, dow, fmtDay, rel, addDays, toMin, hm, DOWS, toast, sheet, closeSheet, errorBanner,
  sb, session, token, signOut, user: () => user, uid: () => uid,
  school, mergeById, settings, saveSettings, subjects, subject, subjectName, ensureSubject, openTests, openHomework, setHomeworkDone, addHomework, addTest,
  rows, insert, update, setTopicState, upload, api, shrinkImage, renderRich, plotSVG, compile, openAdd, onStudy, emitStudy,
  uploadLessonAudio, uploadMaterial,
  syncAll, lastSync, myClass, setMyClass, subjectFromHe, timetable, currentLesson, plan, dayItems, skipKey, doneKey,
  theme, setTheme, setTonight, weekChat, tonightSheet, weekSummary, claudePrompt, openClaude, parsePlan, importSheet,
  _test: { syncCalendar, syncMashov, subjectFromTeacher, freeWindows, pickTarget }
};
document.documentElement.lang = LANG;
document.documentElement.dir = LANG === 'he' ? 'rtl' : 'ltr';
errorBanner();
if ('serviceWorker' in navigator && !DEMO && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
