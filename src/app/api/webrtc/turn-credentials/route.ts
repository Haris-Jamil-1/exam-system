import { NextResponse } from 'next/server';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';
import { generateTurnIceServers } from '@/lib/webrtc-turn';

// Mints short-lived Cloudflare TURN credentials on demand for the teacher live-video feature —
// called by both sides right before opening a peer connection (WebRTCBroadcaster on the
// student, useWebRTCViewer on the teacher; see fetchIceServers in webrtc-signaling.ts). Any
// authenticated user may call this (student or teacher/admin, whichever side is connecting) —
// the credential itself only grants relay access, not exam data, so no further scoping is
// needed beyond "must be logged in". `iceServers: null` (Cloudflare unreachable/misconfigured)
// is a valid, non-error response — the client falls back to STUN-only rather than failing.
export const GET = withErrorHandling(async () => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const iceServers = await generateTurnIceServers();
  return NextResponse.json({ iceServers });
});
