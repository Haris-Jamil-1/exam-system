'use client';
import { useEffect, useRef, useState } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { logViolation } from '@/lib/data';

interface FaceDetectorProps {
  examId: string;
  attemptId: string;
  studentId: string;
}

export function FaceDetector({ examId, attemptId, studentId }: FaceDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [faceDetected, setFaceDetected] = useState(true);
  const [cameraError, setCameraError] = useState(false);
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        // Phase 3: replace this with real face-api.js detection
        // For now: simulate face detected
        setFaceDetected(true);

        // Simulate random no-face events for demo
        const id = setInterval(() => {
          const shouldFlag = Math.random() < 0.02; // 2% chance
          if (shouldFlag) {
            setFaceDetected(false);
            addViolation({ type: 'no_face', timestamp: new Date().toISOString(), description: 'No face detected' });
            logViolation({
              attemptId,
              studentId,
              examId,
              type: 'no_face',
              severity: 'high',
              timestamp: new Date().toISOString(),
              description: 'No face detected in camera feed',
            });
            setTimeout(() => setFaceDetected(true), 3000);
          }
        }, 5000);

        return () => clearInterval(id);
      } catch {
        setCameraError(true);
      }
    }

    const cleanup = init();

    return () => {
      cleanup.then(fn => fn?.());
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [examId, attemptId, studentId, addViolation]);

  return (
    <div className="fixed bottom-4 end-4 z-50">
      <div className="relative rounded-xl overflow-hidden border-2 border-white shadow-lg w-28 h-20 bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <p className="text-white text-xs text-center">Camera unavailable</p>
          </div>
        ) : (
          <div className={`absolute bottom-1 start-1 end-1 text-center text-xs rounded px-1 py-0.5 ${
            faceDetected ? 'bg-green-600 text-white' : 'bg-red-600 text-white animate-pulse'
          }`}>
            {faceDetected ? '✓ Face Detected' : '⚠ No Face'}
          </div>
        )}
      </div>
    </div>
  );
}
