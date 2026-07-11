'use client';
// Sustained-audio detection (Phase 3, doc 01): energy-based VAD sampled every
// 200ms. Brief sounds (a cough, a chair) never flag; only activity sustained
// past SUSTAIN_MS opens an episode, which closes after QUIET_MS of silence and
// is emitted as one audio_detected event with its full duration. No raw audio
// ever leaves the device (decision 1: events-only).
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';

interface AudioMonitorProps {
  buffer: ProctoringEventBuffer;
  threshold?: number;
}

const SAMPLE_MS = 200;
const SUSTAIN_MS = 5_000; // activity must persist this long before it counts
const QUIET_MS = 2_000;   // this much silence closes an episode

export function AudioMonitor({ buffer, threshold = 0.05 }: AudioMonitorProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false; // Guard against unmount before getUserMedia resolves

    // Episode state
    let activeSince: number | null = null;  // first sample above threshold in current run
    let lastActiveAt: number | null = null; // most recent sample above threshold
    let episodeOpen = false;
    let levelSum = 0;
    let levelCount = 0;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        function closeEpisode() {
          if (episodeOpen && activeSince && lastActiveAt) {
            const meanLevel = levelCount > 0 ? levelSum / levelCount : 0;
            const startIso = new Date(activeSince).toISOString();
            addViolation({ type: 'audio_detected', timestamp: startIso, description: 'Sustained audio detected' });
            buffer.emit({
              type: 'audio_detected',
              severity: 'low',
              // Louder sustained audio → higher confidence it's real speech, capped at 1.
              confidence: Math.min(meanLevel / (threshold * 3), 1),
              timestamp: startIso,
              endedAt: new Date(lastActiveAt).toISOString(),
              description: 'Sustained audio above threshold',
              metadata: { meanLevel: Number(meanLevel.toFixed(4)), threshold },
            });
          }
          activeSince = null;
          lastActiveAt = null;
          episodeOpen = false;
          levelSum = 0;
          levelCount = 0;
        }

        timer = setInterval(() => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
          const now = Date.now();

          if (avg > threshold) {
            if (activeSince === null) activeSince = now;
            lastActiveAt = now;
            levelSum += avg;
            levelCount += 1;
            if (!episodeOpen && now - activeSince >= SUSTAIN_MS) {
              episodeOpen = true;
            }
          } else if (activeSince !== null && lastActiveAt !== null && now - lastActiveAt >= QUIET_MS) {
            closeEpisode();
          }
        }, SAMPLE_MS);
      } catch {
        // Microphone denied — not a blocking error
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      ctx?.close();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [buffer, threshold, addViolation]);

  return null;
}
