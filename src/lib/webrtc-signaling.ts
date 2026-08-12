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

// Public STUN (Google's, no account needed) always included — sufficient for peers on the same
// network or behind simple NATs. That alone is exactly why "Connection lost" happens on real
// student networks (campus/home firewalls, symmetric NAT, restrictive corporate networks) even
// though it works fine on a dev machine: STUN only helps two peers discover each other's public
// address, it can't relay traffic when a direct path is blocked. A TURN relay is required for
// that case, and unlike STUN it isn't free — a real TURN server (self-hosted or a paid provider)
// is a hosting/cost decision, so it isn't hardcoded here. Set all three NEXT_PUBLIC_TURN_* env
// vars (server URL(s), username, credential) to add one; `useWebRTCViewer`'s `failed` state is
// the real-world tell that a deployment needs this. Comma-separate NEXT_PUBLIC_TURN_URL for
// multiple TURN URLs (e.g. UDP + TCP/443 fallback) sharing the same credentials.
export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrls = process.env.NEXT_PUBLIC_TURN_URL?.split(',').map(u => u.trim()).filter(Boolean);
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrls && turnUrls.length > 0 && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
  }
  return servers;
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers();
