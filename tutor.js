/* Tutor page: one chat in teach or test mode for one subject (and optionally one topic).
   The server loads the teacher's material; this page only sends the conversation. */
(async function () {
'use strict';
const S = window.SH, { $, esc } = S;
const subjectId = S.qs('subject');
let mode = S.qs('mode') === 'test' ? 'test' : 'teach';
let topic = S.qs('topic') || '';
const testId = S.qs('test');
let chatId = S.qs('chat');
let msgs = [];          // {role:'user'|'assistant', text, image?(dataUrl), hadImage?, start?, verdict?, rated?}
let attach = null;      // {dataUrl}
let busy = false;

$('#back').innerHTML = S.ic('back');
$('#photo-btn').insertAdjacentHTML('afterbegin', S.ic('camera'));
$('#send').innerHTML = S.ic('send');
if (!(await S.session())) return;
await S.school.load();

const subj = S.subject(subjectId);
const test = testId ? S.school.get(S.K.te).find(t => t.id === testId) : S.openTests().find(t => t.subjectId === subjectId);
$('#back').href = S.link('/subject.html', { id: subjectId });
$('#name').textContent = subj ? subj.name : 'Tutor';
document.title = (subj ? subj.name : 'Tutor') + ' · Study Hub';

function header() {
  $('#sub').textContent = (mode === 'teach' ? 'Teaching' : 'Testing') + (test ? ' · test ' + (S.daysUntil(test.testDate) < 7 ? S.rel(test.testDate) : 'on ' + S.fmtDay(test.testDate)) : '');
  S.$$('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#topic-btn').innerHTML = '<span dir="auto">' + esc(topic || (test && test.topics) || 'All topics') + '</span> ' + S.ic('chev', 'sm');
}
header();

/* ---------- rendering ---------- */
const VERDICT = { correct: ['Correct', 'Did you solve it on your own?'], partial: ['Almost', 'Did you get this far on your own?'], wrong: ['Not yet', 'Did you try it on your own?'] };
function render() {
  const box = $('#msgs');
  box.innerHTML = '';
  msgs.forEach((m, i) => {
    if (m.role === 'user') {
      const el = document.createElement('div');
      el.className = 'msg me' + (m.start ? ' start' : '');
      el.dir = 'auto';
      if (m.image) { const img = document.createElement('img'); img.src = m.image; img.alt = 'Your solution'; el.appendChild(img); }
      else if (m.hadImage) el.appendChild(document.createTextNode('[photo] '));
      el.appendChild(document.createTextNode(m.text || ''));
      box.appendChild(el);
      return;
    }
    const el = document.createElement('div');
    el.className = 'msg ai';
    const p = document.createElement('div'); p.className = 'prose'; p.dir = 'auto';
    S.renderRich(p, m.text);
    el.appendChild(p);
    box.appendChild(el);
    if (m.verdict) {
      const v = document.createElement('div');
      v.className = 'verdict ' + m.verdict;
      if (m.rated) v.innerHTML = '<b>' + VERDICT[m.verdict][0] + '</b><span>' + (m.rated === 'alone' ? 'Saved: solved on your own.' : 'Saved: with help. It counts once you solve one alone.') + '</span>';
      else {
        v.innerHTML = '<b>' + VERDICT[m.verdict][0] + '</b><span>' + VERDICT[m.verdict][1] + '</span><div class="row"><button class="btn primary" data-rate="alone">Alone</button><button class="btn" data-rate="help">I had help</button></div>';
        v.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => rate(i, b.dataset.rate));
      }
      box.appendChild(v);
    }
  });
  if (busy) { const t = document.createElement('div'); t.className = 'msg ai typing'; t.textContent = mode === 'test' ? 'Checking…' : 'Thinking…'; box.appendChild(t); }
}
const scrollDown = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

/* ---------- saving ---------- */
async function saveChat() {
  const stored = msgs.map(m => { const o = Object.assign({}, m); if (o.image) { delete o.image; o.hadImage = true; } return o; });
  try {
    if (!chatId) {
      const row = await S.insert(S.T.chats, { subject_id: subjectId, mode, topic: topic || null, messages: stored });
      chatId = row.id;
      if (!S.DEMO) history.replaceState(null, '', S.link('/tutor.html', Object.assign({ subject: subjectId, mode, chat: chatId }, topic ? { topic } : {}, testId ? { test: testId } : {})));
    } else await S.update(S.T.chats, chatId, { messages: stored, topic: topic || null });
  } catch (e) { console.warn('chat save failed', e); }
}
async function rate(i, how) {
  const m = msgs[i];
  m.rated = how;
  render();
  // the question is the tutor's message before the student's attempt
  let q = '', a = '';
  for (let j = i - 1; j >= 0; j--) { if (msgs[j].role === 'user' && !a) a = msgs[j].text || '[photo]'; else if (msgs[j].role === 'assistant') { q = msgs[j].text; break; } }
  try {
    await S.insert(S.T.attempts, { subject_id: subjectId, topic: topic || null, chat_id: chatId, question: q.slice(0, 4000), answer: a.slice(0, 4000), verdict: m.verdict, feedback: m.text.slice(0, 4000), alone: how === 'alone' });
    if (topic) await S.setTopicState(subjectId, topic, m.verdict === 'correct' && how === 'alone' ? 'alone' : 'with_help');
    S.toast(m.verdict === 'correct' && how === 'alone' ? (topic ? 'Topic marked: solved alone' : 'Saved') : 'Saved');
  } catch (e) { S.toast('Couldn’t save: ' + e.message); }
  saveChat();
}

/* ---------- talking to the tutor ---------- */
async function ask() {
  busy = true; render(); scrollDown();
  // only the last two photos travel (the server's limit too); older ones are marked
  let photos = 0;
  const payloadMsgs = msgs.slice(-30).slice().reverse().map(m => {
    const o = { role: m.role, text: m.text || '' };
    if (m.image) { if (photos < 2) { o.image = m.image; photos++; } else o.hadImage = true; }
    else if (m.hadImage) o.hadImage = true;
    return o;
  }).reverse();
  try {
    const r = await S.api('tutor', {
      subjectId, subjectName: subj ? subj.name : '', mode, topic,
      test: test ? { name: test.name, testDate: test.testDate, topics: test.topics || '' } : null,
      messages: payloadMsgs
    });
    msgs.push({ role: 'assistant', text: r.text, verdict: r.verdict || null });
    busy = false; render(); scrollDown();
    saveChat();
  } catch (e) {
    busy = false; render();
    const err = document.createElement('div');
    err.className = 'msg err';
    err.innerHTML = '<span>' + esc(e.message) + '</span><button class="btn" type="button">Try again</button>';
    err.querySelector('button').onclick = () => { err.remove(); ask(); };
    $('#msgs').appendChild(err); scrollDown();
  }
}
function openingLine() {
  const t = topic || (test && test.topics) || '';
  if (mode === 'teach') return t ? 'תלמד אותי ' + t + ' מאפס.' : 'תלמד אותי את החומר מאפס, מהשיעור האחרון.';
  return t ? 'תן לי שאלה ראשונה ברמת המבחן על ' + t + '.' : 'תן לי שאלה ראשונה ברמת המבחן.';
}
function start() {
  msgs = [{ role: 'user', text: openingLine(), start: true }];
  chatId = null;
  render();
  ask();
}

$('#form').onsubmit = e => {
  e.preventDefault();
  if (busy) return;
  const text = $('#input').value.trim();
  if (!text && !attach) return;
  msgs.push({ role: 'user', text, image: attach ? attach.dataUrl : null });
  $('#input').value = ''; $('#input').style.height = '';
  attach = null; $('#preview').hidden = true; $('#preview').innerHTML = '';
  render(); ask();
};
$('#input').addEventListener('input', e => { const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; });
$('#input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover:hover)').matches) { e.preventDefault(); $('#form').requestSubmit(); } });
$('#photo').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const { dataUrl } = await S.shrinkImage(f, 1600, 0.8);
    attach = { dataUrl };
    $('#preview').innerHTML = '<img src="' + dataUrl + '" alt=""><span>Photo attached</span><button class="icon-btn" type="button" aria-label="Remove photo">' + S.ic('x', 'sm') + '</button>';
    $('#preview').hidden = false;
    $('#preview').querySelector('button').onclick = () => { attach = null; $('#preview').hidden = true; };
  } catch (err) { S.toast(err.message); }
};
S.$$('.seg button').forEach(b => b.onclick = () => {
  if (b.dataset.mode === mode || busy) return;
  mode = b.dataset.mode; header(); start();
});
$('#topic-btn').onclick = async () => {
  let topics = [];
  try { topics = await S.rows(S.T.topics, { subject_id: subjectId }); } catch (e) {}
  const opts = [''].concat(topics.map(t => t.name));
  S.sheet('<h2>Focus on</h2><div class="chips">' + opts.map(n => '<button class="chip" data-t="' + esc(n) + '" aria-pressed="' + (n === topic) + '" dir="auto">' + esc(n || 'All topics') + '</button>').join('') + '</div><p class="hint" style="margin-top:12px">Or type any topic to the tutor.</p>', s => {
    s.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.closeSheet(); if (busy || b.dataset.t === topic) return; topic = b.dataset.t; header(); start(); });
  });
};

// resume a saved chat, or start a new one
if (chatId && !S.DEMO) {
  try {
    const row = (await S.rows(S.T.chats, { id: chatId }))[0];
    if (row) { msgs = Array.isArray(row.messages) ? row.messages : []; mode = row.mode; topic = row.topic || topic; header(); render(); scrollDown(); }
    else start();
  } catch (e) { start(); }
} else start();
})();
