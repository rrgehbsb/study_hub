# Study Hub — build plan

Tick items (`[x]`) as they're done and add a dated line to the log at the bottom. Phases go in order: a phase starts only when the one before it is used for real, not just built. Exception: the owner can ask to jump ahead.

The owner's full wish list is in `docs/vision.md`. This plan is the order to build it in.

---

## Owner setup (the owner does these; Claude can't)

- [ ] Make the GitHub repo `rrgehbsb/study_hub` reachable by Claude (public, or install the Claude GitHub app on it).
- [ ] Supabase (the same project as the main Dashboard): SQL Editor → New query → paste `supabase/schema.sql` → Run.
- [ ] Vercel: Add New → Project → import `study_hub` → Deploy (no build settings needed).
- [ ] Vercel → Settings → Environment Variables:
  - `ALLOWED_EMAILS` = the owner's login email
  - `GROQ_API_KEY` from console.groq.com (free, no card)
  - `ANTHROPIC_API_KEY` from console.anthropic.com, **with a monthly spend limit of $10** (Settings → Limits)
  - optional: `GEMINI_API_KEY` from aistudio.google.com (free)
  - `MASHOV_USER` and `MASHOV_PASS`: the Mashov login (after changing the password that was shared in a screenshot)
  - then Deployments → Redeploy
- [x] Re-run `supabase/schema.sql` after v0.2.0.
- [x] Re-run `supabase/schema.sql` after v0.3.0 (recording status, marks, session chats, mistakes). Safe to run again.
- [ ] Open the site on the iPhone → Share → Add to Home Screen. Sign in with the main Dashboard account.
- [ ] Ask each teacher whether recording lessons is OK.

---

## Phase 1 — the tutor works on real material (target: first week)

Goal: upload a real lesson, then study it with a tutor at the teacher's level.

- [x] `CLAUDE.md`, `PLAN.md`, `docs/vision.md`
- [x] `supabase/schema.sql`: study tables, policies, private `study` bucket
- [x] Home: next-test hero, "Up next" (tests + homework from the shared `uid:school` row, tap to finish homework with Undo), subjects, + Add sheet
- [x] Add sheet: lesson recording, board photo, notes, teacher summary (paste), old test (photo/PDF), homework, test — all saved to the shared school row or study tables
- [x] Subject page: Teach me / Test me, topics with state, lessons, materials
- [x] Lesson page: transcript + summary
- [x] `api/transcribe.js`: Groq Whisper (Hebrew) → transcript → Gemini summary + topics → audio deleted
- [x] `api/read-file.js`: board photo / notes / old test (image or PDF) → Claude → text
- [x] `api/tutor.js`: context from old tests + transcripts + materials, cached; teach and test modes; daily call limit
- [x] Tutor page: chat, math rendering (KaTeX), photo of your solution, "solved alone / needed help" → attempts + topic state
- [x] `?demo` mode and `tools/shot.js`
- [ ] **Owner:** run the setup above, upload one real physics lesson, check the Hebrew transcript.
- [ ] Test sync both directions with the main Dashboard: add homework in each app, see it in the other.
- [ ] Fix whatever the first real lesson shows (likely: transcript quality, upload size, tutor tone).

