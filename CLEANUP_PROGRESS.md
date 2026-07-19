# Cleanup & Finalization Progress

Run started: 2026-07-19. Resume from the last unchecked phase if interrupted.

- [x] Phase 1 — Repo cleanup ✅ (build clean · tsc clean · vitest 275/275)
- [x] Phase 2 — docs/ARCHITECTURE.md ✅ (10 sections: stack, tree, data model + ER map, auth/RBAC/RLS, 8 flow walkthroughs, full API table, env vars, conventions, gotchas, LLM change guide)
- [x] Phase 3 — docs/FEATURES.md ✅ (14 modules, ~130 features, uniform table columns for Excel conversion; statuses Live/Config/Simulated/Partial; no invented features — e.g. "resend invite" was checked and does not exist, so it is not listed)
- [x] Phase 4 — README.md rewrite ✅ (client-facing: intro, roles, 4 step-by-step role guides, 11-entry FAQ, short "For Developers" section linking to docs/ARCHITECTURE.md; also created `.env.example` (names only, no secrets) and un-ignored it in .gitignore so the setup instructions are real)
- [x] Phase 5 — Final verification ✅ (build clean · tsc clean · vitest 275/275 · lint at pre-existing 3-error baseline · doc cross-references verified)

---

## Phase 1 — Repo Cleanup

### Deletion Manifest

