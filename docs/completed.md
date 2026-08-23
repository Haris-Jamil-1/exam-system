# notes.pdf — Completed Items

Cross-checked against `CLAUDE.md`'s Session Log (git history is authoritative for exact commits).
Items are grouped by the section of `docs/notes.pdf` they came from, in document order.

## Student UI & Time Controls Updates
- **Pre-Exam Instructions View** — `Exam.instructions`, dedicated Instructions screen before the
  duration timer starts. *(2026-07-09)*
- **Availability Window vs. Duration** — `startTime`/`endTime`/`duration` kept as distinct fields;
  auto-submit fires on whichever of duration-expiry or `endTime` comes first. Deadline math later
  extracted to a pure `computeSubmissionDeadline()` *(2026-07-16)*. Both fields made independently
  editable post-creation on the exam edit screen *(2026-08-12)*.
- **Item-Level Time Limit** — `Question.timeLimitSeconds`/`Item.timeLimitSeconds`, per-question
  mini-countdown that auto-advances and locks backward navigation on expiry. *(2026-07-09)*
- **Optional AI Proctoring Toggle** — `Exam.isProctoringEnabled`; off skips biometric onboarding
  and never mounts the proctoring overlay (no `getUserMedia` at all). *(2026-07-09)*

## Multi-Tiered Item Bank & Role-Based Access Control
- **`ItemBank`/`ItemBankAccess` schema**, `resolveBankPermission()` as the single permission gate,
  institutional vs. personal banks, owner/editor/viewer roles, 3-tab dashboard (Institution / My
  Private / Shared with Me), "Manage Access" invite modal. RLS enabled on both tables. *(2026-07-09,
  RLS added 2026-07-17)*

## Decoupling AI Generation from the Exam Wizard
- AI Generation step removed from the wizard; generation now lives on the Item Bank detail page
  and saves items directly (`itemBankId` in the payload, not `examId`). *(2026-07-09)*

## CLO-Aware, Batch-Controlled AI Generation
- `MAX_BATCH_SIZE` cap enforced client- and server-side, CLO dropdown resolves to real text +
  cross-institution check before prompting the LLM, every generated item stamped with
  `learningObjectiveId`. *(2026-07-09)*
- **"Add CLO-Mapping to teacher portal"** (one-line note in the PDF) — a CLO Mapping tab now
  exists on the item creation form and CLO selection is wired through generation/blueprint
  pooling; treat as satisfied, though there's no dedicated teacher-facing CLO browser page beyond
  the admin curriculum tree.

## Stratified Dynamic Pooling & Test Blueprint
- Blueprint Matrix UI (bank → CLO → target-draw count), JIT stratified sampling per CLO at attempt
  start, `Question.attemptId` split between fixed and pooled questions. *(2026-07-09)*
- Runtime insufficient-pool handling (409, no silent short exam) and the concurrent-double-draw
  race fixed via a transaction. *(2026-07-17, Phase 6)*

## Multi-Section Exam Architecture
- `ExamSection`/`SectionAttempt`, per-section isolated timers and instructions, section-sequential
  and item-sequential locking, weighted composite scoring with independent per-section
  `passingThreshold`, "Fail (section)" surfaced distinctly from a plain percentage pass. *(2026-07-09)*
- Server-side enforcement gaps closed: weight-sum-to-100% checked on attempt start,
  `isItemSequential` given a real server-side lock (`ItemLock` table). *(2026-07-17, Phase 7)*

## AI-Powered Hierarchical Rubric Engine
- Nested dimension/sub-dimension tree, freely rename/customize levels and descriptors, real-time
  weight validation (sub-dimensions sum to parent, root sums to 100%), per-item "Enable AI
  Auto-Grading" toggle, rubric persisted to `Item.rubric` (previously silently dropped).
  *(2026-08-10)*
- Two-stage AI grading (suggestion → mandatory teacher confirm/override, never auto-published),
  append-only grading log as the audit trail, bulk-approve for unmodified AI suggestions.
  *(2026-07-11 Phase 3, bulk-approve 2026-07-17 Phase 7)*
