'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { createExam, createQuestion, getItems, updateItem } from '@/lib/data';
import { generateQuestions } from '@/lib/ai/question-generator';
import type { GeneratedQuestion, QuestionType, Item } from '@/types';
import { useRef } from 'react';
import { Sparkles, Plus, Check, ChevronRight, ChevronLeft, Search, Library, ChevronDown, ChevronUp, Upload } from 'lucide-react';

const step1Schema = z.object({
  title: z.string().min(3, 'Title required'),
  subject: z.string().min(2, 'Subject required'),
  duration: z.number().min(5).max(480),
  totalMarks: z.number().min(1),
  passingMarks: z.number().min(1),
  startTime: z.string().min(1, 'Start time required'),
  endTime: z.string().min(1, 'End time required'),
});

type Step1Data = z.infer<typeof step1Schema>;

const STEPS = ['Basic Info', 'AI Generation', 'Questions', 'Settings'];

const ALL_QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mcq', label: 'Multiple Choice (MCQ)' },
  { value: 'mrq', label: 'Multiple Response (MRQ)' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'essay', label: 'Essay' },
  { value: 'fill_blank', label: 'Fill in the Blank' },
  { value: 'matching', label: 'Matching' },
  { value: 'ordering', label: 'Ordering' },
];

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ', mrq: 'MRQ', true_false: 'T/F', short_answer: 'Short',
  essay: 'Essay', fill_blank: 'Fill', matching: 'Match', ordering: 'Order',
  coding: 'Code', file_upload: 'File',
};

const DIFF_VARIANT: Record<string, string> = { easy: 'success', medium: 'warning', hard: 'danger' };

