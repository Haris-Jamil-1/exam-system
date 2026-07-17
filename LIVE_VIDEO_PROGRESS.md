# Live Video (Teacher ← Student) — Progress

Spec: one-student-at-a-time live camera viewing for teachers, peer-to-peer WebRTC signaled over
Supabase Realtime — no third-party video/SFU service, no media server to run. Direction is
student's camera → teacher (not the old Phase-1 mock, which showed the teacher's own camera and
was never real proctoring video).

## What was built

- **`src/lib/webrtc-signaling.ts`** — shared types/config: `webrtcTopic(attemptId)` →
  `webrtc:{attemptId}`, the `SignalMessage` union (`request | offer | answer | ice-candidate |
  unavailable | close`, each carrying a `viewerId`), and `ICE_SERVERS` (Google's public STUN
  only — see the TURN judgment call below).
- **`src/components/proctoring/WebRTCBroadcaster.tsx`** (student side) — mounted inside
  `ProctoringOverlay` alongside the existing detectors. Listens on a private Supabase Realtime
  Broadcast channel for a teacher's `request`, answers with an SDP offer built from
  **the same `MediaStream` `FaceDetector` already opened** (via a new `streamRef` prop threaded
  through `ProctoringOverlay` → `FaceDetector`) — no second `getUserMedia()` call, no second
  camera-permission prompt, and stopping the peer connection later never stops the camera
  (`addTrack`, not stream transfer, so `FaceDetector`'s own inference and its own `<video>`
  preview are unaffected by anything the WebRTC peer does). Serves exactly one viewer at a
  time — a new `request` tears down whatever was being served before; unmount (exam ends, tab
  closes) always closes whatever's open.
- **`src/hooks/useWebRTCViewer.ts`** (teacher side) — `start(attemptId)` / `stop()` / `state`
  (`idle | connecting | connected | failed | unavailable`) / `errorMessage` / `videoRef`.
  `start()` always calls `stop()` first (only one connection open per hook instance ever), sends
  `request` with a fresh `viewerId`, negotiates the answer/ICE exchange, and attaches the
  remote track to `videoRef`. A 10s timeout after `request` (no answer = student offline, exam
  tab closed, or camera never loaded) surfaces `state: 'failed'` instead of hanging on a blank
  video forever. `pc.onconnectionstatechange` also catches a mid-session drop (NAT/firewall) and
  reports it the same way. The hook's own `useEffect` cleanup (keyed on `attemptId`) calls
  `stop()` on unmount **and** whenever `attemptId` changes — this is what makes "switching to a
  different student always closes the previous connection" true independent of how the caller
  wires the UI.
- **`src/app/(dashboard)/teacher/exams/[examId]/monitor/page.tsx`** — `StudentActionsModal`
  (the existing "Review & Actions" modal, previously only an on-demand-snapshot box) gets a "Go
  live" / "Stop live" control right next to the existing "Request snapshot" button, reusing the
  same `aspect-video` box. Chose to extend this existing modal rather than add a second per-row
  icon: the modal already has exactly the lifecycle the spec needs (mounts fresh per student,
  unmounts on close), so "one connection at a time, closes on switch/navigate-away" falls out of
  React's own mount/unmount instead of being hand-rolled. State-driven messaging: connecting
  ("Connecting to the student's camera…"), failed/unavailable show the hook's specific
  `errorMessage` (offline vs. camera-not-ready vs. connection-lost), never a silent blank frame.

## Security — signaling authorization (spec requirement #7)

A teacher must only reach students in their own institution, **enforced at the signaling layer,
not just the UI** — added two Supabase Realtime Broadcast Authorization RLS policies on
`realtime.messages`, scoped to `topic LIKE 'webrtc:%'`:

- `webrtc_signaling_select` — a caller may subscribe to `webrtc:{attemptId}` only if they're the
  attempt's own student, or a teacher/admin in the same institution as the attempt's exam.
- `webrtc_signaling_insert` — same predicate, for sending broadcasts on the topic.

Same ownership-check shape already used for `Violation`/`ExamAttempt`/`ProctoringHeartbeat`/
`MonitorDirective` (2026-07-11), extracted via `split_part(realtime.topic(), ':', 2)` to get the
attempt id out of the topic string. This means a teacher from a different institution can't even
*subscribe* to another institution's student's channel — confirmed live (see Verification below):
the attempt is real, the attempt id is real, and the connection is still rejected before any SDP
ever exchanges hands.

## TURN judgment call (spec requirement #6 — flag, don't guess)

**No TURN relay was added.** Public STUN only. Per the spec's own instruction to flag rather than
guess if TURN turns out to be necessary:

- This session's live verification ran both peers as two browser contexts on the **same
  machine/network** (same public IP, same NAT) — this setup cannot produce a real signal about
  cross-NAT/symmetric-NAT/corporate-firewall reliability one way or the other. A same-network
  test passing is expected regardless of whether TURN would eventually be needed; it is not
  evidence that STUN-only is sufficient for two arbitrary students/teachers on the real internet.
