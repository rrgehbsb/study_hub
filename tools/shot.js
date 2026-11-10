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
  ['today', '/?demo'],
  ['session-learn', '/session.html?subject=math&topic=%D7%9E%D7%A9%D7%99%D7%A7&test=t1&mode=learn&demo'],
  ['session-test', '/session.html?subject=math&topic=%D7%9E%D7%A9%D7%99%D7%A7&test=t1&mode=test&demo'],
  ['homework', '/homework.html?demo'],
  ['subjects', '/subjects.html?demo'],
  ['subject', '/subject.html?id=math&demo'],
  ['teachers', '/teachers.html?demo'],
  ['progress', '/progress.html?demo'],
  ['record', '/record.html?demo'],
  ['settings', '/settings.html?demo'],
  ['lesson', '/lesson.html?id=l1&demo'],
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
        if (tag === 'phone' && scheme === 'light' && name === 'session-learn') {
          await page.click('#next'); await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/${tag}-session-example.png`, fullPage: true });
          await page.click('#next'); await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/${tag}-session-turn.png`, fullPage: true });
          await page.click('#type'); await page.fill('#ask-in', 'y = -3x + 3'); await page.click('#ask button[type=submit]'); await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/${tag}-session-check.png`, fullPage: true });
          await page.click('[data-rate="alone"]'); await page.waitForTimeout(400);
          await page.screenshot({ path: `${DIR}/${tag}-session-after.png`, fullPage: true });
        }
        if (tag === 'phone' && scheme === 'light' && name === 'record') {
          await page.click('#start'); await page.waitForTimeout(1000);
          await page.click('#flag'); await page.waitForTimeout(300);
          await page.screenshot({ path: `${DIR}/${tag}-recording.png`, fullPage: true });
        }
        if (tag === 'phone' && scheme === 'dark' && name === 'settings') {
          await page.click('[data-th="light"]'); await page.waitForTimeout(300);
          await page.screenshot({ path: `${DIR}/${tag}-settings-forced-light.png` });
          await page.click('#wk-chat'); await page.waitForTimeout(300);
          await page.fill('#cs-in', 'volleyball mon tue 5-7, robotics sunday till 8'); await page.click('#cs-f button[type=submit]'); await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/${tag}-week-chat.png` });
          await page.click('#cs-ok'); await page.waitForTimeout(300);
          await page.click('#wk-chat'); await page.waitForTimeout(300);
          await page.click('#wc-imp'); await page.waitForTimeout(300);
          await page.fill('textarea[name=text]', 'Here you go:\n```studyhub\n{"version":1,"week":[{"name":"Volleyball","days":[1,2],"start":"17:00","end":"19:00"}],"sessions":[{"date":"' + new Date().toISOString().slice(0,10) + '","start":"20:00","end":"20:40","subject":"Maths","topic":"משיק","goal":"2 test questions alone"}]}\n```');
          await page.waitForTimeout(200);
          await page.screenshot({ path: `${DIR}/${tag}-import.png` });
          await page.click('#imp-f button[type=submit]'); await page.waitForTimeout(500);
          await page.click('[data-th="auto"]').catch(() => {});
        }
        if (tag === 'phone' && scheme === 'light' && name === 'today') {
          await page.click('#skip'); await page.waitForTimeout(300);
          await page.fill('#cs-in', 'I have practice late, I am wiped'); await page.click('#cs-f button[type=submit]'); await page.waitForTimeout(1200);
          await page.screenshot({ path: `${DIR}/${tag}-change-tonight.png` });
          await page.click('#cs-ok'); await page.waitForTimeout(500);
          await page.screenshot({ path: `${DIR}/${tag}-tonight-changed.png`, fullPage: true });
          await page.click('.only-phone [data-lang="he"]'); await page.waitForTimeout(1500);
          await page.screenshot({ path: `${DIR}/${tag}-today-hebrew.png`, fullPage: true });
          await page.click('.only-phone [data-lang="en"]'); await page.waitForTimeout(800);
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
