'use client';
// Phase 2: sequential/forwardOnly/autoAdvance enforced server-side via ExamSession
// Phase 3: biometric onboarding uses real face-api.js capture
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExamById, getQuestionsForStudent, getQuestionsForStudentSection, getSections, getSectionAttempts } from '@/lib/data';
import type { Exam, PublicQuestion, Question, ExamSection } from '@/types';
import { useExamStore } from '@/store/examStore';
import { useProctoringStore } from '@/store/proctoringStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useExamTimer } from '@/hooks/useExamTimer';
import { ProctoringOverlay } from '@/components/proctoring/ProctoringOverlay';
import { BiometricOnboarding } from '@/components/proctoring/BiometricOnboarding';
import { CodeQuestion } from '@/components/exam/CodeQuestion';
import { FileUploadQuestion } from '@/components/exam/FileUploadQuestion';
import { ItemCountdownBadge } from '@/components/exam/ItemCountdownBadge';
import { DesktopGuard } from '@/components/shared/DesktopGuard';
import { classifyStartExamResponse, classifySectionStartResponse } from '@/lib/exam-start-errors';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Flag, ChevronLeft, ChevronRight, Clock, ChevronUp, ChevronDown, Pause, Play, Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const SESSION_KEY = (examId: string) => `exam_attempt_${examId}`;

interface AttemptSession {
  attemptId: string;
  startedAt: string;
}

// Availability window vs. duration: the exam auto-submits at whichever comes first —
// the student's duration limit, or the exam's global availableTo (endTime).
function deadlineMs(startedAtIso: string, exam: Exam): number {
  const startedMs = new Date(startedAtIso).getTime();
  const durationDeadline = startedMs + exam.duration * 60_000;
  const availableToMs = new Date(exam.endTime).getTime();
  return Math.min(durationDeadline, availableToMs);
}

function remainingSeconds(startedAtIso: string, exam: Exam, serverNow: number): number {
  return Math.max(0, Math.floor((deadlineMs(startedAtIso, exam) - serverNow) / 1000));
}

// A section's own deadline: whichever comes first — its own durationMinutes (from when the
// student clicked "Start Section", not the overall exam) or the exam's global endTime. If the
// section has no durationMinutes, only the exam's endTime governs it.
function sectionDeadlineMs(sectionStartedAtIso: string, section: ExamSection, exam: Exam): number {
  const startedMs = new Date(sectionStartedAtIso).getTime();
  const availableToMs = new Date(exam.endTime).getTime();
  if (!section.durationMinutes) return availableToMs;
  return Math.min(startedMs + section.durationMinutes * 60_000, availableToMs);
}

