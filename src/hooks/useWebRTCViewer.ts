'use client';
// Teacher-side WebRTC viewer for one student's live camera feed. Peer-to-peer — only the
// SDP/ICE signaling handshake goes through Supabase Realtime (a private, RLS-authorized
// broadcast channel scoped to the attempt, see LIVE_VIDEO_PROGRESS.md); the actual video/audio
// never touches Supabase or any third-party service. Exactly one connection is ever open per
// hook instance — calling start() while already connected/connecting tears down the previous
// attempt first, and switching to a different attemptId or unmounting always calls stop().
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { webrtcTopic, WEBRTC_SIGNAL_EVENT, fetchIceServers, type SignalMessage } from '@/lib/webrtc-signaling';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ViewerState = 'idle' | 'connecting' | 'connected' | 'failed' | 'unavailable';

// If the student doesn't answer within this window, they're offline, the tab is closed, or the
// camera never loaded — surface a clear message instead of an indefinitely blank video.
const REQUEST_TIMEOUT_MS = 10_000;
// A private channel's very first join attempt routinely comes back CHANNEL_ERROR
// ("Unauthorized") for a brief moment right after sign-in/navigation, before the
// realtime socket has finished attaching the just-refreshed auth token — the
// client's own realtime-js library retries automatically and reaches SUBSCRIBED a
// moment later. Failing hard on that first error (as this used to) meant "Go Live"
// was broken on almost every fresh session, while the snapshot directive never hit
// this because it doesn't gate anything on subscribe status. Give the client's own
// retry a real window before treating it as a genuine failure.
const JOIN_TIMEOUT_MS = 12_000;
// ICE's 'disconnected' state is often transient — a brief packet-loss blip that the browser's
// own connectivity checks recover from within a few seconds, with no action needed here. Only
// escalate to an actual reconnect attempt if it hasn't self-healed by this deadline. 'failed'
// (ICE has exhausted every candidate pair) skips straight to reconnecting — no self-heal is
// possible there without new candidates.
const DISCONNECT_GRACE_MS = 6_000;

