# Phase 4 Fixes — Progress (2026-07-17)

Bugfix/gap-closing session on top of the completed Phase 4 work (password reset, multi-class
teacher management, bulk student invitations, role-scoped removal). Six items from manual review:
link-based invites, admin bulk teacher invite, students-tab→classes-tab invite consolidation,
cross-institution invite blocking, teacher profile fixes, and joined-teacher visibility in the
admin panel. All six are done. 229/229 vitest passing (188 baseline + 41 new), `tsc` clean,
`lint` at the pre-existing 3-error/0-new-warning baseline (one pre-existing dead-import warning
in `api/invites/route.ts` was cleaned up as a zero-risk drive-by since the file was already being
edited), `next build` clean. Live-verified against Supabase (`rlbtdpnmdnaxlccelxdr`) via disposable,
self-cleaning Prisma + Playwright scripts — real browser logins, real Postgres rows, real cleanup.

## 1 — Remove link-based invitation ✅

Both shareable-link UIs are gone:
- `admin/teachers/page.tsx` — the `/register?institution=<id>` "Invite Link" box + Copy button
  removed entirely.
- `teacher/students/page.tsx` — its whole 3-tab invite modal (`Share Link` / `By Email` / `Bulk
  Upload`) is gone (see item 3 — the page lost its invite UI altogether, not just the link tab).

**Real bug found along the way, not just cosmetic**: that link never worked. `/register` and
`POST /api/auth/register` never read the `institution` query param at all — clicking "copy link"
and having someone use it always spun up a **brand-new institution** with them as its admin,
never joined the inviting institution as a teacher/student. This was flagged as a red herring
for item 6 before the real cause was found (see item 6).

**DB check**: `InviteToken`/`ClassInvite` both have `email` as a required (non-nullable) field —
neither model ever supported a "no specific invitee" link in the first place, so there was no
token/column to clean up. `Institution.joinCode` is a separate, pre-existing, entirely unused
field (never read anywhere in the app, not wired to any join flow) — confirmed unrelated to the
link removal and left alone; flagging it here in case a future session wants a fully clean sweep.

## 2 — Bulk teacher invitation in admin panel ✅

New `createBulkTeacherInvites()` (`src/lib/data/invites.ts`, Server Action, admin-only) mirrors
`createClassInvites`'s shape exactly: dedup + lowercase, 50-email cap, per-email structured
outcome (`invited | already_member | already_invited | cross_institution | failed`), and the same
rollback-the-invite-row-on-send-failure behavior. `admin/teachers/page.tsx`'s invite panel now has
two tabs — **Single Email** (the pre-existing quick-add, kept) and **Bulk Invite** (paste
textarea via the existing `parseBulkEmails`, plus a CSV/XLSX upload option). Per-email results are
shown inline after sending.

The CSV/XLSX parsing logic was pulled out of `teacher/students/page.tsx` (its only prior call
site, being removed in item 3) into a shared `src/lib/bulk-email-file-parse.ts`, since it's now
used by both the admin bulk-teacher-invite tab and the per-class bulk-student-invite dialog
(item 3) — two real call sites justified extracting it rather than duplicating the XLSX-parsing
logic twice.

## 3 — Move student invitation UI from Students tab to Classes tab ✅

`teacher/students/page.tsx` no longer has any invite action at all — no button, no modal, no
link/email/bulk tabs. It's now a read-only roster view with updated header copy pointing to the
Classes tab. The per-class invite dialog on `teacher/classes/[classId]/page.tsx` (which already
existed — email/comma/newline textarea + `createClassInvites`) is now the **only** place to
invite a student, and gained a CSV/XLSX upload option (via the shared parser from item 2) so no
capability was lost in the move — a plain paste-only box would have been a real regression from
what the Students tab used to offer.

**Real, unrelated leftover found and fixed while live-QA'ing this**: the teacher dashboard's
"Quick Actions" card labeled "Invite Students" still linked to `/teacher/students`
(`teacher/page.tsx:30`) — after this change that page has zero invite capability, so the shortcut
was pointing at a dead end. Repointed it to `/teacher/classes`. Found via a real Playwright
click-through, not by inspection — worth calling out since it's exactly the kind of "update any
nav/empty-state copy" cleanup this task asked for, just in a spot (`teacher/page.tsx`, not the
Students or Classes page itself) that wasn't obvious from the task description alone.

## 4 — Block duplicate cross-institution invites ✅

**Schema check, as asked, before assuming**: `User.institutionId` is a single scalar FK — no
membership/join table anywhere in the schema, and `User.email` is globally `@unique`. So one
email can only ever belong to one institution's account; there is no multi-institution student
(or teacher) concept to preserve. Per the task's own default, the block applies to **both
teachers and students**.

