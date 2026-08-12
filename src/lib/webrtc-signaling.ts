// Shared types/config for the teacher-live-video WebRTC signaling channel. Signaling only goes
// through Supabase Realtime Broadcast (private, authorized via RLS on realtime.messages — see
// LIVE_VIDEO_PROGRESS.md); the actual audio/video never touches Supabase, only SDP/ICE handshake
// messages do. No third-party video/SFU service — this is peer-to-peer.

export function webrtcTopic(attemptId: string): string {
  return `webrtc:${attemptId}`;
}

export const WEBRTC_SIGNAL_EVENT = 'signal';

// A `viewerId` (one per "Go Live" click) disambiguates which teacher session a message belongs
// to — more than one teacher/admin in the same institution can technically hold this channel's
// RLS-granted access at once, so without this, a second teacher's request could cross-talk with
// the first's in-flight negotiation. The student always serves the most recent requester and
// ignores stale/foreign messages; the teacher only processes messages carrying its own viewerId.
export type SignalMessage =
  | { type: 'request'; viewerId: string }
  | { type: 'offer'; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; viewerId: string; candidate: RTCIceCandidateInit }
  | { type: 'unavailable'; viewerId: string; reason: string }
  | { type: 'close'; viewerId: string };

// Public STUN (Google's, no account needed) — the fallback whenever the TURN credential fetch
// below fails for any reason (Cloudflare unreachable, misconfigured, network error). Sufficient
// for peers on the same network or behind simple NATs, but that alone is exactly why
// "Connection lost" used to happen on real student networks (campus/home firewalls, symmetric
// NAT) even though it worked fine on a dev machine: STUN only helps two peers discover each
// other's public address, it can't relay traffic when a direct path is blocked.
export const STUN_ONLY_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Fetches short-lived Cloudflare TURN credentials (plus Cloudflare's own STUN) from our server
 * route, which mints them on demand using a server-only API token — the browser never talks to
 * Cloudflare directly, and never sees that token (see src/lib/webrtc-turn.ts). Call this right
 * before constructing each RTCPeerConnection rather than once up front: credentials are
 * short-lived and per-connection-attempt, not a build-time constant. Falls back to
 * STUN_ONLY_ICE_SERVERS on any failure — a TURN outage degrades reliability, it never blocks
 * the call outright.
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/webrtc/turn-credentials');
    if (!res.ok) return STUN_ONLY_ICE_SERVERS;
    const data = (await res.json()) as { iceServers: RTCIceServer[] | null };
    return data.iceServers && data.iceServers.length > 0 ? data.iceServers : STUN_ONLY_ICE_SERVERS;
  } catch {
    return STUN_ONLY_ICE_SERVERS;
  }
}
