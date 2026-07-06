'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getStudentSubmissionDetail } from '@/lib/data/students';
import type { StudentSubmissionDetail } from '@/lib/data/students';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

export default function StudentSubmissionPage() {
  const { examId, studentId } = useParams<{ examId: string; studentId: string }>();
  const [detail, setDetail] = useState<StudentSubmissionDetail | null | undefined>(undefined);

  useEffect(() => {
    getStudentSubmissionDetail(examId, studentId).then(d => setDetail(d ?? null));
  }, [examId, studentId]);

  if (detail === undefined) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (detail === null) return <div className="text-center py-12 text-muted-foreground">Submission not found.</div>;

  const { student, exam, attempt, answers } = detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/exams" className="hover:text-[#1A1D23] transition-colors">Exams</Link>
        <span className="select-none">›</span>
        <Link href={`/teacher/exams/${examId}/results`} className="hover:text-[#1A1D23] transition-colors">{exam.title}</Link>
        <span className="select-none">›</span>
        <span className="font-medium text-[#1A1D23]">{student.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{student.name}</h2>
          <p className="text-sm text-muted-foreground">{student.email} · {exam.title}</p>
        </div>
        {attempt ? (
          <div className="text-end">
            <p className="text-2xl font-bold">
              {attempt.score ?? 0}/{attempt.totalMarks ?? exam.totalMarks}
            </p>
            <p className="text-xs text-muted-foreground">
              {attempt.scorePercentage ?? 0}% · {attempt.status === 'submitted' || attempt.status === 'auto_submitted' ? 'Submitted' : 'In progress'}
            </p>
          </div>
        ) : (
          <Badge variant="outline">Not attempted</Badge>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Answer Review</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {answers.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No questions in this exam.</p>
          )}
          {answers.map((a, i) => {
            const isPending = a.type === 'essay' || a.type === 'coding' || a.type === 'file_upload';
            const statusIcon = isPending
              ? <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
              : a.isCorrect
              ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              : <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
            return (
              <div key={a.questionId} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {statusIcon}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Q{i + 1}. {a.stem}</p>
                      <span className="text-xs capitalize text-muted-foreground">{a.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">
                    {isPending ? 'Pending' : `${a.marksAwarded ?? 0}/${a.marks}`}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 ps-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Student&apos;s answer</p>
                    <p className="text-sm break-words">{a.studentAnswer}</p>
                  </div>
                  {!isPending && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Correct answer</p>
                      <p className="text-sm break-words">{a.correctAnswer}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