export function useWebRTCViewer(attemptId: string | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ViewerState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // At most one automatic reconnect per connection — a flaky network that keeps dropping
  // shouldn't spam the student's browser with renegotiation requests forever. Reset whenever
  // a connection actually recovers, so a later, separate drop still gets its own one retry.
  const reconnectedRef = useRef(false);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    if (channelRef.current && viewerIdRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: WEBRTC_SIGNAL_EVENT,
        payload: { type: 'close', viewerId: viewerIdRef.current } satisfies SignalMessage,
      });
    }
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      const supabase = createClient();
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    viewerIdRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
    setErrorMessage(null);
  }, []);

  const start = useCallback((targetAttemptId: string) => {
    stop(); // only one connection at a time — always clear any prior attempt first
    setState('connecting');
    setErrorMessage(null);
    reconnectedRef.current = false;

    const viewerId = crypto.randomUUID();
    viewerIdRef.current = viewerId;

    const supabase = createClient();
    const channel = supabase.channel(webrtcTopic(targetAttemptId), { config: { private: true } });
    channelRef.current = channel;

    function send(message: SignalMessage) {
      void channel.send({ type: 'broadcast', event: WEBRTC_SIGNAL_EVENT, payload: message });
    }

    // Called on a dropped connection, either immediately ('failed') or after a grace period
    // ('disconnected', in case it self-heals — see DISCONNECT_GRACE_MS). Closes the dead
    // RTCPeerConnection and re-requests a fresh offer from the student over the same,
    // still-subscribed signaling channel; handleOffer runs again once it arrives.
    function scheduleReconnect(delayMs: number) {
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = setTimeout(() => {
        if (viewerIdRef.current !== viewerId) return;
        if (pcRef.current?.connectionState === 'connected') return; // self-healed already
        if (reconnectedRef.current) {
          setState('failed');
          setErrorMessage('Connection lost — likely a firewall/network blocking a direct connection.');
          return;
        }
        reconnectedRef.current = true;
        pcRef.current?.close();
        pcRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setState('connecting');
        setErrorMessage(null);
        send({ type: 'request', viewerId });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if (viewerIdRef.current === viewerId) {
            setState('failed');
            setErrorMessage('Reconnection failed — the student may be offline or on a network that blocks a direct connection.');
          }
        }, REQUEST_TIMEOUT_MS);
      }, delayMs);
    }

    async function handleOffer(sdp: RTCSessionDescriptionInit) {
      if (viewerIdRef.current !== viewerId) return;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const iceServers = await fetchIceServers();
      // A newer start()/reconnect may have superseded this one while that fetch was in
      // flight — if so, bail without touching pcRef, which the newer attempt already owns.
      if (viewerIdRef.current !== viewerId) return;
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (videoRef.current) videoRef.current.srcObject = e.streams[0] ?? null;
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && viewerIdRef.current === viewerId) {
          send({ type: 'ice-candidate', viewerId, candidate: e.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (viewerIdRef.current !== viewerId) return;
        if (pc.connectionState === 'connected') {
          setState('connected');
          if (graceTimeoutRef.current) { clearTimeout(graceTimeoutRef.current); graceTimeoutRef.current = null; }
          reconnectedRef.current = false; // recovered — a later, separate drop gets its own retry
        } else if (pc.connectionState === 'disconnected') {
          // Not necessarily terminal — give ICE a window to self-heal before reconnecting.
          scheduleReconnect(DISCONNECT_GRACE_MS);
        } else if (pc.connectionState === 'failed') {
          // No self-heal possible from 'failed' — reconnect right away.
          scheduleReconnect(0);
        }
      };

      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (viewerIdRef.current !== viewerId) return;
        send({ type: 'answer', viewerId, sdp: answer });
      } catch {
        setState('failed');
        setErrorMessage('Could not negotiate the video connection.');
      }
    }

    async function handleIceCandidate(candidate: RTCIceCandidateInit) {
      if (viewerIdRef.current !== viewerId || !pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch {
        // Late/stale candidate — harmless to drop.
      }
    }

    // Overall budget to actually reach SUBSCRIBED — covers the client's own automatic
    // rejoin-after-CHANNEL_ERROR retries. Only fires if subscribing genuinely never
    // succeeds; cleared the moment SUBSCRIBED arrives.
    joinTimeoutRef.current = setTimeout(() => {
      if (viewerIdRef.current === viewerId) {
        setState('failed');
        setErrorMessage('Could not open the signaling connection.');
      }
    }, JOIN_TIMEOUT_MS);

    channel
      .on('broadcast', { event: WEBRTC_SIGNAL_EVENT }, ({ payload }: { payload: SignalMessage }) => {
        if (viewerIdRef.current !== viewerId) return;
        switch (payload.type) {
          case 'offer': void handleOffer(payload.sdp); break;
          case 'ice-candidate': void handleIceCandidate(payload.candidate); break;
          case 'unavailable':
            if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
            setState('unavailable');
            setErrorMessage(payload.reason);
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && viewerIdRef.current === viewerId) {
          if (joinTimeoutRef.current) { clearTimeout(joinTimeoutRef.current); joinTimeoutRef.current = null; }
          send({ type: 'request', viewerId });
          timeoutRef.current = setTimeout(() => {
            if (viewerIdRef.current === viewerId) {
              setState('failed');
              setErrorMessage('Student did not respond — they may be offline or the exam tab is closed.');
            }
          }, REQUEST_TIMEOUT_MS);
        }
        // CHANNEL_ERROR / TIMED_OUT are not treated as terminal here — a private
        // channel's first join attempt commonly errors before the auth token has
        // finished propagating, and realtime-js retries on its own. joinTimeoutRef
        // above is the actual "genuinely never connected" backstop.
      });
  }, [stop]);

  // Always tear down on unmount or when the caller switches to a different attempt/student.
  useEffect(() => () => stop(), [attemptId, stop]);

  return { videoRef, state, errorMessage, start, stop };
}
