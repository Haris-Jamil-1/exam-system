# Phase 3 — Live Monitoring Architecture

Status: architecture proposal (no implementation yet)
Scope: replaces the 10-second polling on `teacher/monitor` and `teacher/exams/[examId]/monitor` with **Supabase Realtime** subscriptions, and defines what "live" means for a proctored exam: an event feed with on-demand visual evidence — **not** always-on video.

## What the teacher sees

Per live exam, a monitor view with:

- **Roster grid:** every enrolled student's attempt state (not started / in progress / submitted / auto-submitted), current trust score, violation count, section progress (item 9's `SectionAttempt` rows make this free), and a "last heartbeat" freshness dot (from `ProctoringHeartbeat`, `01-proctoring-signals.md`) — a stale heartbeat on an in-progress attempt renders as "connection lost / possible tampering", which is itself a first-class monitoring state.
- **Live event feed:** violations streaming in as they're ingested, newest first, filterable by severity/type/student — an upgraded, real-time version of the existing eye-button violations timeline.
- **On-demand snapshot:** a "request snapshot" action per student (see below).
- **Attention ordering:** the roster sorts by a needs-attention heuristic (recent high-severity events, falling trust score, lost heartbeat) so a teacher watching 60 students looks where it matters.

## Realtime transport

- **Mechanism:** Supabase Realtime `postgres_changes` subscriptions on `Violation` (INSERT) and `ExamAttempt` (UPDATE — status/trustScore changes), filtered to the exam being monitored. The write path is unchanged: clients POST batches to `/api/violations` (the SEC-08 stance — no client-writable tables without RLS — is preserved because Realtime here is *read* fan-out of rows the API route wrote).
- **Tenant isolation — the hard requirement:** `postgres_changes` row filters are convenience, **not security**: without RLS, any authenticated Supabase client could subscribe to the raw tables. Since SEC-08 (no RLS) is currently an accepted risk at the *app layer*, Realtime forces the first real crack in that stance. Options:
  1. **Enable RLS on the monitored tables only** (`Violation`, `ExamAttempt`, `ProctoringHeartbeat`) with policies scoped to institution + teacher-ownership, used *only* to gate Realtime subscriptions (app API routes connect via the service role and are unaffected). Partial, surgical retreat from SEC-08. **Recommended** — it's also the natural first step of the "revisit RLS after Phase 3" plan already on record.
  2. Realtime **Broadcast** channels (`exam:{examId}:monitor`) with channel authorization callbacks, where the ingest route re-broadcasts after persisting. Avoids table-level RLS but adds a second delivery path to keep consistent with the DB.
  Option 1 is architecturally cleaner: one source of truth (the table), and the RLS policies double as defense-in-depth for reads generally. Flagged as an open decision because it reopens a risk decision Haris previously signed off on.
- **Fallback:** the subscription layer wraps a degrade-to-polling path (the current 10 s poll code) on websocket failure — monitors must not go blind because a school network blocks websockets.
- **Scale note:** one exam × ~100 students × event batches every 10 s is well within Supabase Realtime limits; per-exam channel scoping keeps a teacher's client from receiving other exams' traffic even within their own institution.

## Visual evidence: on-demand snapshot, not always-on video

Always-on video for N concurrent students means WebRTC + an SFU (LiveKit/mediasoup/Twilio) — meaningful infra cost and complexity, and it contradicts 01's events-not-media privacy posture. Instead:

- **Automatic evidence:** high-severity events may already carry a snapshot (`Violation.screenshotUrl`) per 01's retention policy — the feed renders these inline. For most monitoring, this is enough.
- **On-demand pull:** teacher clicks "request snapshot" → a `SnapshotRequest` row is written via API route → the *student's* client (which subscribes on a per-attempt channel to its own requests — narrow, self-scoped) captures one frame from the already-running proctoring loop and uploads it via the existing authenticated upload path → row updated with the URL → teacher's monitor renders it. Round trip target < 5 s. Every request is logged (who asked, when, of whom) — teachers pulling snapshots is itself an audited action.
- **Live video (explicitly deferred):** if a future requirement demands true live view, the incremental path is WebRTC via LiveKit Cloud for *one student at a time* on teacher click — never grid-of-videos. Out of scope for Phase 3; noted so nobody designs toward an SFU prematurely.

## Alerts: push notification vs dashboard badge

Severity-tiered, so the channel matches urgency:

| Trigger | Channel |
|---|---|
| `high` severity event (multiple faces, phone) or heartbeat lost | **Push** — the teacher may not be staring at the monitor tab. In-app toast + browser Web Push (needs one-time permission grant); the existing notifications feed gets the entry regardless |
| `medium` (sustained no-face, gaze episodes, repeated tab switches) | Dashboard: needs-attention sort bump + unread badge on the student's card |
| `low` / informational | Feed only, no badge |

Thresholds are per-exam config with sane defaults (a strict-mode exam may promote medium→push), stored in `Exam.settings` like the existing proctoring config. **Alert fatigue is the failure mode to design against** — defaults should under-notify, and every push must deep-link to the exact student card. Web Push infrastructure (service worker + subscription storage) is a new small surface; if it slips, v1 ships with in-app toast + badge only and push follows — noted as a scope valve, not an open decision.

## Teacher actions from the monitor (v1 scope)

Read (roster, feed, snapshots) plus two writes: **send a warning message** to a student (renders as a banner in their exam UI, delivered on the same per-attempt channel as snapshot requests) and **force-submit an attempt** (server-side, reuses the existing submit path with `auto_submitted`; also finally provides the manual half of the known "browser died mid-exam" residual gap from items 1–4). Pausing/extending time mid-attempt is deliberately out of scope for Phase 3.

## New/changed surface summary (all additive)

- Realtime subscriptions (teacher monitor) on `Violation` / `ExamAttempt` / `ProctoringHeartbeat`; per-attempt channel for student-directed messages (snapshot requests, warnings)
- New `SnapshotRequest` table (attemptId, requestedById, status, url, timestamps) — doubles as the audit log of teacher snapshot pulls
- RLS policies on the three monitored tables **(open decision — partially reopens SEC-08)** or Broadcast-with-auth alternative
- Alert threshold config in `Exam.settings`; Web Push subscription storage (scope valve: may follow v1)
- Polling code retained as the websocket-failure fallback path

## Open decisions for Haris

1. **RLS-for-Realtime:** accept surgical RLS on `Violation`/`ExamAttempt`/`ProctoringHeartbeat` (recommended; first step of the planned post-Phase-3 RLS revisit) vs Broadcast channels with auth callbacks (keeps SEC-08 posture fully intact, at the cost of a second delivery path).
2. **Alert defaults:** which event types warrant push out of the box, and whether teachers can customize per exam in v1 or defaults-only.
3. Whether on-demand snapshot requires a visible indicator on the student's screen when it fires (transparency vs deterrence trade-off — recommend visible, it doubles as deterrence and simplifies the consent story from 01's retention decision).