Known limits to handle in this phase if they bite:
- **Recordings over 25 MB** (Groq's free cap). Voice Memos "Compressed" quality is about 0.5 MB/min, so 45 minutes is close. If uploads fail: split the audio server-side (ffmpeg in the function, or a GitHub Action), or record two shorter files.
- **Vercel function time limit.** `vercel.json` asks for 60 s; Groq usually transcribes 45 min in well under that. If it times out, move transcription to a background job (GitHub Action triggered by a webhook).

## v0.3 — the chosen design (done 2026-11-10)

- [x] Coach look (A) + course layout per subject (C), phone and computer, light and dark
- [x] English / Hebrew app, teaching language per session
- [x] Today with the planner (tonight's block, your day, "move to tomorrow")
- [x] Study session in 4 steps with graphs drawn from the tutor's ```plot blocks
- [x] Homework, Subjects, From teachers, Progress (mistakes that repeat, Mashov grades), Settings (your week)
- [x] Record a lesson in the app with board photos and "On the test!" marks placed in the transcript
- [ ] **Owner:** re-run the schema, set your week in Settings, record one real lesson, do one real session
- [ ] Check on a real iPhone: recording with the screen on for a whole lesson (iOS may stop recording if the app is left)

## v0.3.1 — owner feedback (done 2026-11-10)

- [x] White background option: Settings → Appearance → Light / Dark / Auto
- [x] Week planned in conversation: "Plan my week with Claude" (prompt → regular Claude interviews → ```studyhub block → Import), plus a quick in-app chat (`api/week.js`)
- [x] "Change tonight": not tonight / shorter / later, or in your own words
- [ ] **Owner:** plan the week once with Claude and import it

## v0.4 — the owner's blueprint (done 2026-11-10)

- [x] Tabs: Home · Tutor · Record (main, middle) · Notebook · Progress
- [x] Tutor page: knows the tests, what to teach next, Teach me / Test me per test
- [x] Record picks the lesson from the class timetable (your group), today's lessons to tap
- [x] Notebook replaces Homework / Subjects / From teachers: coming up, lessons with summaries + transcripts, messages, subjects
- [x] Your groups + teachers set once (Mashov groups when available); messages sort themselves
- [x] Tests of other groups / classes fold into "Probably not yours" (never deleted, one tap back)
- [x] Android: color-scheme, text-size-adjust, Hebrew font preloaded, checked at 360px
- [ ] **Owner:** check that "Groups you're in" in Settings is right; send a screenshot if Android text still looks off
- [ ] First real Mashov run: check `groupFields` and that the groups list fills

## Phase 2 — the best possible transcript and teaching

- [ ] Compare Groq Whisper with ivrit.ai's Hebrew Whisper (`ivrit-ai/whisper-large-v3`) on the same real lesson; keep the winner. ivrit.ai has no hosted API, so if it wins it runs in a GitHub Action (free minutes) or on the owner's PC.
- [ ] Link board photos to the lesson by time (a photo taken during a lesson's timetable slot belongs to that lesson), so the tutor sees "what was on the board when the teacher said X".
- [ ] Topics: build the topic list per subject from transcripts and old tests (Gemini), owner can rename/merge with one tap.
- [ ] "Timed practice test" mode: 2 to 4 questions in the style of the teacher's test, timer, checked at the end.
- [ ] Maths subject with the owner's maths material (the owner wants maths explained in Hebrew).

## Phase 3 — everything comes in by itself

- [ ] **Share-to-Study inbox** `api/inbox.js` + an iPhone Shortcut ("Send to Study") in the share sheet: WhatsApp teacher summaries, board photos, PDFs. Auth with a personal inbox token (Shortcuts can't sign in). The subject is guessed from the timetable and the text, and can be changed with one tap.
- [ ] **"Record lesson" Shortcut**: starts a Voice Memo; when stopped, uploads it with the subject from the timetable slot.
- [x] **School calendar** (v0.2.0): `api/calendar.js` reads `https://handasaim.co.il/calendar/<class>.ics`; the home page adds new tests to the shared school row (id `cal-<uid>`, `calUid`, `source:'calendar'`), follows date changes, and links to an own test on the same day. Class from the Dashboard's timetable (`cls`) or Study Hub's own setting.
- [x] **Mashov** (v0.2.0, **untested against the real Mashov**: the dev sandbox can't reach web.mashov.info): `api/mashov.js` logs in with `MASHOV_USER`/`MASHOV_PASS` (school 570358, year computed) using the endpoints of the unofficial libraries, returns homework + the last 30 days of teacher messages. The home page runs it at most every 30 min: homework → school row (id `mashov-hw-<id>`), messages → `study_materials` kind `teacher_message` (subject guessed from the teacher's name in the Dashboard timetable, else `inbox`). It returns `homeworkFields` so the field mapping can be fixed after the first real run.
- [ ] First real Mashov run: check homework fields, due dates, message subjects; fix the mapping.
- [ ] Mashov files (PDFs teachers attach) → `read-file` so the tutor can read them.
- [ ] **Ofek**: some teachers post homework only there. First find out how its login works (likely the Ministry of Education login). Options in order: an API the Ofek site itself calls; a headless browser in a GitHub Action; manual add (current fallback).
- [ ] De-duplicate: the same homework from Mashov and Ofek is one item.

## Phase 4 — the planner

- [x] Weekly fixed activities (volleyball, robotics, gym, travel) entered once (v0.3, Settings). When the main Dashboard's weekly planner exists, read it from the shared database instead.
- [x] Free slots = timetable + fixed activities + travel, per day (v0.3, `SH.plan`).
- [ ] Study need per test: topics × readiness (topics not `alone` need time), minimum lead time (start 5 to 7 days before).
- [~] The plan (tonight only so far): 25–40 minute blocks in free slots, at most one block on a training day unless a test is within 3 days. Re-plans when a test date, topic list or readiness changes.
- [ ] Afternoon push notification with tonight's block; tapping it opens the tutor on that topic. (Copy web-push from the main Dashboard: `api/notify.js`, VAPID keys.)
- [ ] Tonight's block + homework due soon on the main Dashboard's Today (a small change in the main repo, through the shared database).

---

## Log

- 2026-11-10 (night): v0.4.1 — bug hunt (tools/check.js + tools/flows.js). Fixed: crash when the clipboard refuses the Claude prompt; Record page's last button hidden behind the tabs; small tap targets; English labels left in Hebrew; a "Done for tonight" without any question tried; group matching by word stem (מבחן באפליקציה → פיתוח אפליקציות); sender-less Mashov messages; Mashov subjects saved before teachers point at them.

- 2026-11-10 (evening): v0.4.0 — owner's blueprint: new tabs, Tutor page, Record as a main tab with the timetable, Notebook, groups/teachers set once, other groups' tests folded away. The sandbox can now reach Mashov, the school site and the live app (allowed domains): calendar + timetable checked live; Mashov login format accepted.
- 2026-11-10 (later): v0.3.1 — light/dark/auto switch; week planning in regular Claude with import back; in-app week and "Change tonight" assistant; imported sessions and per-day overrides in the planner.
- 2026-11-10: v0.3.0 — owner picked design A (Coach) with C's course layout and the building blocks; rebuilt every page, added the planner, step sessions with graphs, in-app recording, progress, settings, Hebrew.
- 2026-11-09 (later): v0.2.0 — school calendar + Mashov import, class setup, "From teachers" on home, sync status in Account. Owner wants everything pulled in automatically, not typed.
- 2026-11-09: Repo started. Phase 1 code written in one night (unattended): pages, functions, schema, demo mode. Not yet tested against real Supabase/API keys.
