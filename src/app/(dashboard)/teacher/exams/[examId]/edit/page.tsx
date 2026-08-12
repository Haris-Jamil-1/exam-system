'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getExamEditPageData, createQuestion, updateQuestion, deleteQuestion, updateExam, duplicateExam, getMyClasses } from '@/lib/data';
import type { Exam, Question, QuestionType, ExamSection, ClassSummary } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SectionsManager } from '@/components/exams/SectionsManager';
import { MathTextarea } from '@/components/rich/MathTextField';
import { RichText } from '@/components/rich/RichText';
import { DateTimeField } from '@/components/shared/DateTimeField';
import { computeExamDurationMinutes, MIN_EXAM_DURATION_MINUTES } from '@/lib/exam-duration';
import { Plus, Trash2, GripVertical, Save, Radio, CalendarCheck, CheckCircle2, ChevronRight, Copy, Clock } from 'lucide-react';

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'mrq', label: 'Multiple Response' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'essay', label: 'Essay' },
  { value: 'fill_blank', label: 'Fill in the Blank' },
];

const STEM_SAVE_DEBOUNCE_MS = 600;

export default function EditExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [newType, setNewType] = useState<QuestionType>('mcq');
  const [newStem, setNewStem] = useState('');
  const [newMarks, setNewMarks] = useState(4);
  const [newDifficulty, setNewDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [newTimeLimitSeconds, setNewTimeLimitSeconds] = useState<number | undefined>(undefined);
  const [newSectionId, setNewSectionId] = useState<string>('none');
  const [newRubricText, setNewRubricText] = useState('');
  const [saved, setSaved] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [instructions, setInstructions] = useState('');
  // Pending debounced stem saves, keyed by question id.
  const stemSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Schedule (start/end/duration) — a local draft with an explicit Save, not auto-saved on
  // blur like Instructions: a chronology change is consequential enough to want a deliberate
  // confirm, not a stray click-away commit. Only editable while the exam is upcoming (draft or
  // scheduled) — the server enforces the same rule (PUT /api/exams/[examId]), this is just UX.
  const [scheduleDraft, setScheduleDraft] = useState<{ startTime: string; endTime: string; duration: number } | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // "Assign to another section" — clones this exam (see duplicateExam) and attaches it to a
  // different Class with its own schedule.
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateClassId, setDuplicateClassId] = useState('');
  const [duplicateStart, setDuplicateStart] = useState('');
  const [duplicateEnd, setDuplicateEnd] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    // One server action instead of three serialized round trips.
    getExamEditPageData(examId).then(({ exam: e, questions: q, sections: s }) => {
      setExam(e);
      setInstructions(e?.instructions ?? '');
      setQuestions(q);
      setSections(s);
      if (e) setScheduleDraft({ startTime: e.startTime, endTime: e.endTime, duration: e.duration });
    });
    getMyClasses().then(setClasses);
  }, [examId]);

  const scheduleLocked = exam?.status === 'live' || exam?.status === 'completed';

  async function saveSchedule() {
    if (!exam || !scheduleDraft) return;
    setScheduleError('');
    const windowMinutes = computeExamDurationMinutes(scheduleDraft.startTime, scheduleDraft.endTime);
    if (!windowMinutes) {
      setScheduleError('End time must be after start time.');
      return;
    }
    if (!scheduleDraft.duration || scheduleDraft.duration < MIN_EXAM_DURATION_MINUTES) {
      setScheduleError(`Duration must be at least ${MIN_EXAM_DURATION_MINUTES} minutes.`);
      return;
    }
    setScheduleSaving(true);
    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: scheduleDraft.startTime,
          endTime: scheduleDraft.endTime,
          duration: scheduleDraft.duration,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setScheduleError(typeof data.message === 'string' ? data.message : 'Could not save the schedule.');
        return;
      }
      setExam(data as Exam);
      handleSave();
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleDuplicate() {
    setDuplicateError('');
    if (!duplicateClassId) {
      setDuplicateError('Choose a section to assign this exam to.');
      return;
    }
    if (!computeExamDurationMinutes(duplicateStart, duplicateEnd)) {
      setDuplicateError('Set a valid start and end time (end must be after start).');
      return;
    }
    setDuplicating(true);
    try {
      const cloned = await duplicateExam(examId, duplicateClassId, { startTime: duplicateStart, endTime: duplicateEnd });
      router.push(`/teacher/exams/${cloned.id}/edit`);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : 'Could not duplicate this exam.');
      setDuplicating(false);
    }
  }

  async function addQuestion() {
    if (!newStem.trim()) return;
    // Rubric lines: "name | max points | description" (description optional).
    const rubric = newType === 'essay' && newRubricText.trim()
      ? newRubricText
          .split('\n')
          .map(line => {
            const [name, points, ...desc] = line.split('|').map(p => p.trim());
            const maxPoints = Number(points);
            return name && Number.isFinite(maxPoints) && maxPoints > 0
              ? { name, maxPoints, description: desc.join(' | ') || undefined }
              : null;
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
      : undefined;
    const q = await createQuestion({
      examId,
      type: newType,
      stem: newStem,
      marks: newMarks,
      difficulty: newDifficulty,
      order: questions.length + 1,
      timeLimitSeconds: newTimeLimitSeconds,
      sectionId: newSectionId === 'none' ? undefined : newSectionId,
      rubric: rubric?.length ? rubric : undefined,
    });
    setQuestions(prev => [...prev, q]);
    setNewStem('');
    setNewTimeLimitSeconds(undefined);
    setNewRubricText('');
    setSaved(false);
  }

  async function reassignSection(id: string, sectionId: string) {
    await updateQuestion(id, { sectionId: sectionId === 'none' ? undefined : sectionId });
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, sectionId: sectionId === 'none' ? undefined : sectionId } : q));
    setSaved(false);
  }

  async function removeQuestion(id: string) {
    await deleteQuestion(id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  // The stem editor is a controlled field whose value comes from `questions`. Awaiting the server
  // round trip before updating that state meant every character typed while a save was in flight
  // was echoed away by the stale prop — live QA typing " Edited." at a human cadence landed as
  // "di". Local state now updates immediately (so nothing is ever lost) and the save is debounced
  // per question; blurring the field flushes it right away.
  function updateStem(id: string, stem: string) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, stem } : q));
    setSaved(false);
    const timers = stemSaveTimers.current;
    if (timers[id]) clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      delete timers[id];
      void updateQuestion(id, { stem });
    }, STEM_SAVE_DEBOUNCE_MS);
  }

  function flushStemSave(id: string, stem: string) {
    const timers = stemSaveTimers.current;
    if (!timers[id]) return;
    clearTimeout(timers[id]);
    delete timers[id];
    void updateQuestion(id, { stem });
  }

  async function updateTimeLimit(id: string, timeLimitSeconds: number | undefined) {
    await updateQuestion(id, { timeLimitSeconds: timeLimitSeconds ?? undefined });
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, timeLimitSeconds } : q));
    setSaved(false);
  }

  async function saveInstructions() {
    await handleUpdate({ instructions });
  }

  async function toggleProctoring(checked: boolean) {
    await handleUpdate({ isProctoringEnabled: checked });
  }

  async function toggleSectionSequential(checked: boolean) {
    if (!exam) return;
    await handleUpdate({ settings: { ...exam.settings, isSectionSequential: checked } });
  }

  async function toggleItemSequential(checked: boolean) {
    if (!exam) return;
    await handleUpdate({ settings: { ...exam.settings, isItemSequential: checked } });
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleUpdate(patch: Partial<Exam>) {
    if (!exam) return;
    setStatusUpdating(true);
    const updated = await updateExam(exam.id, patch);
    if (updated) setExam(updated);
    setStatusUpdating(false);
  }

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/exams" className="hover:text-[#1A1D23] transition-colors">Exams</Link>
        <span className="select-none">›</span>
        <span className="font-medium text-[#1A1D23]">Edit</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{exam.title}</h2>
          <p className="text-sm text-muted-foreground">{exam.subject} · {exam.duration} min · {exam.totalMarks} marks</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => { setDuplicateError(''); setDuplicateOpen(true); }} className="gap-2">
            <Copy className="h-4 w-4" />
            Assign to Another Section
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            {saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ── Approval / Status panel ── */}
      {(() => {
        const approval = exam.approvalStatus ?? 'not_submitted';

        if (approval === 'not_submitted') return (
          <div className="rounded-xl border border-[#EBF0F8] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500">✏</span>
              <div>
                <p className="text-sm font-semibold text-gray-700">Draft</p>
                <p className="text-xs text-muted-foreground">Submit to admin for approval before going live.</p>
              </div>
            </div>
            <Button onClick={() => handleUpdate({ approvalStatus: 'pending' })} disabled={statusUpdating} className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] shrink-0">
              <ChevronRight className="h-4 w-4" />
              {statusUpdating ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        );

        if (approval === 'pending') return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Awaiting Admin Approval</p>
              <p className="text-xs text-amber-700">Your exam has been submitted and is pending review. You&apos;ll be able to go live once approved.</p>
            </div>
          </div>
        );

        if (approval === 'rejected') return (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <CheckCircle2 className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Returned for Revision</p>
                <p className="text-xs text-red-600">Admin returned this exam. Make your changes and resubmit.</p>
              </div>
            </div>
            <Button onClick={() => handleUpdate({ approvalStatus: 'pending' })} disabled={statusUpdating} variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-100 shrink-0">
              <ChevronRight className="h-4 w-4" />
              {statusUpdating ? 'Resubmitting…' : 'Resubmit for Approval'}
            </Button>
          </div>
        );

        // approved — show live controls
        return (
          <div className="rounded-xl border border-[#EBF0F8] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                exam.status === 'live' ? 'bg-green-100 text-green-600' :
                exam.status === 'completed' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'
              }`}>
                {exam.status === 'live' ? <Radio className="h-4 w-4" /> : exam.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <CalendarCheck className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-sm font-semibold capitalize text-gray-700">{exam.status}</p>
                <p className="text-xs text-muted-foreground">
                  {exam.status === 'scheduled' && 'Approved — go live when ready to start the exam.'}
                  {exam.status === 'live' && 'Exam is running. Students can join now.'}
                  {exam.status === 'completed' && 'Exam ended. View results from the exams list.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {exam.status === 'scheduled' && (
                <Button onClick={() => handleUpdate({ status: 'live' })} disabled={statusUpdating} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Radio className="h-4 w-4" />
                  {statusUpdating ? 'Going live…' : 'Go Live Now'}
                </Button>
              )}
              {exam.status === 'live' && (
                <Button onClick={() => handleUpdate({ status: 'completed' })} disabled={statusUpdating} variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50">
                  <CheckCircle2 className="h-4 w-4" />
                  {statusUpdating ? 'Ending…' : 'End Exam'}
                </Button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Schedule */}
      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {scheduleLocked ? (
            <p className="text-sm text-muted-foreground">
              This exam is {exam.status} — its schedule can no longer be changed. Use{' '}
              {exam.status === 'live' ? 'Extend/Change End Time on the live monitor screen' : 'a duplicate'} instead.
            </p>
          ) : scheduleDraft && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time <span className="text-muted-foreground font-normal">(availability opens)</span></Label>
                  <DateTimeField
                    initialValue={scheduleDraft.startTime}
                    onChange={v => v && setScheduleDraft(prev => prev && { ...prev, startTime: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time <span className="text-muted-foreground font-normal">(availability closes)</span></Label>
                  <DateTimeField
                    initialValue={scheduleDraft.endTime}
                    onChange={v => v && setScheduleDraft(prev => prev && { ...prev, endTime: v })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Exam Duration (Minutes) <span className="text-muted-foreground font-normal">(the student&apos;s own countdown once they start)</span></Label>
                <div className="flex items-center gap-2 max-w-xs">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    type="number"
                    min={MIN_EXAM_DURATION_MINUTES}
                    value={scheduleDraft.duration}
                    onChange={e => setScheduleDraft(prev => prev && { ...prev, duration: Number(e.target.value) })}
                  />
                </div>
              </div>
              {scheduleError && <p className="text-sm text-red-500">{scheduleError}</p>}
              <Button onClick={saveSchedule} disabled={scheduleSaving} variant="outline" size="sm">
                {scheduleSaving ? 'Saving…' : 'Save Schedule'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Instructions + Proctoring */}
      <Card>
        <CardHeader><CardTitle>Instructions & Proctoring</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pre-Exam Instructions <span className="text-muted-foreground font-normal">(shown to students before they start)</span></Label>
            <Textarea
              placeholder="e.g. Calculators are prohibited. Ensure your camera is active."
              rows={4}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              onBlur={saveInstructions}
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={exam.isProctoringEnabled}
              onChange={e => toggleProctoring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <div>
              <span className="text-sm font-medium">Enable AI Proctoring</span>
              <p className="text-xs text-muted-foreground">Camera, tab/fullscreen monitoring, and identity verification. Turn off for low-stakes exams.</p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Sections */}
      <Card>
        <CardHeader><CardTitle>Multi-Section Architecture</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sections.length > 0 && !!exam.settings?.dynamicPoolingBlueprint && Object.keys(exam.settings.dynamicPoolingBlueprint).length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Not supported together:</strong> stratified dynamic pooling draws questions exam-wide, not
              per section — a pooled question is never assigned to any section, so it will not appear inside any
              section for students. Use sections with a fixed question list, or pooling on a non-sectioned exam,
              not both on the same exam.
            </div>
          )}
          <SectionsManager
            examId={examId}
            sections={sections}
            onChange={setSections}
            isSectionSequential={!!exam.settings?.isSectionSequential}
            onToggleSectionSequential={toggleSectionSequential}
            isItemSequential={!!exam.settings?.isItemSequential}
            onToggleItemSequential={toggleItemSequential}
          />
        </CardContent>
      </Card>

      {/* Stratified pooling notice */}
      {exam.settings?.dynamicPoolingBlueprint && Object.keys(exam.settings.dynamicPoolingBlueprint).length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>This exam uses stratified dynamic pooling</strong> — each student gets their own randomly-drawn
          question set from the configured item banks at attempt start, so there is no single fixed question list to
          manage here. Any questions you add below are additional fixed questions every student sees on top of their
          personal pool. Edit the pooling blueprint from the exam wizard&apos;s Settings step.
        </div>
      )}

      {/* Questions list */}
      <Card>
        <CardHeader>
          <CardTitle>Fixed Questions ({questions.length})</CardTitle>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">Q{i + 1}</span>
                      <Badge variant="outline" className="text-xs capitalize">{q.type.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                      <span className="text-xs text-gray-400">{q.marks} marks</span>
                    </div>
                    <MathTextarea
                      value={q.stem}
                      onValueChange={value => updateStem(q.id, value)}
                      onBlur={() => flushStemSave(q.id, q.stem)}
                      rows={2}
                      className="text-sm resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground font-normal whitespace-nowrap">Time limit (seconds)</Label>
                        <Input
                          type="number"
                          placeholder="No limit"
                          min={5}
                          defaultValue={q.timeLimitSeconds}
                          onBlur={e => updateTimeLimit(q.id, e.target.value ? Number(e.target.value) : undefined)}
                          className="h-7 w-24 text-xs"
                        />
                      </div>
                      {sections.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground font-normal whitespace-nowrap">Section</Label>
                          <Select value={q.sectionId ?? 'none'} onValueChange={v => reassignSection(q.id, v)}>
                            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No section</SelectItem>
                              {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                        {q.options.map(opt => (
                          <span key={opt.id} className={`text-xs px-2 py-0.5 rounded ${opt.isCorrect ? 'bg-green-100 text-green-700' : 'text-gray-500'}`}>
                            <RichText content={opt.text} />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <MathTextarea
              placeholder="Enter your question here..."
              rows={3}
              value={newStem}
              onValueChange={setNewStem}
            />
          </div>
          <div className="flex gap-4 flex-wrap">
            <div className="space-y-2 max-w-[200px]">
              <Label>Time limit (seconds) <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                type="number"
                placeholder="No limit"
                min={5}
                value={newTimeLimitSeconds ?? ''}
                onChange={e => setNewTimeLimitSeconds(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            {sections.length > 0 && (
              <div className="space-y-2 max-w-[220px]">
                <Label>Section</Label>
                <Select value={newSectionId} onValueChange={setNewSectionId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No section</SelectItem>
                    {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {newType === 'essay' && (
            <div className="space-y-2">
              <Label>
                Grading rubric <span className="text-muted-foreground font-normal">(optional — enables AI-suggested grading)</span>
              </Label>
              <Textarea
                placeholder={'One criterion per line:  name | max points | description\ne.g.  Thesis clarity | 4 | States a clear, arguable thesis'}
                rows={3}
                value={newRubricText}
                onChange={e => setNewRubricText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Without a rubric, essay answers are graded manually. AI suggestions always require your confirmation before the student sees a mark.
              </p>
            </div>
          )}
          <Button onClick={addQuestion} disabled={!newStem.trim()} className="gap-2">
            <Plus className="h-4 w-4" /> Add Question
          </Button>
        </CardContent>
      </Card>

      {/* Assign to Another Section — clones this exam (questions + sections) and attaches the
          copy to a different Class with its own schedule; see duplicateExam. */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-blue-500" /> Assign to Another Section
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates an independent copy of this exam — same questions and settings — attached to a
              different section, with its own schedule. Editing one copy never affects the other.
            </p>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={duplicateClassId} onValueChange={setDuplicateClassId}>
                <SelectTrigger><SelectValue placeholder="Choose a section…" /></SelectTrigger>
                <SelectContent>
                  {classes.filter(c => !c.archivedAt && c.id !== exam.classId).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {classes.length === 0 && (
                <p className="text-xs text-muted-foreground">You don&apos;t have any other sections yet — create a Class first.</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <DateTimeField onChange={setDuplicateStart} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <DateTimeField onChange={setDuplicateEnd} />
              </div>
            </div>
            {duplicateError && <p className="text-sm text-red-500">{duplicateError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)} disabled={duplicating}>Cancel</Button>
            <Button onClick={handleDuplicate} disabled={duplicating} className="gap-2">
              <Copy className="h-4 w-4" />
              {duplicating ? 'Duplicating…' : 'Duplicate & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
