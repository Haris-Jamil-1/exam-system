'use client';
import { useEffect, useRef } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { logViolation } from '@/lib/data';

interface AudioMonitorProps {
  examId: string;
  attemptId: string;
  studentId: string;
  threshold?: number;
}

export function AudioMonitor({ examId, attemptId, studentId, threshold = 0.05 }: AudioMonitorProps) {
  const { addViolation } = useProctoringStore();
  const lastLogTime = useRef<number>(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf: number;
    let cancelled = false; // Guard against unmount before getUserMedia resolves

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

        function check() {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
          if (avg > threshold) {
            const now = Date.now();
            if (now - lastLogTime.current > 10000) {
              lastLogTime.current = now;
              addViolation({ type: 'audio_detected', timestamp: new Date().toISOString(), description: 'Audio detected' });
              logViolation({
                attemptId, studentId, examId,
                type: 'audio_detected', severity: 'medium',
                timestamp: new Date().toISOString(),
                description: 'Sustained audio above threshold detected',
              });
            }
          }
          raf = requestAnimationFrame(check);
        }
        check();
      } catch {
        // Microphone denied — not a blocking error
      }
    }

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ctx?.close();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [examId, attemptId, studentId, threshold, addViolation]);

  return null;
}
