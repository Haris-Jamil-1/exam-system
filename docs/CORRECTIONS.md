# Production Data Corrections Log

Record of one-off manual corrections applied directly to production data, outside the normal application code path. Each entry: what was wrong, why, exact before/after values, and when/how it was verified. Corrections are only ever applied after an explicit human decision — see the referenced finding for context.

---

## 2026-07-06 — DAT-01: MCQ scoring bug correction

**Finding**: `QA_RESULTS.md`'s DAT-01 (read-only audit, `scripts/qa-data-integrity-audit.ts`) found 2 real production `Answer` rows scored under the pre-2026-06-25 bug where MCQ/true_false answers were compared by option *text* instead of option *ID* (fixed in the 2026-06-25 "Destructive QA Audit + 7 Critical Fixes" session — see `CLAUDE.md`). Both rows were `submittedAt: 2026-06-25T14:04:06.442Z`, i.e. submitted in the narrow window before that day's fix landed.

**Decision**: recalculate and correct both rows using the current (fixed) scoring logic, rather than leave them flagged. Authorized by the user 2026-07-06.

**Scope of correction**: only `Answer.isCorrect`/`Answer.marksAwarded` for the 2 flagged rows, and the derived `ExamAttempt.score`/`scorePercentage` for their parent attempt (recomputed as the sum of *all* answers in that attempt, not just the 2 corrected ones — a 3rd, genuinely-wrong answer in the same attempt was independently verified against its question's options and correctly left untouched). `trustScore`/`violationCount` were not touched — unrelated to this bug.

### Corrected rows

| Table | Row | Field | Old value | New value |
|---|---|---|---|---|
| `Answer` | `cmqtkpdw5000d04jmmhdco49a` (question `cmqt9s2tz000104jsq9eu8cox`, "recommended approach for handling edge cases") | `isCorrect` | `false` | `true` |
| `Answer` | `cmqtkpdw5000d04jmmhdco49a` | `marksAwarded` | `0` | `4` |
| `Answer` | `cmqtkpe2e000e04jm9ra7gfkk` (question `cmqt9s4ej000604jsz2olfnst`, "concept ... associated with optimization") | `isCorrect` | `false` | `true` |
| `Answer` | `cmqtkpe2e000e04jm9ra7gfkk` | `marksAwarded` | `0` | `4` |
| `ExamAttempt` | `cmqtkoyxo000b04jmdd9yjtt5` (exam "MIDTERM", `cmqt9s1pi000004jsmtpgbb6d`) | `score` | `0` | `8` |
| `ExamAttempt` | `cmqtkoyxo000b04jmdd9yjtt5` | `scorePercentage` | `0` | `67` |

**Why (root cause)**: for both rows, the student's stored `response` was the *correct* option's ID (verified by looking up the option in the question's `options` array and confirming `isCorrect: true`), but `Answer.isCorrect` was stored as `false` and `marksAwarded` as `0` — the exact signature of the pre-fix bug (the old code compared the response against `correctAnswer` text rather than looking up the option by ID). The 3rd answer in the same attempt (`cmqtkpe8m000f04jmmw0xt4be`) was separately checked and its stored response genuinely does not match its question's correct option — left as-is, correctly scored 0.

**How applied**: one-off script (`scripts/dat01-correct.ts`, run then deleted — disposable, not committed) directly against the production DB via Prisma, in a single transaction (2 `Answer` updates + 1 `ExamAttempt` update). Idempotency check included (would no-op if re-run after the fix). Pre-write, values were read and printed for review; post-write, re-read to confirm the transaction committed as expected.

**Verification**: `npx tsx scripts/qa-data-integrity-audit.ts` re-run against the live prod DB immediately after — **0 rows now flagged** (down from 2), confirming no other rows were affected and the correction is complete.

**Not corrected / out of scope**: this attempt's `trustScore` (currently `0`, which looks independently stale — likely predates the same day's `trustScore` server-side-calculation fix — but that's a different bug, not part of DAT-01, and was not touched here).
