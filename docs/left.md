# notes.pdf — Remaining Items

Cross-checked against `CLAUDE.md`'s Session Log — anything not named in `completed.md` and not
found anywhere in the log is listed here. Ordered roughly by how self-contained/low-risk the fix
is, not by the PDF's own order.

---

## Advanced Item Types & Multimedia Responses — AUDIO_RESPONSE/VIDEO_RESPONSE done, COMPOSITE_CASE deferred
Phased exactly as planned — items 1–3 and 5 (schema, audio/video capture UI, storage, scoring)
shipped 2026-08-22; item 4 (composite/case-study split-screen rendering) deliberately deferred,
schema-only this pass. Moved the completed half to `completed.md`; what's left:

**Not started — COMPOSITE_CASE split-screen rendering.**
- Schema already landed: `Item.parentItemId`/`Question.parentQuestionId` self-relations exist
  (`ItemComposite`/`QuestionComposite`), so a case-study parent + children can already be
  represented in the DB — nothing here blocks starting the UI whenever it's picked up.
- Still needed: split-screen layout (parent passage sticky on one side, scrollable child questions
  on the other, side flipped for RTL vs LTR per the notes' own spec), an item-builder flow for
  authoring a composite item + attaching children, and wiring the exam-taking page to render a
  `composite_case` question by rendering its children through the *existing* per-type components
  (`RecordingQuestion`, `FileUploadQuestion`, etc.) rather than a new rendering path.
- Scoring should fall out of the existing engine once children are real `Question` rows with a
  `parentQuestionId` — likely needs one small addition to `scoreAnswers`' switch (composite_case
  currently has no case at all, so it silently scores 0 — harmless while nothing creates such rows,
  but needs a real `case 'composite_case': sum children's marksAwarded` before this ships).

---

## ~~2. UI/UX Wireframe overhaul ("Update 16 July — think with me")~~ — DECIDED: skip (2026-08-22)
Asked Haris directly rather than guessing: the current 3-step wizard + Settings-step blueprint
panel is the intended shape going forward. None of the "16 July" wireframe's alternate flows
(5-page Default Wizard rework, Path2 Blueprint-First, Path3 Express Mode, Smart Item Bank
Ingestion/AI Import) are being built. No further action — this item is closed, not deferred.