Single source of truth: `resolveAcceptInviteAssignment()` (`src/lib/invite-accept-decision.ts`,
pure, unit-tested) decides, given an existing User row (or none) and the inviting institution:
block if the existing row is an **active** (non-suspended) member of a *different* institution;
allow everything else. "Active" deliberately excludes suspended accounts — a suspended user isn't
currently a member of anywhere in practice, so their email can move to a new institution (and its
old suspension is cleared **only** when the institution is actually changing, never on a
same-institution re-invite — a same-institution suspended user must never be silently reactivated
just because someone re-invited their email). `isEmailActiveElsewhere()`
(`src/lib/data/invite-guards.ts`) wraps this with the one Prisma lookup every call site needs.

Wired into **every** invite-creation and invite-acceptance path, server-side (not just client
validation):
- `POST /api/invites` (institution-level teacher/student invites) — placed *before* the existing
  "already a student, just link them" shortcut, since that shortcut's own lookup
  (`prisma.user.findFirst({ email, role: 'student' })`) had **zero institution scoping** and would
  otherwise happily link a teacher to a same-named student from a different institution.
- `createClassInvites()` (per-class student invites) — new `cross_institution` outcome added to
  `BulkInviteResult`.
- `createBulkTeacherInvites()` (item 2).
- `POST /api/invites/accept/[token]` and `POST /api/class-invites/accept/[token]` — defense in
  depth at accept time too (covers invites created before this guard existed, and races), **and**
  this is where a real secondary bug was found and fixed: the class-invite accept route's
  "existing student" lookup was scoped to `institutionId: invite.class.institutionId`, so an email
  belonging to a *different* institution fell through to the "brand-new student" branch, which —
  once Supabase account creation failed (email already taken) and resolved the existing account —
  would have silently enrolled that other-institution student into this class. Fixed by checking
  by email alone, unscoped, before deciding "brand-new".

## 5 — Fix teacher profile ✅

**Root cause of the broken "Edit"**: there was no separate Edit button — the Profile form was
always editable, but `onSubmit()` took no arguments and did nothing but flash a fake "Saved" state
for 2 seconds (`setTimeout`). A real `PATCH /api/users/me` endpoint already existed and was simply
never called. Fixed: `onSubmit` now receives the form values, PATCHes the real endpoint, surfaces
a server error inline instead of silently "succeeding", and syncs the locally-cached session
(`localStorage`'s `exam_user`, which `useCurrentUser` reads on mount) so the new name is picked up
elsewhere in the shell without a hard reload. Email input is now disabled (the API route only ever
supported `name`/`avatarUrl` — an editable-but-non-functional email field would just be a second
version of the same bug). Live-verified end-to-end via Playwright: edited the name, confirmed the
"Saved" state, confirmed the row changed in Postgres, then reloaded the page and confirmed the new
name survived.

**Hardcoded stats removed**: the "Exams / Students / Avg Trust" card was a literal array
(`{value: '8'}`, `{value: '142'}`, `{value: '91'}`) shown identically for every teacher regardless
of their real data. Replaced with `getTeacherDashboardData()`'s already-correct, already-real,
already-teacher-scoped aggregates (`activeExams`, `totalStudents`, the avg-trust-score aggregate
over the teacher's own students' exam attempts) — no new query needed, this data already existed
and was just unused on this page. Renamed the label "Exams" → "Active Exams" to match what the
number actually represents now.

**Password change form** (`onPwSubmit`) has the exact same "fake success, no API call" pattern —
**left as-is, flagged rather than fixed**. The task's own wording ("the broken 'Edit' option") and
research pointed specifically at the profile save path; changing a password while already logged
in also needs a design decision this session wasn't asked to make (re-authentication before
allowing the change, vs. trusting an active session outright). Noted here rather than guessed at.

**Confirmed out of scope, not touched**: `student/settings/page.tsx` has the identical hardcoded
`{Exams: '12', Avg: '84%', Trust: '98'}` stat block — same bug, same fix would apply, but the task
scoped this to the *teacher* profile/dashboard specifically. Flagging so it isn't lost.

## 6 — Show joined teachers in admin panel ✅

