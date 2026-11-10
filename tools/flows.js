// The main flows, step by step, with checks (demo mode). Fails loudly on the first wrong result.
// Run: node tools/serve.js . &  then  PLAYWRIGHT_PATH=$(npm root -g)/playwright node tools/flows.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5178';
const results = [];
const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? ' — ' + extra : ''));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  const open = async path => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(path + ': ' + e.message)); await p.goto(BASE + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(700); return p; };

  // 1. Notebook: "Not my test" folds a test away, Undo brings it back, "Mine" too
  let p = await open('/notebook.html?tab=coming&demo');
  const count = () => p.evaluate(() => ({ mine: document.querySelectorAll('[data-test]').length, other: document.querySelectorAll('[data-mine]').length }));
  const c0 = await count();
  ok('notebook shows other groups\' tests folded', c0.other === 2, JSON.stringify(c0));
  await p.click('[data-test]'); await p.waitForTimeout(400); await p.click('#not-mine'); await p.waitForTimeout(500);
  const c1 = await count();
  ok('"Not my test" moves it to the fold', c1.mine === c0.mine - 1 && c1.other === c0.other + 1, JSON.stringify(c1));
  await p.click('.toast button'); await p.waitForTimeout(500);
  const c2 = await count();
  ok('Undo brings it back', c2.mine === c0.mine && c2.other === c0.other, JSON.stringify(c2));
  await p.click('details.fold summary'); await p.click('[data-mine]'); await p.waitForTimeout(500);
  const c3 = await count();
  ok('"Mine" brings a folded test back', c3.mine === c0.mine + 1 && c3.other === c0.other - 1, JSON.stringify(c3));
  // homework tick + undo
  const todo0 = await p.textContent('[data-f="todo"]');
  await p.click('[data-tog]'); await p.waitForTimeout(500);
  const todo1 = await p.textContent('[data-f="todo"]');
  ok('ticking homework lowers the to-do count', todo0 !== todo1, todo0 + ' → ' + todo1);
  await p.click('.toast button'); await p.waitForTimeout(500);
  ok('Undo un-ticks it', (await p.textContent('[data-f="todo"]')) === todo0);
  // tabs
  for (const tb of ['lessons', 'messages', 'subjects', 'coming']) { await p.click(`[data-tab="${tb}"]`); await p.waitForTimeout(300); }
  ok('notebook tabs switch and keep the URL', p.url().includes('tab=coming'));
  await p.close();

  // 2. Messages: tell once who a teacher is → their messages sort
  p = await open('/notebook.html?tab=messages&demo');
  ok('unknown teacher asked once', await p.locator('[data-who]').count() === 1);
  await p.selectOption('[data-who]', 'school'); await p.waitForTimeout(600);
  ok('after picking, nobody is unknown', await p.locator('[data-who]').count() === 0);
  await p.close();

  // 3. Groups: picking a group changes which tests are yours
  p = await open('/settings.html?demo');
  const chem = p.locator('[data-g="כימיה"]');
  ok('groups list shown in Settings', await chem.count() === 1);
  ok('groups guessed from Mashov (physics on, chemistry off)', (await p.getAttribute('[data-g="פיזיקה"]', 'aria-pressed')) === 'true' && (await chem.getAttribute('aria-pressed')) === 'false');
  const fitBefore = await p.evaluate(() => SH.testFit(SH.school.get(SH.K.te).find(x => x.id === 'cal-c1')));
  await chem.click(); await p.waitForTimeout(700);
  const fitAfter = await p.evaluate(() => SH.testFit(SH.school.get(SH.K.te).find(x => x.id === 'cal-c1')));
  ok('chemistry test: other → mine after picking chemistry', fitBefore === 'other' && fitAfter === 'mine', fitBefore + ' → ' + fitAfter);
  ok('other-class test stays folded whatever groups', await p.evaluate(() => SH.testFit(SH.school.get(SH.K.te).find(x => x.id === 'cal-l1'))) === 'other');
  // theme
  await p.click('[data-th="dark"]'); await p.waitForTimeout(200);
  ok('Dark theme applies', (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await p.click('[data-th="light"]'); await p.waitForTimeout(200);
  ok('Light theme applies', (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
  await p.close();

  // 4. Record: pick a lesson from today's list, record, tabs hide, stop
  p = await open('/record.html?demo');
  const n = await p.locator('[data-p]').count();
  ok('today\'s lessons listed', n > 0, 'count ' + n);
  await p.locator('[data-p]').nth(2).click(); await p.waitForTimeout(300);
  const subj = await p.textContent('.rec-subj');
  ok('tapping a lesson picks its subject', /English|אנגלית/.test(subj), subj);
  await p.click('#start'); await p.waitForTimeout(800);
  ok('recording hides the tabs', !(await p.isVisible('.tabs')));
  await p.click('#flag'); await p.waitForTimeout(200);
  ok('"On the test!" counts a mark', /⚑ 1/.test(await p.textContent('#mc')));
  await p.click('#stop'); await p.waitForTimeout(800);
  ok('stop brings the tabs back', await p.isVisible('.tabs'));
  ok('after stopping: link to Lessons', await p.locator('text=Lessons').count() > 0);
  await p.close();

  // 5. Session: learn → example → your turn → check → rate → finish marks tonight done
  p = await open('/session.html?subject=math&topic=x&test=t1&mode=learn&demo');
  await p.click('#next'); await p.waitForTimeout(900); await p.click('#next'); await p.waitForTimeout(900);
  await p.click('#type'); await p.fill('#ask-in', 'y = 2x'); await p.click('#ask button[type=submit]'); await p.waitForTimeout(900);
  ok('a verdict comes back', await p.locator('.verdict').count() > 0);
  await p.click('[data-rate="alone"]'); await p.waitForTimeout(500);
  ok('after rating: another question / finish', await p.locator('#again').count() === 1);
  await p.click('#again'); await p.waitForTimeout(900);
  ok('another question goes back to Your turn', await p.locator('#snap').count() === 1);
  await p.close();

  // 6. Home → Tutor → Start opens a session with the right subject
  p = await open('/tutor.html?demo');
  const href = await p.getAttribute('#now a.btn.accent', 'href');
  ok('Tutor "Start" opens a session for the next test', /session\.html\?.*subject=math/.test(href || ''), href);
  ok('Tutor lists only your tests', !(await p.textContent('#tests')).includes('בכימיה'));
  await p.close();
  p = await open('/?demo');
  ok('Home mentions tests that are probably not yours', /probably not yours/.test(await p.textContent('#next')));
  ok('Home has no chemistry test', !(await p.textContent('#next')).includes('בכימיה'));
  await p.close();

  // 7. Old links still work
  for (const [from, want] of [['/homework.html?demo', 'tab=coming'], ['/teachers.html?demo', 'tab=messages'], ['/subjects.html?demo', 'tab=subjects'], ['/tutor.html?subject=math&demo', 'session.html']]) {
    p = await open(from); ok('old link ' + from.split('?')[0] + ' still lands right', p.url().includes(want), p.url()); await p.close();
  }

  ok('no crashes during the flows', !errs.length, errs.join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
})();
