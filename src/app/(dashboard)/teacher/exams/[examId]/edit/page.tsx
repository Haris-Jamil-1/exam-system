'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getExamById, getQuestions, createQuestion, updateQuestion, deleteQuestion, updateExam } from '@/lib/data';
import type { Exam, Question, QuestionType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, Save, Radio, CalendarCheck, CheckCircle2, ChevronRight } from 'lucide-react';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'mrq', label: 'Multiple Response' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'essay', label: 'Essay' },
  { value: 'fill_blank', label: 'Fill in the Blank' },
];

export default function EditExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newType, setNewType] = useState<QuestionType>('mcq');
  const [newStem, setNewStem] = useState('');
  const [newMarks, setNewMarks] = useState(4);
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [saved, setSaved] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    Promise.all([getExamById(examId), getQuestions(examId)]).then(([e, q]) => {
      setExam(e ?? null);
      setQuestions(q);
    });
  }, [examId]);

  async function addQuestion() {
    if (!newStem.trim()) return;
    const q = await createQuestion({
      examId,
      type: newType,
      stem: newStem,
      marks: newMarks,
      difficulty: newDifficulty,
      order: questions.length + 1,
    });
    setQuestions(prev => [...prev, q]);
    setNewStem('');
    setSaved(false);
  }

  async function removeQuestion(id: string) {
    await deleteQuestion(id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function updateStem(id: string, stem: string) {
    await updateQuestion(id, { stem });
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, stem } : q));
    setSaved(false);
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleStatusChange(next: 'scheduled' | 'live' | 'completed') {
    if (!exam) return;
    setStatusUpdating(true);
    const updated = await updateExam(exam.id, { status: next });
    if (updated) setExam(updated);
    setStatusUpdating(false);
  }

  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    draft:     { label: 'Draft',     color: '#6B7280', bg: '#F3F4F6' },
    scheduled: { label: 'Scheduled', color: '#1E88E5', bg: '#EEF6FF' },
    live:      { label: 'Live',      color: '#16A34A', bg: '#DCFCE7' },
    completed: { label: 'Completed', color: '#9CA3AF', bg: '#F9FAFB' },
  };

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/exams" className="hover:text-[#1A1D23] transition-colors">Exams</Link>
        <span className="select-none">›</span>
        <span className="font-medium text-[#1A1D23]">Edit</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{exam.title}</h2>
          <p className="text-sm text-muted-foreground">{exam.subject} · {exam.duration} min · {exam.totalMarks} marks</p>
        </div>
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      {/* ── Status panel ── */}
      {(() => {
        const cfg = STATUS_CONFIG[exam.status] ?? STATUS_CONFIG.draft;
        return (
          <div className="rounded-xl border border-[#EBF0F8] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {exam.status === 'draft' && '✏'}
                {exam.status === 'scheduled' && <CalendarCheck className="h-4 w-4" />}
                {exam.status === 'live' && <Radio className="h-4 w-4" />}
                {exam.status === 'completed' && <CheckCircle2 className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                <p className="text-xs text-muted-foreground">
                  {exam.status === 'draft' && 'Publish to schedule this exam for students.'}
                  {exam.status === 'scheduled' && 'Go live when you\'re ready to start the exam.'}
                  {exam.status === 'live' && 'Exam is currently running. Students can join now.'}
                  {exam.status === 'completed' && 'Exam has ended. View results from the exams list.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {exam.status === 'draft' && (
                <Button
                  onClick={() => handleStatusChange('scheduled')}
                  disabled={statusUpdating}
                  className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]"
                >
                  <CalendarCheck className="h-4 w-4" />
                  {statusUpdating ? 'Publishing…' : 'Publish Exam'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {exam.status === 'scheduled' && (
                <Button
                  onClick={() => handleStatusChange('live')}
                  disabled={statusUpdating}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Radio className="h-4 w-4" />
                  {statusUpdating ? 'Going live…' : 'Go Live Now'}
                </Button>
              )}
              {exam.status === 'live' && (
                <Button
                  onClick={() => handleStatusChange('completed')}
                  disabled={statusUpdating}
                  variant="outline"
                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {statusUpdating ? 'Ending…' : 'End Exam'}
                </Button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Questions list */}
      <Card>
        <CardHeader>
          <CardTitle>Questions ({questions.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
              No questions yet. Add one below.
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="flex gap-3 border rounded-lg p-4 bg-gray-50">
                <div className="flex items-start gap-2 flex-1">
                  <GripVertical className="h-5 w-5 text-gray-300 mt-0.5 shrink-0 cursor-grab" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">Q{i + 1}</span>
                      <Badge variant="outline" className="text-xs capitalize">{q.type.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                      <span className="text-xs text-gray-400">{q.marks} marks</span>
                    </div>
                    <Textarea
                      value={q.stem}
                      onChange={e => updateStem(q.id, e.target.value)}
                      rows={2}
                      className="text-sm resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                    />
                    {q.options && (
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        {q.options.map(opt => (
                          <span key={opt.id} className={`text-xs px-2 py-0.5 rounded ${opt.isCorrect ? 'bg-green-100 text-green-700' : 'text-gray-500'}`}>
                            {opt.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => removeQuestion(q.id)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add question */}
      <Card>
        <CardHeader><CardTitle>Add Question</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Select value={newType} onValueChange={v => setNewType(v as QuestionType)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newDifficulty} onValueChange={v => setNewDifficulty(v as typeof newDifficulty)}>
              <SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Marks"
              value={newMarks}
              min={1}
              onChange={e => setNewMarks(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Question Stem</Label>
            <Textarea
              placeholder="Enter your question here..."
              rows={3}
              value={newStem}
              onChange={e => setNewStem(e.target.value)}
            />
          </div>
          <Button onClick={addQuestion} disabled={!newStem.trim()} className="gap-2">
            <Plus className="h-4 w-4" /> Add Question
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