- **Governance/analytics pieces** (2026-08-22):
  - **Zero-Anchor / Veto criteria** — `RubricRow.isVeto` (toggle in `RubricEditor.tsx`, a small
    shield icon per leaf dimension) flows through `compileRubric()` into `RubricCriterion.isVeto`.
    New pure `computeEssaySuggestedScore()` (`src/lib/ai/essay-scoring.ts`, extracted out of
    `gradeEssayAnswer` specifically so this is unit-tested rather than only live-QA'd, 8 tests):
    if the AI scores a veto criterion at ≤0, the whole suggested score is forced to 0 regardless
    of every other dimension, logged as `rationale.vetoTriggered: true`. Deliberately only applied
    at AI-suggestion time, never blocking a teacher's manual override — matches this feature's own
    "the instructor maintains ultimate authority" principle.
  - **Audit logging** — `AnswerGrading.latencyMs` (new column) captures each AI call's wall-clock
    time in both `gradeEssayAnswer` and `gradeCodingAnswer`'s quality-review call. Token
    consumption was already logged (`inputTokens`/`outputTokens`, since Phase 3). Instructor
    override rate is computed as a query over the existing log (`teacher_override` vs.
    `teacher_confirmation` row counts) rather than a stored counter — surfaced as a new "AI
    Grading Override Rate" stat on `admin/analytics`.
  - **CLO-based KPI reporting** — new `getCloPerformanceReport(courseId)`
    (`src/lib/data/curriculum.ts`): average score % per CLO across every graded answer mapped to
    it (`marksAwarded` set), floored at 10 graded answers before showing a number (same
    insufficient-N convention as the psychometrics service's own per-item stats) — surfaced as a
    badge on each CLO in the new `teacher/curriculum/[courseId]` page. **Flagged, not assumed**:
    the plan's assumption that this could reuse the psychometrics service's "existing per-CLO
    aggregation pattern" turned out to be wrong — no such pattern exists there (it only computes
    per-item/per-exam stats) — so this was built as a straightforward TypeScript aggregation
    query instead. Also resolved the plan's own flagged "raw numbers vs. formatted export"
    question pragmatically (raw numbers, inline in the existing pages) rather than re-asking, on
    the reasoning that a full accreditation-export format is a separate, much larger feature not
    implied by anything else in this notes.pdf section.

## Feature 1: Institutional Group & Cohort Management
- Implemented as `Class`/`ClassEnrollment`/`ClassInvite` rather than a `StudentGroup` table —
  same shape (named group container, roster, bulk CSV invite mapping name/email/group, exam
  targeting by group id). *(2026-07-14, CSV upload added to the invite dialog 2026-07-17)*

## Feature 2: Dynamic Student Profile Tagging & Advanced Filtering
Built exactly per the notes' own AND/OR semantics (re-read carefully rather than assumed): the
operator governs how **tag membership combines with class/teacher membership**, not internal
logic between multiple tags — "Section 101 students who are ALSO tagged Special Accommodations"
(AND, narrows) vs. "anyone in the Group OR anyone globally possessing that tag" (OR, widens,
tag alone can reach institution-wide). *(2026-08-22)*

- **Schema mismatch resolved per Haris's decision** ("Extend Exam directly," confirmed rather than
  guessed): `User.tags: String[]` + `Exam.targetTags: String[]`/`Exam.targetTagsOperator: AND|OR`,
  layered onto the existing `Exam.classId` dimension — no `ExamAssignment` table introduced (the
  notes assumed one exists; it doesn't, and extending `Exam` directly is the smaller, compatible
  change).
- **Single enforcement point extended, not duplicated**: `exam-eligibility.ts`'s
  `isStudentEligibleForExam`/`studentVisibleExamWhere` (the one shared rule
  `POST /api/attempts` and every student exam-listing query already goes through) gained the tag
  dimension. OR-widening is baked directly into the Prisma WHERE (a new `hasSome` branch scoped to
  `targetTagsOperator: 'OR'`); AND-narrowing can't be expressed as a Postgres array-subset WHERE
  clause, so it's applied as a new `filterExamsByTagTargeting()` post-query filter — both
  `getStudentExams` and `getStudentDashboardData` call it identically (the exact two functions
  that drifted before, per this file's own documented history, so this was deliberately built as
  one shared function both call rather than two call sites hand-rolling the same logic again).
  22 unit tests, plus a disposable live-DB script exercising the real Prisma query against actual
  Postgres (`hasSome` behaves correctly live, not just in the mocked unit tests) — fixtures
  confirmed deleted afterward.
