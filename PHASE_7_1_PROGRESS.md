# Phase 7.1 Progress (2026-07-17)

Small, scoped bugfix session closing the three concrete frontend gaps found while writing
`MANUAL_QA_PHASE_5-7.md`. No backend logic, schema, or scoring touched — all three backend
behaviors were already correct and tested; the bugs were purely in how the frontend consumed
them.

## Scope decision, stated up front

This repo has no existing pattern for testing React components directly (no
`@testing-library/react`, no jsdom/happy-dom vitest environment, no `.test.tsx` files anywhere).
Every other piece of decision logic in this codebase lives in `src/lib/*.ts` as a pure function
and is tested that way (`item-bank-permissions.ts`, `exam-deadline.ts`, `class-permissions.ts`,
etc.) rather than through component rendering. Following that established convention rather than
introducing a new testing toolchain for a 3-bug scoped fix: all three bugs were fixed by
**extracting the actual decision logic into pure, fully-unit-tested functions**, then wiring the
React components to call them. The "no session written on failure" and "override control
visible/hidden correctly" guarantees follow structurally from the extracted functions' return
shapes gating the components' branches — not from rendering assertions. Flagged here rather than
decided silently, per this session's own instruction to stop and flag rather than reach for a
bigger tool than the task needs.

## Bug 1 — `handleStartExam` never checked `res.ok` — closed

**Before**: `POST /api/attempts`'s response was parsed as `{id, startedAt}` unconditionally,
regardless of status code. Any of the four rejection reasons (`not_started`, `exam_ended`,
`insufficient_pool`, `invalid_section_weights`) wrote a corrupt `{attemptId: undefined,
startedAt: undefined}` session to `sessionStorage`, called `setAttemptId(undefined)`, and for a
sectioned exam proceeded straight to Section 1's instructions screen — where "Start Section"
would then silently no-op forever (its own guard requires a truthy `attemptId`), stranding the
student with no error and no path forward.

**After**: new `src/lib/exam-start-errors.ts`'s `classifyStartExamResponse(status, body)` turns
the raw response into a discriminated union (`{ok: true, attempt}` or `{ok: false, kind,
studentMessage, instructorDetail?}`). `handleStartExam` now branches on this before doing
anything else — the `!outcome.ok` branch returns immediately, so the session write and every
subsequent line of the old success path are structurally unreachable on any rejection.

- Per-case student messages: `not_started` is enriched client-side with the actual
  `exam.startTime` (already loaded on the page — no backend change needed) formatted via
  `toLocaleString()`; `exam_ended` shows a plain closed message; `insufficient_pool` and
  `invalid_section_weights` both show a generic "configuration issue, instructor notified"
  message — **never** the raw shortfall/weight-sum detail from the backend.
- That raw detail isn't just discarded: it's `console.error`'d client-side under both
  configuration-issue kinds. **This is not a real instructor-notification mechanism** — it's a
  frontend-only fix and there is no backend endpoint to actually alert an instructor. Flagged
  explicitly (not built) per the instruction to stop and flag rather than add backend logic:
  a real fix would be a small addition to the existing derived-`GET /api/notifications` pattern
  (Phase 1/2 era) or a dedicated audit row, either of which is out of scope here.
- The Start button never becomes permanently dead: it stays enabled after any failure (label
  switches to "Try Again"), so retrying is always possible — simpler and safer than a
  per-case retryable/disabled matrix, and avoids ever trapping a student on a truly inert button.

## Bug 2 — `handleStartSection` swallowed its 403 silently — closed

**Before**: `if (!res.ok) return;` — the section-sequential lock's 403 (or any other rejection)
produced zero feedback; the student just saw nothing happen when clicking "Start Section."

**After**: `classifySectionStartResponse(status, body)` (same file) returns `null` on success or
the backend's own error string on failure. On failure, the section instructions screen now shows
that message and swaps the "Start Section" button for a **Reload** button — reusing the exact
recovery pattern this same file already uses for the waiting-room timer expiry
(`window.location.reload()`, which re-runs the page's own `load()` effect and its existing
resume-detection logic to land the student on whichever section they're actually meant to be
in). No new recovery mechanism was invented; an existing one was reused.

## Bug 3 — `GradingPanel` had no UI path to a permitted backend state — closed

**Before**: `const resolved = gradingStatus === 'confirmed' || gradingStatus === 'overridden'`
gated the entire confirm/override/regrade action block. Phase 7's grading-override fix
deliberately still permits re-overriding an `overridden`-but-not-yet-`confirmed` answer
server-side (only `confirmed` triggers the 409) — but with `resolved` collapsing both statuses
into one gate, there was no button left to invoke that permitted action.

**After**: new `src/lib/grading-status.ts` — `isGradingFinalized(status)` (true only for
`confirmed`) and `canOverrideGrading(status)` (its inverse). The action block's gate changed from
`!resolved` to `!finalized`; the badge's `resolved` variable (confirmed-or-overridden, for
styling only) is untouched. Concrete effect: the Override button now stays visible for an
`overridden` answer, relabeled "Change override" to make clear it's adjusting an existing
decision, not starting fresh. The Confirm button's visibility is unchanged (`gradingStatus ===
'ai_suggested'` only — it was never exposed for `overridden` before and still isn't). Regrade
also becomes reachable again for `overridden` answers as a direct, correct consequence of fixing
the same over-broad gate — not a new feature, and the backend independently still blocks it (and
override, and confirm) once `confirmed`, so this doesn't create any new way to mutate a
genuinely finalized item.

## Tests

- `tests/unit/exam-start-errors.test.ts` (9) — success classification (real 201, and a malformed
  201 body correctly falling through to `ok: false` rather than crashing on missing fields); all
  four rejection kinds classified correctly; `insufficient_pool`/`invalid_section_weights`
  explicitly asserted to keep the CLO id and shortfall/weight-sum detail out of
  `studentMessage` while carrying it in `instructorDetail`; an unrecognized error shape falls
  into `'unknown'` rather than crashing; `classifySectionStartResponse` returns `null` on success,
  surfaces the backend's own message on the lock rejection, and has a sane fallback.
- `tests/unit/grading-status.test.ts` (4) — `confirmed` is the only finalized state;
  `overridden`/`ai_suggested`/`pending_ai` all permit override.

## Verification

- `npx tsc --noEmit` → clean
- `npm run lint` → 3 errors / 1 warning, unchanged pre-existing baseline
- `npm run build` → passes
- `npx vitest run` → **201/201 passing** (188 baseline + 13 new: 9 exam-start-errors + 4
  grading-status)

## Next step

`MANUAL_QA_PHASE_5-7.md` was written against the **buggy** frontend behavior — its Section C5
step 6 (re-override of an overridden answer) and the three 🔴-flagged findings throughout
(insufficient-pool UI experience, section-weight-validation UI experience, section-lock silent
403) should now all surface real, specific error messages instead of silent failures or stuck
screens. Walk through that document again against this fixed build — every 🔴 item in it should
now flip from "reproduce the bug" to "confirm the fix," and Section C5 step 6 should now show a
working "Change override" path instead of a missing one.