- **What to watch for in real use**: STUN-only P2P fails whenever both peers sit behind
  symmetric NAT (common on some corporate/school networks and specific mobile carriers) or a
  firewall that blocks the negotiated UDP path outright. `useWebRTCViewer`'s `failed` state with
  "Connection lost — likely a firewall/network blocking a direct connection" is exactly this
  failure mode surfacing to the teacher — if that message starts showing up in real usage, that's
  the signal TURN is actually needed, not a bug to chase in the WebRTC code itself.
  - **Cost/hosting implications if TURN becomes necessary**: TURN is a relay, not just a
    handshake helper — the actual video/audio bytes for a failed-P2P session flow through it, so
    cost scales with usage (bandwidth), unlike STUN which is free and stateless. Options: a
    self-hosted `coturn` instance (another service to run and pay hosting for, similar shape to
    the Judge0 self-hosting decision from Phase 3, run on your own box), or a pay-per-use hosted
    TURN provider (e.g. Twilio, Cloudflare, Metered — recurring bandwidth cost, no server to run).
    Either way this is a real, ongoing cost that public STUN doesn't have — deliberately not
    added preemptively.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — 3 errors / 0 warnings, at or better than the pre-existing baseline (one
  leftover unused `useRef` import from an early draft of `WebRTCBroadcaster.tsx` was caught and
  removed by this same lint pass before commit).
- `npx vitest run` — 268/268 passing (no regressions; this feature has no pure-function surface
  of its own to unit test — it's DB/Realtime/WebRTC-driven throughout, so verification leaned on
  live QA, matching this repo's established pattern for this kind of feature, e.g. the
  2026-07-09 pooling/session-log entries).
- `npm run build` — clean production build, all routes registered, no new type/build errors.
- **Live, two-real-browser verification** against the live Supabase project, via a disposable,
  self-cleaning Playwright + Prisma script (two throwaway institutions — Tenant A with a real
  teacher+student, Tenant B with only a teacher, used purely for the cross-tenant negative case).
  Run against a **fresh production build** (`next build && next start`), not `npm run dev` — this
  session's own Round 3 work surfaced a real StrictMode dev-mode double-mount false negative in
  this exact proctoring-overlay code path, so dev-mode alone was deliberately not trusted here.
  All 4 checks passed:
  1. **Video actually connects with real frames** — teacher clicks "Go live" on a real student
     mid-exam (real camera, via Playwright's fake-video-device flag, not a mock stream) → the
     `<video>` element's `readyState` reaches `HAVE_CURRENT_DATA` (2) or higher. This is a real
     peer-to-peer connection, not a stub.
  2. **"Stop live" tears down cleanly** — after stopping, the UI reverts to the "Go live" button
     (hook state back to `idle`), and — checked independently on the *student's* side — the
     student's own camera `MediaStream` track is still `readyState: 'live'`, confirming the
     proctoring detectors were never affected by opening/closing the viewer.
  3. **Cross-institution rejection at the signaling layer** — signed in directly as Tenant B's
     teacher (no UI, this is a signaling-authorization check) and attempted to subscribe to
     Tenant A's real attempt's `webrtc:{attemptId}` channel: result was
     `CHANNEL_ERROR: Unauthorized: You do not have permissions to read from this Channel topic`
     — rejected by the RLS policy itself, before any SDP/ICE ever exchanged.
  4. Modal close after a live session did not hang or crash (unmount-driven teardown, matching
     requirement #3's "navigating away must fully close the previous peer connection").
  - All QA data (2 institutions, 3 users, 1 exam, 1 attempt) confirmed deleted afterward.

## Known gaps / not built

- **TURN** — see judgment call above; not added, flagged for a real-world signal before adding.
- **Multiple simultaneous teacher viewers** — the RLS policy allows any teacher/admin in the
  institution to open a viewer session; `viewerId` disambiguates messages so two teachers opening
  the same student's feed at once won't cross-talk, but the student only serves the *most recent*
  requester (the older teacher's session goes silently stale, no explicit "someone else is now
  viewing" message). Not in the spec's stated requirements; noted here rather than built.
- **Web Push / background notification when "Go live" needs the teacher to already be on the
  monitor page** — no change from the existing Phase 3 scope valve on this.
- Unrelated, pre-existing, not investigated further (didn't block any of the 4 verification
  checks above, including the video connecting with real frames): a benign `pageerror` — "Unexpected
  token '<'" — was observed once on the student's exam page during this session's live QA,
  consistent with some non-JSON (likely HTML 404) response being parsed as JSON by an unrelated
  resource fetch elsewhere on that page. Did not reproduce it in isolation and it did not affect
  any of the WebRTC verification outcomes; worth a look in a future pass if it recurs.