- **UI**: inline per-student tag chip editor + bulk multi-select "Bulk Tag"/"Remove Tag" action bar
  + a tag filter strip on `teacher/students` (no existing tag-input component to reuse — the
  CLO/violation-type "tags" elsewhere are read-only `Badge` displays, not editable inputs, so this
  is purpose-built); a "Target Tags" chip input + AND/OR radio next to the existing class picker
  in the exam wizard; a new "Average Score by Student Tag" table on `teacher/analytics` (multi-tag
  membership is OR internally — any one matching tag counts — since the notes don't specify
  multi-tag-internal logic and OR is the more conservative, inclusive default).

## Ticket 10: Standardize Curriculum & Classes to the Item Bank's tri-tenancy + sharing model
Full parity with the Item Bank RBAC pattern, built by directly mirroring
`ItemBank`/`ItemBankAccess`/`resolveBankPermission()` rather than inventing a second model.
*(2026-08-22)*

- **Schema**: `Class` gained `classLevel` (institutional/personal, default personal) + `ownerId`
  (backfilled to `teacherId` for every pre-existing row) and a new `ClassAccess` junction table
  (owner/editor/viewer). `Course` gained the same pair (`courseLevel`, default **institutional**
  since every pre-existing row was already admin-created and institution-wide — the opposite
  default from Class, for the opposite reason) + `ownerId` (backfilled to `institutionId`) and a
  new `CourseAccess` table; `Course`'s unique constraint widened from `(institutionId, code)` to
  `(institutionId, ownerId, code)` so two teachers' private course codes can't collide with each
  other or with an institutional one.
- **Permission model**: new `resolveClassPermission()`/`resolveCoursePermission()` (both in a
  dedicated pure-function module, same convention as `item-bank-permissions.ts`) — cross-tenant
  hard-denied first, then institution admins get implicit owner on everything in their own
  institution (the judgment call Haris confirmed should match Item Bank exactly), then
  owner/explicit-grant resolution. Class roster mutations (enrollments/invites) require editor+;
  rename/archive/share require owner — mirrors Item Bank's "editors can add/edit items but not
  alter core settings" split.
- **Data layer**: `classes.ts`/`curriculum.ts` rewritten with the 3-tier query functions
  (`getInstitutionClasses`/`getMyPrivateClasses`/`getSharedWithMeClasses` and the Course
  equivalents) plus collaborator management (`add/remove/getXCollaborator(s)`), all permission-
  checked. **Found and fixed a real pre-existing gap while doing this**: `createCourse()` had no
  role check at all — any authenticated user could create/mutate institution-wide curriculum by
  calling the server action directly, not just via the admin-only UI page. `getCourses()` also
  had zero access scoping before this (every teacher saw every course, always) — the institutional
  tier deliberately preserves that exact visibility (a teacher needs no explicit grant to read an
  institutional course, only to edit one), so this is additive, not a new restriction.
- **UI**: new `ManageAccessDialog` generalized from an Item-Bank-only component into a resource-
  agnostic one (fetch/add/remove callbacks injected as props) so Item Bank, Classes, and
  Curriculum all share one implementation instead of three near-duplicates. New 3-tab dashboards
  at `teacher/classes` and the previously-nonexistent `teacher/curriculum` (+ `[courseId]` detail
  page, a 2-column Topic/CLO tree scoped to one course), new `admin/classes` page for creating
  institutional classes (mirroring `admin/item-banks`), admin's existing `admin/curriculum` page
  updated to only manage the institutional tier through the new permission-aware queries.
