'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getStudentsForExam, getViolations, getScoreDistribution, getQuestionDifficulty } from '@/lib/data';
import type { Exam, CurrentUser, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const PASS_COLORS = ['#22c55e', '#ef4444'];

export default function ResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  type StudentResult = CurrentUser & { score: number; trustScore: number; violationCount: number };

  const [exam, setExam] = useState<Exam | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [scoreDist, setScoreDist] = useState<{ range: string; count: number }[]>([]);
  const [diffData, setDiffData] = useState<{ difficulty: string; correct: number; incorrect: number }[]>([]);
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);

  useEffect(() => {
    Promise.all([
      getExamById(examId),
      getStudentsForExam(examId),
      getViolations(examId),
      getScoreDistribution(examId),
      getQuestionDifficulty(examId),
    ]).then(([e, s, v, sd, dd]) => {
      setExam(e ?? null);
      setViolations(v);
      setScoreDist(sd);
      setDiffData(dd);
      setStudentResults(
        s.slice(0, 10).map(student => ({
          ...student,
          score: Math.floor(50 + Math.random() * 50),
          trustScore: Math.floor(60 + Math.random() * 40),
          violationCount: v.filter(vio => vio.studentId === student.id).length,
        }))
      );
    });
  }, [examId]);

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  const passed = studentResults.filter(s => s.score >= exam.passingMarks).length;
  const passData = [
    { name: 'Pass', value: passed },
    { name: 'Fail', value: studentResults.length - passed },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{exam.title}</h2>
        <p className="text-sm text-muted-foreground">{exam.subject} · Passing: {exam.passingMarks}/{exam.totalMarks}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: studentResults.length },
          { label: 'Passed', value: passed },
          { label: 'Pass Rate', value: `${Math.round(passed / Math.max(studentResults.length, 1) * 100)}%` },
          { label: 'Total Violations', value: violations.length },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Score Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreDist}>
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pass / Fail</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <PieChart width={200} height={200}>
              <Pie data={passData} cx={100} cy={100} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {passData.map((_, i) => <Cell key={i} fill={PASS_COLORS[i]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </CardContent>
        </Card>
      </div>

      {/* Question difficulty */}
      <Card>
        <CardHeader><CardTitle>Question Difficulty Performance</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={diffData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="difficulty" type="category" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="correct" name="Correct %" fill="#22c55e" radius={[0, 4, 4, 0]} />
              <Bar dataKey="incorrect" name="Incorrect %" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-student table */}
      <Card>
        <CardHeader><CardTitle>Student Results</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Trust Score</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Violations</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {studentResults.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">{s.score}/{exam.totalMarks}</td>
                    <td className="px-4 py-3">
                      <span className={s.trustScore < 60 ? 'text-red-600' : 'text-green-600'}>
                        {s.trustScore}%
                      </span>
                    </td>
                    <td className="px-4 py-3">{s.violationCount}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.score >= exam.passingMarks ? 'success' : 'danger'}>
                        {s.score >= exam.passingMarks ? 'Pass' : 'Fail'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
