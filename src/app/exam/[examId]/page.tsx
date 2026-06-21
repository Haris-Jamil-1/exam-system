'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getExamById, getQuestions } from '@/lib/data';
import type { Exam, Question } from '@/types';
import { useExamStore } from '@/store/examStore';
import { useExamTimer } from '@/hooks/useExamTimer';
import { ProctoringOverlay } from '@/components/proctoring/ProctoringOverlay';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Flag, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

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

  useEffect(() => {
    Promise.all([getExamById(examId), getQuestions(examId)]).then(([e, q]) => {
      if (e) {
        setExam(e);
        setCurrentExam(e);
        setQuestions(q);
      }
    });
    return () => { resetExam(); };
  }, [examId, resetExam, setCurrentExam]);

  const handleTimeUp = useCallback(() => {
    router.push(`/exam/${examId}/complete`);
  }, [examId, router]);

  const { timeRemaining, isLow } = useExamTimer(exam?.duration ?? 60, handleTimeUp);

  function handleSubmit() {
    router.push(`/exam/${examId}/complete`);
  }

  if (!exam || questions.length === 0) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Proctoring */}
      <ProctoringOverlay examId={examId} attemptId="attempt-mock" />

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
        {/* Question Navigator - Left sidebar */}
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
                    flagged ? 'border-yellow-400 bg-yellow-50 text-yellow-700' :
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

        {/* Main Question Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Question header */}
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

            {/* MCQ */}
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
              <textarea
                placeholder="Write your answer here..."
                value={(answers[q.id] as string) ?? ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                rows={8}
                className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
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
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-600" /> Current
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-green-200 border border-green-400" /> Answered
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-yellow-100 border border-yellow-400" /> Flagged
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-gray-100 border border-gray-200" /> Not visited
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <Button
              onClick={() => setShowSubmitModal(true)}
              className="w-full"
            >
              Submit Exam
            </Button>
          </div>
        </aside>
      </div>

      {/* Bottom nav */}
      <footer className="bg-white border-t px-4 py-3 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevQuestion}
          disabled={currentQuestionIndex === 0}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>

        <span className="text-sm text-muted-foreground">
          {currentQuestionIndex + 1} / {questions.length}
        </span>

        {currentQuestionIndex < questions.length - 1 ? (
          <Button onClick={nextQuestion} className="gap-2">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setShowSubmitModal(true)} className="gap-2 lg:hidden">
            Submit
          </Button>
        )}
      </footer>

      {/* Submit modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Exam?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
            </p>
            {flaggedQuestions.size > 0 && (
              <p className="text-sm text-yellow-600">
                ⚠️ You have {flaggedQuestions.size} flagged question(s) for review.
              </p>
            )}
            {answeredCount < questions.length && (
              <p className="text-sm text-red-600">
                {questions.length - answeredCount} question(s) unanswered will be marked as skipped.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>
              Continue Exam
            </Button>
            <Button onClick={handleSubmit}>
              Confirm Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