- **RLS**: new SECURITY DEFINER helper functions `class_can_read`/`class_can_manage` and
  `course_can_read`/`course_can_manage`, mirroring the exact `item_bank_can_read`/
  `item_bank_can_manage` pattern from the 2026-07-17 Item Bank RLS fix (deliberately reused rather
  than hand-rolled, since that fix exists specifically because the naive inline-EXISTS version hit
  infinite recursion for this exact ItemBank↔ItemBankAccess shape). `Class`'s existing SELECT
  policy extended with the new grant path; `ClassAccess`/`Course`/`CourseAccess` get new
  SELECT-only policies (Course previously had **no RLS at all**). `ClassEnrollment`/`ClassInvite`
  policies extended so a granted collaborator (not just the teacher-of-record/admin) can read the
  roster. Topic/LearningObjective deliberately left without RLS, matching Item/ItemOption's
  precedent (RLS stops at the bank/access level, not per-contained-row).
- **Live-verified** via disposable fixtures + `SET ROLE authenticated`/`SET request.jwt.claims`
  queries (same method as the 2026-07-17 Item Bank RLS verification): a personal class/course is
  invisible to a teacher with no grant, visible to its owner, visible to a granted collaborator
  after the grant (and their own `ClassAccess` row is visible to them specifically), invisible to
  an unrelated third party, and a same-institution admin gets implicit visibility into everything
  — including the full collaborator list — with no explicit grant, confirming the judgment call.
  All fixtures confirmed deleted afterward (0 leftovers).
- **Verification**: `tsc` clean · `lint` at the exact pre-existing 3-error baseline · `vitest`
  415/415 (+7 new, replacing the old `canManageClass`-based test file with `resolveClassPermission`
  coverage) · `build` clean, all new routes registered (`admin/classes`, `teacher/curriculum`,
  `teacher/curriculum/[courseId]`, `api/classes/[classId]/collaborators`,
  `api/courses/[courseId]/collaborators`).

## Update 9 August 2026 — Ticket Batch
- **Ticket 1 (trust score inconsistency + UI color coding)** — trust score formula and
  color-threshold logic unified across every view (was two formulas + four inline color schemes).
  *(2026-08-10)*
- **Ticket 4 (decouple Availability Window from Exam Duration)** — the exam edit screen now has
  independent Start/End and Duration fields ("duration and the availability window are genuinely
  separate concepts here, not one derived from the other," confirmed by reading the wizard's own
  code); the whichever-is-sooner cutoff enforcement this ticket also asked for was already
  server-side since the original duration/availability work. *(2026-08-12)*
- **Ticket 2 (missing media evidence for AI violations)** — audio evidence capture
  (`AudioMonitor.tsx`'s `captureClip()`: a 6s `MediaRecorder` clip taken when an audio episode
  opens, uploaded and stored in the violation's `screenshotUrl` — same field/pipeline visual
  evidence uses) and the Live Monitor → Student Detail modal's click-to-load evidence UX
  (`StudentActionsModal.tsx`'s `viewViolationEvidence()`, gated on `Boolean(v.screenshotUrl)` for
  every violation row, branching to an `<audio>` player vs `<img>` via
  `violationMediaKind`/file-extension sniffing). *(2026-08-10)*
- **Ticket 3 (editable per-exam question points, decoupled from the Item Bank default)** — the
  wizard's Select Questions step already has `marksOverride`/`effectiveMarks`/`setItemMarks` state,
  a live editable points `<Input>` per selected item, and a "Total Points: N" badge; confirmed it
  never writes back to the source `Item`. *(2026-08-12)*
- **Ticket 5 (broken RTL layout on Item Bank page)** — root cause was Radix `Tabs`/`Select`
  defaulting their internal `dir` to `ltr` regardless of `html[dir]`; fixed app-wide with a
  `DirectionProvider` + an `npm overrides` pin, explicitly verified against the Item Bank page
  this ticket named. *(2026-08-10)*
- **Ticket 6 (replace plain text inputs with a real RTE, math/chem tools inside the toolbar)** —
  Quill WYSIWYG editor for stem/answer-option fields, Math/Chemistry as toolbar-embedded buttons
  opening the existing equation dialog. *(2026-08-10)*
- **Ticket 8 (UI overlap / text overflow in the Matching question component)** — the closed-state
  dropdown clipped long text with no ellipsis; fixed as part of the same session's live-QA pass.
  *(2026-08-10)*
