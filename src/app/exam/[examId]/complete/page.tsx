'use client';
// Phase 2: held=1 state comes from exam.settings.resultsVisibility stored in DB
// Teacher publishes via PATCH /api/exams/[id]/publish-results → sets resultsPublishedAt
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Shield, AlertTriangle, Trophy, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useProctoringStore } from '@/store/proctoringStore';
import { DesktopGuard } from '@/components/shared/DesktopGuard';

type PerQuestionResult = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  marksAwarded: number;
};

export default function ExamCompletePage() {
  const { examId } = useParams<{ examId: string }>();
  const params = useSearchParams();
  const score = Number(params.get('score') ?? 0);
  const total = Number(params.get('total') ?? 0);
  const pct   = Number(params.get('pct')   ?? 0);
  const held  = params.get('held') === '1';

  const { violationCount, trustScore } = useProctoringStore();
  const [perQuestion, setPerQuestion] = useState<PerQuestionResult[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    const key = `exam_result_${examId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setPerQuestion(JSON.parse(stored) as PerQuestionResult[]);
      sessionStorage.removeItem(key);
    }
  }, [examId]);

  const scoreColor = pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';
  const needsGrading = perQuestion.some(q => q.type === 'essay' || q.type === 'coding' || q.type === 'file_upload');

  return (
    <DesktopGuard>
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex h-20 w-20 rounded-full bg-green-100 items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Exam Submitted!</h1>
          <p className="text-muted-foreground mt-2">
            Your answers have been recorded and scored.
          </p>
        </div>

        {/* Held results banner */}
        {held && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 space-y-3 text-center">
              <Clock className="h-10 w-10 text-amber-500 mx-auto" />
              <p className="font-semibold text-amber-800">Results Pending Review</p>
              <p className="text-sm text-amber-700">
                Your teacher has chosen to review submissions before publishing results.
                You will be notified when your results are available.
              </p>
              <p className="text-xs text-amber-600 italic">Check &ldquo;My Results&rdquo; later to see your score.</p>
            </CardContent>
          </Card>
        )}

        {/* Score card */}
        {!held && total > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium">Your Score</span>
                </div>
                <span className={`font-bold text-2xl ${scoreColor}`}>
                  {score}/{total}
                </span>
              </div>
              <Progress value={pct} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">
                {pct}% — {pct >= 70 ? 'Pass' : 'Needs improvement'}
              </p>
              {needsGrading && (
                <p className="text-xs text-muted-foreground text-center bg-yellow-50 rounded p-2">
                  Essay / coding questions require manual grading. Final score may be higher once graded.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Per-question breakdown */}
        {!held && perQuestion.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <button
                onClick={() => setShowBreakdown(b => !b)}
                className="flex items-center justify-between w-full text-start"
              >
                <CardTitle className="text-sm font-semibold">Question Breakdown</CardTitle>
                {showBreakdown
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showBreakdown && (
              <CardContent className="pt-0 space-y-2 max-h-80 overflow-y-auto">
                {perQuestion.map((q, i) => {
                  const earned = q.marksAwarded;
                  const full = q.marks;
                  const isPending = (q.type === 'essay' || q.type === 'coding' || q.type === 'file_upload');
                  const pctQ = full > 0 ? Math.round((earned / full) * 100) : 0;
                  return (
                    <div key={q.questionId} className="flex items-start gap-3 py-2 border-b last:border-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 mt-0.5">Q{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 leading-snug line-clamp-2">{q.stem}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs capitalize text-muted-foreground">{q.type.replace('_', ' ')}</span>
                          {!isPending && (
                            <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pctQ >= 70 ? 'bg-green-500' : pctQ >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                style={{ width: `${pctQ}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold shrink-0 ${isPending ? 'text-muted-foreground' : pctQ === 100 ? 'text-green-600' : pctQ > 0 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {isPending ? 'Pending' : `${earned} / ${full}`}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        )}

        {/* Trust score card */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium">Integrity Score</span>
                </div>
                <span className={`font-bold text-lg ${
                  trustScore >= 80 ? 'text-green-600' : trustScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {trustScore}%
                </span>
              </div>
              <Progress value={trustScore} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {trustScore >= 80
                  ? 'Excellent integrity score'
                  : trustScore >= 60
                  ? 'Good — some violations detected'
                  : 'Low trust score — multiple violations recorded'}
              </p>
            </div>

            {violationCount > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">Violations Recorded</span>
                </div>
                <p className="text-xs text-yellow-700">
                  {violationCount} proctoring violation{violationCount !== 1 ? 's' : ''} were detected.
                  These have been logged and will be reviewed by your teacher.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Link href="/student">
            <Button className="w-full">Return to Dashboard</Button>
          </Link>
          <Link href="/student/results">
            <Button variant="outline" className="w-full">View My Results</Button>
          </Link>
        </div>
      </div>
    </div>
    </DesktopGuard>
  );
}
