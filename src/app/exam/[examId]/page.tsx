'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExamById, getQuestionsForStudent } from '@/lib/data';
import type { Exam, PublicQuestion } from '@/types';
import { useExamStore } from '@/store/examStore';
import { useProctoringStore } from '@/store/proctoringStore';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useExamTimer } from '@/hooks/useExamTimer';
import { ProctoringOverlay } from '@/components/proctoring/ProctoringOverlay';
import { DesktopGuard } from '@/components/shared/DesktopGuard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Flag, ChevronLeft, ChevronRight, Clock, ChevronUp, ChevronDown } from 'lucide-react';
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

  // Load exam + questions + start/rehydrate attempt
  useEffect(() => {
    async function load() {
      const [e, q] = await Promise.all([getExamById(examId), getQuestionsForStudent(examId)]);
      if (!e) return;
      setExam(e);
      setCurrentExam(e);
      setQuestions(q);

      // Rehydrate or create attempt
      const stored = sessionStorage.getItem(SESSION_KEY(examId));
      let session: AttemptSession;

      if (stored) {
        session = JSON.parse(stored) as AttemptSession;
      } else {
        const studentId = user?.id ?? 'anonymous';
        const res = await fetch('/api/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ examId, studentId }),
        });
        const attempt = await res.json() as { id: string; startedAt: string };
        session = { attemptId: attempt.id, startedAt: attempt.startedAt };
        sessionStorage.setItem(SESSION_KEY(examId), JSON.stringify(session));
      }

      setAttemptId(session.attemptId);
      // Calculate remaining seconds accounting for elapsed time
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(session.startedAt).getTime()) / 1000
      );
      const remaining = Math.max(0, e.duration * 60 - elapsedSeconds);
      setInitialSeconds(remaining);
    }

    load();
    return () => { resetExam(); };
  }, [examId, resetExam, setCurrentExam, user?.id]);

  // Submit answers to backend then navigate
  const doSubmit = useCallback(async () => {
    if (submitting || !exam) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId,
          answers,
          violationCount,
          trustScore,
        }),
      });
      const result = await res.json() as { score: number; totalMarks: number; scorePercentage: number };
      sessionStorage.removeItem(SESSION_KEY(examId));
      router.push(
        `/exam/${examId}/complete?score=${result.score}&total=${result.totalMarks}&pct=${result.scorePercentage}`
      );
    } catch {
      // On network error still navigate so student isn't stuck
      sessionStorage.removeItem(SESSION_KEY(examId));
      router.push(`/exam/${examId}/complete?score=0&total=0&pct=0`);
    }
  }, [submitting, exam, attemptId, examId, answers, violationCount, trustScore, router]);

  const handleTimeUp = useCallback(() => { void doSubmit(); }, [doSubmit]);
  const { timeRemaining, isLow } = useExamTimer(initialSeconds, handleTimeUp);

  function handleSubmitConfirm() {
    setShowSubmitModal(false);
    void doSubmit();
  }

  if (!exam || questions.length === 0 || initialSeconds === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading exam...</p>
      </div>
    );
  }

  const q = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  return (
    <DesktopGuard>
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ProctoringOverlay examId={examId} attemptId={attemptId || 'attempt-loading'} />

      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-gray-900">{exam.title}</h1>
          <p className="text-xs text-muted-foreground">{exam.subject}</p>
        </div>
        <div className={cn(
          'flex items-center gap-2 font-mono font-bold text-lg px-3 py-1 rounded-lg',
          isLow ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
        )}>
          <Clock className="h-4 w-4" />
          {timeRemaining}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Question Navigator */}
        <aside className="w-20 border-e bg-white flex-shrink-0 overflow-y-auto hidden sm:block">
          <div className="p-2 space-y-1.5">
            {questions.map((qi, i) => {
              const answered = !!answers[qi.id];
              const flagged = flaggedQuestions.has(qi.id);
              const current = i === currentQuestionIndex;
              return (
                <button
                  key={qi.id}
                  onClick={() => goToQuestion(i)}
                  className={cn(
                    'w-full h-10 rounded text-xs font-medium transition-colors border-2',
                    current ? 'border-blue-600 bg-blue-600 text-white' :
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
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="capitalize text-xs">{q.type.replace('_', ' ')}</Badge>
                  <Badge
                    variant={q.difficulty === 'easy' ? 'success' : q.difficulty === 'medium' ? 'warning' : 'danger'}
                    className="capitalize text-xs"
                  >
                    {q.difficulty}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{q.marks} marks</span>
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

            {/* Matching — select which pairs are correct */}
            {q.type === 'matching' && q.options && (
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

            {/* Ordering — reorder with up/down buttons */}
            {q.type === 'ordering' && q.options && (
              <OrderingQuestion
                questionId={q.id}
                options={q.options}
                answers={answers}
                setAnswer={setAnswer}
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
        <Button variant="outline" onClick={prevQuestion} disabled={currentQuestionIndex === 0} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="text-sm text-muted-foreground">{currentQuestionIndex + 1} / {questions.length}</span>
        {currentQuestionIndex < questions.length - 1 ? (
          <Button onClick={nextQuestion} className="gap-2">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setShowSubmitModal(true)} className="gap-2 lg:hidden" disabled={submitting}>
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
  answers: Record<string, string | string[]>;
  setAnswer: (qId: string, value: string | string[]) => void;
}

function OrderingQuestion({ questionId, options, answers, setAnswer }: OrderingProps) {
  // Initialise order from saved answer, or default to given order
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
