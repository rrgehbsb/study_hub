# Study Hub

A personal **learning dashboard PWA** for one high-school student (the owner, Tom, 11th grade at תיכון הנדסאים הרצליה, school code 570358). It collects school info (homework, tests, teacher material), teaches each topic at the level of the owner's own teachers, and plans when to study around a busy week (volleyball, robotics, gym).

It is a **separate app** from the owner's main Dashboard (https://github.com/rrgehbsb/Dashboard), but it **shares the same Supabase project**, so the two apps see the same homework and tests and will later share the weekly schedule.

`PLAN.md` is the build plan: phases, steps and their status. **Read it before starting, and tick items off in it as you finish them.**

---

## 0. Why this exists (read this first)

The owner failed two tests in a row. Not for lack of effort: they studied at home, often from zero, felt good, and then felt lost in the test. What went wrong:

- **Practice was too guided.** Studying with an AI chat meant small steps and hints. That trains understanding an explanation, not solving an unfamiliar test question alone.
- **The level didn't match the teacher's.** Studying from topic lists gave easier questions than the teacher's tests.
- **No time and no energy.** Volleyball and robotics; the owner comes home tired. Anything that needs setup, prompts or decisions doesn't get used.

So the app's three jobs, in order of importance:

1. **Teach to the test, at the teacher's level.** From the teacher's own words (lesson transcripts), board photos, teacher summaries and the teacher's old tests. Every topic ends with a question the owner solves **alone**, checked by the tutor.
2. **Know everything without the owner typing it.** Homework and tests flow in from the school calendar, Mashov, Ofek and WhatsApp.
3. **Plan the time.** Find free slots, decide how much to study before each test, and tell the owner when to start ("Physics test in 5 days. Tonight 19:00: free fall").

---

## 1. How to work with this owner

- **Less is more. Zero effort is the goal.** Judge every feature by what it asks the owner to do against what it gives back. No forms when a default works. No prompts to write: the tutor opens already loaded with the right subject, topic and material.
- **The owner is not deeply technical and gets overwhelmed by long text.** Explain in plain language, short. Make the call; ask only questions that genuinely need their answer.
- **Never build features that make studying feel done when it isn't.** A summary read counts for nothing. Progress = questions solved alone. Don't add streaks, XP, confetti or guilt copy (same rule as the main Dashboard).
- **Standing permission to deploy:** after each batch of changes, bump the version (§6), commit straight to `main` and push. Always tell the owner it's live.
- **Verify in a real browser** at phone width (390px) AND desktop width before claiming something works. `?demo` (§7) works without login or keys.
- **Never touch the owner's main Dashboard repo from here** unless the owner asks. Integration happens through the shared database (§3).
- **Exam weeks:** the owner should not be building in the week before a test. If they ask for big features then, say so once, briefly.

---

## 2. Stack

- **Vanilla HTML/CSS/JS, no build step, no framework.** Same as the main Dashboard, so the owner can read it. Libraries are self-hosted in `/vendor/` (Supabase, KaTeX, marked), so the installed app works offline. `package.json` is empty on purpose.
- **Supabase** (auth + Postgres + Storage), project `mtuoqwbrujxutofhyahb`, shared with the main Dashboard. The browser uses the public publishable key. Same login as the main Dashboard (email + password).
- **Vercel** hosts the pages and the serverless functions in `api/` (CommonJS). Pushing to `main` deploys (once the Vercel project is linked; see PLAN.md "Owner setup").
- **AI:**

| Job | Provider | Env var | Why |
|---|---|---|---|
| Lesson audio → text | Groq, `whisper-large-v3`, language `he` | `GROQ_API_KEY` | Free tier: about 8 h audio/day, 25 MB per file. The transcript is the tutor's main source, so quality matters; Phase 2 compares it with ivrit.ai's Hebrew Whisper on a real lesson. |
| Teaching, checking solutions, reading board photos and old tests | Anthropic Claude (`TUTOR_MODEL`, default `claude-sonnet-5-5`) | `ANTHROPIC_API_KEY` | Mistakes here go straight into the owner's head. Budget: **hard cap of $10/month**, set in the Anthropic console, plus the daily limit in §5. |
| Lesson summaries, topic tags, sorting | Google Gemini Flash (`GEMINI_MODEL`, default `gemini-flash-latest`) | `GEMINI_API_KEY` | Free tier, easy jobs, errors are harmless. Optional: without the key, summaries are skipped. |

