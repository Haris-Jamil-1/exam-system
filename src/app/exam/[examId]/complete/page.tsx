'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Shield, AlertTriangle, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useProctoringStore } from '@/store/proctoringStore';

export default function ExamCompletePage() {
  const params = useSearchParams();
  const score = Number(params.get('score') ?? 0);
  const total = Number(params.get('total') ?? 0);
  const pct   = Number(params.get('pct')   ?? 0);

  const { violationCount, trustScore } = useProctoringStore();

  const scoreColor = pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
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

        {/* Score card */}
        {total > 0 && (
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
              <p className="text-xs text-muted-foreground text-center bg-yellow-50 rounded p-2">
                Note: Essay questions require manual grading by your teacher.
                Final score may be higher once essays are graded.
              </p>
            </CardContent>
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
  );
}
