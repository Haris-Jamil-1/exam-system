# Evalix — AI-Proctored Online Examination Platform

**Evalix** (formerly ExamPro) is a complete, multi-tenant e-testing platform for schools,
universities, and training institutions. It covers the full assessment lifecycle: building
question banks, creating exams (by hand or with AI), delivering them securely with
AI-powered proctoring, monitoring students live, grading with AI assistance, and analyzing
results with real psychometric statistics.

**Live app:** https://exam-system-sigma.vercel.app · Available in **English and Arabic** (full RTL).

### Why Evalix

- **Secure exams** — server-enforced time windows, eligibility checks, one attempt per
  student, answer sanitization, tamper-resistant sequential modes, and full tenant isolation
  between institutions.
- **AI proctoring that respects privacy** — face, multiple-person, gaze, phone/book, noise,
  tab-switch, and fullscreen monitoring, all running **inside the student's own browser**
  with self-hosted models. No video is streamed or recorded; only typed events (and
  evidence snapshots for serious violations, auto-deleted after 30 days) reach the server.
  Every student gets a live **trust score**.
- **AI creation & grading** — generate curriculum-aligned questions with Claude straight
  into your question banks, and get AI-suggested grades for essays and code (with real
  test-case execution). A teacher **always** confirms before any mark is awarded.
- **Live monitoring** — real-time roster with trust scores and violation timelines,
  on-demand camera snapshots, one-click live video, warnings, and force-submit.
- **Multi-tenant by design** — unlimited institutions on one deployment, each fully
  isolated, with per-institution AI usage quotas and platform-level oversight.

---

## Roles at a glance

| Role | What they do |
|---|---|
| **Super Admin** | Platform operator. Sees every institution, tracks AI/code-execution usage and estimated cost, and can suspend/unsuspend institutions or users. Not part of any institution. |
| **Institution Admin** | Runs one institution: invites teachers, manages users and curriculum (courses → topics → learning objectives), creates institutional question banks, approves exams, sees institution-wide analytics, and can deactivate accounts. |
| **Teacher** | Creates classes and invites students, builds question banks (manually, by CSV import, or with AI), creates and configures exams, monitors live exam sessions, grades, and reviews results and item statistics. |
| **Student** | Accepts an invite, takes exams under proctoring, and views published results with a per-question breakdown. |

---

## How to use the platform

### Institution Admin — setting up your institution

1. **Register** — open the app, choose **Register**, and create your institution. You become
   its first admin.
2. **Configure email redirects** *(one-time, done by whoever hosts the platform)* — see
   "For Developers" below; without it, invite emails point to the wrong address.
3. **Invite teachers** — go to **Teachers → Invite**. Paste one or more email addresses, or
   upload a CSV/XLSX file for bulk invites. Each teacher receives an email link to join
   your institution. A per-email report shows anything that couldn't be sent (for example,
   an address already active at another institution — that's blocked by design).
4. **Set up curriculum** *(recommended for AI generation and analytics)* — under
   **Curriculum**, create Courses, their Topics, and Learning Objectives (with Bloom's
   level and learning domain). Teachers align questions and AI generation to these.
5. **Create institutional question banks** *(optional)* — under **Item Banks**, create
   shared banks and assign teacher editors. Teachers can also make their own private banks.
6. **Approve exams** — exams submitted by teachers appear under **Exams** for
   approval/rejection.
