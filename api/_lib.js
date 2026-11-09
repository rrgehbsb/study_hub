// Shared helpers for the api/ functions (files starting with "_" are not routes on Vercel).
// Every function talks to Supabase WITH THE CALLER'S TOKEN, so row-level security
// decides what it can read and write. No service-role key is needed.

const SB_URL = process.env.SUPABASE_URL || 'https://mtuoqwbrujxutofhyahb.supabase.co';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_tYgBycEksvhfB-2sBenWHA_dLTeVO9F';
const BUCKET = 'study';

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}

// Signed in, and allowed to spend the AI budget?
async function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Not signed in.');
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new HttpError(401, 'Your sign-in expired. Sign in again.');
  const user = await r.json();
  const allowed = String(process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) throw new HttpError(503, 'Setup not finished: ALLOWED_EMAILS is not set in Vercel.');
  if (!allowed.includes(String(user.email || '').toLowerCase())) throw new HttpError(403, 'This account is not allowed to use Study Hub’s AI.');
  return { token, user };
}

// PostgREST with the user's token. path like "study_lessons?id=eq.123&select=*"
async function db(token, path, opt) {
  opt = opt || {};
  const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (opt.prefer) headers.Prefer = opt.prefer;
  const r = await fetch(SB_URL + '/rest/v1/' + path, { method: opt.method || 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new HttpError(502, 'Database: ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}
const one = async (token, path) => { const rows = await db(token, path); return Array.isArray(rows) ? rows[0] : rows; };
const patch = (token, table, id, values) => db(token, table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: Object.assign({ updated_at: new Date().toISOString() }, values), prefer: 'return=minimal' });

async function download(token, path) {
  const r = await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/'), { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new HttpError(502, 'Could not read the uploaded file (' + r.status + ').');
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' };
}
async function remove(token, path) {
  try {
    await fetch(SB_URL + '/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
  } catch (e) { /* the file just stays; not worth failing the request */ }
}

// ---------- AI providers ----------
const TUTOR_MODEL = () => process.env.TUTOR_MODEL || 'claude-sonnet-5-5';

async function claude({ system, messages, max_tokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'Setup not finished: ANTHROPIC_API_KEY is not set in Vercel.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: TUTOR_MODEL(), max_tokens: max_tokens || 1500, system, messages })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('status ' + r.status);
    if (/credit|billing|limit/i.test(msg)) throw new HttpError(402, 'The AI budget for this month is used up (Anthropic console limit).');
    throw new HttpError(502, 'Claude: ' + msg);
  }
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const u = j.usage || {};
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  return { text, input, output: u.output_tokens || 0 };
}

// Gemini Flash for cheap jobs. Returns parsed JSON, or null when no key / it fails.
async function geminiJSON(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
    });
    if (!r.ok) { console.warn('gemini', r.status, (await r.text()).slice(0, 200)); return null; }
    const j = await r.json();
    const t = (((j.candidates || [])[0] || {}).content || {}).parts;
    return JSON.parse((t || []).map(p => p.text || '').join(''));
  } catch (e) { console.warn('gemini failed', e); return null; }
}

// Daily guard on paid AI calls (the hard stop is the monthly limit in the Anthropic console).
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
async function checkBudget(token) {
  const limit = Number(process.env.DAILY_TUTOR_CALLS || 120);
  const row = await one(token, 'study_usage?day=eq.' + today() + '&select=calls');
  if (row && row.calls >= limit) throw new HttpError(429, 'Daily limit reached (' + limit + ' AI turns). It resets at midnight.');
}
async function bumpUsage(token, input, output) {
  try { await db(token, 'rpc/study_bump_usage', { method: 'POST', body: { p_in: input, p_out: output } }); } catch (e) { console.warn('usage bump failed', e.message); }
}

function handler(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try { await fn(req, res); }
    catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: e.message || 'Something went wrong.' });
    }
  };
}

module.exports = { SB_URL, SB_KEY, HttpError, send, body, auth, db, one, patch, download, remove, claude, geminiJSON, checkBudget, bumpUsage, handler, today, TUTOR_MODEL };
