// App-shell service worker: every page and file of this version is saved on install, then served
// from the phone at once (no waiting for the network). A new version (CACHE changes with VERSION in
// app.js) installs in the background and takes over on the next page; the old copy is deleted.
// CACHE must match VERSION in app.js (bump both on every change).
const CACHE = 'study-v0.6.9';
const V = '?v=' + CACHE.replace('study-v', '');
const PAGES = ['/', '/index.html', '/tutor.html', '/session.html', '/record.html', '/notebook.html', '/subject.html', '/progress.html',
  '/settings.html', '/lesson.html', '/login.html', '/homework.html', '/subjects.html', '/teachers.html'];
const FILES = ['/app.css' + V, '/app.js' + V, '/session.js' + V, '/manifest.json',
  '/vendor/supabase-2.116.0.js', '/vendor/marked.min.js', '/vendor/lame-1.2.1.min.js',
  '/vendor/katex/katex.min.css', '/vendor/katex/katex.min.js', '/vendor/katex/auto-render.min.js',
  '/fonts/rubik-hebrew-wght-normal.woff2', '/fonts/space-grotesk-latin-wght-normal.woff2', '/fonts/rubik-latin-wght-normal.woff2',
  '/icons/icon.svg', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // one by one, so a single missing file can't block the whole install
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PAGES.concat(FILES).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  const page = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/';
  // pages: the saved page whatever the ?query (?demo, ?id=…); files: exact match (the ?v= is the version)
  const key = page ? new Request(url.origin + (url.pathname === '/' ? '/index.html' : url.pathname)) : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, page ? { ignoreSearch: true } : undefined);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    } catch (err) {
      return (await c.match('/index.html')) || Response.error();
    }
  }));
});