7. **Manage users** — under **Users**/**Teachers** you can deactivate an account
   (soft — nothing is deleted; a deactivated teacher's classes are archived) and
   reactivate it later.

### Teacher — running assessments

1. **Accept your invite** — click the link in the invitation email, set your name and
   password, and log in.
2. **Create a class** — **Classes → New Class**. Open the class and **invite students**
   (paste emails or upload CSV/XLSX). Students who already have an account just sign in;
   new ones get a signup link. Watch invite status (pending/accepted/expired) on the class
   page, and remove enrollments if needed.
3. **Build your question bank** — **Item Bank** has three tabs: Institution banks, My
   Private banks, and Shared with Me. Inside a bank:
   - **Add Question** for the manual builder (10 types: MCQ, multiple-response,
     true/false, short answer, essay, fill-in-the-blank, matching, ordering, coding,
     file upload — with marks, difficulty, per-item time limits, rubrics for essay/coding,
     starter code and test cases for coding).
   - **Import CSV** for bulk import.
   - **Generate with AI** to create up to 15 draft items at once, optionally aligned to a
     Learning Objective and grounded in an uploaded source document. Generated items
     arrive as **drafts** for your review; possible duplicates are tagged.
   - Move items through draft → review → **approved** (only approved items can be drawn
     into pooled exams). Use **Manage Access** to share a bank with colleagues as
     editor/viewer.
4. **Create an exam** — **Exams → New Exam**, a 3-step wizard:
   - *Basic info*: title, subject, instructions, start/end window, duration, and
     optionally a **Class** (restricts the exam to that class's roster).
   - *Select questions*: pick fixed questions from any bank you can access.
   - *Settings*: toggle **AI Proctoring**; optionally define **sections** (own timers,
     weights that must sum to 100%, per-section passing thresholds, sequential order);
     optionally enable **dynamic pooling** (choose banks, then how many questions to draw
     per learning objective — every student gets their own random draw); sequential
     item-locking; max violations.
5. **Submit for approval** — your admin approves the exam; it goes live automatically at
   its start time (you can also go live early or end it manually; it completes itself at
   the closing time).
6. **Monitor live** — **Monitor** (all live exams) or the per-exam Monitor page: live
   roster with trust scores, violations, and connection status. Click the eye icon on a
   student for their timeline and actions: **Snapshot**, **Go Live** (view their camera),
   **Send Warning**, **Force Submit**.
7. **Grade** — objective questions score themselves. For essays/code, open
   **Results → View answers** for a student: review AI suggestions per rubric criterion
   (code runs against your test cases), then **Confirm**, **Override**, or **Approve All**.
   Marks are only ever awarded by you.
8. **Publish & analyze** — publish results when ready (students see nothing before that).
   Review the results table (watch for **"Fail (section)"** — a passing total can still
   fail a section threshold), score distributions, trust trends, and per-item facility &
   discrimination statistics in the bank.

### Student — taking an exam

1. **Accept your invite** — click the link in the email from your teacher. If you're new,
   create your password; if you already have an account, just sign in.
2. **Find your exam** — your dashboard and **Exams** page show upcoming and live exams.
3. **Start** — on a proctored exam you'll first complete a short **camera check** (face
   and ID photo), then read the instructions. The timer only starts when you click
   **Start Exam**.
4. **During the exam** — expect these proctoring rules:
   - Stay in **fullscreen** (a blocking overlay returns you if you leave).
   - Stay on the exam tab; switching tabs or apps is recorded.
   - Stay alone, visible to the camera, and avoid phones/books and background talking.
   - Everything is analyzed **in your browser** — no video recording is uploaded; serious
     violations save a single snapshot as evidence. Your teacher may send you warnings or
     view your camera live.
   - Some exams lock questions/sections once you move on, and some questions have their
     own countdown — the interface always shows you.
5. **Submit** — answers are submitted together at the end (the exam auto-submits when
   time runs out). Don't close the browser mid-exam: your answers live in your session
   until you submit.
6. **Results** — once your teacher publishes, **Results** shows your score, pass/fail,
   and a per-question breakdown.

### Super Admin — platform oversight

1. **Access** — the flag is granted only by the platform operator via direct database
   update (`UPDATE "User" SET "isSuperAdmin" = true WHERE email = '...'`), then visit `/super`.
2. **Overview** — every institution with teacher/student/active-exam counts.
3. **Usage & cost** — monthly AI-generation/grading calls and code-execution submissions
   per institution, with estimated cost.
4. **Suspension** — soft-suspend an institution (all its users are blocked immediately;
   nothing is deleted) or a single user; unsuspend the same way. Super admins cannot
   suspend each other from the panel.

---

## FAQ & Troubleshooting

**An invite email link goes to `localhost` / the wrong site.**
The Supabase Site URL isn't configured. In the Supabase dashboard: Authentication → URL
Configuration → set Site URL to your deployment URL and add it to Additional Redirect URLs.

**A student can't start an exam.**
The error message says why: the exam hasn't opened yet, has already closed, they're not in
the exam's class, or (for pooled exams) the question pool no longer has enough approved
items — in that last case, approve more items in the bank or lower the blueprint's draw
counts.

**"Fullscreen Required" keeps appearing.**
That's proctoring working as intended — the exam must stay fullscreen. Click the button on
the overlay to return. Repeated real exits are recorded as violations.

**The proctoring widget says "Basic monitoring" only.**
The camera/vision models couldn't load — usually a denied camera permission or a very
restrictive network/browser. Tab-switch and fullscreen monitoring still work. Try a
Chromium-based browser and allow camera/microphone access.

**A teacher's "Go Live" video never connects.**
Live video is a direct browser-to-browser connection. On strict corporate/campus firewalls
a direct path may be impossible (the status will say a firewall is likely blocking it) —
snapshots still work. Supporting these networks requires adding a TURN relay server (see
`docs/ARCHITECTURE.md`, §9).

**Why did an exam show "Fail (section)" despite a passing overall score?**
The exam has per-section passing thresholds; the student missed one section's threshold,
which fails the attempt regardless of the composite score. The per-student answer view
shows each section's result.

**AI generation/grading buttons do nothing or items look canned.**
The deployment has no `ANTHROPIC_API_KEY` set — generation falls back to clearly-labeled
mock items and grading waits for manual marking. Set the key to enable real AI. A 429
means the institution's monthly AI quota is spent.

**Coding questions aren't auto-graded.**
Judge0 isn't configured (`JUDGE0_API_URL`/`JUDGE0_API_KEY`) or its quota ran out. Answers
are safely held for manual grading — students are never failed by an unavailable sandbox.

**A student closed their laptop mid-exam. Can we recover their answers?**
No — answers stay in the student's browser until submitted (by design; nothing is uploaded
mid-exam). If they reopen the same exam they resume their attempt. If the session is truly
dead, the teacher can Force Submit, which scores 0.

**Deleted/suspended by mistake?**
Everything is soft: suspension and deactivation flip a flag and can be reversed the same
way; archiving a class hides it without touching enrollment history.

---

## For Developers

```bash
npm install                    # also runs prisma generate
cp .env.example .env.local     # then fill in — see the env table in docs/ARCHITECTURE.md §7
npm run db:push                # push prisma/schema.prisma to the database
npm run dev                    # http://localhost:3000
npm run test:unit              # 275 vitest unit tests
npm run build                  # production build (required check before shipping)
```

Minimum env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `DATABASE_URL` (pgBouncer :6543), `DIRECT_URL` (:5432),
`NEXT_PUBLIC_APP_URL`. Optional: `ANTHROPIC_API_KEY` (real AI), `RESEND_API_KEY` (invite
email), `JUDGE0_API_URL`/`JUDGE0_API_KEY` (code execution), `CRON_SECRET`,
`PSYCHOMETRICS_SECRET`. Deployment target is Vercel (`vercel.json` defines the two daily
cron jobs).

**Full technical documentation:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack,
directory map, data model, auth/RBAC/RLS, end-to-end flow walkthroughs, complete API
surface, conventions, and known gotchas. Feature inventory:
[`docs/FEATURES.md`](docs/FEATURES.md).