function QuestionPreview({ q, index, added, onAdd }: {
  q: GeneratedQuestion; index: number; added: boolean; onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOptions = q.options && q.options.length > 0;

  return (
    <div className={`border rounded-lg p-4 transition-colors ${added ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
            <Badge variant="info" className="text-xs">{TYPE_LABELS[q.type]}</Badge>
            <Badge variant={DIFF_VARIANT[q.difficulty] as 'success' | 'warning' | 'danger'} className="text-xs capitalize">{q.difficulty}</Badge>
            <Badge variant="outline" className="text-xs">{q.marks} pts</Badge>
          </div>
          <p className="text-sm font-medium">{q.stem}</p>

          {hasOptions && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-blue-600 mt-2 hover:underline"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide options' : `Show ${q.options!.length} options`}
            </button>
          )}

          {expanded && hasOptions && (
            <ul className="mt-2 space-y-1">
              {q.options!.map((opt, j) => {
                const isCorrect = Array.isArray(q.correctAnswer)
                  ? q.correctAnswer.includes(opt)
                  : opt === q.correctAnswer;
                return (
                  <li
                    key={j}
                    className={`text-xs px-2.5 py-1.5 rounded flex items-center gap-2 ${
                      isCorrect ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-50 text-muted-foreground'
                    }`}
                  >
                    <span className="font-semibold w-4">{String.fromCharCode(65 + j)}.</span>
                    <span>{opt}</span>
                    {isCorrect && <Check className="h-3 w-3 ms-auto shrink-0 text-green-600" />}
                  </li>
                );
              })}
            </ul>
          )}

          {q.explanation && (
            <p className="text-xs text-muted-foreground mt-2 italic border-s-2 border-blue-200 ps-2">{q.explanation}</p>
          )}
        </div>

        <Button
          size="sm"
          variant={added ? 'secondary' : 'default'}
          onClick={onAdd}
          disabled={added}
          className="gap-1 shrink-0"
        >
          {added ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add</>}
        </Button>
      </div>
    </div>
  );
}

function ItemBankPicker({ selectedIds, onToggle }: {
  selectedIds: Set<string>;
  onToggle: (item: Item) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getItems({ status: 'approved' }).then(setItems);
  }, []);

  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (diffFilter !== 'all' && item.difficulty !== diffFilter) return false;
    if (search && !item.stem.toLowerCase().includes(search.toLowerCase()) &&
        !item.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search by stem or tag…" className="ps-8 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ALL_QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={diffFilter} onValueChange={setDiffFilter}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} approved item{filtered.length !== 1 ? 's' : ''} available</p>

      {filtered.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
          No approved items match your filters.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filtered.map(item => {
            const selected = selectedIds.has(item.id);
            const isExpanded = expandedId === item.id;
            const hasOptions = item.options && item.options.length > 0;

            return (
              <div
                key={item.id}
                className={`border rounded-lg p-3 transition-colors ${selected ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
                      <Badge variant={DIFF_VARIANT[item.difficulty] as 'success' | 'warning' | 'danger'} className="text-xs capitalize">{item.difficulty}</Badge>
                      <Badge variant="outline" className="text-xs">{item.marks} pts</Badge>
                      {item.usageCount > 0 && (
                        <span className="text-xs text-muted-foreground">· used {item.usageCount}×</span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{item.stem}</p>
                    {item.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {item.tags.map(tag => (
                          <span key={tag} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{tag}</span>
                        ))}
                      </div>
                    )}
                    {hasOptions && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 mt-1.5 hover:underline"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {isExpanded ? 'Hide options' : `Show ${item.options!.length} options`}
                      </button>
                    )}
                    {isExpanded && hasOptions && (
                      <ul className="mt-2 space-y-1">
                        {item.options!.map((opt, j) => (
                          <li
                            key={opt.id}
                            className={`text-xs px-2.5 py-1.5 rounded flex items-center gap-2 ${
                              opt.isCorrect ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-50 text-muted-foreground'
                            }`}
                          >
                            <span className="font-semibold w-4">{String.fromCharCode(65 + j)}.</span>
                            <span>{opt.text}</span>
                            {opt.isCorrect && <Check className="h-3 w-3 ms-auto shrink-0 text-green-600" />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={selected ? 'secondary' : 'default'}
                    onClick={() => onToggle(item)}
                    className="gap-1 shrink-0"
                  >
                    {selected ? <><Check className="h-3 w-3" /> Added</> : <><Plus className="h-3 w-3" /> Add</>}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NewExamPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);

  // AI-generated questions
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [addedAIQuestions, setAddedAIQuestions] = useState<GeneratedQuestion[]>([]);
  const [docText, setDocText] = useState('');
  const [fileName, setFileName] = useState('');
  const [genDifficulty, setGenDifficulty] = useState('medium');
  const [genType, setGenType] = useState<QuestionType>('mcq');
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Item bank selections
  const [selectedBankItems, setSelectedBankItems] = useState<Map<string, Item>>(new Map());

  // Settings — proctoring + shuffle
  const [proctoringLevel, setProctoringLevel] = useState<'basic' | 'standard' | 'strict'>('standard');
  const [maxViolations, setMaxViolations] = useState(3);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);
  const [showResults, setShowResults] = useState(true);
  // Navigation
  const [navigationMode, setNavigationMode] = useState<'free' | 'sequential'>('free');
  const [forwardOnly, setForwardOnly] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [allowPause, setAllowPause] = useState(true);
  // Results visibility — Phase 2: stored in ExamSettings.resultsVisibility
  const [resultsVisibility, setResultsVisibility] = useState<'instant' | 'held'>('instant');
  // Dynamic pooling — Phase 2: pool drawn randomly from item bank at runtime
  const [enablePooling, setEnablePooling] = useState(false);
  const [poolSize, setPoolSize] = useState(30);
  const [questionLimit, setQuestionLimit] = useState(20);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const totalAdded = addedAIQuestions.length + selectedBankItems.size;

  const { register, handleSubmit, formState: { errors } } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
  });

  function onStep1(data: Step1Data) {
    setStep1Data(data);
    setStep(1);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';
      setDocText(text);
    };
    reader.readAsText(file);
    // Reset so re-uploading same file fires onChange
    e.target.value = '';
  }

  async function handleGenerate() {
    if (!docText.trim()) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 800));
    const result = generateQuestions({ text: docText, count: 5, difficulty: genDifficulty as 'easy' | 'medium' | 'hard', type: genType });
    setGeneratedQuestions(result);
    setIsGenerating(false);
  }

  function addAIQuestion(q: GeneratedQuestion) {
    if (!addedAIQuestions.includes(q)) {
      setAddedAIQuestions(prev => [...prev, q]);
    }
  }

  function toggleBankItem(item: Item) {
    setSelectedBankItems(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      return next;
    });
  }

  async function handleFinish() {
    if (!step1Data) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      // institutionId and teacherId are resolved from the session in the server action
      const exam = await createExam({
        ...step1Data,
        institutionId: '',
        teacherId: '',
        maxViolations,
        status: 'draft',
        settings: {
          shuffleQuestions: shuffleQ,
          shuffleOptions: shuffleO,
          showResultsAfter: showResults,
          allowedViolations: maxViolations,
          proctoringLevel,
          navigationMode,
          forwardOnly: navigationMode === 'sequential' ? forwardOnly : undefined,
          autoAdvance,
          allowPause,
          resultsVisibility,
          ...(enablePooling ? { poolSize, questionLimit } : {}),
        },
      });

      let order = 1;

      for (const q of addedAIQuestions) {
        await createQuestion({
          examId: exam.id,
          type: q.type,
          stem: q.stem,
          options: q.options?.map((o, idx) => ({ id: `opt-${idx}`, text: o, isCorrect: o === q.correctAnswer || (Array.isArray(q.correctAnswer) && q.correctAnswer.includes(o)) })),
          correctAnswer: q.correctAnswer,
          marks: q.marks,
          difficulty: q.difficulty,
          order: order++,
          explanation: q.explanation,
        });
      }

      for (const item of selectedBankItems.values()) {
        await createQuestion({
          examId: exam.id,
          type: item.type,
          stem: item.stem,
          options: item.options,
          correctAnswer: item.correctAnswer,
          marks: item.marks,
          difficulty: item.difficulty,
          order: order++,
          explanation: item.explanation,
        });
        await updateItem(item.id, { usageCount: item.usageCount + 1 });
      }

      router.push(`/teacher/exams/${exam.id}/edit`);
    } catch (err) {
      console.error('[handleFinish] Failed to create exam:', err);
      setCreateError('Failed to create exam. Please try again.');
      setIsCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/exams" className="hover:text-[#1A1D23] transition-colors">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-[#1A1D23]">Create New Exam</span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                i < step ? 'bg-blue-600 border-blue-600 text-white' :
                i === step ? 'border-blue-600 text-blue-600' :
                'border-gray-200 text-gray-400'
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:block ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Basic Info ── */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onStep1)} className="space-y-4">
              <div className="space-y-2">
                <Label>Exam Title</Label>
                <Input placeholder="Midterm: Data Structures" {...register('title')} />
                {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input placeholder="Computer Science" {...register('subject')} />
                  {errors.subject && <p className="text-sm text-red-500">{errors.subject.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" defaultValue={60} {...register('duration', { valueAsNumber: true })} />
                  {errors.duration && <p className="text-sm text-red-500">{errors.duration.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Marks</Label>
                  <Input type="number" defaultValue={100} {...register('totalMarks', { valueAsNumber: true })} />
                </div>
                <div className="space-y-2">
                  <Label>Passing Marks</Label>
                  <Input type="number" defaultValue={60} {...register('passingMarks', { valueAsNumber: true })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="datetime-local" {...register('startTime')} />
                  {errors.startTime && <p className="text-sm text-red-500">{errors.startTime.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="datetime-local" {...register('endTime')} />
                  {errors.endTime && <p className="text-sm text-red-500">{errors.endTime.message}</p>}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="gap-2">Next <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: AI Generation ── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Generate Questions with AI</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Paste or upload document content</Label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {fileName ? fileName : 'Upload file (.txt, .md, .csv)'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.text"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
                <Textarea
                  placeholder="Paste your lecture notes, textbook excerpt, or topic description here — or upload a .txt / .md file above…"
                  rows={6}
                  value={docText}
                  onChange={e => setDocText(e.target.value)}
                />
                {docText && (
                  <p className="text-xs text-muted-foreground">{docText.length.toLocaleString()} characters loaded</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Question Type</Label>
                  <Select value={genType} onValueChange={v => setGenType(v as QuestionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_QUESTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={genDifficulty} onValueChange={setGenDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleGenerate} disabled={isGenerating || !docText.trim()} className="gap-2">
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Generating…' : 'Generate 5 Questions'}
              </Button>
            </CardContent>
          </Card>

          {generatedQuestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Generated Questions
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    ({addedAIQuestions.length} of {generatedQuestions.length} added)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {generatedQuestions.map((q, i) => (
                  <QuestionPreview
                    key={i}
                    q={q}
                    index={i}
                    added={addedAIQuestions.includes(q)}
                    onAdd={() => addAIQuestion(q)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(2)} className="gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Questions (AI + Item Bank) ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Questions</CardTitle>
                <Badge variant={totalAdded > 0 ? 'success' : 'outline'} className="text-sm">
                  {totalAdded} question{totalAdded !== 1 ? 's' : ''} added
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ai">
                <TabsList className="mb-4">
                  <TabsTrigger value="ai" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Generated ({addedAIQuestions.length})
                  </TabsTrigger>
                  <TabsTrigger value="bank" className="gap-1.5">
                    <Library className="h-3.5 w-3.5" />
                    Item Bank ({selectedBankItems.size})
                  </TabsTrigger>
                </TabsList>

                {/* AI Generated sub-tab */}
                <TabsContent value="ai" className="space-y-3">
                  {addedAIQuestions.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No AI questions added yet</p>
                      <p className="text-sm mt-1">Go back to Step 2 to generate and add questions.</p>
                      <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => setStep(1)}>
                        <ChevronLeft className="h-3.5 w-3.5" /> Back to AI Generation
                      </Button>
                    </div>
                  ) : (
                    addedAIQuestions.map((q, i) => (
                      <div key={i} className="flex items-start gap-3 border rounded-lg p-3 bg-blue-50 border-blue-200">
                        <span className="text-sm font-semibold text-blue-600 w-6 shrink-0 mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{q.stem}</p>
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant="info" className="text-xs">{TYPE_LABELS[q.type]}</Badge>
                            <Badge variant={DIFF_VARIANT[q.difficulty] as 'success' | 'warning' | 'danger'} className="text-xs capitalize">{q.difficulty}</Badge>
                            <Badge variant="outline" className="text-xs">{q.marks} pts</Badge>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* Item Bank sub-tab */}
                <TabsContent value="bank">
                  <ItemBankPicker
                    selectedIds={new Set(selectedBankItems.keys())}
                    onToggle={toggleBankItem}
                  />
                  {selectedBankItems.size > 0 && (
                    <div className="mt-4 space-y-2 border-t pt-4">
                      <p className="text-sm font-medium text-muted-foreground">Selected from item bank:</p>
                      {Array.from(selectedBankItems.values()).map((item, i) => (
                        <div key={item.id} className="flex items-start gap-3 border rounded-lg p-3 bg-green-50 border-green-200">
                          <span className="text-sm font-semibold text-green-600 w-6 shrink-0 mt-0.5">{addedAIQuestions.length + i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{item.stem}</p>
                            <div className="flex gap-1.5 mt-1">
                              <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
                              <Badge variant={DIFF_VARIANT[item.difficulty] as 'success' | 'warning' | 'danger'} className="text-xs capitalize">{item.difficulty}</Badge>
                              <Badge variant="outline" className="text-xs">{item.marks} pts</Badge>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleBankItem(item)}
                            className="text-xs text-red-500 hover:text-red-700 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="gap-2">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Settings ── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Exam Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">

              {/* ── Navigation Mode ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Navigation Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['free', 'sequential'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setNavigationMode(mode);
                        if (mode === 'free') setForwardOnly(false);
                      }}
                      className={`border rounded-lg p-3 text-start text-xs transition-colors ${
                        navigationMode === mode ? 'border-blue-600 bg-blue-50 text-blue-700' : 'hover:border-gray-300'
                      }`}
                    >
                      <p className="font-semibold capitalize">{mode}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {mode === 'free' ? 'Students can jump to any question freely' : 'Questions appear one by one in order'}
                      </p>
                    </button>
                  ))}
                </div>
                {navigationMode === 'sequential' && (
                  <label className="flex items-center gap-3 cursor-pointer ps-1">
                    <input
                      type="checkbox"
                      checked={forwardOnly}
                      onChange={e => setForwardOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">Forward-only</span>
                      <p className="text-xs text-muted-foreground">Students cannot go back to previous questions once they move forward.</p>
                    </div>
                  </label>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* ── Auto-advance + Pause ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Behavior</Label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAdvance}
                    onChange={e => setAutoAdvance(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-medium">Auto-advance after MCQ answer</span>
                    <p className="text-xs text-muted-foreground">Moves to next question automatically when student selects an option.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPause}
                    onChange={e => setAllowPause(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-medium">Allow exam pause</span>
                    <p className="text-xs text-muted-foreground">Students can pause the timer (timer stops, proctoring continues). Log is recorded.</p>
                  </div>
                </label>
              </div>

              <div className="h-px bg-border" />

              {/* ── Results Visibility ── */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Results Visibility</Label>
                <Select value={resultsVisibility} onValueChange={v => setResultsVisibility(v as 'instant' | 'held')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant — shown immediately after submission</SelectItem>
                    <SelectItem value="held">Held — teacher publishes results manually</SelectItem>
                  </SelectContent>
                </Select>
                {resultsVisibility === 'held' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Students will see a &ldquo;Results Pending Review&rdquo; message until you publish results from the exam results page.
                  </p>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* ── Proctoring ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Proctoring</Label>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-normal">Proctoring Level</Label>
                  <Select value={proctoringLevel} onValueChange={v => setProctoringLevel(v as typeof proctoringLevel)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic — Tab/window detection only</SelectItem>
                      <SelectItem value="standard">Standard — Tab + face detection</SelectItem>
                      <SelectItem value="strict">Strict — Full proctoring + audio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground font-normal whitespace-nowrap">Max violations (auto-submit)</Label>
                  <Input
                    type="number"
                    value={maxViolations}
                    min={1} max={10}
                    onChange={e => setMaxViolations(Number(e.target.value))}
                    className="w-20 h-8 text-sm"
                  />
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* ── Shuffle ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Shuffle & Display</Label>
                {[
                  { label: 'Shuffle questions', desc: 'Randomize question order per student.', value: shuffleQ, set: setShuffleQ },
                  { label: 'Shuffle answer options', desc: 'Randomize option order for MCQ/MRQ.', value: shuffleO, set: setShuffleO },
                  { label: 'Show results after submission', desc: 'Display score and correct answers instantly.', value: showResults, set: setShowResults },
                ].map(opt => (
                  <label key={opt.label} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.value}
                      onChange={e => opt.set(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="h-px bg-border" />

              {/* ── Dynamic Pooling ── */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enablePooling}
                    onChange={e => setEnablePooling(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-semibold">Dynamic Question Pooling</span>
                    <p className="text-xs text-muted-foreground">Draw a random subset of questions from a larger pool at runtime (Phase 2 feature).</p>
                  </div>
                </label>
                {enablePooling && (
                  <div className="ps-7 grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Pool size (total items)</Label>
                      <Input type="number" value={poolSize} min={questionLimit} onChange={e => setPoolSize(Number(e.target.value))} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Questions per student</Label>
                      <Input type="number" value={questionLimit} min={1} max={poolSize} onChange={e => setQuestionLimit(Number(e.target.value))} className="h-8 text-sm" />
                    </div>
                    <p className="col-span-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                      Phase 2: at exam start, the system will randomly pick {questionLimit} questions from a pool of {poolSize} approved items matching this exam&apos;s subject/difficulty.
                    </p>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm border-t">
                <p className="font-medium">Exam Summary</p>
                <p className="text-muted-foreground">{step1Data?.title} · {step1Data?.subject}</p>
                <p className="text-muted-foreground">{step1Data?.duration} min · {step1Data?.totalMarks} marks (pass at {step1Data?.passingMarks})</p>
                <p className="text-muted-foreground">{totalAdded} question{totalAdded !== 1 ? 's' : ''} total ({addedAIQuestions.length} AI + {selectedBankItems.size} from bank)</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="outline" className="text-xs capitalize">{navigationMode} nav</Badge>
                  {forwardOnly && <Badge variant="outline" className="text-xs">forward-only</Badge>}
                  {autoAdvance && <Badge variant="outline" className="text-xs">auto-advance</Badge>}
                  {allowPause && <Badge variant="outline" className="text-xs">pauseable</Badge>}
                  <Badge variant={resultsVisibility === 'instant' ? 'success' : 'warning'} className="text-xs">
                    {resultsVisibility === 'instant' ? 'Instant results' : 'Held results'}
                  </Badge>
                  {enablePooling && <Badge variant="info" className="text-xs">pooling {questionLimit}/{poolSize}</Badge>}
                </div>
              </div>
            </CardContent>
          </Card>
          {createError && (
            <p className="text-sm text-red-600 text-center">{createError}</p>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2" disabled={isCreating}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleFinish} className="gap-2" disabled={isCreating}>
              <Check className="h-4 w-4" /> {isCreating ? 'Creating…' : 'Create Exam'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
