> **Status (2026-07-09): Items 1–9 implemented, QA'd, and shipped.** See CLAUDE.md's session log for what changed. All 9 items from this gap analysis are now complete.

# Spec Gap Analysis & Implementation Plan

Source: incoming spec "Student UI & Time Controls Updates" (9 distinct feature areas). Researched against the actual codebase on 2026-07-09 (Prisma schema, API routes, `lib/data/*`, exam wizard, student exam page, timer hook, proctoring components, item bank pages).

Legend: ✅ already exists · ⚠️ partially exists / stubbed · ❌ does not exist

---

## 1. Pre-Exam Instructions View — ❌ mostly missing

| Piece | Status | Detail |
|---|---|---|
| `Exam.instructions` (rich text) field | ❌ | No such column. `Exam` model has no HTML/instructions field at all. |
| Instructions screen between countdown and exam start | ❌ | `src/app/exam/[examId]/page.tsx` goes waiting-room → (conditional biometric gate) → exam UI directly. No intermediate instructions screen. |
| "Start Exam" button that gates the duration timer | ❌ | Timer currently seeds itself automatically from `endTime - serverNow` the instant the page loads past the waiting room — nothing waits for a button click. |

**Plan**
- Add `instructions String?` (HTML) to `Exam` in `prisma/schema.prisma`, push live via `prisma db push`.
- Exam builder Settings step: add a rich-text/textarea field for instructions (reuse existing form patterns; a simple HTML textarea is enough — no existing rich text editor dependency in the repo, so keep it as a `<textarea>` producing sanitized HTML rather than pulling in a new WYSIWYG lib).
- Student exam page: insert an `InstructionsScreen` state between the waiting-room and the exam UI (and after the biometric gate, since biometric verification is identity/environment setup, instructions are exam-specific — order: waiting room → biometric gate (if strict) → instructions screen → **[Start Exam]** → exam UI+timer starts).
- Critical: the duration timer (`useExamTimer`'s `initialSeconds`) must only be computed/started at the moment "Start Exam" is clicked, not on page load. This requires tracking a `examStartedAt` client/server timestamp distinct from `attempt.startedAt` (attempt is already created earlier for resume purposes) — simplest correct approach: keep `ExamAttempt.startedAt` as attempt-creation time (needed for `availableTo` cross-check, see #2), but only mount `<ExamRunner>` (the component containing the timer + questions) after the button is clicked, and derive the duration timer from `min(duration-based deadline, endTime)` computed fresh at that moment. Store a `sessionStorage` flag so a mid-exam reload doesn't re-show instructions.

---

## 2. Availability Window vs Time Limit (Duration) — ⚠️ fields exist, enforcement is broken/missing

| Piece | Status | Detail |
|---|---|---|
| `availableFrom`/`availableTo` distinct from `durationMinutes` | ✅ (renamed) | Already modeled as `Exam.startTime`, `Exam.endTime`, `Exam.duration` (Int minutes) — functionally identical, just different names. **No schema change needed**, just wire the logic correctly. |
| Auto-submit at `min(duration expiry, availableTo)` | ❌ | Confirmed via full read of `useExamTimer.ts` and `exam/[examId]/page.tsx`: the client seeds the countdown **only from `endTime - serverNow`**. `exam.duration` is loaded but never compared. There is no `min(duration, endTime)` anywhere. |
| Server-side enforcement of the deadline | ❌ | `POST /api/attempts/[id]/submit` has **no `endTime`/duration check at all** — a late submission is accepted unconditionally as long as the attempt is `in_progress`. Only attempt *creation* (`POST /api/attempts`) is time-gated (SEC-07/STU-01/TIME-02, already shipped). Auto-*ending* an in-progress attempt server-side does not exist. |

**Plan**
- Client: when starting the timer (see #1), compute `deadline = min(attempt.startedAt + duration*60s, exam.endTime)`, seed `useExamTimer` from `deadline - serverNow`. This directly implements the spec's worked example (60 min duration, exam closes 12:00, student starts 11:30 → auto-submits at 12:00, i.e. 30 min).
- Server: add the same `min(startedAt + duration, endTime)` check into `POST /api/attempts/[attemptId]/submit` — reject/flag submissions that arrive after the deadline is not what we want (client auto-submits AT the deadline), but we do want the server to independently compute the deadline and mark `status: 'auto_submitted'` vs `'submitted'` based on whether the request landed at/after the deadline vs before — this also finally makes use of the currently-dead `auto_submitted` enum value.
- No schema changes required for this item — `startTime`/`endTime`/`duration` already give us everything; this is pure logic wiring.

---

## 3. Item-Level Time Limit (Optional) — ❌ fully missing

| Piece | Status | Detail |
|---|---|---|
| `timeLimitSeconds` on `Question`/`Item` | ❌ | Confirmed via schema + grep — no such field anywhere. |
| Per-question mini countdown UI | ❌ | No per-question timer component exists. |
| Auto-save + auto-advance on expiry | ❌ | Doesn't exist. |
| "Previous" locked for expired items | ⚠️ | A *global* forward-only lock already exists (`settings.navigationMode === 'sequential' && forwardOnly`), but nothing per-item/per-expiry. |

**Plan**
- Add `timeLimitSeconds Int?` to `Question` (exam-bound) and `Item` (bank-bound) in schema.
- Exam builder question editor: optional numeric input "Time limit (seconds)".
- Student exam page: new small hook `useItemTimer(timeLimitSeconds, onExpire)` mounted per question, resets when navigating to a new question; on expiry, auto-saves current response (reuse existing answer-save path) and calls the existing `goToNext()` logic; mark that question index as "expired" in local state so its sidebar/Previous access is disabled going forward (extends the existing `forwardOnly`-style disabling logic to also check a per-question `expiredQuestions: Set<number>`).

---

## 4. Optional AI Proctoring (Toggle Feature) — ❌ missing (only a strictness level exists, not an on/off switch)

| Piece | Status | Detail |
|---|---|---|
| `isProctoringEnabled` boolean | ❌ | Only `settings.proctoringLevel: 'basic'|'standard'|'strict'` exists — always "on" at some level, no off switch. |
| Wizard toggle "Enable AI Proctoring" | ❌ | Settings step has a proctoring **level** select, no boolean toggle. |
| Bypass camera/mic/biometric checks when off | ❌ | `ProctoringOverlay` (with `TabGuard`/`FullscreenGuard`/`AudioMonitor`/`FaceDetector`) is mounted **unconditionally** for every exam with an active attempt — none of the four monitors read any setting. |

**Plan**
- Add `isProctoringEnabled Boolean @default(true)` to `Exam`.
- Wizard Settings step: add the toggle switch above/alongside the existing `proctoringLevel` select (disable the level select when off).
- Student exam page: skip the biometric onboarding gate entirely and don't render `<ProctoringOverlay>` at all when `exam.isProctoringEnabled === false`; also skip camera/mic `getUserMedia` calls (currently only inside `FaceDetector`, which simply won't mount).

---

## 5. Multi-Tiered Item Bank & RBAC — ❌ fully missing (biggest gap)

| Piece | Status | Detail |
|---|---|---|
| `ItemBank` entity (`bankLevel`, `ownerId`) | ❌ | Items today are a flat table scoped only by `institutionId` + `authorId`. There is no bank grouping at all. |
| `ItemBankAccess` junction table (OWNER/EDITOR/VIEWER) | ❌ | `Role` enum is only `admin/teacher/student`; no per-bank role model exists. |
| `POST /api/item-banks/{id}/collaborators` | ❌ | No `/api/item-banks/*` routes exist at all. |
| Institution Banks / My Private Banks / Shared with Me tabs | ❌ | Current `teacher/items` page tabs are status-based (All/Approved/Need Review/Draft/Archived), not bank-based. |
| "Manage Access" / "Invite Colleagues" modal | ❌ | Doesn't exist. There's a decorative, unwired "visible to other teachers" checkbox in `items/new` — no real sharing mechanism behind it. |

**Plan** (largest item — new tables + new routes + reworked item pages)
- New models: `ItemBank { id, name, bankLevel: INSTITUTIONAL|PERSONAL, ownerId, institutionId, createdAt }`, `ItemBankAccess { id, bankId, userId, permissionRole: OWNER|EDITOR|VIEWER, assignedBy, createdAt }` with `@@unique([bankId, userId])`.
- Add `bankId String?` to `Item` (nullable during transition, backfill existing items into a default per-institution "Legacy/Institutional" bank so nothing orphaned).
- `lib/data/item-banks.ts`: `getMyBanks()` (owned + institutional-editor), `getSharedBanks()`, `createBank()`, `addCollaborator()`, `updateCollaboratorRole()`, `removeCollaborator()` — all permission-checked (OWNER-only for delete/settings, EDITOR+ for item mutation, VIEWER read-only).
- API: `POST/GET /api/item-banks`, `POST /api/item-banks/[id]/collaborators`, `DELETE /api/item-banks/[id]/collaborators/[userId]`.
- Rework `teacher/items` into a bank-first UX: 3 tabs (Institution / My Private / Shared with Me) → clicking a bank opens a bank-detail page listing its items, with a "Manage Access" dialog (search users by name/email within the institution, assign EDITOR/VIEWER).
- Admin: ability to create an INSTITUTIONAL bank and assign teacher EDITORs.

---

## 6. Decouple AI Generation from Exam Wizard — ⚠️ partially — wizard restructure + route rework needed

| Piece | Status | Detail |
|---|---|---|
| Remove "AI Generation" step from wizard | ❌ | Currently Step 1 of 4 in `teacher/exams/new/page.tsx`; needs removal, leaving Basic Info → Select Questions (bank-only) → Settings. |
| Move AI generation UI into Item Bank detail page | ❌ | Item Bank detail page doesn't exist yet (depends on #5). Once it does, port the existing upload/paste/type/difficulty/Generate UI from the wizard step into it. |
| API takes `itemBankId` not `examId` | ⚠️ | Current `/api/ai/generate-questions` takes neither — it's stateless (returns JSON, no persistence). Needs both the payload field added AND actual persistence wired in (today the wizard persists client-side via `createQuestion()`; that whole path needs to move to `createItem()` against a bank). |
| Direct save to `Item` table with `itemBankId` FK | ❌ | Today nothing is saved server-side by this route at all. |

**Plan**
- Wizard: delete Step 1 entirely; renumber to 3 steps (Basic Info → Select Questions [bank picker only, `ItemBankPicker` already exists and mostly does this] → Settings).
- `/api/ai/generate-questions`: add `itemBankId` (required) to the payload; after generating, `prisma.item.createMany` (with options) directly into `Item`/`ItemOption` scoped to that bank, then return the created items so the UI can refresh the list — matches spec's "Direct Saving" + "State Update" requirements.
- Item Bank detail page (built as part of #5): add "Generate with AI" button opening the relocated generation panel (upload/paste/difficulty/type/Generate), alongside existing "Add Question" manual entry.

---

## 7. Advanced AI Item Generation (CLO-Aware & Batch-Controlled) — ❌ mostly missing, builds on #6

| Piece | Status | Detail |
|---|---|---|
| CLO `Select` in generation UI, fetching `LearningObjective` | ❌ | `CurriculumPicker` component already exists and is used in `items/new`, but not wired into the AI-generation panel. |
| Dynamic quantity input with `max={MAX_BATCH_SIZE}`, reactive button label | ⚠️ | Count is currently **hardcoded to 5** in the wizard call; API schema allows up to 20 but the mock generator silently caps output at 5 regardless of requested count. |
| Server-side reject `quantity > MAX_BATCH_SIZE` | ⚠️ | Inline zod `.max(20)` exists but with no shared/named constant and effectively meaningless since output is hard-capped at 5 anyway. |
| Resolve CLO_ID → text, inject into system prompt | ❌ | No real LLM call exists in the codebase at all yet — `generateQuestions()` in `lib/ai/question-generator.ts` is 100% canned mock data, Phase-3-flagged for a real Anthropic API call. Prompt engineering work is not meaningfully applicable until the mock is replaced with a real call. |
| `learningObjectiveId` FK populated per generated item | ❌ | Depends on both the CLO picker (above) and #6's direct-save-to-Item work. |

**Plan**
- Define `MAX_BATCH_SIZE = 15` (per spec) as a shared constant (`src/lib/ai/constants.ts`), used both client-side (`InputNumber` max + button label `Generate {n} Questions`) and server-side (reject `quantity > MAX_BATCH_SIZE` with 400).
- Add `learningObjectiveId` to the generation payload; wire `CurriculumPicker` into the generation panel (Course → Topic → CLO).
- Server resolves `learningObjectiveId → LearningObjective.text` and appends the spec's exact directive string to the (currently mock) prompt-construction step, and stamps `learningObjectiveId` onto every created `Item`.
- **Scope call**: I will make the generator function actually honor the requested `count` (remove the `slice(0, min(count,5))` cap) so quantity control is real, and will structure the "prompt" construction/CLO-injection so it's correct and ready — but will **not** swap in a live Anthropic API call unless you confirm that's in scope for this pass (that's explicitly flagged `ANTHROPIC_API_KEY # Phase 3 only` in CLAUDE.md and was deliberately deferred previously). Mock generation will continue to be used, just now CLO-aware and quantity-correct.

---

## 8. Stratified Dynamic Pooling & Test Blueprint Integration — ❌ missing (existing pooling is an inert stub)

| Piece | Status | Detail |
|---|---|---|
| Remove "Questions per student" static input | ⚠️ | Exists today (`questionLimit`/`poolSize` checkboxes+inputs in wizard Settings, explicitly labeled "(Phase 2 feature)"), confirmed **never read anywhere at runtime** — dead settings. |
| Blueprint matrix UI (CLO × available pool × target draw) | ❌ | Doesn't exist. |
| `Exam.settings.dynamicPoolingBlueprint` object | ❌ | `settings` JSON currently only meaningfully carries `proctoringLevel`/`resultsVisibility`/nav flags; no blueprint shape defined. |
| JIT stratified sampling at attempt-start | ❌ | Confirmed: every student gets the exact same `Question` rows created at exam-build time; no per-attempt sampling of any kind exists in `lib/data/exams.ts` or the attempt-creation route. |

**Plan**
- Replace the wizard's static pooling checkbox with a Blueprint step (only shown when the exam's selected questions are bank-sourced with CLOs attached): table listing each distinct CLO among selected bank items, its available-pool count (query `Item` count by `learningObjectiveId` within the chosen bank(s)), and a target-draw `InputNumber` per row, validated `target ≤ available` client-side; total exam length = sum of draws (read-only derived field).
- Store as `settings.dynamicPoolingBlueprint: { [learningObjectiveId]: count }`.
- At attempt creation (`POST /api/attempts`), if a blueprint is present: for each CLO key, run a randomized query (`ORDER BY RANDOM() LIMIT n` via `$queryRaw` against `Item`, filtered to that bank+CLO+approved status), concatenate, shuffle once more, and materialize those into per-attempt `Question` rows (copy pattern already used elsewhere: bank Item → Question copy, same as the existing wizard "add bank item to exam" flow) so scoring/results code (which is entirely `Question`/`Answer`-based) keeps working unchanged.
- This is inherently per-student `Question` sets, which is a meaningful behavior change from "one shared question list per exam" — flagging this explicitly since it interacts with review/analytics screens that currently assume all students in an exam share identical questions.

---

## 9. Multi-Section Exam Architecture — ❌ fully missing (largest, most invasive item)

| Piece | Status | Detail |
|---|---|---|
| `ExamSection` table | ❌ | Doesn't exist. |
| `Question`/`Item` → `sectionId` instead of `examId` | ❌ | `Question.examId` is a required direct FK today; re-pointing to `sectionId` is a breaking schema change touching nearly every route/lib/data function that queries questions (`exams.ts`, `questions.ts`, `students.ts`, `analytics.ts`, submit route, results pages, PDF/export if any). |
| `isSectionSequential`/`isItemSequential` on `Exam.settings` | ⚠️ | `navigationMode`/`forwardOnly` already exist as an exam-wide analog; would need to become section-scoped. |
| Section builder UI (add section, per-section instructions/timer/weight/threshold) | ❌ | Doesn't exist. |
| Section instruction/waiting screens, isolated per-section timers, auto-advance between sections | ❌ | Doesn't exist — directly built on top of #1's instructions-screen pattern but repeated per section. |
| Hierarchical scoring (raw → scaled → weighted composite, per-section pass/fail) | ❌ | `lib/scoring.ts` (or wherever) computes one flat `score`/`scorePercentage` per attempt; no section-weighted rollup exists. |
| Diagnostic reporting with per-section breakdown | ⚠️ | STU-03 (per-question breakdown) already exists and is the right foundation to extend, but there's no section grouping to roll up into. |

**Plan**
This is a full architectural migration, not an additive feature — every place that currently assumes "one flat list of questions per exam" needs a section layer inserted. Recommended approach:
- `ExamSection { id, examId, title, instructions, durationMinutes?, orderIndex, sectionWeight, passingThreshold? }`.
- Add `sectionId String?` to `Question` (nullable — legacy/simple exams with no sections keep `sectionId = null` and behave exactly as today, a single implicit section). This backward-compatible nullable approach avoids a breaking migration for all existing exams/attempts.
- Exam builder: new "Sections" step — add/reorder sections, assign bank/AI-generated questions into a specific section, per-section weight (validated to sum to 100%) and optional passing threshold, plus the two sequential-lock toggles.
- Student flow: generalize the single instructions-screen-then-start pattern from #1 into a per-section loop (Section N instructions → Start Section N → section timer → auto-submit-section → Section N+1 instructions...), reusing the per-item timer/lock infra from #3 within each section.
- Scoring: extend `lib/scoring.ts` to group by `sectionId`, compute raw/scaled per section, apply weights for a composite total, evaluate `passingThreshold` per section, and flag overall status `Failed` if any threshold is missed regardless of composite score.
- Reporting: extend the existing per-question breakdown (STU-03) with a section-grouping wrapper on both the student `complete` page and teacher results page.

---

## Recommended Phasing

Items 1–4 are additive, low-risk, and directly buildable on the existing schema/flow with small, well-contained changes. Items 5–9 are each a genuine architectural addition (new tables, new permission model, new sampling engine, or a schema-wide section layer) — bundling all five into one pass is high-risk for a codebase this size and hard to QA thoroughly in one sitting.

**Proposed for this pass: Items 1–4** (Instructions screen, availability-vs-duration auto-submit fix, per-item time limits, proctoring toggle). These are the ones framed as "Student UI & Time Controls" in the spec title, they compose cleanly with each other (all touch the same `exam/[examId]/page.tsx` + `useExamTimer` + wizard Settings step), and each is independently testable end-to-end today.

Items 5–9 (Item Bank RBAC, AI-generation relocation, CLO-aware batch generation, stratified pooling, multi-section architecture) are proposed as a **separate follow-up pass** — each deserves its own focused session given the schema/route surface area involved (especially #9, which touches nearly every question/scoring/results code path in the app).
