// Bug hunt in ?demo mode: every page at phone / Android / computer width, English and Hebrew,
// light and dark. Reports console errors, failed requests, sideways scrolling, broken links,
// tiny tap targets and text, English left over in Hebrew; then taps every button on every
// page (fresh load each time) and reports anything that throws.
// Run: node tools/serve.js . &  then  PLAYWRIGHT_PATH=$(npm root -g)/playwright node tools/check.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5178';
const PAGES = ['/', '/tutor.html', '/record.html', '/notebook.html?tab=coming', '/notebook.html?tab=lessons', '/notebook.html?tab=messages', '/notebook.html?tab=subjects',
  '/progress.html', '/settings.html', '/subject.html?id=math', '/subject.html?id=phys', '/lesson.html?id=l1', '/lesson.html?id=l2',
  '/session.html?subject=math&topic=x&test=t1&mode=learn', '/session.html?subject=phys&topic=x&mode=test', '/homework.html', '/teachers.html', '/subjects.html'];
const withDemo = p => p + (p.includes('?') ? '&' : '?') + 'demo';
// English that may stay in Hebrew: names, demo data, sources
const OK_EN = /^(Study|Mashov|Ofek|WhatsApp|Claude|Physics|Maths|English|Essay|draft|Kinematics|test|Maths retest|Worksheet|EN|AI|PDF|demo|example|com|Volleyball|Robotics|Notes|Free|fall)$/i;
const found = new Map();
const add = (k, v) => { if (!found.has(k)) found.set(k, new Set()); found.get(k).add(v); };

(async () => {
  const browser = await chromium.launch();
  const VIEWS = [['phone', 390, 844], ['android', 360, 740], ['desktop', 1280, 900]];
  for (const [tag, w, h] of VIEWS) for (const lang of ['en', 'he']) for (const scheme of (tag === 'phone' ? ['light', 'dark'] : ['light'])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: tag !== 'desktop', hasTouch: tag !== 'desktop' });
    await ctx.addInitScript(l => { try { localStorage.setItem('sh:lang', l); } catch (e) {} }, lang);
    for (const p of PAGES) {
      const page = await ctx.newPage(), where = `${tag}/${lang}/${scheme} ${p}`;
      page.on('console', m => { if (m.type() === 'error') add('console error', where + ': ' + m.text()); });
      page.on('pageerror', e => add('crash', where + ': ' + e.message));
      page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) add('missing file', where + ': ' + r.status() + ' ' + r.url().replace(BASE, '')); });
      await page.goto(BASE + withDemo(p), { waitUntil: 'networkidle' }).catch(e => add('load', where + ': ' + e.message));
      await page.waitForTimeout(900);
      const r = await page.evaluate(({ he }) => {
        const out = { over: document.documentElement.scrollWidth - innerWidth, small: [], tiny: [], en: [], links: [], blank: [] };
        const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !el.closest('[hidden],details:not([open]) > :not(summary)'); };
        document.querySelectorAll('a[href],button,select,input:not([type=hidden]),summary').forEach(el => {
          if (!vis(el) || el.closest('.prose,.transcript,.bubble,p')) return;
          const b = el.getBoundingClientRect();
          if (b.height < 36 || b.width < 36) out.small.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
        });
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; while ((n = walk.nextNode())) {
          const el = n.parentElement; if (!el || !n.textContent.trim() || !vis(el) || el.closest('script,style,.katex,svg')) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) out.tiny.push(n.textContent.trim().slice(0, 30) + ' ' + fs + 'px');
          if (he) (n.textContent.match(/[A-Za-z][A-Za-z’']{2,}/g) || []).forEach(w => out.en.push(w));
          if (/undefined|NaN|\[object|null\b/.test(n.textContent)) out.blank.push(n.textContent.trim().slice(0, 60));
        }
        document.querySelectorAll('a[href]').forEach(a => { const u = new URL(a.href, location.href); if (u.origin === location.origin) out.links.push(u.pathname); });
        return out;
      }, { he: lang === 'he' });
      if (r.over > 1) add('sideways scroll', where + ': ' + r.over + 'px');
      r.small.forEach(x => add('small tap target', `${tag} ${p}: ${x}`));
      r.tiny.forEach(x => add('tiny text', `${tag} ${p}: ${x}`));
      r.blank.forEach(x => add('undefined/NaN on screen', `${where}: ${x}`));
      r.en.filter(x => !OK_EN.test(x)).forEach(x => add('English left in Hebrew', `${p}: ${x}`));
      for (const l of new Set(r.links)) add('_links', l);
      await page.close();
    }
    await ctx.close();
  }
  // every internal link exists
  const ctx0 = await browser.newContext(); const pg = await ctx0.newPage();
  for (const l of found.get('_links') || []) { const res = await pg.request.get(BASE + l); if (res.status() >= 400) add('broken link', l + ' ' + res.status()); }
  found.delete('_links'); await ctx0.close();

  // tap every button on every page (phone, English and Hebrew), fresh load each time
  for (const lang of ['en', 'he']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(l => { try { localStorage.setItem('sh:lang', l); } catch (e) {} }, lang);
    for (const p of PAGES) {
      const probe = await ctx.newPage();
      await probe.goto(BASE + withDemo(p), { waitUntil: 'networkidle' }); await probe.waitForTimeout(700);
      const n = await probe.evaluate(() => document.querySelectorAll('button, summary, select, label.tile').length);
      await probe.close();
      for (let i = 0; i < n; i++) {
        const page = await ctx.newPage(), errs = [];
        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        page.on('dialog', d => { errs.push('dialog: ' + d.message()); d.dismiss(); });
        await page.goto(BASE + withDemo(p), { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
        const label = await page.evaluate(i => { const el = document.querySelectorAll('button, summary, select, label.tile')[i]; return el ? (el.textContent || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 40) : null; }, i);
        if (!label || /sign out|התנתקות/i.test(label)) { await page.close(); continue; }
        try {
          const el = page.locator('button, summary, select, label.tile').nth(i);
          if (await el.isVisible()) {
            const tagName = await el.evaluate(e => e.tagName);
            if (tagName === 'SELECT') { const v = await el.evaluate(e => (e.options[e.options.length - 1] || {}).value); if (v) await el.selectOption(v); }
            else if (tagName === 'LABEL') {} else await el.click({ timeout: 2000 });
            await page.waitForTimeout(700);
            // after the tap: a sheet may open; tap its first button too
            const sheetBtn = page.locator('.sheet.on button, .sheet.on a.btn').first();
            if (await sheetBtn.count() && await sheetBtn.isVisible().catch(() => false)) {
              const href = await sheetBtn.getAttribute('href').catch(() => null);
              if (!href) { await sheetBtn.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600); }
            }
            const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            if (over > 1) errs.push('sideways scroll ' + over + 'px after tap');
          }
        } catch (e) { errs.push('tap failed: ' + e.message.split('\n')[0]); }
        errs.forEach(e => add('after a tap', `${lang} ${p} [${label}]: ${e}`));
        await page.close();
      }
    }
    await ctx.close();
  }
  await browser.close();
  if (!found.size) { console.log('no problems found'); return; }
  for (const [k, v] of found) { console.log(`\n## ${k} (${v.size})`); Array.from(v).slice(0, 40).forEach(x => console.log(' - ' + x)); }
})();