- Functions verify the caller's Supabase session (`Authorization: Bearer <access token>`) and that their email is in `ALLOWED_EMAILS` (comma-separated). Friends have accounts on the shared Supabase project; they must not be able to spend the owner's AI budget.
- Functions talk to Supabase **with the caller's token and the publishable key**, so row-level security protects every read and write. No service-role key is needed in Phase 1.

---

## 3. Data

### Shared with the main Dashboard: the `uid:school` row
Table `app_state` (`key text PK, data jsonb, updated_at`), row `"<uid>:school"`. Study Hub reads and writes these keys exactly as the main Dashboard's `v3/school.js` does:

```
dashboard:school:v1:subjects    [{id, name, color, hidden}]
dashboard:school:v1:assignments [{id, subjectId, title, type, dueDate, priority, status:'Not started'|'In progress'|'Done', completedAt, notes, createdAt, updatedAt}]
dashboard:school:v1:tests       [{id, subjectId, name, testDate, topics, studyStatus, importance, notes, createdAt, updatedAt}]
dashboard:school:v1:grades      [{id, subjectId, type, gradeValue, maxGrade, date, weight, notes, testId?}]
dashboard:school:v1:timetable   {cls:"11-3", mine:["מתמטיקה|teacher name", …]}  ← main Dashboard's; Study Hub only READS it
study:v1:settings               {cls, lang, teachLang, theme:'light'|'dark'|'auto', week:[{id,name,days:[0-6],start,end}], studyMins, commuteMins, latest,
                                 overrides:{'YYYY-MM-DD':{skip,start,mins}}, sessions:[{date,start,end,subject,topic,goal}],
                                 myGroups:[class group names]|null, mashovGroups:[{subject,teachers}], teachers:{name:subjectId|'school'},
                                 testMine:{testId:true|false}, updatedAt}  ← Study Hub's own
```
**Which tests are yours (v0.4):** the class calendar lists every group's tests and sometimes other classes' (`מבחן בלשון יא2 ויא4`). `SH.testFit` says `mine` / `maybe` / `other`: your own override (`testMine`) → a class named in the title (yours or not) → the class's split groups (`/api/school?groups=1`) the test is about vs. your groups (`myGroups` picked once, else guessed from Mashov's groups, else the Dashboard's `timetable.mine`) → otherwise a whole-class subject = mine. `openTests()` = mine + maybe (everything uses it: planner, Home, Tutor); `otherTests()` fold into "Probably not yours" with a one-tap "Mine". **Nothing is ever deleted or left un-imported**: a wrong guess must never hide a real test date.

**Teachers:** a Mashov message's sender is matched (`sameTeacher`, name order ignored) to your one-time list (`settings.teachers`), then Mashov's groups, then the Dashboard's timetable. Unknown senders get one "Who teaches what? (once)" picker in Notebook → Messages and Settings; picking moves all their old messages too.

Imported items keep a `source` (`'calendar'` / `'mashov'`) and stable ids (`cal-<uid>`, `mashov-hw-<id>`), so re-imports and other devices never duplicate them. Calendar tests also carry `calUid`, which is how the main Dashboard hides its own read-only calendar copy.

