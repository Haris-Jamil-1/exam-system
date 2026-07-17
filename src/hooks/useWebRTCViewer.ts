'use client';
// Teacher-side WebRTC viewer for one student's live camera feed. Peer-to-peer — only the
// SDP/ICE signaling handshake goes through Supabase Realtime (a private, RLS-authorized
// broadcast channel scoped to the attempt, see LIVE_VIDEO_PROGRESS.md); the actual video/audio
// never touches Supabase or any third-party service. Exactly one connection is ever open per
// hook instance — calling start() while already connected/connecting tears down the previous
// attempt first, and switching to a different attemptId or unmounting always calls stop().
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { webrtcTopic, WEBRTC_SIGNAL_EVENT, ICE_SERVERS, type SignalMessage } from '@/lib/webrtc-signaling';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ViewerState = 'idle' | 'connecting' | 'connected' | 'failed' | 'unavailable';

// If the student doesn't answer within this window, they're offline, the tab is closed, or the
// camera never loaded — surface a clear message instead of an indefinitely blank video.
const REQUEST_TIMEOUT_MS = 10_000;

export function useWebRTCViewer(attemptId: string | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ViewerState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
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

    const viewerId = crypto.randomUUID();
    viewerIdRef.current = viewerId;

    const supabase = createClient();
    const channel = supabase.channel(webrtcTopic(targetAttemptId), { config: { private: true } });
    channelRef.current = channel;

    function send(message: SignalMessage) {
      void channel.send({ type: 'broadcast', event: WEBRTC_SIGNAL_EVENT, payload: message });
    }

    async function handleOffer(sdp: RTCSessionDescriptionInit) {
      if (viewerIdRef.current !== viewerId) return;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
        if (pc.connectionState === 'connected') setState('connected');
        else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setState('failed');
          setErrorMessage('Connection lost — likely a firewall/network blocking a direct connection.');
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
          send({ type: 'request', viewerId });
          timeoutRef.current = setTimeout(() => {
            if (viewerIdRef.current === viewerId) {
              setState('failed');
              setErrorMessage('Student did not respond — they may be offline or the exam tab is closed.');
            }
          }, REQUEST_TIMEOUT_MS);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (viewerIdRef.current === viewerId) {
            setState('failed');
            setErrorMessage('Could not open the signaling connection.');
          }
        }
      });
  }, [stop]);

  // Always tear down on unmount or when the caller switches to a different attempt/student.
  useEffect(() => () => stop(), [attemptId, stop]);

  return { videoRef, state, errorMessage, start, stop };
}