function sectionRemainingSeconds(sectionStartedAtIso: string, section: ExamSection, exam: Exam, serverNow: number): number {
  return Math.max(0, Math.floor((sectionDeadlineMs(sectionStartedAtIso, section, exam) - serverNow) / 1000));
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const user = useCurrentUser();

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attemptId, setAttemptId] = useState('');
  const [initialSeconds, setInitialSeconds] = useState(0);
  // serverOffset: (serverNow - clientNow) in ms. Positive means client clock is behind.
  const [serverOffset, setServerOffset] = useState(0);
  // Waiting state: seconds until exam startTime; null = not in waiting phase
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);

  // Biometric gate — shown before exam if proctoring level is strict
  const [biometricDone, setBiometricDone] = useState(false);
  // Set when the student used the gate's "start without verification" escape hatch —
  // reported to the teacher as an unverified_start violation once the attempt exists
  // (the gate runs before any attempt row is created, so it can't be logged earlier).
  const skippedVerificationRef = useRef(false);
  // Pre-exam instructions gate — the duration timer only starts once this is dismissed
  const [instructionsDone, setInstructionsDone] = useState(false);
  const [startingExam, setStartingExam] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Pause overlay
  const [paused, setPaused] = useState(false);
  // File upload answers stored separately (File objects can't go into Zustand string answers)
  const [fileAnswers, setFileAnswers] = useState<Record<string, File | null>>({});

  // ── Multi-section exams only (sections.length > 0) ──────────────────────────────
  // A non-sectioned exam never touches any of this — everything above/below behaves exactly
  // as it did before sections existed.
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionInstructionsDone, setSectionInstructionsDone] = useState(false);
  const [startingSection, setStartingSection] = useState(false);
  const [sectionStartError, setSectionStartError] = useState<string | null>(null);
  const [submittedSectionIds, setSubmittedSectionIds] = useState<Set<string>>(new Set());
  const isSectioned = sections.length > 0;
  const currentSection = isSectioned ? sections[currentSectionIndex] : undefined;

  // Question indices whose per-item time limit has expired — navigating back to them is locked
  const [expiredIndices, setExpiredIndices] = useState<Set<number>>(new Set());

  const {
    currentQuestionIndex,
    answers,
    flaggedQuestions,
    setCurrentExam,
    setAnswer,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    flagQuestion,
    resetExam,
  } = useExamStore();

  const { violationCount, trustScore } = useProctoringStore();

  const settings = exam?.settings;
  // Multi-section exams use isItemSequential instead of navigationMode/forwardOnly — answering
  // a question auto-advances and hides Previous entirely, matching the spec's "Lock Answered
  // Questions" toggle. Reuses the exact same isSequential/forwardOnly gating logic below either way.
  const isSequential = isSectioned ? !!settings?.isItemSequential : settings?.navigationMode === 'sequential';
  const forwardOnly  = isSectioned ? isSequential : (isSequential && !!settings?.forwardOnly);
  // Phase 7: isItemSequential specifically (not the older non-sectioned navigationMode flag)
  // has real server-side enforcement via POST .../items/[questionId]/lock — best-effort here,
  // since the server independently re-applies any lock at submit time regardless of whether
  // this call succeeds (see the submit routes' defense-in-depth read of ItemLock rows).
  const itemLockActive = isSectioned && isSequential;
  const autoAdvance  = !!settings?.autoAdvance;
  const allowPause   = settings?.allowPause !== false; // default true

  // Load exam (+ sections, if any); check start time before entering the instructions/attempt
  // flow. Questions are fetched separately below, once it's known whether an attempt (and
  // therefore a possible stratified-pooled or section-scoped question set) already exists.
  useEffect(() => {
    async function load() {
      const [e, examSections, timeRes] = await Promise.all([
        getExamById(examId),
        getSections(examId),
        fetch('/api/time').then(r => r.json() as Promise<{ now: number }>),
      ]);
      if (!e) return;

      const offset = timeRes.now - Date.now(); // positive = client behind server
      setServerOffset(offset);
      setExam(e);
      setCurrentExam(e);
      setSections(examSections);
      const sectioned = examSections.length > 0;

      const serverNow = Date.now() + offset;
      const startMs = new Date(e.startTime).getTime();

      const stored = sessionStorage.getItem(SESSION_KEY(examId));
      if (stored) {
        // Resuming an attempt already in progress — the student already passed the waiting
        // room, biometric gate, and (overall) instructions screen.
        const session = JSON.parse(stored) as AttemptSession;
        setAttemptId(session.attemptId);
        setBiometricDone(true);
        setInstructionsDone(true);

        if (!sectioned) {
          // Pass the attemptId so a pooled exam's already-materialized private questions load
          // correctly (a bare examId fetch would return none for a pure-pooling exam).
          const q = await getQuestionsForStudent(examId, session.attemptId);
          setQuestions(q);
          setInitialSeconds(remainingSeconds(session.startedAt, e, serverNow));
          return;
        }

        // Sectioned resume: find the first section that isn't submitted yet — that's where
        // the student left off. If it was already started (has its own startedAt), skip its
        // instructions screen and load straight into it; otherwise show its instructions.
        const sectionAttempts = await getSectionAttempts(session.attemptId);
        const submitted = new Set(sectionAttempts.filter(sa => sa.status !== 'in_progress').map(sa => sa.sectionId));
        setSubmittedSectionIds(submitted);
        const sorted = examSections.slice().sort((a, b) => a.orderIndex - b.orderIndex);
        const resumeIndex = sorted.findIndex(s => !submitted.has(s.id));
        const targetIndex = resumeIndex === -1 ? sorted.length - 1 : resumeIndex;
        setCurrentSectionIndex(targetIndex);
        const targetSection = sorted[targetIndex];
        const existingSectionAttempt = sectionAttempts.find(sa => sa.sectionId === targetSection.id);
        if (existingSectionAttempt?.startedAt) {
          const q = await getQuestionsForStudentSection(examId, targetSection.id, session.attemptId);
          setQuestions(q);
          setSectionInstructionsDone(true);
          setInitialSeconds(sectionRemainingSeconds(existingSectionAttempt.startedAt, targetSection, e, serverNow));
        }
        return;
      }

      // Show waiting room only when the exam hasn't been manually started by the teacher
      // AND the scheduled startTime hasn't been reached yet.
      // If status is already 'live', the teacher started it early — let the student in immediately.
      if (e.status !== 'live' && startMs > serverNow) {
        setWaitSeconds(Math.ceil((startMs - serverNow) / 1000));
        return;
      }

      // Fixed/shared-question preview for the (overall) instructions screen. For a
      // stratified-pooled or sectioned exam this is empty (nothing to preview yet — the real
      // set is only known once the attempt/section is started) — the instructions screen
      // accounts for that explicitly rather than treating 0 as "still loading".
      if (!sectioned) {
        const q = await getQuestionsForStudent(examId);
        setQuestions(q);
      }

      // Ready to enter: biometric gate (if strict proctoring is enabled) runs first, then the
      // instructions screen. The duration timer does NOT start here — it only starts once the
      // student clicks "Start Exam" on the instructions screen (see handleStartExam below).
      if (!e.isProctoringEnabled || e.settings.proctoringLevel !== 'strict') {
        setBiometricDone(true);
      }
    }

    load();
    return () => { resetExam(); };
  }, [examId, resetExam, setCurrentExam, user?.id]);

  async function handleStartExam() {
    if (!exam || startingExam) return;
    setStartingExam(true);
    setStartError(null);
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      });
      const body = await res.json().catch(() => ({}));
      const outcome = classifyStartExamResponse(res.status, body);
      if (!outcome.ok) {
        // Never write session/local state on a failed start — the button stays clickable
        // (see the `disabled` prop below) so the student always has a retry path, but nothing
        // here proceeds into the exam until a real 201 comes back.
        if (outcome.instructorDetail) console.error('[exam-start]', outcome.kind, outcome.instructorDetail);
        let message = outcome.studentMessage;
        if (outcome.kind === 'not_started') {
          message = `This exam opens at ${new Date(exam.startTime).toLocaleString()}.`;
        }
        setStartError(message);
        return;
      }
      const attempt = outcome.attempt;
      const session: AttemptSession = { attemptId: attempt.id, startedAt: attempt.startedAt };
      sessionStorage.setItem(SESSION_KEY(examId), JSON.stringify(session));
      setAttemptId(attempt.id);

      // The gate's "start without verification" choice is only reportable now that the
      // attempt row exists. Best-effort: a failure here must never block the exam start.
      if (skippedVerificationRef.current) {
        skippedVerificationRef.current = false; // report once, even if start is retried later
        void fetch('/api/violations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attemptId: attempt.id,
            examId,
            events: [{
              type: 'unverified_start',
              severity: 'high',
              confidence: 1,
              timestamp: new Date().toISOString(),
              description: 'Student started the exam without completing face/ID identity verification',
            }],
          }),
        }).catch(err => console.error('[exam-start] failed to report unverified start:', err));
      }

      if (isSectioned) {
        // Sectioned exams have no overall duration timer — each section gates its own via
        // "Start Section" (handleStartSection). Nothing to seed here; the very next screen is
        // Section 1's instructions.
        setInstructionsDone(true);
        return;
      }

      // Re-fetch with the now-known attemptId — for a stratified-pooled exam this is the
      // first moment the student's private question set exists at all (materialized
      // server-side inside POST /api/attempts); for a non-pooled exam it's the same fixed
      // list they already had, just re-fetched.
      const freshQuestions = await getQuestionsForStudent(examId, attempt.id);
      setQuestions(freshQuestions);
      const serverNow = Date.now() + serverOffset;
      setInitialSeconds(remainingSeconds(attempt.startedAt, exam, serverNow));
      setInstructionsDone(true);
    } finally {
      setStartingExam(false);
    }
  }

  async function handleStartSection() {
    if (!exam || !currentSection || !attemptId || startingSection) return;
    setStartingSection(true);
    setSectionStartError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/sections/${currentSection.id}/start`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      const errorMessage = classifySectionStartResponse(res.status, body);
      if (errorMessage) {
        // e.g. 403 if a locked earlier section wasn't actually submitted — show it rather than
        // leaving the student on a dead button, and reload so the page's own resume-detection
        // logic (in the load() effect) re-runs and lands them on whichever section they're
        // actually meant to be in, the same recovery pattern the waiting room already uses.
        setSectionStartError(errorMessage);
        return;
      }
      const sectionAttempt = body as { startedAt: string };
      const q = await getQuestionsForStudentSection(examId, currentSection.id, attemptId);
      setQuestions(q);
      const serverNow = Date.now() + serverOffset;
      setInitialSeconds(sectionRemainingSeconds(sectionAttempt.startedAt, currentSection, exam, serverNow));
      setSectionInstructionsDone(true);
      // Fresh section — local UI state from the previous section shouldn't carry over.
      setExpiredIndices(new Set());
      goToQuestion(0);
    } finally {
      setStartingSection(false);
    }
  }

  // Waiting-room countdown: tick down and auto-start when startTime is reached
  useEffect(() => {
    if (waitSeconds === null) return;
    if (waitSeconds <= 0) {
      setWaitSeconds(null);
      // Re-run beginAttempt by triggering a load via state (simpler: reload the component)
      // We reload the page so the full load() path runs cleanly once startTime has passed.
      window.location.reload();
      return;
    }
    const id = setInterval(() => setWaitSeconds(s => (s !== null ? Math.max(0, s - 1) : null)), 1000);
    return () => clearInterval(id);
  }, [waitSeconds]);

  // Auto-advance effect: when MCQ answer is set in autoAdvance mode, move to next
  useEffect(() => {
    if (!autoAdvance) return;
    const q = questions[currentQuestionIndex];
    if (!q) return;
    if ((q.type === 'mcq' || q.type === 'true_false') && answers[q.id]) {
      const timer = setTimeout(() => {
        if (currentQuestionIndex < questions.length - 1) nextQuestion();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [answers, currentQuestionIndex, questions, autoAdvance, nextQuestion]);

  const doSubmit = useCallback(async () => {
    if (submitting || !exam) return;
    setSubmitting(true);
    try {
      // Upload any pending file answers and collect URLs
      const fileUploads = await Promise.allSettled(
        Object.entries(fileAnswers)
          .filter(([, file]) => file !== null)
          .map(async ([questionId, file]) => {
            const fd = new FormData();
            fd.append('file', file!);
            fd.append('folder', `exams/${examId}`);
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
            if (!uploadRes.ok) throw new Error('Upload failed');
            const { path } = await uploadRes.json() as { path: string };
            return { questionId, path };
          })
      );
      const mergedAnswers: Record<string, string | string[] | Record<string, string>> = { ...answers };
      for (const result of fileUploads) {
        if (result.status === 'fulfilled') {
          mergedAnswers[result.value.questionId] = result.value.path;
        }
      }

      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, answers: mergedAnswers, violationCount, trustScore }),
      });
      const submitResult = await res.json() as {
        score: number; totalMarks: number; scorePercentage: number;
        perQuestion: Array<{ questionId: string; stem: string; type: string; marks: number; marksAwarded: number }>;
      };
      sessionStorage.removeItem(SESSION_KEY(examId));
      const heldParam = exam.settings.resultsVisibility === 'held' ? '&held=1' : '';
      // attemptId lets the completion page re-fetch the per-question
      // breakdown from the server on every load (including reloads),
      // instead of a one-time sessionStorage read that vanished after
      // the first render.
      router.push(
        `/exam/${examId}/complete?score=${submitResult.score}&total=${submitResult.totalMarks}&pct=${submitResult.scorePercentage}&attemptId=${attemptId}${heldParam}`
      );
    } catch {
      sessionStorage.removeItem(SESSION_KEY(examId));
      router.push(`/exam/${examId}/complete?score=0&total=0&pct=0`);
    }
  }, [submitting, exam, attemptId, examId, answers, fileAnswers, violationCount, trustScore, router]);

  const handleSectionSubmit = useCallback(async () => {
    if (submitting || !exam || !currentSection) return;
    setSubmitting(true);
    try {
      const sectionQuestionIds = new Set(questions.map(qi => qi.id));
      const fileUploads = await Promise.allSettled(
        Object.entries(fileAnswers)
          .filter(([qid, file]) => file !== null && sectionQuestionIds.has(qid))
          .map(async ([questionId, file]) => {
            const fd = new FormData();
            fd.append('file', file!);
            fd.append('folder', `exams/${examId}`);
            const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
            if (!uploadRes.ok) throw new Error('Upload failed');
            const { path } = await uploadRes.json() as { path: string };
            return { questionId, path };
          })
      );
      const sectionAnswers: Record<string, string | string[] | Record<string, string>> = {};
      for (const [qid, val] of Object.entries(answers)) {
        if (sectionQuestionIds.has(qid)) sectionAnswers[qid] = val;
      }
      for (const result of fileUploads) {
        if (result.status === 'fulfilled') sectionAnswers[result.value.questionId] = result.value.path;
      }

      const res = await fetch(`/api/attempts/${attemptId}/sections/${currentSection.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: sectionAnswers }),
      });
      const result = await res.json() as {
        isLastSection: boolean;
        nextSectionId: string | null;
        overallResult: { score: number; totalMarks: number; scorePercentage: number } | null;
      };

      setSubmittedSectionIds(prev => new Set(prev).add(currentSection.id));

      if (result.isLastSection && result.overallResult) {
        sessionStorage.removeItem(SESSION_KEY(examId));
        const heldParam = exam.settings.resultsVisibility === 'held' ? '&held=1' : '';
        router.push(
          `/exam/${examId}/complete?score=${result.overallResult.score}&total=${result.overallResult.totalMarks}&pct=${result.overallResult.scorePercentage}&attemptId=${attemptId}${heldParam}`
        );
        return;
      }

      // Advance to the next section's instructions screen.
      setSectionInstructionsDone(false);
      setCurrentSectionIndex(i => i + 1);
      setQuestions([]);
      resetExam();
      setCurrentExam(exam);
    } catch {
      sessionStorage.removeItem(SESSION_KEY(examId));
      router.push(`/exam/${examId}/complete?score=0&total=0&pct=0`);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, exam, currentSection, questions, answers, fileAnswers, attemptId, examId, router, resetExam, setCurrentExam]);

  const handleTimeUp = useCallback(() => {
    if (isSectioned) void handleSectionSubmit();
    else void doSubmit();
  }, [isSectioned, handleSectionSubmit, doSubmit]);
  const { timeRemaining, isLow } = useExamTimer(initialSeconds, handleTimeUp, paused);

  function handleSubmitConfirm() {
    setShowSubmitModal(false);
    if (isSectioned) void handleSectionSubmit();
    else void doSubmit();
  }

  // Hooks must run on every render (before any early return below), even while questions
  // are still loading — q is undefined until then, and useItemTimer tolerates that.
  const q = questions[currentQuestionIndex];

  // Best-effort — the server independently re-locks via ItemLock rows read at submit time
  // regardless of whether this call lands, so a dropped request here never lets a client
  // bypass the lock, it only means the lock becomes server-visible slightly later.
  const lockItem = useCallback((questionId: string, response: unknown) => {
    if (!itemLockActive || !attemptId) return;
    fetch(`/api/attempts/${attemptId}/items/${questionId}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    }).catch(() => {});
  }, [itemLockActive, attemptId]);

  const handleNextClick = useCallback(() => {
    if (q) lockItem(q.id, answers[q.id]);
    nextQuestion();
  }, [q, answers, lockItem, nextQuestion]);

  // Most restrictive wins when both isItemSequential and the Phase 5 per-item timer both
  // apply to the same item: expiry already force-advances past it, so it must lock here too,
  // exactly like a manual "Next" click would — the item stays locked either way it was left.
  const handleItemExpire = useCallback(() => {
    setExpiredIndices(prev => {
      if (prev.has(currentQuestionIndex)) return prev;
      const next = new Set(prev);
      next.add(currentQuestionIndex);
      return next;
    });
    if (q) lockItem(q.id, answers[q.id]);
    if (currentQuestionIndex < questions.length - 1) nextQuestion();
  }, [currentQuestionIndex, questions.length, nextQuestion, q, answers, lockItem]);

  // ── Pre-exam waiting room ─────────────────────────────────────────────────────
  if (waitSeconds !== null && exam) {
    const wm = Math.floor(waitSeconds / 60);
    const ws = waitSeconds % 60;
    return (
      <DesktopGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="inline-flex h-20 w-20 rounded-full bg-blue-100 items-center justify-center mx-auto">
              <Clock className="h-10 w-10 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
              <p className="text-muted-foreground mt-1">Exam hasn&apos;t started yet</p>
            </div>
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Starts in</p>
              <p className="text-5xl font-mono font-bold text-blue-600">
                {String(wm).padStart(2, '0')}:{String(ws).padStart(2, '0')}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(exam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              The exam will open automatically when the timer reaches zero. Keep this page open.
            </p>
          </div>
        </div>
      </DesktopGuard>
    );
  }

  // ── Biometric gate ────────────────────────────────────────────────────────────
  if (exam && !biometricDone) {
    return (
      <BiometricOnboarding
        onComplete={() => setBiometricDone(true)}
        onSkip={() => {
          skippedVerificationRef.current = true;
          setBiometricDone(true);
        }}
      />
    );
  }

  // ── Pre-exam instructions screen ──────────────────────────────────────────────
  // The duration timer only starts once "Start Exam" is clicked (handleStartExam),
  // never before — see the load() effect above, which never sets initialSeconds here.
  const isPooled = !!(exam?.settings?.dynamicPoolingBlueprint && Object.keys(exam.settings.dynamicPoolingBlueprint).length > 0);
  if (exam && !instructionsDone) {
    return (
      <DesktopGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center">
              <div className="inline-flex h-16 w-16 rounded-full bg-blue-100 items-center justify-center mx-auto mb-3">
                <Info className="h-8 w-8 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
              <p className="text-muted-foreground mt-1">Please read the instructions before you begin</p>
            </div>
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{exam.duration} minutes</Badge>
                <Badge variant="outline">{exam.totalMarks} marks</Badge>
                {isSectioned ? (
                  <Badge variant="info">{sections.length} section{sections.length !== 1 ? 's' : ''}</Badge>
                ) : isPooled ? (
                  <Badge variant="info">Your question set is generated when you start</Badge>
                ) : (
                  <Badge variant="outline">{questions.length} question{questions.length !== 1 ? 's' : ''}</Badge>
                )}
              </div>
              {exam.instructions ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{exam.instructions}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No special instructions provided for this exam.</p>
              )}
              {exam.isProctoringEnabled && (
                <p className="text-xs text-muted-foreground border-t pt-3">
                  This exam is proctored: your camera and microphone are analyzed on your device to
                  detect rule violations. Only violation events are recorded — no continuous video or
                  audio is stored. A single camera snapshot may be saved as evidence for serious flags,
                  and you will see an on-screen indicator whenever that happens.
                </p>
              )}
            </div>
            {startError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
                {startError}
              </p>
            )}
            <Button onClick={handleStartExam} disabled={startingExam || (!isPooled && !isSectioned && questions.length === 0)} className="w-full" size="lg">
              {startingExam ? 'Starting…' : startError ? 'Try Again' : 'Start Exam'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              {isSectioned
                ? `This exam is split into ${sections.length} timed section${sections.length !== 1 ? 's' : ''} — each section's own timer starts when you click "Start Section".`
                : `Your ${exam.duration}-minute timer starts as soon as you click Start Exam.`}
            </p>
          </div>
        </div>
      </DesktopGuard>
    );
  }

  // ── Section N instructions screen (multi-section exams only) ─────────────────
  if (exam && isSectioned && currentSection && !sectionInstructionsDone) {
    return (
      <DesktopGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center">
              <div className="inline-flex h-16 w-16 rounded-full bg-blue-100 items-center justify-center mx-auto mb-3">
                <Info className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Section {currentSectionIndex + 1} of {sections.length}</p>
              <h1 className="text-2xl font-bold text-gray-900">{currentSection.title}</h1>
            </div>
            <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {currentSection.durationMinutes ? (
                  <Badge variant="outline">{currentSection.durationMinutes} minutes</Badge>
                ) : (
                  <Badge variant="outline">No section time limit</Badge>
                )}
                <Badge variant="outline">{currentSection.sectionWeight}% of grade</Badge>
                {currentSection.passingThreshold !== undefined && (
                  <Badge variant="outline">pass ≥ {currentSection.passingThreshold}%</Badge>
                )}
              </div>
              {currentSection.instructions ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{currentSection.instructions}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No special instructions for this section.</p>
              )}
            </div>
            {sectionStartError ? (
              <>
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
                  {sectionStartError}
                </p>
                <Button onClick={() => window.location.reload()} className="w-full" size="lg">
                  Reload
                </Button>
              </>
            ) : (
              <Button onClick={handleStartSection} disabled={startingSection} className="w-full" size="lg">
                {startingSection ? 'Starting…' : 'Start Section'}
              </Button>
            )}
            <p className="text-xs text-center text-muted-foreground">
              {currentSection.durationMinutes
                ? `This section's ${currentSection.durationMinutes}-minute timer starts as soon as you click Start Section.`
                : 'This section has no timer of its own — the overall exam deadline still applies.'}
            </p>
          </div>
        </div>
      </DesktopGuard>
    );
  }

  if (!exam || questions.length === 0 || !attemptId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading exam...</p>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length + Object.values(fileAnswers).filter(Boolean).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const currentAnswered = answers[q.id] !== undefined || fileAnswers[q.id] !== undefined;
  const isRequired = q.required && !currentAnswered;

  function handleGoToQuestion(i: number) {
    if (isSequential && Math.abs(i - currentQuestionIndex) > 1) return;
    if (forwardOnly && i < currentQuestionIndex) return;
    if (expiredIndices.has(i)) return;
    if (forwardOnly && i > currentQuestionIndex) lockItem(q.id, answers[q.id]);
    goToQuestion(i);
  }

  return (
    <DesktopGuard>
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {exam.isProctoringEnabled && (
        <ProctoringOverlay examId={examId} attemptId={attemptId || 'attempt-loading'} onForceSubmit={handleTimeUp} />
      )}

      {/* ── Pause overlay ── */}
      {paused && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center gap-6">
          <Pause className="h-12 w-12 text-slate-400" />
          <div className="text-center space-y-1">
            <p className="text-white text-xl font-bold">Exam Paused</p>
            <p className="text-slate-400 text-sm">Timer is stopped. Proctoring continues.</p>
          </div>
          <Button onClick={() => setPaused(false)} className="gap-2 bg-blue-600 hover:bg-blue-700 px-8">
            <Play className="h-4 w-4" /> Resume Exam
          </Button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-gray-900">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">
            {isSectioned && currentSection
              ? `Section ${currentSectionIndex + 1} of ${sections.length}: ${currentSection.title}`
              : exam.subject}
          </p>
        </div>
        {isSectioned && (
          <div className="hidden md:flex items-center gap-1.5" title="Section progress">
            {sections.map((s, i) => {
              const done = submittedSectionIds.has(s.id);
              const active = i === currentSectionIndex;
              return (
                <div
                  key={s.id}
                  className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold border',
                    done
                      ? 'bg-green-600 border-green-600 text-white'
                      : active
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                  )}
                  title={`${s.title}${done ? ' (submitted)' : active ? ' (current)' : ''}`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3">
          {allowPause && !paused && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPaused(true)}
              className="gap-1 text-muted-foreground hover:text-gray-900"
              title="Pause exam"
            >
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          <div className={cn(
            'flex items-center gap-2 font-mono font-bold text-lg px-3 py-1 rounded-lg',
            isLow ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
          )}>
            <Clock className="h-4 w-4" />
            {paused ? <span className="text-muted-foreground">--:--</span> : timeRemaining}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Question Navigator */}
        <aside className="w-20 border-e bg-white flex-shrink-0 overflow-y-auto hidden sm:block">
          <div className="p-2 space-y-1.5">
            {questions.map((qi, i) => {
              const answered = !!answers[qi.id] || !!fileAnswers[qi.id];
              const flagged  = flaggedQuestions.has(qi.id);
              const current  = i === currentQuestionIndex;
              const disabled =
                (isSequential && Math.abs(i - currentQuestionIndex) > 1) ||
                (forwardOnly && i < currentQuestionIndex) ||
                expiredIndices.has(i);
              return (
                <button
                  key={qi.id}
                  onClick={() => handleGoToQuestion(i)}
                  disabled={disabled}
                  className={cn(
                    'w-full h-10 rounded text-xs font-medium transition-colors border-2',
                    disabled
                      ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                      : current  ? 'border-blue-600 bg-blue-600 text-white' :
                        flagged  ? 'border-yellow-400 bg-yellow-50 text-yellow-700' :
                        answered ? 'border-green-400 bg-green-50 text-green-700' :
                        'border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                >
                  {flagged && <span className="block text-yellow-500">🚩</span>}
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Question */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="outline" className="capitalize text-xs">{q.type.replace('_', ' ')}</Badge>
                  <Badge
                    variant={q.difficulty === 'easy' ? 'success' : q.difficulty === 'medium' ? 'warning' : 'danger'}
                    className="capitalize text-xs"
                  >
                    {q.difficulty}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{q.marks} marks</span>
                  {q.required && <Badge variant="danger" className="text-xs">Required</Badge>}
                  {isSequential && (
                    <Badge variant="info" className="text-xs">Sequential</Badge>
                  )}
                  {!!q.timeLimitSeconds && (
                    <ItemCountdownBadge
                      key={q.id}
                      limitSeconds={q.timeLimitSeconds}
                      paused={paused}
                      onExpire={handleItemExpire}
                    />
                  )}
                </div>
                <p className="text-base font-medium text-gray-900">
                  Q{currentQuestionIndex + 1}. {q.stem}
                </p>
              </div>
              <button
                onClick={() => flagQuestion(q.id)}
                className={cn(
                  'p-2 rounded hover:bg-muted transition-colors shrink-0',
                  flaggedQuestions.has(q.id) ? 'text-yellow-500' : 'text-gray-300'
                )}
                title="Flag for review"
              >
                <Flag className="h-5 w-5" />
              </button>
            </div>

            {/* MCQ / True-False */}
            {(q.type === 'mcq' || q.type === 'true_false') && q.options && (
              <div className="space-y-2">
                {q.options.map(opt => (
                  <label key={opt.id} className={cn(
                    'flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                    answers[q.id] === opt.id ? 'border-blue-600 bg-blue-50' : 'hover:border-gray-300 hover:bg-gray-50'
                  )}>
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswer(q.id, opt.id)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="text-sm">{opt.text}</span>
                  </label>
                ))}
              </div>
            )}

            {/* MRQ */}
            {q.type === 'mrq' && q.options && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Select all that apply</p>
                {q.options.map(opt => {
                  const current = (answers[q.id] as string[] | undefined) ?? [];
                  const checked = current.includes(opt.id);
                  return (
                    <label key={opt.id} className={cn(
                      'flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                      checked ? 'border-blue-600 bg-blue-50' : 'hover:border-gray-300 hover:bg-gray-50'
                    )}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const newArr = checked
                            ? current.filter(id => id !== opt.id)
                            : [...current, opt.id];
                          setAnswer(q.id, newArr);
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Short answer */}
            {q.type === 'short_answer' && (
              <input
                type="text"
                placeholder="Type your answer..."
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {/* Essay */}
            {q.type === 'essay' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Essay questions are manually graded by your teacher.</p>
                <textarea
                  placeholder="Write your answer here..."
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  rows={8}
                  className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {/* Fill blank */}
            {q.type === 'fill_blank' && (
              <input
                type="text"
                placeholder="Fill in the blank..."
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {/* Matching — new format: left column + shuffled right dropdown */}
            {q.type === 'matching' && q.options && q.matchingChoices && (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center text-xs font-medium text-muted-foreground mb-1 px-1">
                  <span>Term</span><span /><span>Match</span>
                </div>
                {q.options.map(opt => {
                  const matchMap = (answers[q.id] as unknown as Record<string, string> | undefined) ?? {};
                  const selected = matchMap[opt.id] ?? '';
                  return (
                    <div key={opt.id} className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center">
                      <div className="rounded-lg border bg-gray-50 px-4 py-3 text-sm font-medium truncate">{opt.text}</div>
                      <span className="text-gray-400 text-xs">→</span>
                      <select
                        value={selected}
                        onChange={e => {
                          const cur = (answers[q.id] as unknown as Record<string, string> | undefined) ?? {};
                          setAnswer(q.id, { ...cur, [opt.id]: e.target.value });
                        }}
                        className={cn(
                          'w-full rounded-lg border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
                          selected ? 'border-blue-400' : 'border-gray-200 text-muted-foreground',
                        )}
                      >
                        <option value="">— select —</option>
                        {q.matchingChoices!.map(choice => (
                          <option key={choice} value={choice}>{choice}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Matching — legacy format (full pair in text, old data) */}
            {q.type === 'matching' && q.options && !q.matchingChoices && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Select all correct matches</p>
                {q.options.map(opt => {
                  const selected = ((answers[q.id] as string[] | undefined) ?? []).includes(opt.id);
                  return (
                    <label key={opt.id} className={cn(
                      'flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                      selected ? 'border-blue-600 bg-blue-50' : 'hover:border-gray-300 hover:bg-gray-50'
                    )}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const cur = (answers[q.id] as string[] | undefined) ?? [];
                          const next = selected ? cur.filter(id => id !== opt.id) : [...cur, opt.id];
                          setAnswer(q.id, next);
                        }}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Ordering */}
            {q.type === 'ordering' && q.options && (
              <OrderingQuestion
                questionId={q.id}
                options={q.options}
                answers={answers}
                setAnswer={setAnswer}
              />
            )}

            {/* Coding challenge */}
            {q.type === 'coding' && (
              <CodeQuestion
                question={q as unknown as Question}
                value={(answers[q.id] as string) ?? (q.starterCode ?? '')}
                onChange={code => setAnswer(q.id, code)}
              />
            )}

            {/* File upload */}
            {q.type === 'file_upload' && (
              <FileUploadQuestion
                question={q as unknown as Question}
                value={fileAnswers[q.id] ?? null}
                onChange={file => setFileAnswers(prev => ({ ...prev, [q.id]: file }))}
              />
            )}
          </div>
        </main>

        {/* Right panel — progress */}
        <aside className="w-48 border-s bg-white flex-shrink-0 hidden lg:flex flex-col p-4">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Progress</p>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{answeredCount}/{questions.length} answered</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-blue-600" /> Current</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-green-200 border border-green-400" /> Answered</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-yellow-100 border border-yellow-400" /> Flagged</div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-gray-100 border border-gray-200" /> Not visited</div>
            </div>
            {isSequential && (
              <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">Sequential mode — questions must be answered in order.</p>
            )}
          </div>
          <div className="mt-auto">
            <Button onClick={() => setShowSubmitModal(true)} className="w-full" disabled={submitting}>
              {submitting ? 'Submitting...' : isSectioned ? 'Submit Section' : 'Submit Exam'}
            </Button>
          </div>
        </aside>
      </div>

      {/* Bottom nav */}
      <footer className="bg-white border-t px-4 py-3 flex items-center justify-between">
        {!forwardOnly ? (
          <Button
            variant="outline"
            onClick={prevQuestion}
            disabled={currentQuestionIndex === 0 || expiredIndices.has(currentQuestionIndex - 1)}
            className="gap-2"
            title={expiredIndices.has(currentQuestionIndex - 1) ? 'The time limit for the previous question has expired.' : undefined}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
        ) : (
          <div /> // spacer to keep layout
        )}
        <span className="text-sm text-muted-foreground">{currentQuestionIndex + 1} / {questions.length}</span>
        {currentQuestionIndex < questions.length - 1 ? (
          <Button
            onClick={handleNextClick}
            disabled={!!isRequired}
            className="gap-2"
            title={isRequired ? 'This question is required — please answer before continuing.' : undefined}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => setShowSubmitModal(true)}
            className="gap-2 lg:hidden"
            disabled={submitting}
          >
            {isSectioned ? 'Submit Section' : 'Submit'}
          </Button>
        )}
      </footer>

      {/* Submit modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isSectioned ? `Submit ${currentSection?.title ?? 'Section'}?` : 'Submit Exam?'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions
              {isSectioned ? ' in this section' : ''}.
            </p>
            {flaggedQuestions.size > 0 && (
              <p className="text-sm text-yellow-600">⚠️ You have {flaggedQuestions.size} flagged question(s) for review.</p>
            )}
            {answeredCount < questions.length && (
              <p className="text-sm text-red-600">
                {questions.length - answeredCount} question(s) unanswered will be marked as skipped.
              </p>
            )}
            {isSectioned && !!settings?.isSectionSequential && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                This exam locks completed sections — once submitted, you cannot return to this section.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>{isSectioned ? 'Continue Section' : 'Continue Exam'}</Button>
            <Button onClick={handleSubmitConfirm} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Confirm Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DesktopGuard>
  );
}

// ── Ordering sub-component ──────────────────────────────────────────────────
interface OrderingProps {
  questionId: string;
  options: { id: string; text: string }[];
  answers: Record<string, string | string[] | Record<string, string>>;
  setAnswer: (qId: string, value: string | string[] | Record<string, string>) => void;
}

function OrderingQuestion({ questionId, options, answers, setAnswer }: OrderingProps) {
  const savedOrder = (answers[questionId] as string[] | undefined) ?? options.map(o => o.id);

  function move(index: number, direction: -1 | 1) {
    const next = [...savedOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setAnswer(questionId, next);
  }

  const orderedOptions = savedOrder.map(id => options.find(o => o.id === id)!).filter(Boolean);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Drag or use the arrows to arrange in the correct order</p>
      {orderedOptions.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-2 p-3 border rounded-lg bg-white">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
            {i + 1}
          </span>
          <span className="flex-1 text-sm">{opt.text}</span>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4 text-gray-500" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === orderedOptions.length - 1}
              className="rounded p-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
