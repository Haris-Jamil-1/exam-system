# ExamPro — Manual QA Instructions

Companion to `QA_RESULTS.md`. Two kinds of items live here:
- **Section A** — genuinely `[MANUAL]` items from `QA_CHECKLIST.md`: visual/UX judgment, multi-device/multi-timezone setups, or product decisions that no script can resolve.
- **Section B** — `[AUTO]` items that came back **BLOCKED** in this run. These are NOT manual work — real test code already exists for every one of them. This section is a quick index; do not hand-test these, just unblock the environment and run `npm run test:e2e` (see `tests/README.md`).

---

## Section A — True manual items

### Admin

**ADM-02** — `getMyInstitution()` used everywhere, no hardcoded institution name
Steps: Register a brand-new institution with a distinctive name (e.g. "Zzyzx Test College"). Log in as that admin. Visit `/admin`, `/admin/settings`, `/teacher/settings`, `/student/settings` (as the respective seeded users). Confirm every page shows "Zzyzx Test College," never "University of Technology" or any other hardcoded name.
Why manual: purely visual confirmation across 4 pages.

**ADM-05** — Schedule clash never reaches the teacher (confirmed missing feature)
This is not a test — it's a design decision. Recommend one of: (a) write a `Notification`-equivalent row when `scheduleExamAtomically` returns conflicts, surfaced via a new branch in `GET /api/notifications` for `role === 'teacher'`; or (b) have the admin's rejection UI require them to manually message the teacher (weaker, but zero-code). Flag to product/eng lead for a decision before writing more code here.

### Teacher

