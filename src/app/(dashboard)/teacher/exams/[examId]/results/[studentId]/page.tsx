'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getStudentSubmissionDetail } from '@/lib/data/students';
import type { StudentSubmissionDetail } from '@/lib/data/students';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GradingPanel } from '@/components/grading/GradingPanel';
import { CheckCircle2, XCircle, HelpCircle, CheckCheck } from 'lucide-react';

export default function StudentSubmissionPage() {
  const { examId, studentId } = useParams<{ examId: string; studentId: string }>();
  const [detail, setDetail] = useState<StudentSubmissionDetail | null | undefined>(undefined);
  const [approving, setApproving] = useState(false);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);

  useEffect(() => {
    getStudentSubmissionDetail(examId, studentId).then(d => setDetail(d ?? null));
  }, [examId, studentId]);

  if (detail === undefined) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (detail === null) return <div className="text-center py-12 text-muted-foreground">Submission not found.</div>;

  const { student, exam, attempt, answers, sections } = detail;
  const isSectioned = sections.length > 0;
  const unmodifiedPendingCount = answers.filter(a => a.gradingStatus === 'ai_suggested').length;

  async function handleApproveAll() {
    if (!attempt) return;
    setApproving(true);
    setApproveMessage(null);
    try {
      const res = await fetch(`/api/grading/attempts/${attempt.id}/bulk-approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Approve all failed');
      setApproveMessage(`Approved ${data.approved} — ${data.alreadyFinalized} already finalized, ${data.notReady} not ready yet.`);
      void getStudentSubmissionDetail(examId, studentId).then(d => setDetail(d ?? null));
    } catch (err) {
      setApproveMessage(err instanceof Error ? err.message : 'Approve all failed');
    } finally {
      setApproving(false);
    }
  }

  // Group answers by section, preserving the exam's section order; a null sectionId
  // (non-sectioned exam, or a question created before sections existed) falls into
  // a single unlabeled group rendered exactly like the old flat list.
  const groups: { sectionId: string | null; title: string | null; answers: typeof answers }[] = isSectioned
    ? [
        ...sections.map(s => ({ sectionId: s.sectionId, title: s.title, answers: answers.filter(a => a.sectionId === s.sectionId) })),
        ...(answers.some(a => a.sectionId === null) ? [{ sectionId: null, title: 'Unsectioned', answers: answers.filter(a => a.sectionId === null) }] : []),
      ]
    : [{ sectionId: null, title: null, answers }];

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

      {isSectioned && (
        <Card>
          <CardHeader><CardTitle>Section Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sections.map(s => (
              <div key={s.sectionId} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                <span className="font-medium">{s.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{s.sectionWeight}% weight</span>
                  {s.passingThreshold !== null && (
                    <Badge variant={s.passed === false ? 'destructive' : 'outline'} className="text-xs">
                      pass ≥ {s.passingThreshold}%{s.passed === false ? ' — not met' : ''}
                    </Badge>
                  )}
                  <span className="font-semibold">{s.score ?? 0}/{s.totalMarks ?? 0} ({Math.round(s.scorePercentage ?? 0)}%)</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Answer Review</CardTitle>
            {isSectioned && (
              <p className="text-xs text-muted-foreground">
                This student&apos;s question set may differ from other students&apos; if the exam uses pooled/randomized questions — grouped below by the section each question belongs to.
              </p>
            )}
          </div>
          {unmodifiedPendingCount > 0 && (
            <div className="text-end">
              <Button size="sm" disabled={approving} onClick={() => void handleApproveAll()}>
                <CheckCheck className="h-3.5 w-3.5 me-1" /> Approve All ({unmodifiedPendingCount})
              </Button>
              {approveMessage && <p className="text-xs text-muted-foreground mt-1">{approveMessage}</p>}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {answers.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No questions in this exam.</p>
          )}
          {groups.map(group => (
            <div key={group.sectionId ?? '__none__'} className="space-y-3">
              {isSectioned && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
              )}
              {group.answers.map((a, i) => {
                // Graded (confirmed/overridden) essay/coding answers show their real
                // mark; anything still in the grading pipeline shows Pending.
                const gradingResolved = a.gradingStatus === 'confirmed' || a.gradingStatus === 'overridden';
                const isPending = (a.type === 'essay' || a.type === 'coding' || a.type === 'file_upload') && !gradingResolved;
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
                    {a.answerId && a.gradingStatus && (
                      <GradingPanel
                        answerId={a.answerId}
                        maxMarks={a.marks}
                        gradingStatus={a.gradingStatus}
                        suggestion={a.suggestion}
                        onChanged={() => void getStudentSubmissionDetail(examId, studentId).then(d => setDetail(d ?? null))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
