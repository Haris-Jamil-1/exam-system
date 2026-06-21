'use client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { TabGuard } from './TabGuard';
import { FullscreenGuard } from './FullscreenGuard';
import { AudioMonitor } from './AudioMonitor';
import { FaceDetector } from './FaceDetector';
import { ViolationAlert } from './ViolationAlert';

interface ProctoringOverlayProps {
  examId: string;
  attemptId: string;
}

export function ProctoringOverlay({ examId, attemptId }: ProctoringOverlayProps) {
  const user = useCurrentUser();
  const studentId = user?.id ?? 'anonymous';

  return (
    <>
      <TabGuard examId={examId} attemptId={attemptId} studentId={studentId} />
      <FullscreenGuard examId={examId} attemptId={attemptId} studentId={studentId} />
      <AudioMonitor examId={examId} attemptId={attemptId} studentId={studentId} />
      <FaceDetector examId={examId} attemptId={attemptId} studentId={studentId} />
      <ViolationAlert />
    </>
  );
}