- **Ticket 9 (flexible hierarchical scoring rubric for essays)** — same item as the rubric engine
  entry above; matches this ticket's ask almost line for line (dynamic grid, add/rename/delete
  dimensions, sub-dimension nesting, weight validation, AI Auto-Grading toggle). *(2026-08-10)*
- **Ticket 7 (exam content should use `dir="auto"`, independent of the UI's language)** —
  `RichText.tsx` (the shared renderer for stem/options/explanations) already had `dir="auto"` on
  every span, so the read side was covered. The actual gap was the **authoring** inputs, which had
  no `dir` at all: `QuillEditor`'s contenteditable root (needs `dir="auto"` set directly on
  `quill.root` itself — the attribute's auto-detection doesn't cascade to children, only the
  resolved ltr/rtl does), and `MathTextarea`/`MathInput` (`MathTextField.tsx`). Also found and
  fixed the identical bug on content that bypassed `RichText` entirely (plain `<p>`/`<Textarea>`,
  no `dir` handling): Exam Instructions (wizard + edit page), Section Instructions/Title
  (`SectionsManager.tsx`), and the exam title heading on the student exam page. *(2026-08-22)*

## Advanced Item Types & Multimedia Responses (AUDIO_RESPONSE / VIDEO_RESPONSE)
Phased per the original plan — items 1–3 and 5 shipped this pass; item 4 (COMPOSITE_CASE
split-screen rendering) deliberately deferred, schema-only (see `left.md`).
- **Schema**: `QuestionType` enum gained `audio_response`/`video_response`/`composite_case`;
  `Item`/`Question` both gained `mediaSettings Json?` (`minDurationSeconds`, `maxDurationSeconds`,
  `prepTimeSeconds`, `allowScreenShare`, `maxRetries`) and a self-relation
  (`parentItemId`/`parentQuestionId`, `ItemComposite`/`QuestionComposite`) laying the groundwork
  for composite/case-study children without building the rendering engine yet.
- **Authoring** — item builder (`teacher/items/new`) gained the two new type options plus a
  "Recording Setup" card (prep time / min / max duration, retry cap, screen-share toggle for
  video) that writes `mediaSettings` into `createItem()`'s payload; wizard materialization and
  `duplicateExam()`'s question-copy path both carry `mediaSettings` through.
- **Student capture** — new `RecordingQuestion.tsx`: prep countdown → recording via
  `MediaRecorder` (MIME-type fallback lists for audio/video) → review/retake, with
  `compositeStream()` canvas-compositing webcam + screen side-by-side when screen-share is
  enabled. Wired into the exam-taking page reusing the exact same submit-time upload flow
  `file_upload` already uses (`fileAnswers` state, uploaded on Submit, not per-keystroke).
- **Scoring** — both submit routes (unsectioned + per-section) now derive their manual-grading
  question-type list from one shared `MANUALLY_GRADED_TYPES` export (`scoring.ts`) instead of an
  inline hardcoded list, with `audio_response`/`video_response` added; grading is manual-only, no
  transcription/AI step — confirmed with Haris rather than assumed, matching the original plan's
  point 6.
- **Teacher review** — `/api/evidence` gained an `answerId` branch resolving a
  `file_upload`/`audio_response`/`video_response` answer's stored path to a signed URL (same
  teacher/institution-scoped authorization every other evidence branch uses); the per-student
  results page gained a click-to-load `FileAnswerViewer` (`<audio>`/`<video>`/download-link by
  type). **Incidental bug fixed**: `file_upload` answers had never had a working viewer at all
  before this — they rendered as inert plain text with the raw storage path; this closes that gap
  for all three file-based types at once, not just the two new ones.
- **Verification**: `tsc` clean · `lint` at the unchanged 3-error/0-warning baseline · `vitest`
  436/436 · `build` clean · live DB confirmed (`enum_range` shows all 3 new `QuestionType` values,
  `information_schema.columns` shows `mediaSettings`/`parentItemId`/`parentQuestionId` present on
  both tables). **Known gap, not done this session**: no live browser/hardware QA on the new
  recording UI (`MediaRecorder`, screen-share compositing) — camera/mic-dependent in the same way
  this repo's prior proctoring work flagged rather than claimed tested. *(2026-08-22)*
