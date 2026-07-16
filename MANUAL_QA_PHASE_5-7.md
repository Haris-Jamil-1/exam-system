# ExamPro — Manual QA: Phases 5–7 Close-Out

Companion to `QA_MANUAL.md` (Phase 1–2 hardening) and the three progress logs this covers:
`PHASE_5_PROGRESS.md`, `PHASE_6_PROGRESS.md`, `PHASE_7_PROGRESS.md`. All three phases are
188/188 tests passing, `tsc`/`lint`/`build` clean, and live-verified against Supabase — but
"live-verified" in those sessions meant **direct API calls** (via `fetch` in a real browser
session, or raw SQL against the live DB), not clicking through the actual product UI end to end.
This document exists to close that specific gap.

**Three concrete findings surfaced while writing this doc** (not fixed — per instructions, this
is a checklist, not a patch). They're the highest-priority items below, marked 🔴:

1. `handleStartExam` (the exam-taking page's "Start Exam" handler) **never checks `res.ok`** on
   `POST /api/attempts`. Every rejection reason the backend now returns — `not_started`,
   `exam_ended`, **`insufficient_pool` (new, Phase 6)**, **`invalid_section_weights` (new,
   Phase 7)** — will silently fall through, write a corrupt session with `attemptId: undefined`,
   and for a sectioned exam can leave the student stuck on the Section 1 instructions screen with
   a permanently non-functional "Start Section" button and zero error message.
2. `handleStartSection` **does** check `res.ok`, but on rejection (e.g. the section-sequential
   lock's 403) it just silently returns — no error message reaches the student either.
3. `GradingPanel.tsx` hides the entire confirm/override/regrade action block once
   `gradingStatus` is `'confirmed'` **or** `'overridden'`. Phase 7's grading-override fix
   deliberately still permits re-overriding an `overridden` (not-yet-`confirmed`) answer
   server-side — but there is currently **no UI path that can reach it**. Only a direct API call
   can exercise that permitted behavior today.

Use this document to confirm all three, then decide whether they're worth a follow-up pass.

---

## How to use this document

- Each checkbox is one thing to physically click through and observe, not infer from code.
- Items marked **[NEW]** are genuinely new surface area from Phases 6–7 with no prior manual
  pass at all.
- Items marked **[REGRESSION]** are pre-existing (Phase 5 or earlier) behavior that Phase 7's
  changes to the shared exam-taking page (`src/app/exam/[examId]/page.tsx`) could plausibly have
  disturbed — re-confirm they still work, don't assume.
- Items marked **[API-ONLY]** were verified this session exclusively via direct `fetch()` calls
  or raw SQL, never through the actual UI a real student/teacher would use.
- 🔴 marks a specific suspected bug found while preparing this doc (see the three above).

---

## Section A — Phase 5 regression pass (exam-taking page shares code with Phase 7)

Phase 5 itself shipped no code changes to the student exam-taking flow (audit only), but Phase 7
edited the *same file* (`src/app/exam/[examId]/page.tsx`) to wire item-lock calls into the "Next"
button, the sidebar forward-jump, and the per-item-timer-expiry handler. Re-confirm none of
Phase 5's original behavior broke.

- [ ] **[REGRESSION]** Non-sectioned, non-sequential exam: instructions screen still gates the
      duration timer — timer does not start until "Start Exam" is clicked, not on page load.
- [ ] **[REGRESSION]** Per-item time limit (`Question.timeLimitSeconds`) still auto-advances to
      the next question on expiry, and "Previous"/sidebar navigation to that expired question
      index is still permanently locked afterward.
- [ ] **[REGRESSION]** `isProctoringEnabled = false`: confirm no `<video>` element is ever
      created (open DevTools → Elements, search for `<video`) and no biometric gate renders.
      Confirm `isProctoringEnabled = true` + `proctoringLevel: 'strict'` still shows the
      biometric gate correctly.
- [ ] **[REGRESSION]** Availability-window-vs-duration: start an exam where `endTime` is sooner
      than `startedAt + duration` — confirm the countdown reflects the sooner deadline, and the
      resulting attempt status is `auto_submitted` if you let it expire.
- [ ] Confirm the deliberate non-change is still true: **no cron/background job force-submits a
      dead attempt.** Start an attempt, close the tab without submitting, wait, and confirm the
      attempt just sits `in_progress` forever until a teacher manually calls "Force Submit"
      (live monitor) or force-finalize. This is intentional (see Phase 5's progress log) — you're
      confirming it's *still* true, not filing it as a bug.

---

## Section B — Phase 6: Item Bank RBAC & Dynamic Pooling

### B1. Item Bank three-tab dashboard + RLS

- [ ] As a teacher, confirm the three tabs on `/teacher/items` ("Institution Banks," "My Private
      Banks," "Shared with Me") each show exactly what you'd expect for a fresh account (empty
      "Shared with Me" until someone invites you).
- [ ] **[API-ONLY]** Cross-institution collaborator invite: as a personal-bank owner, open
      "Manage Access," and try to search/select a user from a *different* institution (if your
      test data has one). Confirm the UI either doesn't surface them in the search at all, or a
      submit attempt shows a clear error — not a silent no-op.
- [ ] **[API-ONLY]** RLS spot-check (optional, needs Supabase SQL access or
      `scripts/mgmt-sql.sh`): pick a real `ItemBank`/`ItemBankAccess` row, then run
      ```sql
      SET ROLE authenticated;
      SET request.jwt.claims = '{"sub":"<some-other-institutions-teacher-supabase-uid>"}';
      SELECT * FROM "ItemBank" WHERE id = '<the-bank-id>';
      ```
      confirm it returns zero rows. This was live-verified with disposable data during the Phase
      6 session and cleaned up afterward — this step is only worth doing if you want to
      re-confirm against real production data rather than trust the one-time disposable check.
- [ ] Flag item, not a bug: a personal-bank owner's account being deactivated (admin
      deactivation) does **not** reassign or archive their personal banks — they just become
      inaccessible to everyone except an institution admin (who has implicit owner rights on
      every bank in their institution). If you deactivate a test teacher who owns a personal
      bank, confirm this is the actual behavior and decide if it's acceptable as-is.

### B2. AI generation — decoupled from wizard, CLO-aware, batch-capped

- [ ] Confirm the exam wizard's step list is **Basic Info → Select Questions → Settings** with
      no "AI Generation" step anywhere in the flow.
- [ ] On an item bank's detail page, confirm "Generate with AI" is visible for owner/editor and
      **absent** for a viewer-only collaborator (client-side gate is a nice-to-have; the real
      enforcement is server-side and already tested).
- [ ] Quantity input: confirm it visually caps at 15 (`MAX_BATCH_SIZE`) and the button label
      updates live ("Generate 1 Question" → "Generate 15 Questions").
- [ ] CLO dropdown: pick a CLO, generate, confirm every resulting item shows
      `[Aligned to CLO: ...]` in its explanation (mock generator) or is otherwise visibly tied to
      that CLO in the bank list.
- [ ] Generate with an **invalid/deleted** CLO id (only reachable via direct API — there's no UI
      path to select a nonexistent CLO) is optional to test; the important UI-reachable case is
      confirming the dropdown never lets you select a CLO from another institution's course to
      begin with.

### B3. Dynamic pooling — the two Phase 6 bug fixes

- [ ] **[NEW]** 🔴 **Insufficient-pool UI experience**: build a pooled exam whose blueprint asks
      for more questions from one CLO than are currently approved in the bank. Log in as a
      student and try to start it. **Expected per the backend fix**: a clear message. **What
      will likely actually happen** (per finding #1 above): the page may silently misbehave
      instead of showing anything meaningful, since `handleStartExam` doesn't check `res.ok`.
      Confirm which one it actually is, and if it's the broken case, that's the single most
      valuable finding to act on from this whole document — Phase 6's backend fix (409 with a
      clear shortfall message) would currently be invisible to real students.
- [ ] Healthy pool: build a pooled exam with a comfortable CLO surplus, start it as two different
      students, confirm each gets a full, correctly-sized, independently-shuffled question set
      (open the DB or teacher's per-student review page to compare the two sets — they should
      differ in item selection and/or order).
- [ ] Confirm a student's pooled question set is stable across a hard refresh mid-exam (not
      re-randomized on reload) — refresh the exam page mid-attempt and confirm the same
      questions in the same order reappear.

---

## Section C — Phase 7: Multi-Section Locking

### C1. Section-sequential lock (`isSectionSequential`)

1. Build a 2-section exam with `isSectionSequential` enabled.
2. As a student, start the exam, and on Section 1's instructions screen, **before clicking
   "Start Section,"** open DevTools console and manually call:
   ```js
   fetch(`/api/attempts/${attemptId}/sections/${section2Id}/start`, { method: 'POST' })
     .then(r => console.log(r.status))
   ```
   (grab `attemptId`/`section2Id` from Network tab or sessionStorage) — confirm this returns
   `403`, proving the lock is server-enforced, not just a hidden UI affordance.
3. **[NEW]** 🔴 Now do the *legitimate* version of the same thing through the actual UI: is there
   any way to reach Section 2's "Start Section" button before Section 1 is submitted? If the UI
   genuinely prevents this entirely (e.g. no such button is ever rendered), this finding is
   moot — confirm that's actually true. If there *is* a path (e.g. a stale tab, a browser
   back-button, a race from opening two tabs), click "Start Section" on the locked section and
   confirm you see a clear error, not silence (see finding #2 — `handleStartSection` currently
   swallows the 403 with no message).