**Real root cause, found by reading the accept-invite route, not by guessing**: `POST
/api/invites/accept/[token]`'s Prisma upsert had `update: { name }` — when the *update* branch
fired (i.e. the invitee's Supabase account already existed for any reason — the most common being
someone who's used the platform before in any capacity), **role and institutionId were never
written**, only the name. The invite's own `acceptedAt` got stamped and the flow returned success,
but the actual `User` row could be left with whatever institution/role it already had — so a
teacher could "accept" an invite and never actually become a member of the inviting institution,
with no error surfaced anywhere. `getTeachersList()`'s own query (`institutionId` + `role:
'teacher'`, no other filter) was already correct and not the bug — confirmed by both a direct
live-DB query test and a full Playwright browser session (both included below).

Fixed via the same `resolveAcceptInviteAssignment()` from item 4: the upsert's `update` branch now
always sets `role` and `institutionId` from the invite (and clears a prior suspension only when
the accept is genuinely moving the account to a new institution — see item 4 for why that's
conditional). The broken `/register?institution=` link removed in item 1 was a *secondary* dead
end pointing at the same underlying problem area, not the root cause itself — flagging that
distinction since it would have been easy to conflate the two.

**Suspension/removal still reflected correctly**: `getTeachersList()` doesn't filter suspended
teachers out — it includes them and maps `status: 'suspended'`, unchanged by this session and
re-confirmed live.

## Tests added (items 1, 2, 4, 6 — 41 new tests total)

- `tests/unit/invite-accept-decision.test.ts` (5) — the core Task 4/6 decision function, every
  branch including the suspended-elsewhere-vs-same-institution distinction.
- `tests/unit/invite-guards.test.ts` (5) — `isEmailActiveElsewhere` against mocked Prisma.
- `tests/unit/bulk-teacher-invites.test.ts` (7) — admin-only gate, every outcome branch
  (`invited`/`already_member`/`already_invited`/`cross_institution`/`failed`), the 50-email cap.
- `tests/unit/create-class-invites.test.ts` (3) — the `cross_institution` outcome added to the
  per-class bulk invite, including the suspended-elsewhere-allowed case.
- `tests/unit/teachers-list.test.ts` (3) — regression lock on `getTeachersList`'s query shape and
  that a freshly-joined (non-suspended, correct institutionId/role) teacher renders as `active`.
- `tests/unit/bulk-email-file-parse.test.ts` (5) — the shared CSV/XLSX parser from items 2/3.

## Live verification

Two rounds against the real Supabase project (`rlbtdpnmdnaxlccelxdr`), both fully self-cleaning
(every institution/user row created was deleted afterward; confirmed zero leftovers from this
session's own scripts by re-querying for the session's email/name patterns post-cleanup):

1. **Direct-DB script** (no browser): created two disposable institutions and a real cross-
   institution scenario, confirmed `isEmailActiveElsewhere` blocks an active cross-institution
   email, allows a same-institution one, and allows a *suspended* cross-institution one through;
   confirmed the exact Prisma query `getTeachersList` uses returns a freshly-inserted
   correctly-institutioned teacher as `active`.
2. **Real Playwright browser sessions** (three separate disposable-account runs): logged in as a
   real freshly-created Supabase admin/teacher, drove `/admin/teachers` (confirmed no
   Invite-Link UI, confirmed the Bulk Invite tab and its CSV option render, confirmed a real
   teacher row shows up in the list), `/teacher/students` (confirmed no invite UI —
   screenshot-verified), `/teacher/classes/[id]` (confirmed the invite dialog now has a CSV
   upload option), and `/teacher/settings` (edited the name field through the real UI, confirmed
   the "Saved" state, confirmed the new name landed in Postgres, confirmed it survived a full
   page reload).

**Script-timing false positives caught and not mistaken for real bugs**: an early, less-careful
version of the Playwright script captured page text immediately after `waitForSelector` resolved
on a selector that also matches the persistent sidebar nav (`text=Students`), before the page's
own client-side data fetch had settled — this made it look like the teacher list was empty and
like `/teacher/students` still had an "Invite Students" string. Re-ran both checks with a settle
wait and cross-checked the first against a `git grep` (which found the *real* leftover in
`teacher/page.tsx`, see item 3) and a screenshot (confirmed `/teacher/students` is clean) before
concluding either way — noting this here per the instruction not to guess silently, since it's
exactly the kind of ambiguous signal that's worth being explicit about rather than either
overclaiming a bug or overclaiming a fix.

## Manual click-through notes (screenshots captured, then discarded with the disposable scripts)

- `/admin/teachers` — Invite modal renders cleanly with Single Email / Bulk Invite tabs; no
  visual issues.
- `/teacher/students` — clean, no invite affordance, search + table only; no visual issues.
- `/teacher/classes/[id]` — invite dialog's new CSV upload block sits directly under the existing
  textarea with consistent spacing; no visual issues.
- `/teacher/settings` — Save Changes → "Saved" checkmark state renders correctly; no visual
  issues. Not addressed (pre-existing, out of scope, called out in the 2026-07-14 session log
  too): `DashboardShell`'s avatar-initials computation still reads `localStorage` client-side,
  which is a known pre-existing SSR/client hydration mismatch unrelated to this session's changes.

**Unrelated pre-existing DB debris noticed, not touched**: four institutions named "QA Golden Path
Institution ..." exist in the live database, unconnected to any user row and not matching this
session's own naming/cleanup — predate this session (this session's own scripts always cleaned up
completely, confirmed by post-hoc query). Flagging rather than deleting, since they weren't
created by this session and their origin/purpose wasn't investigated.

## Verification

- `npx tsc --noEmit` → clean.
- `npm run lint` → 3 pre-existing baseline errors (`useExamTimer.ts`, `invite/[token]/page.tsx`,
  `exam/[examId]/page.tsx`, all predate this session, confirmed via `git stash` diff), 0
  warnings — one pre-existing dead-import warning in `api/invites/route.ts` (`adminSupabase`,
  unused even before this session) was cleaned up since that exact file was already being edited.
- `npm run build` → compiles cleanly, all routes registered (2 new: none — `invites.ts` and
  `invite-guards.ts` are Server Actions/helpers, not routes; no new API route files were added).
- `npx vitest run` → 229/229 passing (188 baseline + 41 new).
- Live-verified against Supabase per the two rounds described above.
