# Evalix — Feature Inventory

Complete feature list derived from the codebase (2026-07-19), organized by module.
Intended for conversion to Excel — every table uses the same columns.

**Status legend:** `Live` = implemented and verified · `Config` = implemented, activates
when the relevant service/key is configured · `Simulated` = UI flow exists, backend
verification is simulated · `Partial` = implemented with a documented limitation.

**Roles:** SA = Super Admin · IA = Institution Admin · T = Teacher · S = Student · Pub = Public/no login.

---

## 1. Authentication & Accounts

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Auth | Email/password login | Supabase Auth login with cookie-based sessions | All | Live |
| Auth | Institution self-registration | Public signup creates a new institution + its first admin account | Pub | Live |
| Auth | Password reset request | "Forgot password" page sends a reset email | Pub | Live |
| Auth | Reset-request rate limiting | Max 3 reset emails per address per 15 minutes | Pub | Live |
| Auth | Expired/invalid reset-link handling | Distinct, clear expired-link state instead of a generic error | Pub | Live |
| Auth | Secure session middleware | Server-side JWT validation on every page navigation; automatic login redirect | All | Live |
| Auth | Role-based dashboard routing | Users are automatically routed to their own role's dashboard; other areas redirect away | All | Live |
| Accounts | Profile editing | Name/profile updates persisted server-side (teacher, student, admin settings pages) | IA, T, S | Live |
| Accounts | Password visibility toggle | Show/hide control on all password fields across signup/invite/reset pages | All | Live |
| Accounts | Avatar upload | Profile avatar upload hook + display across dashboards | IA, T, S | Live |
| Accounts | Soft account suspension | Suspended users are treated as logged-out everywhere, including session bootstrap | SA, IA | Live |

## 2. Institution / Tenant Management

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Tenancy | Multi-tenant isolation | Every user, exam, item, class, and analytic is scoped to one institution; cross-tenant access is denied server-side | All | Live |
| Tenancy | Institution join code | Unique per-institution join code stored on each tenant | IA | Live |
| Tenancy | Per-institution AI quota | Monthly AI-call ceiling (default 1000) with automatic month rollover and hard stop | IA (consumes), SA (views) | Live |
| Tenancy | Per-institution Judge0 quota | Monthly code-execution quota; exhaustion degrades to manual grading, never a failed exam | IA (consumes), SA (views) | Live |
| Tenancy | Institution settings page | Institution details view backed by real data | IA | Live |

## 3. User & Role Management

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Users | Three-role RBAC | admin / teacher / student enum enforced in middleware, APIs, and data layer | All | Live |
| Users | Super Admin tier (DB flag) | Platform tier above institution RBAC — a database flag, deliberately not a role; set via SQL only | SA | Live |
| Users | Teacher invitation by email | Admin invites teachers; token-based accept flow creates or links the account | IA | Live |
| Users | Bulk teacher invitations | Paste list or upload CSV/XLSX of emails; per-email success/failure report | IA | Live |
| Users | Cross-institution invite block | An active member of another institution cannot be invited/enrolled; a suspended-elsewhere user can (old suspension cleared) | IA, T | Live |
| Users | Invite token expiry & validation | Public token-validation endpoint; expired/accepted tokens rejected | Pub | Live |
| Users | New-user name setup page | Invited users complete their profile on first accept | Pub | Live |
| Users | Admin user directory | Institution-wide users list | IA | Live |
| Users | Deactivate / reactivate users | Admin can suspend teachers/students in their institution (never other admins, supers, or self); teacher deactivation archives their classes | IA | Live |
| Users | Teacher directory | Admin sees all joined teachers with real data | IA | Live |

