'use client';
// Student-side peer for teacher live-video viewing. Listens on a private, RLS-authorized
// Supabase Realtime Broadcast channel (webrtc:{attemptId} — RLS policies on realtime.messages,
// see LIVE_VIDEO_PROGRESS.md for the exact SQL) for a teacher's 'request', then answers with an
// SDP offer built from the SAME MediaStream
// FaceDetector already opened for proctoring — no second getUserMedia() call, no extra camera
// permission prompt. Only the signaling handshake goes through Supabase; the actual video/audio
// is peer-to-peer via WebRTC. Serves at most one viewer at a time — a newer 'request' tears down
// whatever peer connection was previously being served, so the student never carries more than
// one live viewer's overhead at once, and no dangling connection survives an exam ending
// (unmount closes whatever's open).
import { useEffect, type RefObject } from 'react';
import { createClient } from '@/lib/supabase/client';
import { webrtcTopic, WEBRTC_SIGNAL_EVENT, ICE_SERVERS, type SignalMessage } from '@/lib/webrtc-signaling';

interface WebRTCBroadcasterProps {
  attemptId: string;
  streamRef: RefObject<MediaStream | null>;
}

export function WebRTCBroadcaster({ attemptId, streamRef }: WebRTCBroadcasterProps) {
  useEffect(() => {
    if (!attemptId || attemptId === 'attempt-loading') return;

    let pc: RTCPeerConnection | null = null;
    let activeViewerId: string | null = null;
    let cancelled = false;

    const supabase = createClient();
    const channel = supabase.channel(webrtcTopic(attemptId), { config: { private: true } });

    function send(message: SignalMessage) {
      void channel.send({ type: 'broadcast', event: WEBRTC_SIGNAL_EVENT, payload: message });
    }

    function teardown() {
      pc?.close();
      pc = null;
      activeViewerId = null;
    }

    async function handleRequest(viewerId: string) {
      // A new requester (or a re-request from the same one) always wins — tear down whatever
      // was being served before, so exactly one peer connection is ever open.
      teardown();
      activeViewerId = viewerId;

      const stream = streamRef.current;
      if (!stream) {
        send({ type: 'unavailable', viewerId, reason: 'Camera not ready on the student\'s device.' });
        return;
      }

      const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc = conn;
      for (const track of stream.getTracks()) {
        // addTrack (not stream.clone()) — this only registers the track as a sender on the new
        // RTCPeerConnection; it does not transfer ownership, so FaceDetector's own use of the
        // same tracks (MediaPipe/COCO-SSD inference, the proctoring widget's own <video>) is
        // completely unaffected, and stopping this peer connection later never stops the camera.
        conn.addTrack(track, stream);
      }
      conn.onicecandidate = (e) => {
        if (e.candidate && activeViewerId === viewerId) {
          send({ type: 'ice-candidate', viewerId, candidate: e.candidate.toJSON() });
        }
      };

      try {
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        if (cancelled || activeViewerId !== viewerId) return;
        send({ type: 'offer', viewerId, sdp: offer });
      } catch {
        send({ type: 'unavailable', viewerId, reason: 'Could not start the video connection.' });
        teardown();
      }
    }

    async function handleAnswer(viewerId: string, sdp: RTCSessionDescriptionInit) {
      if (!pc || activeViewerId !== viewerId) return;
      try {
        await pc.setRemoteDescription(sdp);
      } catch {
        // Stale/invalid answer for a connection that's already moved on — ignore.
      }
    }

    async function handleIceCandidate(viewerId: string, candidate: RTCIceCandidateInit) {
      if (!pc || activeViewerId !== viewerId) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // A candidate that arrives after the connection closed/renegotiated — harmless to drop.
      }
    }

    channel
      .on('broadcast', { event: WEBRTC_SIGNAL_EVENT }, ({ payload }: { payload: SignalMessage }) => {
        if (cancelled) return;
        switch (payload.type) {
          case 'request': void handleRequest(payload.viewerId); break;
          case 'answer': void handleAnswer(payload.viewerId, payload.sdp); break;
          case 'ice-candidate': void handleIceCandidate(payload.viewerId, payload.candidate); break;
          case 'close': if (activeViewerId === payload.viewerId) teardown(); break;
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      teardown();
      void supabase.removeChannel(channel);
    };
  }, [attemptId, streamRef]);

  return null;
}
