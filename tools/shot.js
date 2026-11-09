// Screenshots every page in ?demo mode at phone (390px) and desktop (1280px) width, taps
// through the main flows, and fails on console errors or sideways scrolling.
// Run: node tools/serve.js . &  then
//      PLAYWRIGHT_PATH=$(npm root -g)/playwright SHOT_DIR=/tmp/shots node tools/shot.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:5178';
const DIR = process.env.SHOT_DIR || 'shots';
fs.mkdirSync(DIR, { recursive: true });
const PAGES = [
  ['home', '/?demo'],
  ['subject', '/subject.html?id=phys&demo'],
  ['lesson', '/lesson.html?id=l1&demo'],
  ['tutor-teach', '/tutor.html?subject=phys&mode=teach&demo'],
  ['tutor-test', '/tutor.html?subject=phys&mode=test&demo'],
  ['login', '/login.html']
];
(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const [w, h, tag] of [[390, 844, 'phone'], [1280, 900, 'desktop']]) {
    for (const scheme of ['light', 'dark']) {
      if (scheme === 'dark' && tag === 'desktop') continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme });
      for (const [name, path] of PAGES) {
        const page = await ctx.newPage();
        page.on('console', m => { if (m.type() === 'error') problems.push(`${tag}/${name}: console: ${m.text()}`); });
        page.on('pageerror', e => problems.push(`${tag}/${name}: ${e.message}`));
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) problems.push(`${tag}/${name}: sideways overflow ${over}px`);
        await page.screenshot({ path: `${DIR}/${tag}-${scheme}-${name}.png`, fullPage: true });
        if (tag === 'phone' && scheme === 'light' && name === 'home') {
          await page.click('#add'); await page.waitForTimeout(400);
          await page.screenshot({ path: `${DIR}/${tag}-add-sheet.png` });
          await page.click('[data-k="lesson"]'); await page.waitForTimeout(400);
          await page.screenshot({ path: `${DIR}/${tag}-add-lesson.png` });
          await page.goto(BASE + path, { waitUntil: 'networkidle' });
          await page.click('[data-done]'); await page.waitForTimeout(600);
          await page.screenshot({ path: `${DIR}/${tag}-homework-done.png` });
        }
        if (tag === 'phone' && scheme === 'light' && name === 'tutor-test') {
          await page.fill('#input', 'y(t)=45+5t-5t^2');
          await page.click('#send'); await page.waitForTimeout(1500);
          await page.screenshot({ path: `${DIR}/${tag}-tutor-verdict.png`, fullPage: true });
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
  console.log('all pages ok');
})();