**Sync rules (copied from the main Dashboard; they were learned the hard way, do NOT regress):**
1. `await client.auth.getSession()` before every read and write.
2. One Supabase client per page (the `__oneClient` patch in every page's `<head>`).
3. **Write = merge.** Try the `app_state_patch` RPC first (it merges keys in the database). Without it: read the cloud row, merge each changed key **entry by entry by `id`** (newer `updatedAt` wins, see `mergeById` in `app.js`), stamp `_pushAt`, upsert. Never overwrite the whole row, never drop keys you didn't change.
4. **Read = overlay** onto local. Never wipe local first.
5. Every edited item gets a fresh `updatedAt` (ISO string). A "delete" is never a delete: set `status:'Done'` or `hidden:true`.
6. Subjects are matched by `id`. When Study Hub needs a new subject, add it to `subjects` the same way the main app does (`{id, name, color}`), never a parallel list.
7. Test sync both directions: change homework in Study Hub → it shows in the main Dashboard's School page, and the other way.

### Study Hub's own tables (`supabase/schema.sql`)
All have `user_id uuid default auth.uid()` and row-level security "own rows only". Run the file in the Supabase SQL editor; it is safe to run again.

| Table | What | Notes |
|---|---|---|
| `study_lessons` | One recorded lesson | `subject_id` (matches school subjects), `lesson_date`, `title`, `status` (`recording` → `uploaded` → `transcribing` → `ready` / `error`), `started_at`, `marks` (seconds the owner tapped "On the test!"), `audio_path`, `transcript`, `summary`, `topics text[]`, `error` |
| `study_materials` | Everything else the tutor learns from | `kind`: `board` (photo of the board), `notes` (owner's or a classmate's notes), `teacher_summary` (pasted WhatsApp text), `teacher_message` (imported from Mashov; `subject_id` may be `inbox` when the teacher couldn't be matched), `old_test`, `worksheet`. `source_ref` (unique per user) stops duplicates. `file_path` (Storage), `content` (text; for files, filled by `api/read-file.js`), optional `lesson_id`, `status` |
| `study_topics` | Topics per subject and how ready the owner is | `state`: `new` / `with_help` / `alone`. Only `alone` counts as ready. |
| `study_attempts` | Each question the owner tried | `question`, `answer`, `verdict` (`correct` / `partial` / `wrong`), `feedback`, `alone bool`, `mistake` (short English label from the tutor) |
| `study_chats` | Tutor conversations | `mode` (`teach` / `test` / `session`), `topic`, `messages jsonb` (with `step`) |
| `study_usage` | AI spend guard | one row per user per day: `calls`, `input_tokens`, `output_tokens` |

Storage bucket **`study`** (private). Paths are always `<uid>/<kind>/<id>.<ext>`; the policies only allow a user inside their own `<uid>/` folder.

**Audio is deleted from Storage once transcribed.** Keep only the text: it saves space and it's the teacher's voice.

---

## 4. Design and files

**Design (chosen by the owner on 2026-11-10):** "Coach" (direction A) for the look and the Today page: warm off-white, one dark hero card, one orange accent, Rubik. Each subject/test uses the "Course" layout from direction C: topics in order as a path, the next one highlighted, a practice test at the end, and "what the tutor teaches from". The canvas with all directions: https://claude.ai/artifact/9rPanErtktfF7ef4MHpdtQ (rows A, B, C and "Building blocks"). Phone = bottom tabs **Home · Tutor · Record · Notebook · Progress** (owner's blueprint, v0.4; Record is the red middle tab); computer (≥900px) = top bar and two columns with a red Record button. Settings = the gear.

**Language:** the app is English or Hebrew (`SH.t('English text')` looks up `HE` in `app.js`; `html[dir]` switches to RTL). Teaching language is separate: "same as the test" (Hebrew, English for the English subject) or a per-session EN/עב switch. Times and formulas stay left-to-right inside Hebrew (`<span dir="ltr">`, `.katex` isolate).

```
index.html      Home: tonight's block (planner), your day, next test readiness, coming up, last lesson, came in by itself
tutor.html      Tutor: "study now" (the planner's pick), your tests with topic progress + Teach me / Test me, homework with
                the tutor, learn something else, what the tutor teaches from. Old ?subject= links go straight to a session.
session.html/.js  Study session in 4 steps: Learn → Example → Your turn → Check ("Test me" starts at Your turn)
record.html     Record tab (red, middle): picks the lesson from today's class timetable (your group when the class splits),
                today's lessons to tap, wake lock, board photos and "On the test!" marks tied to the moment, chunks in
                IndexedDB so a crash doesn't lose the lesson, auto-stop at the period's end; tabs hide while recording
notebook.html   Notebook: Coming up (tests + homework by date, "Probably not yours" fold) · Lessons (summaries →
                lesson.html) · Messages (Mashov + WhatsApp, sorted by teacher) · Subjects (→ subject.html)
homework.html, subjects.html, teachers.html  redirects into the Notebook (old links)
subject.html    One subject as a course: next test, topic path, practice test, lessons, what the tutor teaches from
progress.html   Solved alone vs with help, readiness per test, mistakes that keep coming back, grades
settings.html   Appearance (Light / Dark / Auto), sources status + class, your groups and teachers (set once), your week
                (chat, "Plan my week with Claude", import, edit by hand), study minutes, way home, latest time,
                app and teaching language, AI turns, sign out
lesson.html     One lesson: summary, full transcript (marks and photo moments shown)
login.html      Email + password (same accounts as the main Dashboard)
app.css         Coach design system (light + dark), course path, session, record styles
app.js          window.SH: Supabase, session, school row (merge-safe), imports (school site, Mashov), timetable,
                planner, study tables, uploads, api(), graphs (```plot → SVG, safe formula parser), i18n, nav, demo data
sw.js           Service worker (network-first), cache name = version
api/_lib.js     Server helpers: auth check, Supabase REST with the user's token, usage guard, Claude, Gemini
api/transcribe.js  audio → Groq (verbose_json) → transcript with [m:ss] stamps, marks and board-photo moments → summary
api/read-file.js   board photo / notes / old test (image or PDF) → Claude → text
api/tutor.js       one tutor turn; modes teach/test/session (+ step), lang he/en, plot blocks, VERDICT + MISTAKE tags
api/week.js        the week assistant: mode 'week' (owner describes the week in their own words → activities, study
                   minutes, latest, way home; asks one question at a time) and 'tonight' (skip / shorter / later)
api/calendar.js    tests + events from the Handasaim class calendar (.ics)
api/school.js      the class timetable (copied from the main Dashboard): today + 3 days and the regular week
api/mashov.js      the owner's Mashov homework, grades, groups (subject + teacher) and teacher messages (unofficial endpoints, read only)
supabase/schema.sql  tables, policies, storage bucket (re-run after each version that changes it; safe)
tools/serve.js, tools/shot.js  local server; Playwright screenshots of every page in ?demo (phone, dark, computer)
```

**The planner (`SH.plan`)**: day items = school (from the timetable; 07:45–15:20 if no class), the way home (`commuteMins`), and the owner's weekly activities (`settings.week`, +30 min after each). Free windows from 14:00 to `latest`. Block length = `studyMins` (+20 when the test is ≤2 days away). Target = nearest test within 14 days → first topic "with help", then "new"; all solved alone → practice test; no topics → the test's first listed topic from zero; no test → homework due within 2 days → review of the last lesson. "Done" is a per-device per-day flag.

On top of that: `settings.overrides[day]` (from "Change tonight": skip, a later start, shorter) and `settings.sessions` (imported from regular Claude) win over the computed block for that day; an imported session's `subject` is matched to a school subject by name.

**Plan my week with Claude** (owner's idea, v0.3.1): `SH.claudePrompt` builds a prompt with school hours, activities, tests with topic readiness, homework and the next 7 days. `SH.openClaude` copies it and opens claude.ai. Claude interviews the owner, then ends with a ```studyhub JSON block (`{week, studyMins, latest, commuteMins, sessions}`). "Import from Claude" (`SH.importSheet`) takes the pasted text or a file, shows a preview, and saves. This costs nothing from the API budget. The in-app chat (`api/week.js`) is the quick version for small changes.

**Theme:** `localStorage sh:theme` + `settings.theme`; every page's `<head>` sets `html[data-theme]` before paint; Auto = follow the phone.

## 5. The tutor (the most important part)

`api/tutor.js` builds every request from the subject's material, newest first, trimmed to `CONTEXT_CHARS` characters (default 90,000, roughly 30–45k tokens of Hebrew):
1. The teacher's **old tests** (they set the level and style of every question).
2. **Lesson transcripts** about the topic (full transcript, not the summary).
3. **Board photos and notes** as text, and **teacher summaries**.

The material goes in a cached system block (`cache_control: ephemeral`) so follow-up turns are cheap.

**Teaching rules (in the system prompt; keep them):**
- Speak **Hebrew** (the owner's tests are in Hebrew), short messages, one idea at a time. Math in LaTeX between `$…$` / `$$…$$`.
- Use the teacher's order, notation and examples from the transcripts. Say which lesson an example came from.
- **Teach mode** ("from zero"): short explanation → a quick check question → wait for the answer → next idea. Then one full worked example from class. Then a test-level question the owner solves alone.
- **Test mode:** one question at a time, in the style and difficulty of the teacher's old tests. **No hints until the owner has submitted an attempt** (a photo of the written solution or typed). Then: verdict, and exactly where the solution broke (reading the question, setup, physics/math idea, algebra, units, graph).
- After a verdict, the page asks "Did you solve it alone?" and saves an attempt. A topic becomes `alone` only after a correct attempt marked alone.
- If the material doesn't cover something, say so, and teach it from general knowledge, flagged as "not from your teacher's material".
- Never invent what the teacher said.

**Spend guard:** `DAILY_TUTOR_CALLS` (default 120) and `max_tokens` 1500 per turn. Over the limit → a friendly "daily limit reached" message. The real hard stop is the $10/month cap in the Anthropic console.

---

## 6. Conventions

- **Version bump on every change:** `VERSION` in `app.js`, `CACHE` in `sw.js`, and the `?v=` on asset links in every page, all equal. Otherwise the installed PWA serves stale files.
- **Commits:** straight to `main`, messages like `area: what changed (vX.Y.Z)`.
- Secrets never go in client code. Only the Supabase publishable key belongs in the browser.
- No personal data hard-coded as defaults (schedules, subjects): a friend could sign in. Demo data lives only behind `?demo`.
- Tap targets ≥ 44px, text ≥ 13px, 16px side gutters, light + dark, `prefers-reduced-motion` respected. Undo toasts, never `alert()` / `confirm()` (mobile Safari blocks them).
- Text the owner or teacher wrote is shown with `dir="auto"` (Hebrew and English mix).
- Every page has the on-screen error banner (`SH.errorBanner`) so crashes are visible on a phone without a console.

---

## 7. Local testing

- `node tools/serve.js .` then open `http://localhost:5178/?demo`. Demo mode: sample subjects, tests, lessons and canned tutor replies; **no login, no network calls, no storage writes**.
- `PLAYWRIGHT_PATH=$(npm root -g)/playwright SHOT_DIR=/tmp/shots node tools/shot.js` screenshots every page in demo mode at 390px and 1280px and fails on console errors or horizontal overflow.
- `node tools/flows.js` (same `PLAYWRIGHT_PATH`): the main flows step by step with PASS/FAIL (fold a test away and back, tick + undo, teacher picker, groups, theme, record, session, old links).
- `node tools/check.js`: the bug hunt (~25 min): every page at 390 / 360 / 1280 px, English + Hebrew, light + dark; console errors, missing files, broken links, small tap targets, English left in Hebrew; then taps every button on every page. Run it before big deploys.
- `api/` needs the env vars; test it on the deployed site (or `vercel dev`).

---

## 8. Environment variables (Vercel project settings)

| Variable | Needed for | Status |
|---|---|---|
| `ALLOWED_EMAILS` | who may use the AI functions (the owner's email) | set during owner setup |
| `GROQ_API_KEY` | transcription | set during owner setup |
| `ANTHROPIC_API_KEY` | tutor, reading photos/PDFs | set during owner setup (with the $10/month cap) |
| `GEMINI_API_KEY` | summaries (optional) | optional |
| `MASHOV_USER`, `MASHOV_PASS` | Mashov import | set by the owner; optional `MASHOV_SCHOOL` (default 570358), `MASHOV_YEAR`, `MASHOV_API_VERSION` |
| `TUTOR_MODEL`, `GEMINI_MODEL`, `WHISPER_MODEL`, `DAILY_TUTOR_CALLS`, `CONTEXT_CHARS` | overrides | optional |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | optional; the defaults in `api/_lib.js` are the shared project's public values | optional |