**Root markdown — session/progress artifacts (all content is preserved in git history and summarized in CLAUDE.md's session log; superseded by the new docs/ARCHITECTURE.md + docs/FEATURES.md):**

| File | Reason |
|---|---|
| LIVE_VIDEO_PROGRESS.md | Session progress log for the 2026-07-17 WebRTC work — done, shipped |
| MANUAL_QA_PHASE_5-7.md | Manual QA checklist written against pre-fix behavior (its findings are already fixed) |
| PHASE4_FIXES_PROGRESS.md | Session progress log — done, shipped |
| PHASE4_FIXES_ROUND2_PROGRESS.md | Session progress log — done, shipped |
| PHASE4_FIXES_ROUND3_PROGRESS.md | Session progress log — done, shipped |
| PHASE_5_PROGRESS.md | Session progress log — done, shipped |
| PHASE_6_PROGRESS.md | Session progress log — done, shipped |
| PHASE_7_PROGRESS.md | Session progress log — done, shipped |
| PHASE_7_1_PROGRESS.md | Session progress log — done, shipped |
| PROCTORING_FIX_PROGRESS.md | Session progress log for the 2026-07-18 proctoring fix — done, shipped |
| QA_CHECKLIST.md | 2026-07-03 QA audit checklist — every finding closed 2026-07-06 |
| QA_MANUAL.md | Manual companion to the closed QA audit |
| QA_RESULTS.md | Results of the closed QA audit |
| requirements.md | 2026-07-09 gap-analysis spec — all 9 items implemented and verified |

**docs/phase3 — progress logs only (the 01–06 architecture/design docs are KEPT):**

| File | Reason |
|---|---|
| docs/phase3/PROGRESS.md | Doc-writing progress tracker |
| docs/phase3/IMPLEMENTATION_PROGRESS.md | Implementation session log — shipped |
| docs/phase3/FOLLOWUP_PROGRESS.md | Follow-up session log — shipped |

**Tracked build artifacts:**

| File | Reason |
|---|---|
| api/psychometrics/__pycache__/*.pyc (2 files) | Python bytecode accidentally committed; added `__pycache__/` to .gitignore |

**Unused source code (verified: zero imports anywhere in src/, tests/, e2e/, scripts/):**

| File | Reason |
|---|---|
| src/lib/mock-data/ (9 files) | Phase 1 mock layer; nothing imports any of it since Phase 2 wired real data |
| src/components/shared/Navbar.tsx | Landing page (`src/app/page.tsx`) defines its own local `Navbar`; this one is orphaned |
| src/components/shared/RoleGuard.tsx | Never imported; role gating is done in middleware + layouts |
| src/components/ui/separator.tsx | Never imported |
| src/components/ui/skeleton.tsx | Never imported |
| src/components/ui/toast.tsx | Never imported (no toast system is mounted anywhere) |
| src/hooks/useViolations.ts | Never imported |

**Unused npm dependencies (verified via grep across all code + configs):**

| Package | Reason |
|---|---|
| @tanstack/react-query | Zero imports anywhere |
| @radix-ui/react-separator | Only consumer was the deleted separator.tsx |
| @radix-ui/react-toast | Only consumer was the deleted toast.tsx |

**Unused public assets (create-next-app defaults, zero references):**

| File | Reason |
|---|---|
| public/file.svg, globe.svg, next.svg, vercel.svg, window.svg | Default scaffolding icons, referenced nowhere |

**Local (untracked) artifacts:**

| Item | Reason |
|---|---|
| 13 × .DS_Store files | macOS Finder artifacts (already gitignored) |
| test-results/ (empty dir) | Stale Playwright artifact dir |
| tests/integration/ (empty dir) | Empty leftover directory |

**Moved, not deleted:**

| Item | Reason |
|---|---|
| CORRECTIONS.md → docs/CORRECTIONS.md | Permanent audit trail of the 2026-07-06 production data corrections — kept, relocated out of the root |

**Explicitly KEPT (checked and confirmed referenced/needed):**
- `CLAUDE.md` — active project instructions for Claude Code sessions
- `docs/phase3/01–06*.md` — genuine architecture/design docs for the proctoring/AI/monitoring/psychometrics subsystems
- `requirements.txt` (root) — required by Vercel to detect the Python function in `api/psychometrics/`
- `api/psychometrics/` — live Vercel Python Function (psychometrics)
- `scripts/mgmt-sql.sh` — operational Supabase Management-API SQL helper (used when pg egress is blocked)
- `scripts/qa-data-integrity-audit.ts` — wired to `npm run test:data-integrity`
- `scripts/backfill-item-banks.ts` — one-time data-migration record (kept per "keep seed/migration scripts")
- `tests/`, `e2e/`, `playwright.config.ts`, `vitest.config.ts` — active test suites
- `messages/`, `public/models/`, `public/hero-proctoring.jpg` — runtime assets
- `.env`, `.env.local` — local env (gitignored)

### Status: ✅ COMPLETE (2026-07-19)

Executed exactly as manifested above — 43 tracked files deleted (17 markdown, 2 .pyc, 15 source files, 5 svg, plus the mock-data folder counted per-file), 1 file moved (CORRECTIONS.md → docs/), 3 npm deps removed, `__pycache__/` gitignored, 13 .DS_Store + 2 empty dirs removed locally. Nothing had to be restored.

**Post-cleanup verification:** `npm run build` clean (88 routes) · `npx tsc --noEmit` clean · `npx vitest run` 275/275 passing.

---

## Phase 2 — docs/ARCHITECTURE.md ✅

Created `docs/ARCHITECTURE.md` (~10 sections): tech stack table + how the pieces fit,
annotated directory tree, full data model (every Prisma model + text ER map, incl. the
`isSuperAdmin` DB-flag vs `Role` enum distinction), auth/RBAC (middleware → `getAuthUser()`
→ per-query scoping) + exact RLS inventory (7 tables + WebRTC broadcast policies; SEC-08
noted), 8 file-by-file flow walkthroughs (exam creation + AI path, pooling/sections, exam
taking, proctoring pipeline, grading, invites/classes, password reset, super admin), a
complete API table (~40 routes with auth requirements), every env var, conventions (incl.
the safe schema-change procedure — `db push`, no migrations dir, RLS-for-new-tables rule),
known gaps/gotchas (LaTeX unhandled, Supabase URL config, Judge0/TURN/STUN, no-autosave
design, hydration mismatch), and a "How to make changes with an LLM" paste-list table.

## Phase 3 — docs/FEATURES.md ✅

Created `docs/FEATURES.md`: 14 modules, ~130 features in uniform
`| Module | Feature | Description | User Role(s) | Status |` tables (Excel-ready).
Statuses: Live / Config (needs a key or service) / Simulated (biometric verification) /
Partial (STUN-only live video, selective RLS). Derived from code — features that don't
exist in code (e.g. "resend invitation email") were checked and deliberately not listed.

## Phase 4 — README.md ✅

Rewrote `README.md` as the client-facing document: platform intro + value points, roles
table, numbered how-to guides for all four roles, an 11-entry FAQ/troubleshooting section,
and a short "For Developers" section linking to `docs/ARCHITECTURE.md` and
`docs/FEATURES.md`. Also created `.env.example` (variable names + placeholders only, no
secrets) and added a `!.env.example` exception to `.gitignore` so the documented
`cp .env.example .env.local` step actually works.

## Phase 5 — Final verification ✅

- `npm run build` — clean (0 errors, 88 routes)
- `npx tsc --noEmit` — clean
- `npx vitest run` — **275/275 passing**
- `npm run lint` — 3 errors, all the documented pre-existing baseline (`useExamTimer.ts`,
  `invite/[token]/page.tsx`, `exam/[examId]/page.tsx`), 0 warnings
- Doc consistency: grepped all three new docs for references to any deleted file — none.
  All internal links resolve (`docs/ARCHITECTURE.md` ↔ `docs/FEATURES.md` ↔ `README.md`,
  `docs/CORRECTIONS.md`, `docs/phase3/01–06`).
- `CLAUDE.md` got a one-line pointer note (its historical session log references the
  deleted progress files; they remain retrievable from git history).

## Final summary

- **Deleted:** 43 tracked files — 14 root markdown session/QA artifacts, 3 docs/phase3
  progress logs, 2 committed `.pyc` files, 9 `src/lib/mock-data/*` files, 6 unused
  components/hooks (`Navbar`, `RoleGuard`, `separator`, `skeleton`, `toast`,
  `useViolations`), 5 default Next.js SVGs; plus untracked: 13 `.DS_Store`, 2 empty dirs.
- **Moved:** `CORRECTIONS.md` → `docs/CORRECTIONS.md` (audit trail preserved).
- **Dependencies removed:** `@tanstack/react-query`, `@radix-ui/react-separator`,
  `@radix-ui/react-toast`.
- **Created:** `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, rewritten `README.md`,
  `.env.example`, this file.
- **Build/test status:** everything green (see Phase 5 above). Nothing was skipped;
  nothing needed restoring.