**TCH-01** — Exam creation for every question type (mcq, mrq, true_false, short_answer, essay, fill_blank, matching, ordering, coding, file_upload)
Steps: As a teacher, go to `/teacher/items/new`. For each of the 10 types, create one item, save, and confirm it appears correctly in `/teacher/items` with the right type badge and options/correct-answer summary. Then build an exam in `/teacher/exams/new` pulling from those items (or via AI generation) and confirm every type renders correctly in the exam editor's preview.
Why manual: requires visually confirming form fields adapt correctly per type (e.g. matching's per-row "match text" input, coding's language selector + test case rows, file_upload's allowed-extensions picker) — this is UI-shape verification, not a single assertion.

**TCH-02** — Edit exam, change schedule, publish
Steps: Create a draft exam, edit its title/duration/schedule, submit for approval, get it approved (as admin), confirm the edited fields round-trip correctly on the teacher's exam list and edit page.
Why manual: multi-step workflow with visual confirmation at each step.

**TCH-03** — No per-student answer review pane exists (confirmed by static code read; `golden-path.spec.ts` includes an automated confirmation step, still blocked)
This is a missing-feature finding, not something to "test more." Recommend scoping a new `teacher/exams/[examId]/results/[studentId]` page backed by a new `getStudentSubmissionDetail()` data function joining `Answer` → `Question` → `Option`. Flag to product/eng lead for prioritization — this affects every question type, not just fill_blank.

**TCH-04** — (BLOCKED-AUTO, see Section B — not manual)

**TCH-05** — Results/monitor polling intervals don't leak on navigation
Steps: Open `/teacher/exams/[examId]/results`, wait 20+ seconds (past one 15s poll cycle), navigate away, then use browser dev tools' Network tab or a memory profiler to confirm no orphaned `setInterval` is still firing requests after navigation.
Why manual: needs dev-tools inspection, not a simple assertion.

**TCH-06** — Exam status badge staleness on `/teacher/exams` list
Steps: Approve and schedule an exam for 2 minutes from now. Wait past the start time without touching the exam. Refresh `/teacher/exams`. Confirm whether the badge still says "Scheduled" (predicted, per STU-01's finding that the raw `Exam.status` column never self-transitions) even though students can already join.
Why manual: visual badge-state confirmation.

### Student

**STU-02** — Matching options render shuffled, not pre-ordered
`golden-path.spec.ts` captures the option order across 2 page loads as an automated soft signal, but a single reload has a real chance of coincidentally matching even if shuffling works correctly. For real confidence: reload the exam page 5-10 times as the same student and manually record the right-hand dropdown option order each time; confirm it changes across at least most reloads.
Why manual: statistical confidence in randomness needs more samples than is worth hard-coding into an assertion (a flaky-by-design test is worse than a documented manual check).

**STU-05** — In-progress answers survive a hard refresh
Steps: Start an exam, answer 2-3 questions (including at least one matching/ordering question, since those have the most complex client-side state), hard-refresh the browser (Cmd+R / Ctrl+R, not just SPA navigation). Confirm whether previously-entered answers are still shown, or whether the question set reloads blank (predicted, since `useExamStore` — the Zustand answer store — is in-memory only with no persistence layer, confirmed by code read in QA_CHECKLIST.md).
Why manual: needs to visually distinguish "attempt resumed, answers preserved" from "attempt resumed, answers lost" — both look like a normal page load.

### Scoring

**SCR-03 (bulk-import half)** — CSV Bulk Import breaks matching/ordering/mcq/mrq/true_false questions
Steps: As a teacher, open the bulk-import CSV feature (`BulkImportModal.tsx`, likely reachable from `/teacher/items`). Prepare a CSV row for a `matching` type question using the documented schema (`stem, type, difficulty, marks, correctAnswer, tags, cloCode` — note there is no options column). Import it. Confirm what actually happens: does it reject the row with a validation error, or does it silently create a matching question with zero options (which would then be unusable/unscoreable)?
Why manual: needs an actual CSV file authored and the import UI walked through — the code-level finding (no options column in the CSV schema) is already confirmed by static read, but the exact failure mode (rejected vs. silently broken) needs to be observed.

**SCR-05 addendum (new finding from this pass)** — `teacher/exams/[examId]/results/page.tsx:59` divides by `exam.totalMarks` with no zero-guard
Steps: Create an exam with a single 0-mark question (or delete all questions after creation, if the UI allows saving with zero questions), let a student submit, then view the teacher results page. Confirm whether the pass-rate/percentage display shows `NaN`/`Infinity`/blank rather than crashing the page outright.
Why manual: this was surfaced incidentally while writing SCR-07's unit test and has not been independently reproduced live yet — worth a quick human check before deciding if it needs a code-level guard.

### Error handling

**ERR-04** — Teacher edits a live exam's marks while a student is mid-attempt
Steps: Start a student attempt on an exam. As the teacher, change a question's `marks` value via the exam editor while the attempt is still in progress. Have the student submit. Confirm whether the awarded marks reflect the OLD or NEW value (code read predicts NEW, since `submit/route.ts` re-fetches `questionRows` fresh at submit time — confirm this is desired product behavior, not just technically-what-happens).
Why manual: needs a product-intent judgment call ("should this be locked once a student starts?"), not just an assertion.

**ERR-05** — Timer hitting zero mid-keystroke doesn't lose the in-flight answer
Steps: Set a very short exam duration (e.g. 1 minute). Start typing an answer in a fill_blank or essay field right as the timer approaches zero. Confirm the auto-submit captures the in-progress keystroke rather than the field's last-saved (pre-keystroke) value.
Why manual: needs precise, human-timed interaction with the countdown UI.

### Security

**SEC-08** — No Supabase RLS anywhere (architectural)
Not a test — a decision: given SEC-01 through SEC-03/SEC-04 are already-confirmed application-layer gaps, is it worth adding database-level RLS policies as defense-in-depth on `Question`, `ExamAttempt`, `Answer`, and `Exam` (the four highest-value tables), or is fixing the application-layer checks sufficient? Flag to product/eng lead — this is a build-vs-accept-risk call, not something QA can resolve alone.

### Data integrity

**DAT-01 (real historical audit)** — auditing ACTUAL production data for the pre-06-25 MCQ scoring bug
`scripts/qa-data-integrity-audit.ts` is written and ready, but running it meaningfully requires either (a) read-only credentials against the real prod database (never write credentials — a read replica or a `SELECT`-only role), or (b) exporting the relevant `Answer`/`Question`/`Option`/`ExamAttempt` tables for offline analysis. This is a data-access decision for whoever owns the prod Supabase project, not something to route through the disposable QA tenant environment (which has no real historical data to audit in the first place).
Why manual: requires a human with prod DB access to either grant a read-only credential or run the query themselves.

**DAT-03** — Teacher account removal with exams/students still assigned
No user-deletion API route was found anywhere in the codebase during the QA_CHECKLIST.md read-through. Confirm with product/eng whether this is genuinely an unsupported operation (in which case this item is N/A, not a bug) or whether it's planned and just not yet exposed in the UI.
Why manual: requires confirming intent, not just behavior.

### Timing

**TIME-01** — Cross-timezone rendering consistency (regression check on the newest fix, `bf71c01`)
Steps: On two machines (or two browser profiles with OS timezone overridden — e.g. one set to UTC, one to UTC+5:30), log in as admin and teacher respectively. Create/view the same exam from both. Confirm both show the CORRECTLY LOCALLY-TRANSLATED time for the same underlying instant (e.g. an exam starting at 14:00 UTC should show as 14:00 on the UTC machine and 19:30 on the UTC+5:30 machine — both correct, not a bug). The actual regression to watch for is if the two machines show times that don't correspond to the same instant at all (which would indicate the UTC storage/parsing broke).
Why manual: needs genuinely different system timezones, which is impractical to fake reliably in an automated test without a timezone-mocking harness that wasn't in scope for this pass.

**TIME-03** — Refresh/back-button/network-drop mid-exam resumes correctly
Same underlying question as STU-05 — see that entry for steps. Additionally test: killing wifi/network mid-exam for 10-20 seconds, then restoring it, and confirming the exam page recovers gracefully (doesn't error out, timer catches back up via the server-time-offset mechanism already in the code).
Why manual: needs real network-condition manipulation (browser dev tools' network throttling/offline mode).

**TIME-04** — Session/JWT expiry during an exam
Steps: Start an exam with a duration longer than the configured Supabase JWT lifetime (check Supabase project auth settings for the exact value — commonly 1 hour access token lifetime with auto-refresh). Let the exam run past that window without any user interaction that would trigger a token refresh. Attempt to submit. Confirm whether `@supabase/ssr`'s automatic refresh handles this transparently, or whether the student sees an auth error at the worst possible moment (final submit).
Why manual: requires a long-duration real-time test and inspecting network requests for 401s/refresh calls.

### Performance

**PERF-01** — Cold start latency per role dashboard
Steps: With browser cache cleared, time the first paint / interactive time for `/admin`, `/teacher`, `/student` immediately after a fresh login.
Why manual: subjective "does this feel slow" judgment plus needs a real deployed/staged environment to be meaningful (localhost timings don't reflect real cold-start behavior).

**PERF-02** — Waterfall fetching regression (spot-checked already via code read, low risk)
Steps: Open browser Network tab, load `/teacher/exams/[examId]/results` and `/exam/[examId]`, confirm the `Promise.all`-batched requests fire in parallel, not sequentially waterfall-style.
Why manual: needs Network tab visual inspection.

**PERF-03** — Connection pool exhaustion under a "everyone submits at the deadline" spike
Steps: Use a load-testing tool (k6, autocannon, or similar — none installed in this repo) to fire N concurrent `POST /api/attempts/[id]/submit` requests against a test exam with N enrolled students, where N is large enough to plausibly exceed the pgBouncer pool size. Confirm no dropped/failed submissions.
Why manual: needs a load-testing tool setup and a non-trivial number of seeded attempts, out of scope for this pass's fixture size (2 tenants × 1 student each).

**PERF-04** — Layout shift on dashboards + exam-taking page
Steps: Run Lighthouse or manually watch for visible content jumping during initial load on `/teacher`, `/student`, and `/exam/[examId]`.
Why manual: visual/perceptual judgment (CLS metric can be automated with Lighthouse CI, which is a reasonable follow-up if this becomes a recurring concern).

---

## Section B — FINAL: the e2e suite has fully run against a live DB

As of 2026-07-03, the complete suite ran to a clean, trustworthy conclusion against `rlbtdpnmdnaxlccelxdr` (explicit, authorized override of `guard-non-prod.ts`). Every `[AUTO]` item that could run has a real PASS/FAIL result with evidence — see `QA_RESULTS.md` for the full breakdown. This section now lists only what's genuinely still open.

**Confirmed real bugs (as of 2026-07-03 run, since fixed — see below):** SEC-01, SEC-02, SEC-03, SEC-04, SEC-07, STU-01/TIME-02, SCR-05, ERR-01 (all 15 routes), ERR-02 (`/api/upload`, `/api/extract-text`). **Still open, not yet fixed:** STU-03, TCH-03, and a new minor finding (`resultsPublishedAt` omitted instead of `null`).
**Confirmed passing:** STU-02 (shuffle genuinely works), ADM-01, ADM-03, ADM-04, TCH-04, ERR-03, ERR-06, ERR-07, STU-04, TIME-05, SEC-05, SEC-06, GOLD-01 (full golden path, after three harness fixes documented in QA_RESULTS.md).

**2026-07-06 fix pass — all P0/P1 items above (SEC-01/02/03/04/07, STU-01/TIME-02, SCR-05, ERR-01/ERR-02) are now fixed and independently verified against live DB.** See QA_RESULTS.md's "Post-fix follow-up" section and the corresponding commits (`cde294b`, `251f0f1`, `397be86`, `82c6bd5`, `63c2d19`).

**Still genuinely open:**

| Item | Status |
|---|---|
| DAT-01 (real historical audit) | Run against live prod DB on 2026-07-06 (read-only) — confirmed 2 real pre-existing production `Answer` rows still affected by the pre-06-25 MCQ scoring bug. **Awaiting human decision** on recalculate vs. flag (see QA_RESULTS.md for exact row IDs) — not auto-corrected per instruction. |
| Camera-widget/Submit-button overlap (found while fixing GOLD-01) | Not a confirmed app bug — Playwright needed an offset click to avoid a floating camera-preview widget that geometrically overlaps the Submit button in the exam-taking UI. Worth a human checking a real browser at a normal viewport size to see if this is a real, user-facing overlap or an artifact of headless Chromium's no-camera rendering state. Steps: start any exam with `proctoringLevel` other than none, scroll to the bottom-right of the screen where the camera PIP renders, and see if it visually overlaps the "Submit Exam" button in the right sidebar at common viewport sizes (1366×768, 1920×1080). |
| STU-03 (per-question marks lost after one reload) | Not yet fixed — `sessionStorage`-cleared-after-one-read behavior, confirmed live. |
| TCH-03 (no per-student answer review pane) | Not yet fixed — missing feature, needs product scoping (see Section A above). |
| `resultsPublishedAt` omitted instead of `null` | Not yet fixed — one-line `?? null` fix, low priority. |

**Resolved this pass (previously listed here as open):**
- SEC-03, PUT half (cross-tenant `trustScore` overwrite) — confirmed fixed and independently verified 2026-07-06 (was already code-fixed in `cde294b`, just never independently exercised by the e2e suite).
- DAT-02 — confirmed fixed 2026-07-06: `deleteExam`'s FK-safe transaction (violations → attempts → exam) was exercised for real via several disposable-exam-with-attempt deletions during this session's verification scripts, all clean. The schema still has no `onDelete` on `ExamAttempt.exam`/`Violation.exam` (a raw-SQL delete bypassing the app layer would still fail/orphan), but the actual product code path is safe.
