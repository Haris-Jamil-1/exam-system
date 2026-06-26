'use client';
// Phase 2: sequential/forwardOnly/autoAdvance enforced server-side via ExamSession
// Phase 3: biometric onboarding uses real face-api.js capture
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExamById, getQuestionsForStudent } from '@/lib/data';
import type { Exam, PublicQuestion, Question } from '@/types';
import { useExamStore } from '@/store/examStore';
import { useProctoringStore } from '@/store/proctoringStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useExamTimer } from '@/hooks/useExamTimer';
import { ProctoringOverlay } from '@/components/proctoring/ProctoringOverlay';
import { BiometricOnboarding } from '@/components/proctoring/BiometricOnboarding';
import { CodeQuestion } from '@/components/exam/CodeQuestion';
import { FileUploadQuestion } from '@/components/exam/FileUploadQuestion';
import { DesktopGuard } from '@/components/shared/DesktopGuard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Flag, ChevronLeft, ChevronRight, Clock, ChevronUp, ChevronDown, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const SESSION_KEY = (examId: string) => `exam_attempt_${examId}`;

interface AttemptSession {
  attemptId: string;
  startedAt: string;
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
  // Pause overlay
  const [paused, setPaused] = useState(false);
  // File upload answers stored separately (File objects can't go into Zustand string answers)
  const [fileAnswers, setFileAnswers] = useState<Record<string, File | null>>({});

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
  const isSequential = settings?.navigationMode === 'sequential';
  const forwardOnly  = isSequential && !!settings?.forwardOnly;
  const autoAdvance  = !!settings?.autoAdvance;
  const allowPause   = settings?.allowPause !== false; // default true

  // Load exam + questions; check start time before creating attempt
  useEffect(() => {
    async function load() {
      const [[e, q], timeRes] = await Promise.all([
        Promise.all([getExamById(examId), getQuestionsForStudent(examId)]),
        fetch('/api/time').then(r => r.json() as Promise<{ now: number }>),
      ]);
      if (!e) return;

      const offset = timeRes.now - Date.now(); // positive = client behind server
      setServerOffset(offset);
      setExam(e);
      setCurrentExam(e);
      setQuestions(q);

      const serverNow = Date.now() + offset;
      const startMs = new Date(e.startTime).getTime();

      // Show waiting room only when the exam hasn't been manually started by the teacher
      // AND the scheduled startTime hasn't been reached yet.
      // If status is already 'live', the teacher started it early — let the student in immediately.
      if (e.status !== 'live' && startMs > serverNow) {
        setWaitSeconds(Math.ceil((startMs - serverNow) / 1000));
        return;
      }

      await beginAttempt(e, offset);
    }

    async function beginAttempt(e: Exam, offset: number) {
      const stored = sessionStorage.getItem(SESSION_KEY(examId));
      let session: AttemptSession;

      if (stored) {
        session = JSON.parse(stored) as AttemptSession;
      } else {
        const res = await fetch('/api/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examId }),
        });
        const attempt = await res.json() as { id: string; startedAt: string };
        session = { attemptId: attempt.id, startedAt: attempt.startedAt };
        sessionStorage.setItem(SESSION_KEY(examId), JSON.stringify(session));
      }

      setAttemptId(session.attemptId);

      // Use endTime - serverNow so the timer is anchored to the scheduled end, not duration
      const serverNow = Date.now() + offset;
      const endMs = new Date(e.endTime).getTime();
      const remaining = Math.max(0, Math.floor((endMs - serverNow) / 1000));
      setInitialSeconds(remaining);

      if (e.settings.proctoringLevel !== 'strict') {
        setBiometricDone(true);
      }
    }

    load();
    return () => { resetExam(); };
  }, [examId, resetExam, setCurrentExam, user?.id]); // eslint-disable-line

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
      // Store per-question breakdown for the completion page
      if (submitResult.perQuestion) {
        sessionStorage.setItem(`exam_result_${examId}`, JSON.stringify(submitResult.perQuestion));
      }
      const heldParam = exam.settings.resultsVisibility === 'held' ? '&held=1' : '';
      router.push(
        `/exam/${examId}/complete?score=${submitResult.score}&total=${submitResult.totalMarks}&pct=${submitResult.scorePercentage}${heldParam}`
      );
    } catch {
      sessionStorage.removeItem(SESSION_KEY(examId));
      router.push(`/exam/${examId}/complete?score=0&total=0&pct=0`);
    }
  }, [submitting, exam, attemptId, examId, answers, fileAnswers, violationCount, trustScore, router]);

  const handleTimeUp = useCallback(() => { void doSubmit(); }, [doSubmit]);
  const { timeRemaining, isLow } = useExamTimer(initialSeconds, handleTimeUp, paused);

  function handleSubmitConfirm() {
    setShowSubmitModal(false);
    void doSubmit();
  }

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
    return <BiometricOnboarding onComplete={() => setBiometricDone(true)} />;
  }

  if (!exam || questions.length === 0 || !attemptId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading exam...</p>
      </div>
    );
  }

  const q = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length + Object.values(fileAnswers).filter(Boolean).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const currentAnswered = answers[q.id] !== undefined || fileAnswers[q.id] !== undefined;
  const isRequired = q.required && !currentAnswered;

  function handleGoToQuestion(i: number) {
    if (isSequential && Math.abs(i - currentQuestionIndex) > 1) return;
    if (forwardOnly && i < currentQuestionIndex) return;
    goToQuestion(i);
  }

  return (
    <DesktopGuard>
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ProctoringOverlay examId={examId} attemptId={attemptId || 'attempt-loading'} />

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
          <p className="text-xs text-muted-foreground">{exam.subject}</p>
        </div>
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
                (forwardOnly && i < currentQuestionIndex);
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
              {submitting ? 'Submitting...' : 'Submit Exam'}
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
            disabled={currentQuestionIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
        ) : (
          <div /> // spacer to keep layout
        )}
        <span className="text-sm text-muted-foreground">{currentQuestionIndex + 1} / {questions.length}</span>
        {currentQuestionIndex < questions.length - 1 ? (
          <Button
            onClick={nextQuestion}
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
            Submit
          </Button>
        )}
      </footer>

      {/* Submit modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Exam?</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
            </p>
            {flaggedQuestions.size > 0 && (
              <p className="text-sm text-yellow-600">⚠️ You have {flaggedQuestions.size} flagged question(s) for review.</p>
            )}
            {answeredCount < questions.length && (
              <p className="text-sm text-red-600">
                {questions.length - answeredCount} question(s) unanswered will be marked as skipped.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>Continue Exam</Button>
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