## 4. Classes & Students

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Classes | Create/rename/archive classes | One teacher owns many classes; archive is soft (history preserved) | T, IA | Live |
| Classes | Class roster | Per-class enrolled-student list | T, IA | Live |
| Classes | Bulk student invites per class | Paste or CSV/XLSX upload; deduped; invalid entries dropped with report | T | Live |
| Classes | Class invite accept page | Public token page: new emails get a signup form; existing students must sign in as that account (never a password reset) | Pub, S | Live |
| Classes | Invite status tracking | Per-class list of pending/accepted/expired invites | T | Live |
| Classes | Remove student from class | Removes the enrollment only, never the account; permission-checked | T, IA | Live |
| Students | Teacher's Students tab | Roster is the union of direct links and class enrollments — includes per-student real trust-score average and violation count | T | Live |
| Students | "Not yet computed" trust display | Students with zero attempts show an honest placeholder, never a fake score | T | Live |

## 5. Question / Item Bank

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Item Bank | Institutional & personal banks | Two bank levels; 3-tab dashboard (Institution / My Private / Shared with Me) | T, IA | Live |
| Item Bank | Bank collaborators (RBAC) | Owner/editor/viewer grants, institution-scoped search, manage-access dialog | T, IA | Live |
| Item Bank | Admin bank management | Admin creates institutional banks and assigns teacher editors | IA | Live |
| Item Bank | Implicit admin ownership | Institution admins have owner rights on every bank in their institution | IA | Live |
| Item Bank | 10 question types | MCQ, MRQ, true/false, short answer, essay, fill-blank, matching, ordering, coding, file upload | T | Live |
| Item Bank | Manual item builder | Full editor incl. marks, difficulty, review status, options, explanations | T | Live |
| Item Bank | CSV bulk item import | Bulk-import modal with error surfacing | T | Live |
| Item Bank | Item lifecycle states | draft → review → approved → archived; only approved items enter exam pools | T, IA | Live |
| Item Bank | Item versioning fields | Version number + previous-version link on every item | T | Live |
| Item Bank | Tags | Free-form tags per item (incl. auto "ai-possible-duplicate") | T | Live |
| Item Bank | Per-item time limit | Optional seconds-based limit carried into exams | T | Live |
| Item Bank | Grading rubrics on items | Criteria (name/points/description) powering AI + manual grading | T | Live |
| Item Bank | Coding item fields | Language, starter code, test cases | T | Live |
| Item Bank | Item psychometrics columns | Facility index % and discrimination index % from real administration data | T, IA | Live |
| Curriculum | Course → Topic → CLO hierarchy | Full curriculum management (Bloom's level + learning domain per CLO) | IA | Live |
| Curriculum | CLO linkage on items/questions | Items and exam questions carry their learning objective | T | Live |

## 6. Exam Creation (incl. AI)

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Exam Builder | 3-step exam wizard | Basic info → select questions (cross-bank picker) → settings | T | Live |
| Exam Builder | Exam instructions | Rich pre-exam instructions shown on the student's start screen | T | Live |
| Exam Builder | Availability window + duration | Separate start/end times and duration; effective deadline is whichever ends sooner | T | Live |
| Exam Builder | Class scoping | Optional class assignment restricts visibility & eligibility to that roster; unscoped exams keep legacy behavior | T | Live |
| Exam Builder | Proctoring on/off toggle | Disabling skips the biometric gate and never activates camera/mic/monitors | T | Live |
| Exam Builder | Multi-section exams | Sections with own instructions, optional isolated timers, weights, order | T | Live |
| Exam Builder | Section weights validation | Weights must sum to 100% — warned in UI and enforced server-side at exam start | T | Live |
| Exam Builder | Per-section passing thresholds | A failed section flags the whole attempt Failed regardless of composite score | T | Live |
| Exam Builder | Sequential section / item locking | Optional: sections must be taken in order; answered items can't be revisited (server-enforced) | T | Live |
| Exam Builder | Dynamic pooling blueprint | Pick banks, then per-CLO draw counts against live approved-item availability; each student gets a private random draw | T | Live |
| Exam Builder | Exam approval workflow | Teacher submits; admin approves/rejects (real server state change) | T, IA | Live |
| Exam Builder | Exam CRUD + share | Edit, delete (FK-safe cascade), invite students via email from the share modal | T | Live |
| AI Creation | AI item generation into banks | Claude-powered generation (batch of up to 15) directly into a chosen bank as drafts | T | Config |
| AI Creation | CLO-aware generation | Selected CLO text is resolved (institution-verified) and injected into the prompt; generated items stamped with the CLO | T | Config |
| AI Creation | Source-material generation | Upload PDF/DOCX → text extraction → used as grounded source (injection-hardened) | T | Config |
| AI Creation | Async job + polling | 202 job pattern with status polling and staleness sweep; jobs record model + token costs | T | Live |
| AI Creation | Duplicate detection | Recent-stem prompt context + trigram similarity tagging of likely duplicates | T | Config |
| AI Creation | AI quota enforcement | Hard 429 at the institution's monthly cap | T | Live |
| AI Creation | Mock fallback | Without an API key, generation still works with clearly-labeled mock items | T | Live |

## 7. Exam Delivery & Timers

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Delivery | Student exam list | Real-time-derived status (upcoming/live/completed) scoped by class/roster | S | Live |
| Delivery | Eligibility enforcement | Server-side gate on attempt creation — hidden exams cannot be started by guessing IDs (403) | S | Live |
| Delivery | Time-window enforcement | Starts blocked before startTime (unless teacher went live early) and after endTime — server-side | S | Live |
| Delivery | One attempt per student | Database-unique constraint; resume always allowed, incl. from a fresh browser | S | Live |
| Delivery | Pre-exam instructions screen | Timer does not start until the student clicks Start | S | Live |
| Delivery | Exam countdown timer | Seeded from server time; min(duration, closing time) | S | Live |
| Delivery | Per-item countdown timers | Optional per-question timers that auto-advance and permanently lock navigation back | S | Live |
| Delivery | Per-section timers | Independent section timers capped by the exam close time | S | Live |
| Delivery | Section progress indicator | Numbered header circles with completion checkmarks | S | Live |
| Delivery | Auto-submit at deadline | Client auto-submits; server independently classifies late submissions as auto_submitted | S | Live |
| Delivery | Desktop-only guard | Exam page blocks mobile devices | S | Live |
| Delivery | Clear start-failure messages | Pool-shortage, weight-config, not-started, ended states each show a specific retriable message | S | Live |
| Delivery | Insufficient-pool protection | A shrunk question pool blocks the start (409) instead of silently serving a shorter exam | S, T | Live |
| Delivery | Answer submission | One-shot bulk submit; option-ID-based deterministic scoring of all objective types incl. fractional partial credit | S | Live |
| Delivery | Tamper-resistant sequential mode | Locked answers override whatever the final bulk payload claims | S | Live |
| Delivery | File-upload answers | Typed/size-limited uploads to private storage (pdf, doc, docx, md, txt, …) | S | Live |
| Delivery | Coding questions | In-browser editor with starter code and language setting | S | Live |
| Delivery | Completion page | Score summary + per-question breakdown, reload-safe (server-fetched) | S | Live |

## 8. Proctoring & Trust Scores

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Proctoring | Biometric onboarding gate | Live camera preview, face + ID captures with frozen-frame display before entry | S | Simulated |
| Proctoring | Face presence detection | MediaPipe landmarker — sustained no-face episodes become violations | S | Live |
| Proctoring | Multiple-face detection | Debounced, confidence-floored second-person detection with snapshot evidence | S | Live |
| Proctoring | Gaze-away detection | Head-turn/iris heuristics; sustained episodes escalate to high severity | S | Live |
| Proctoring | Prohibited-object detection | COCO-SSD phone/book detection on sampled frames with evidence snapshots | S | Live |
| Proctoring | Background-noise detection | Energy-based voice-activity episodes with duration-tiered severity | S | Live |
| Proctoring | Tab-switch detection | Immediate emit on hide + escalation if the student stays away | S | Live |
| Proctoring | Window-blur detection | Deduplicated from tab switches; brief blurs tolerated | S | Live |
| Proctoring | Fullscreen enforcement | Auto-enter + blocking overlay when not fullscreen; violation only on real exits | S | Live |
| Proctoring | Privacy-first design | All models self-hosted and run in-browser; only typed events (and explicit evidence snapshots) leave the machine | S | Live |
| Proctoring | Consent notice | Monitoring consent line on the instructions screen; visible capture indicator | S | Live |
| Proctoring | Evidence snapshots | Auto-captured on serious violations to private storage; 30-day automatic purge | S, T | Live |
| Proctoring | Batched event pipeline | Buffered event upload (idempotent, ordered, immediate for high severity, hidden-tab safe) | S | Live |
| Proctoring | Server-side severity | Severity re-derived server-side; duration tiers (long episodes → high) | — | Live |
| Proctoring | Trust score (v2) | Severity/duration/confidence-weighted 0–100 score with per-type caps, recomputed live on every event | S, T | Live |
| Proctoring | Proctoring heartbeat | 30s liveness signal; makes detector suppression visible as "Disconnected" | S, T | Live |
| Proctoring | Violation limit setting | Per-exam max-violations value stored on the exam | T | Live |

## 9. Live Monitoring

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Monitoring | Per-exam live monitor | Realtime roster (Supabase Realtime + polling fallback with Live/Polling badge) | T | Live |
| Monitoring | Cross-exam monitor page | All live exams in one view with the same per-student actions | T | Live |
| Monitoring | Needs-attention sorting | Low-trust / high-severity students flagged and sorted first | T | Live |
| Monitoring | Disconnected detection | Stale heartbeat on an in-progress attempt surfaces as Disconnected | T | Live |
| Monitoring | Per-student detail modal | Violations timeline with severity badges, trust score, actions | T | Live |
| Monitoring | On-demand snapshot | Teacher pulls a single camera frame from a student (audited directive) | T | Live |
| Monitoring | Live video (Go Live) | One-student-at-a-time peer-to-peer WebRTC camera stream, no third-party video service; signaling authorization enforced at the database layer | T | Partial (STUN-only) |
| Monitoring | Send warning | Teacher warning banner delivered to the student in-exam | T | Live |
| Monitoring | Force submit | For live clients via directive; for dead clients via server finalization | T | Live |
| Monitoring | Teacher-action audit log | Every snapshot/warning/force-submit is an append-only directive row | T, IA | Live |
| Monitoring | High-severity browser notifications | Native notification when the monitor tab is hidden | T | Live |

## 10. Grading (manual + AI)

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Grading | Deterministic auto-scoring | All objective types scored instantly at submit (ID-based, partial credit) | — | Live |
| Grading | AI essay grading | Per-criterion rubric scores with quoted evidence and prompt-injection flags | T | Config |
| Grading | AI coding grading | Judge0 test-case execution + Claude quality review, combined 70/30 (per-question override) | T | Config |
| Grading | Mandatory teacher confirmation | AI only suggests; marks are written exclusively by teacher confirm/override | T | Live |
| Grading | Grading state machine | pending_ai → ai_suggested → confirmed/overridden; only confirmed is terminal (409 on re-mutation) | T | Live |
| Grading | Change-override before finalize | An overridden-but-unconfirmed mark can still be adjusted | T | Live |
| Grading | Bulk approve | "Approve All (N)" finalizes every untouched AI suggestion in one transaction | T | Live |
| Grading | Append-only grading audit | Every grading event stores the exact rubric snapshot — a replayable dispute trail | T, IA | Live |
| Grading | Graceful AI degradation | No key / quota hit / sandbox down ⇒ answers wait for manual grading; marks never auto-awarded on failure | T | Live |
| Grading | Judge0 cost attribution | Per-institution usage log, one row per grading event, submission-count billing unit | SA | Live |

## 11. Results & Analytics

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Results | Results publishing control | Scores hidden from students until the teacher publishes | T, S | Live |
| Results | Teacher results table | Per-student scores, trust, status; auto-refreshing; "Fail (section)" badge when a threshold was missed | T | Live |
| Results | Per-student answer review | Full per-question review of all 10 types, grouped by section, incl. each pooled student's own question set | T | Live |
| Results | Student results page | Own scores, pass/fail incl. section-threshold outcomes, per-question breakdown | S | Live |
| Results | Score distribution chart | Per-exam and aggregate histograms | T, IA | Live |
| Results | Trust-score trend | Weekly average trust trend | T, IA | Live |
| Results | Question difficulty chart | Correct/incorrect by difficulty | T | Live |
| Analytics | Teacher & admin dashboards | Real scoped stats (students via union of rosters, time-aware active-exam counts) | T, IA | Live |
| Psychometrics | Facility & discrimination indices | Per-administration, versioned; corrected point-biserial; pooled-aware | T, IA | Live |
| Psychometrics | Reliability stats | Cronbach's alpha / KR-20 per exam (honest NULLs on sparse pooled matrices) | T, IA | Live |
| Psychometrics | Distractor analysis | Option-level quartile analysis | T | Live |
| Psychometrics | Low-N gating | <10 responses stored but display-gated; <30 marked low-confidence | T | Live |
| Psychometrics | Nightly + on-demand recompute | Daily cron sweep plus a per-exam recompute button | T | Live |

## 12. Notifications

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Notifications | Real derived notifications | Violations, pending exam approvals, accepted invites — derived from the database, polled every 30s | IA, T | Live |
| Notifications | High-severity browser push (monitor) | Native Notification API when the monitor tab is hidden | T | Live |
| Notifications | Email delivery | Invite and password-reset emails (Supabase + Resend) | All | Live |

## 13. Super Admin (Platform)

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Super Admin | Platform overview panel | Every institution with teacher/student/active-exam counts | SA | Live |
| Super Admin | Usage & cost tracking | Monthly AI + Judge0 usage per institution with env-tunable cost estimates | SA | Live |
| Super Admin | Institution suspension | Soft suspend/unsuspend — blocks every user of the institution, no data deleted | SA | Live |
| Super Admin | User suspension | Soft suspend/unsuspend individual users platform-wide | SA | Live |
| Super Admin | Peer protection | Super admins cannot suspend each other from the panel | SA | Live |
| Super Admin | Out-of-band privilege | The flag is set only via direct SQL — unreachable from any UI or institution role | SA | Live |

## 14. Security & Compliance

| Module | Feature | Description | User Role(s) | Status |
|---|---|---|---|---|
| Security | Tenant isolation everywhere | Institution scoping resolved from the JWT on every query; IDs never trusted from request bodies | — | Live |
| Security | Server-side answer sanitization | Students never receive correct answers/explanations over the wire | S | Live |
| Security | Server-side trust & scoring | Trust scores and marks are never accepted from the client | — | Live |
| Security | Row-Level Security (selective) | RLS on 10 realtime-read tables + WebRTC signaling channel authorization; rest is app-layer (documented accepted risk) | — | Partial |
| Security | Private evidence storage | Evidence/uploads in a private bucket; teacher access via scoped signed URLs only | T | Live |
| Security | Evidence retention | Automatic 30-day purge cron | — | Live |
| Security | Malformed-input handling | Every mutating route returns structured 4xx JSON on bad input | — | Live |
| Security | Grading/monitor audit trails | Append-only AnswerGrading + MonitorDirective logs | IA | Live |
| Security | Item-lock defense in depth | Sequential-mode server locks override tampered bulk submissions | — | Live |
| Security | Idempotent violation ingest | Client sequence numbers prevent duplicate/spoofed replays and reveal suppressed batches | — | Live |
| i18n | English + Arabic | Cookie-based locale toggle, full RTL layout support | All | Live |

---

*Derived from `prisma/schema.prisma`, `src/app/**` pages/routes, and `src/lib/**` on 2026-07-19.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for how each feature is implemented.*