4. Submit Section 1 normally, confirm Section 2 now starts cleanly.
5. Try resubmitting Section 1 again via a direct API call (`POST .../sections/{section1Id}/submit`
   with any body) — confirm `409`.

### C2. Item-sequential lock (`isItemSequential`) — the new `ItemLock` mechanism

1. Build a section with `isItemSequential` enabled, at least 3 questions.
2. Answer Q1, click "Next." Open DevTools Network tab — confirm a
   `POST /api/attempts/{id}/items/{q1Id}/lock` fired and returned `201`.
3. Confirm "Previous" is hidden/disabled from Q2 onward (this part is pure client-side state,
   already known to work).
4. Try to go back to Q1 via direct API manipulation (not reachable through the UI, since Previous
   is hidden) — call the lock endpoint again for Q1's id and confirm `403 item_locked`.
5. **[NEW]** Let a per-item timer expire naturally (don't touch the question) under
   `isItemSequential` — confirm it *also* fires a lock call for that question (check Network tab)
   and that the item is genuinely locked afterward (repeat step 4 for the expired item). This is
   the "most restrictive wins" flag-don't-guess item from `PHASE_7_PROGRESS.md` — it was verified
   by reading the wiring code and via a scripted API-level test, but never watched happen in a
   real browser with a real countdown running out.
6. Submit the section normally and confirm the final score reflects what you actually answered
   for every question (this exercises the defense-in-depth path end-to-end through real UI
   interaction, not a scripted tampered payload like the Phase 7 live QA did).

### C3. Section-weight-sums-to-100% validation

1. In the exam wizard, build a 2-section exam with weights that **don't** sum to 100 (e.g. 40/40).
   Confirm the non-blocking amber warning appears ("should sum to 100%") but the exam still
   saves.
2. **[NEW]** 🔴 As a student, try to start that exam. **Expected**: a clear
   `invalid_section_weights` error. **What to actually check for** (per finding #1): does the
   student see any error at all, or does the page silently proceed into a broken state? This is
   the second half of the same `handleStartExam` gap flagged above — reproduce it here
   specifically for the weight-validation path, separately from the pooling path in B3, since
   they're different code but the same UI-layer symptom.
3. Fix the weights to sum to exactly 100, confirm the same student can now start normally.
4. Confirm a student who **already started** the exam before the teacher broke the weights is
   never blocked from resuming (this matches the deliberate "never strand an in-progress
   student" design choice) — start an attempt with valid weights, have the teacher edit a
   section's weight to break the sum, and confirm the student's next page load/resume still
   works.

### C4. Composite scoring + section-threshold override

1. Build the exact scenario from the spec's own worked example: 2 sections, 60%/40% weight,
   50%/90% passing thresholds. Score Section A 100%, Section B 50%.
2. Confirm the teacher's results table shows this student as **Failed** (not a plain Pass), even
   though the raw composite is 80%.
3. Confirm the student's own completion page shows a "section threshold not met" message, not a
   contradictory "Pass."
4. Spot-check one more composite math case with weights that aren't round numbers (e.g. 3
   sections at 33/33/34) to build confidence beyond the one canonical example.

### C5. AI Grading Override & Bulk-Approve

1. Have a student submit essay/coding answers so the AI grading pipeline produces
   `ai_suggested` answers (needs `ANTHROPIC_API_KEY` set, or confirm the mock fallback still
   produces a suggestion to work with).
2. On the per-student review page, confirm the new **"Approve All (N)"** button's count matches
   exactly the number of answers currently showing an AI suggestion with no teacher action taken
   yet (not counting anything already overridden/confirmed).
3. Click "Approve All." Confirm:
   - Every previously-`ai_suggested` answer now shows as confirmed/resolved with the AI's mark.
   - Any answer you'd already manually overridden *before* clicking Approve All is untouched —
     same mark, same status, not silently reset to the AI's original suggestion.
   - The message shown (`Approved N — M already finalized, K not ready yet`) matches what you'd
     expect by counting manually.
   - The attempt's total score updates once, correctly, reflecting the newly-confirmed marks.
4. Try clicking "Approve All" a second time with nothing new pending — confirm it's a harmless
   no-op (0 approved) rather than an error or a duplicate mutation.
5. Override one answer manually. Confirm the score recalculates immediately and the answer shows
   as "Manually Modified"/overridden.
6. **[NEW]** 🔴 Try to override that same answer *again* (still `overridden`, not yet
   `confirmed`). Per Phase 7's Task 2b fix, the **backend now permits this** — but per finding #3,
   **the UI likely won't let you**, since `GradingPanel` hides the whole action block once
   `resolved` (`confirmed` OR `overridden`) is true. Confirm which one actually happens:
   - If the override buttons are gone and there's no way to re-adjust an overridden-but-not-yet-
     finalized mark through the UI, that's the exact mismatch flagged above — the backend
     capability exists, is tested, and is unreachable by a real teacher.
   - If you can find some path to it (e.g. a page reload resets some local state), note exactly
     how.
7. Finalize an answer (via "Confirm" or via "Approve All"), then try to override it via a direct
   API call (`POST /api/grading/answers/{id}` with `{action: 'override', marks: 5}`) — confirm
   `409` ("already been finalized... reopening... not yet supported"). This is the one part of
   this feature that both the backend test suite *and* a real UI path (there's no button to even
   attempt this once resolved) agree on — lower priority to hand-verify, included for
   completeness.

---

## Section D — Cross-cutting: does "unaffected" actually hold?

Each progress file made a claim that some existing behavior was "unaffected" or "unchanged" by
that phase's work. Spot-check the ones that are cheap to verify and matter if wrong.

- [ ] **Phase 7's claim**: "the no-autosave-until-final-submit property still holds exactly as
      before for every exam except ones that opt into `isItemSequential`." Verify the negative
      case: start a **non**-`isItemSequential` exam, answer a few questions, and confirm (via DB
      or an API call as a teacher/admin) that **zero** `Answer` rows exist for that attempt until
      you actually click Submit. This is the control group for the claim — Phase 7 only ever
      tested the positive case (that `ItemLock` rows *do* appear for sequential exams).
- [ ] **Related, not explicitly claimed but worth confirming**: for an `isItemSequential` exam
      whose client dies mid-exam (crash the tab after locking 2 of 5 items), confirm
      `POST /api/monitor/force-finalize` still scores it **0**, exactly as it does for every
      other exam — it was confirmed by code read that force-finalize never queries `ItemLock` at
      all, so the partial answer data sitting in `ItemLock` for that student is currently
      invisible to the recovery path that could theoretically use it. Not a bug (matches the
      explicit "don't touch this" instruction), but worth knowing: Phase 7 created a small amount
      of recoverable partial-answer data that nothing in the product currently uses.
- [ ] **Phase 6's claim**: "no behavior changed" for item-bank RBAC and AI generation (only test
      coverage was added). Spot-check one legitimate cross-bank AI-generation flow end-to-end
      (pick a bank you have editor rights on, generate 3 questions, confirm they land as drafts)
      to confirm the *already-existing* Phase 3-era functionality genuinely still works after
      this session's edits to nearby files (`pooling.ts`, `attempts/route.ts`).
- [ ] **Phase 6's claim**: cross-institution collaborator rejection and the personal-bank
      cross-tenant guards were "not touched, still correct." These are covered by 11 automated
      tests now (`item-bank-data.test.ts`) — lower priority to hand-verify again, but worth one
      spot check if you have two real institutions in your test data.

---

## Known gaps carried over from earlier phases (context, not new — don't file these)

- **Camera-widget/Submit-button overlap** (flagged since the original QA pass): still open,
  still "you check it yourself in a real browser" per the original note. Phase 7 changed the
  Next-button's `onClick` handler on the same exam-taking page — worth a quick glance to confirm
  this didn't shift anything near the submit button/camera-preview area, but this is a layout
  question, not a logic one.
- **`DashboardShell` SSR/hydration mismatch** (avatar-initials `localStorage` read): still open,
  unrelated to Phases 5–7, causes occasional flaky "did my click actually register" moments
  during manual QA on any dashboard page. If a manual QA step in this doc seems to silently not
  register a click, try it again once before concluding it's a real bug — this is a known,
  pre-existing red herring.
- **No cron/auto-finalize for dead attempts**: still an open, deliberate gap (Phase 5). Explicitly
  out of scope for all three phases covered here per the close-out brief — don't re-flag it,
  just be aware `force-finalize` remains the only recovery path and it always scores 0.

---

## Bug-report convention

If you find something wrong while working through this document, report it as:

```
**[Phase/Area] Short title**
Steps: exact clicks/API calls, in order, with any specific test data used (exam id, section
weights, CLO, etc.)
Expected: what the relevant PHASE_X_PROGRESS.md entry or this doc says should happen
Actual: what you actually saw
Severity: does it block a real workflow, or is it cosmetic/edge-case
```

For the three 🔴 findings already flagged above, you don't need to re-report them from scratch —
just confirm PASS/FAIL against the "Expected" written into each checklist item, and note any
detail that differs from what's predicted here (e.g., if `handleStartExam`'s missing `res.ok`
check turns out to fail more gracefully than predicted, that's worth knowing too).
