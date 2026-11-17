// Record page end to end with a fake microphone (Chromium): MP3 out, double tap, redraw, black screen, crash recovery.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const OUT = process.env.OUT || '/tmp/rec-test'; fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5178';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PATCH = `<script>(function(){var S=window.SH;S.DEMO=false;window.__gum=0;var g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=function(c){window.__gum++;return g(c)};
window.__SEG_MS=+sessionStorage.getItem('seg')||4000;window.__parts=[];var b64=async function(f){var b=new Uint8Array(await f.arrayBuffer());var s='';for(var i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return btoa(s);};
S.upload=async function(kind,f,ext){window.__parts.push({kind:kind,ext:ext,type:f.type,size:f.size,b64:await b64(f)});return 'demo/'+kind+'/p'+window.__parts.length+'.'+ext;};
S.uploadLessonAudio=async function(f){window.__up={type:f.type,name:f.name,size:f.size,b64:await b64(f)};return {id:'x'};};})();</script>`;
(async () => {
  const br = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(process.env.FAKE_WAV ? ['--use-file-for-fake-audio-capture=' + process.env.FAKE_WAV] : []), '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await ctx.route('**/record.html*', async r => { const res = await r.fetch(); let h = await res.text(); h = h.replace(/(<script src="\/app.js[^"]*"><\/script>)/, '$1' + PATCH); r.fulfill({ response: res, body: h }); });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // all parts sent so far (from index `from`), joined into one file = what the transcriber gets, in order
  const save = async (name, from) => { const ps = (await page.evaluate(() => window.__parts)).slice(from || 0); if (!ps.length) return null; const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.concat(ps.map(p => Buffer.from(p.b64, 'base64')))); return { f, n: ps.length, ext: ps.map(p => p.ext) }; };
  const probe = f => { try { return require('child_process').execSync('ffprobe -v error -show_entries format=duration,format_name -of csv=p=0 ' + f).toString().trim(); } catch (e) { return 'ERR'; } };

  await page.goto(BASE + '/record.html?demo'); await page.waitForSelector('#start');
  // 1) double tap: one recorder only
  await page.evaluate(() => { const b = document.querySelector('#start'); b.click(); b.click(); b.click(); });
  await page.waitForSelector('#time', { timeout: 8000 });
  ok(await page.evaluate(() => window.__gum) === 1, 'triple tap on Start opens the microphone once');
  await page.waitForTimeout(3000);
  // 2) something wipes the screen mid-recording: it comes back, no error
  await page.evaluate(() => { document.querySelector('#view').innerHTML = '<p>other</p>'; });
  await page.waitForTimeout(600);
  ok(!!(await page.$('#time')), 'recording screen redraws itself if something replaces it');
  // 3) black screen and back
  await page.click('#dark'); await page.waitForTimeout(500);
  ok(!!(await page.$('#blackout')), 'black screen shows');
  const box = await page.locator('.blackout-hit').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
  ok(!(await page.$('#blackout')), 'holding the middle brings the screen back');
  await page.waitForTimeout(6000);
  const tm = await page.textContent('#time');
  ok(/^0:(09|1\d)$/.test(tm), 'timer runs (' + tm + ')');
  let hmax = 0; for (let i = 0; i < 12; i++) { hmax = Math.max(hmax, await page.evaluate(() => Math.max(...[...document.querySelectorAll('#wave span')].map(b => parseFloat(b.style.height) || 0)))); await page.waitForTimeout(150); }
  ok(hmax > 14, 'the sound bars move (' + hmax + ' px)');
  await page.screenshot({ path: path.join(OUT, 'recording.png') });
  await page.click('#stop');
  await page.waitForFunction(() => /saved|נשמר/.test(document.querySelector('#view').textContent), null, { timeout: 15000 });
  const r1 = await save('lesson.mp3');
  ok(r1 && r1.n >= 3 && r1.ext.every(e => e === 'mp3'), 'the lesson went up in ' + (r1 && r1.n) + ' MP3 parts while recording (one every few seconds in this test, 5 min for real)');
  const p1 = probe(r1.f); const d1 = parseFloat(p1.split(',')[1] || p1.split(',')[0]);
  console.log('   ffprobe:', p1);
  ok(/mp3/.test(p1) && d1 > 8 && d1 < 15, 'the MP3 opens and is ~10 s long (' + d1 + ' s)');
  await page.waitForTimeout(500);
  ok(/saved|נשמר/.test(await page.textContent('#view')), 'shows Lesson saved');
  // 4) crash in the middle: reload, then "Upload it"
  // crash test: long parts (60 s) so the recording is still only on the phone when the app closes
  await page.evaluate(() => sessionStorage.setItem('seg', '60000')); await page.reload(); await page.waitForSelector('#start');
  const n0 = 0;
  await page.evaluate(() => document.querySelector('#start').click());
  await page.waitForTimeout(10000);
  const before = await page.evaluate(() => window.__parts);
  await page.reload(); // the app closes mid-lesson
  await page.waitForFunction(() => window.__parts && window.__parts.length > 0, null, { timeout: 15000 }).catch(async () => console.log('   rescue box:', await page.evaluate(() => { const r = document.querySelector('#rescue'); return r ? r.hidden + '|' + r.textContent : 'none'; })));
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => window.__parts);
  const all = after;
  fs.writeFileSync(path.join(OUT, 'recovered.mp3'), Buffer.concat(all.map(p => Buffer.from(p.b64, 'base64'))));
  const p2 = probe(path.join(OUT, 'recovered.mp3'));
  console.log('   crash: ' + after.length + ' part sent by itself after reopening:', p2);
  ok(/mp3/.test(p2) && parseFloat(p2.split(',')[1]) > 8, 'after the app closes mid-lesson, reopening Record sends the rest by itself; nothing lost');
  ok(/Sent|נשלח/.test(await page.textContent('#rescue')), 'it says it sent it');
  // 5) split + convert helpers
  const sp = await page.evaluate(async () => {
    const u = Uint8Array.from(atob(window.__parts[window.__parts.length - 1].b64), c => c.charCodeAt(0));
    const parts = window.SH.splitMp3(u, 3000);
    return Promise.all(parts.map(async b => { const x = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < x.length; i += 32768) s += String.fromCharCode.apply(null, x.subarray(i, i + 32768)); return btoa(s); }));
  });
  let good = 0; sp.forEach((b, i) => { const f = path.join(OUT, 'part' + i + '.mp3'); fs.writeFileSync(f, Buffer.from(b, 'base64')); if (/mp3/.test(probe(f))) good++; });
  ok(sp.length > 1 && good === sp.length, 'an MP3 cut into ' + sp.length + ' parts: every part opens');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
