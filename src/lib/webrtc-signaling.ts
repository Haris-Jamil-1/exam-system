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

// Public STUN only (Google's, no account needed) — sufficient for peers on the same network or
// behind simple NATs. No TURN relay: see LIVE_VIDEO_PROGRESS.md's explicit judgment call on why
// that's deferred rather than added preemptively (cost + this session's testing couldn't produce
// a real cross-NAT signal either way).
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];
