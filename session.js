/* A study session in four steps: Learn → Example → Your turn → Check.
   The server loads the teacher's material; this page sends the conversation and the step.
   "Test me" starts at Your turn and loops Your turn → Check. */
(async function () {
'use strict';
const S = window.SH, { $, esc, ic, t } = S;
const P = { subject: S.qs('subject'), topic: S.qs('topic') || '', test: S.qs('test'), hw: S.qs('hw'), mode: S.qs('mode') === 'test' ? 'test' : 'learn', mins: +S.qs('mins') || 40 };
const STEPS = ['learn', 'example', 'turn', 'check'];
const STEP_LABEL = { learn: 'Learn', example: 'Example', turn: 'Your turn', check: 'Check' };
let step = P.mode === 'test' ? 'turn' : 'learn';
let msgs = [];          // {role, text, image?, hadImage?, hidden?, step, verdict?, mistake?, rated?}
let busy = false, chatId = null, attach = null, asking = false, typing = false;
const startedAt = Date.now();

$('#back').innerHTML = ic('back', 'flip');
if (!(await S.session())) return;
await S.school.load();
const subj = S.subject(P.subject);
const test = P.test ? S.school.get(S.K.te).find(x => x.id === P.test) : S.openTests().find(x => x.subjectId === P.subject);
const hw = P.hw ? S.school.get(S.K.as).find(a => a.id === P.hw) : null;
const isEnglishSubject = /english|אנגלית/i.test(subj ? subj.name : '');
const st = S.settings();
let teachLang = st.teachLang === 'en' || st.teachLang === 'he' ? st.teachLang : (isEnglishSubject ? 'en' : 'he');
$('#back').href = P.subject ? S.link('/subject.html', { id: P.subject }) : S.link('/');
$('#name').textContent = P.topic || (hw && hw.title) || (subj ? subj.name : '');
document.title = ($('#name').textContent || 'Study') + ' · Study';
$('#tlang').setAttribute('aria-label', t('Teaching language'));

function header() {
  const left = Math.max(0, P.mins - Math.floor((Date.now() - startedAt) / 60000));
  $('#sub').textContent = [subj ? subj.name : '', t('{n} min left', { n: left })].filter(Boolean).join(' · ');
  S.$$('#tlang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tl === teachLang)));
  const at = STEPS.indexOf(step);
  $('#steps').innerHTML = STEPS.map((s, i) => '<div class="' + (i < at ? 'done' : i === at ? 'now' : '') + '"><i></i>' + esc(t(STEP_LABEL[s])) + '</div>').join('');
}
setInterval(header, 30000);
S.$$('#tlang button').forEach(b => b.onclick = () => { if (b.dataset.tl === teachLang) return; teachLang = b.dataset.tl; header(); S.toast(teachLang === 'en' ? 'Next answers in English' : 'התשובות הבאות בעברית'); });

/* ---------- drawing ---------- */
function card(m) {
  const el = document.createElement('div');
  if (m.role === 'user') {
    el.className = 'me-line'; el.dir = 'auto';
    if (m.image) { const img = document.createElement('img'); img.src = m.image; img.alt = t('Your answer'); el.appendChild(img); }
    else if (m.hadImage) el.appendChild(document.createTextNode('[photo] '));
    el.appendChild(document.createTextNode(m.text || ''));
    return el;
  }
  el.className = 'lesson-card';
  const head = document.createElement('div'); head.className = 'from';
  const from = test && step !== 'learn' ? (S.lang() === 'he' ? 'בסגנון ' + (test.name || 'המבחן') : 'In the style of ' + (test.name || 'your test')) : (subj ? subj.name : '');
  head.innerHTML = '<b>' + esc(t(STEP_LABEL[m.step] || 'Learn')) + '</b><span dir="auto">' + esc(from) + '</span>';
  const body = document.createElement('div'); body.className = 'prose'; body.dir = 'auto';
  S.renderRich(body, m.text);
  el.append(head, body);
  return el;
}
function render() {
  header();
  const cur = msgs.filter(m => !m.hidden && m.step === step), old = msgs.filter(m => !m.hidden && m.step !== step);
  $('#earlier').hidden = !old.length;
  $('#earlier summary').textContent = S.lang() === 'he' ? 'שלבים קודמים' : 'Earlier steps';
  const eb = $('#earlier-body'); eb.innerHTML = ''; old.forEach(m => eb.appendChild(card(m)));
  const box = $('#cards'); box.innerHTML = '';
  cur.forEach(m => box.appendChild(card(m)));
  if (busy) { const d = document.createElement('div'); d.className = 'thinking'; d.textContent = step === 'check' ? t('Checking…') : t('Thinking…'); box.appendChild(d); }
  dock();
}
const scrollDown = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
const VERDICT = { correct: ['Correct', 'Did you solve it on your own?'], partial: ['Almost', 'Did you solve it on your own?'], wrong: ['Not yet ', 'Did you solve it on your own?'] };

function askBox(placeholder) {
  return '<form class="ask" id="ask"><textarea id="ask-in" rows="1" dir="auto" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '"></textarea><button class="icon-btn" type="submit" aria-label="' + esc(t('Send')) + '" style="background:var(--ink);color:var(--ground)">' + ic('send', 'flip') + '</button></form>';
}
function dock() {
  const d = $('#dock');
  if (busy) { d.innerHTML = ''; return; }
  const last = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
  if (step === 'learn' || step === 'example') {
    d.innerHTML = (step === 'learn' || asking ? askBox(asking ? t('Ask a question') : t('Your answer')) : '') +
      '<button class="btn big dark block" id="next">' + esc(step === 'learn' ? t('Got it → next') : t('Got it → your turn')) + '</button>' +
      '<div class="grid2"><button class="btn" id="diff">' + esc(t('Explain differently')) + '</button><button class="btn" id="q">' + esc(t('Ask a question')) + '</button></div>';
    $('#next').onclick = () => go(step === 'learn' ? 'example' : 'turn');
    $('#diff').onclick = () => say(S.lang() === 'he' || teachLang === 'he' ? 'תסביר את זה אחרת, יותר פשוט, עם דוגמה אחרת או ציור.' : 'Explain it differently and simpler, with another example or a picture.', true);
    $('#q').onclick = () => { asking = true; dock(); const i = $('#ask-in'); if (i) i.focus(); };
  } else if (step === 'turn') {
    d.innerHTML = (attach ? '<div class="attach"><img src="' + attach + '" alt=""><span>' + esc(t('Photo attached')) + '</span><button class="icon-btn" id="unattach" aria-label="' + esc(t('Remove photo')) + '">' + ic('x', 'sm') + '</button></div>' : '') +
      (typing || attach ? askBox(t('Your answer')) : '') +
      '<label class="btn big dark block" style="position:relative">' + ic('camera') + esc(t('Snap your answer')) + '<input type="file" accept="image/*" capture="environment" id="snap" style="position:absolute;inset:0;opacity:0"></label>' +
      (typing ? '' : '<button class="btn block" id="type">' + esc(t('Type it instead')) + '</button>');
    $('#snap').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { attach = (await S.shrinkImage(f, 1600, 0.8)).dataUrl; dock(); scrollDown(); } catch (err) { S.toast(err.message); } };
    const ty = $('#type'); if (ty) ty.onclick = () => { typing = true; dock(); $('#ask-in').focus(); };
    const un = $('#unattach'); if (un) un.onclick = () => { attach = null; dock(); };
  } else if (step === 'check') {
    if (last && last.verdict && !last.rated) {
      const v = VERDICT[last.verdict];
      d.innerHTML = '<div class="verdict ' + last.verdict + '"><b>' + esc(t(v[0])) + '</b><span>' + esc(t(v[1])) + '</span><div class="grid2"><button class="btn dark" data-rate="alone">' + esc(t('Alone')) + '</button><button class="btn" data-rate="help">' + esc(t('I had help')) + '</button></div></div>';
      S.$$('[data-rate]', d).forEach(b => b.onclick = () => rate(last, b.dataset.rate));
    } else {
      d.innerHTML = askBox(t('Ask a question')) + '<div class="grid2"><button class="btn big dark" id="again">' + esc(t('Another question')) + '</button><button class="btn big" id="finish">' + esc(t('Finish')) + '</button></div>';
      $('#again').onclick = () => go('turn', true);
      $('#finish').onclick = finish;
    }
  }
  const f = $('#ask');
  if (f) {
    const inp = $('#ask-in');
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px'; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover:hover)').matches) { e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = e => {
      e.preventDefault();
      const text = inp.value.trim();
      if (step === 'turn') { if (!text && !attach) return; submitAttempt(text); return; }
      if (!text) return;
      asking = false; say(text);
    };
  }
}

/* ---------- talking to the tutor ---------- */
function opening(s) {
  const he = teachLang === 'he', topic = P.topic || (hw && hw.title) || (test && test.topics) || '';
  if (s === 'learn') return he ? 'תלמד אותי ' + (topic || 'את החומר') + ' מאפס.' : 'Teach me ' + (topic || 'this') + ' from zero.';
  if (s === 'example') return he ? 'הבנתי. תראה לי דוגמה פתורה מהשיעור.' : 'Got it. Show me a worked example from class.';
  if (s === 'turn') return he ? 'תן לי שאלה ברמת המבחן לפתור לבד' + (topic ? ' על ' + topic : '') + '.' : 'Give me a test-level question to solve alone' + (topic ? ' on ' + topic : '') + '.';
  return '';
}
function go(s, again) {
  step = s; asking = false; typing = false; attach = null;
  msgs.push({ role: 'user', text: again ? (teachLang === 'he' ? 'עוד שאלה בבקשה.' : 'Another question, please.') : opening(s), hidden: true, step: s });
  ask();
}
function say(text, hidden) {
  msgs.push({ role: 'user', text, hidden: !!hidden, step });
  ask();
}
function submitAttempt(text) {
  const img = attach;
  attach = null; typing = false;
  step = 'check';
  msgs.push({ role: 'user', text: text || (teachLang === 'he' ? '(הפתרון שלי בתמונה)' : '(my solution is in the photo)'), image: img, step: 'check' });
  ask();
}
async function ask() {
  busy = true; render(); scrollDown();
  let photos = 0;
  const payload = msgs.slice(-30).slice().reverse().map(m => {
    const o = { role: m.role, text: m.text || '' };
    if (m.image) { if (photos < 2) { o.image = m.image; photos++; } else o.hadImage = true; } else if (m.hadImage) o.hadImage = true;
    return o;
  }).reverse();
  try {
    const r = await S.api('tutor', {
      subjectId: P.subject, subjectName: subj ? subj.name : '', mode: 'session', step, lang: teachLang, topic: P.topic || (hw && hw.title) || '',
      test: test ? { name: test.name, testDate: test.testDate, topics: test.topics || '' } : null,
      extra: hw ? (hw.notes || hw.title) : '', messages: payload
    });
    msgs.push({ role: 'assistant', text: r.text, verdict: r.verdict || null, mistake: r.mistake || null, step });
    busy = false; render(); scrollDown(); saveChat();
  } catch (e) {
    busy = false; render();
    const d = $('#dock');
    d.innerHTML = '<div class="verdict wrong"><span>' + esc(e.message) + '</span><button class="btn dark" id="retry">' + esc(t('Try again')) + '</button></div>';
    $('#retry').onclick = ask;
  }
}
async function rate(m, how) {
  m.rated = how;
  render();
  const i = msgs.indexOf(m);
  let q = '', a = '';
  for (let j = i - 1; j >= 0; j--) { if (msgs[j].role === 'user' && !a && !msgs[j].hidden) a = msgs[j].text || '[photo]'; else if (msgs[j].role === 'assistant' && msgs[j].step === 'turn') { q = msgs[j].text; break; } }
  try {
    await S.insert(S.T.attempts, { subject_id: P.subject, topic: P.topic || null, chat_id: chatId, question: q.slice(0, 4000), answer: a.slice(0, 4000), verdict: m.verdict, feedback: m.text.slice(0, 4000), alone: how === 'alone', mistake: m.mistake || null });
    if (P.topic) await S.setTopicState(P.subject, P.topic, m.verdict === 'correct' && how === 'alone' ? 'alone' : 'with_help');
    if (m.verdict === 'correct' && how === 'alone') S.toast(S.lang() === 'he' ? 'נשמר: פתרת לבד' : 'Saved: solved alone');
  } catch (e) { S.toast(e.message); }
  saveChat();
}
function finish() {
  // tonight counts as done only if you actually tried a question (reading isn't studying)
  if (msgs.some(m => m.rated)) S.writeJSON(S.doneKey(S.todayKey()), 1);
  location.href = S.link('/');
}
async function saveChat() {
  const stored = msgs.map(m => { const o = Object.assign({}, m); if (o.image) { delete o.image; o.hadImage = true; } return o; });
  try {
    if (!chatId) chatId = (await S.insert(S.T.chats, { subject_id: P.subject, mode: 'session', topic: P.topic || null, messages: stored })).id;
    else await S.update(S.T.chats, chatId, { messages: stored });
  } catch (e) { console.warn('chat save failed', e); }
}

msgs.push({ role: 'user', text: opening(step), hidden: true, step });
ask();
})();
