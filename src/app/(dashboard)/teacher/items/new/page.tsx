'use client';
// Phase 2: createItem calls prisma.item.create(); cloId stored as learning_objective_id FK
// Phase 2: codeLanguage, starterCode, testCases, allowedFileTypes, maxFileSizeMB stored in Prisma item row
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createItem } from '@/lib/data';
import { generateQuestions } from '@/lib/ai/question-generator';
import type { QuestionType, Option } from '@/types';
import { CurriculumPicker, type CurriculumSelection } from '@/components/shared/CurriculumPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Sparkles, Check, Code2, FileUp, Eye, EyeOff } from 'lucide-react';

const schema = z.object({
  stem: z.string().min(5, 'Question stem is required'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  marks: z.number().min(1),
  tags: z.string().optional(),
  status: z.enum(['draft', 'review', 'approved']),
});

type FormData = z.infer<typeof schema>;

const CODE_LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'c', 'sql'] as const;
type CodeLanguage = typeof CODE_LANGUAGES[number];

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.md', '.txt', '.xlsx', '.png', '.jpg', '.jpeg', '.zip', '.csv', '.mp4'];

const QUESTION_TYPES: { value: QuestionType; label: string; group: string; icon?: React.ReactNode }[] = [
  { value: 'mcq',          label: 'Multiple Choice (MCQ)',   group: 'Open Choices' },
  { value: 'mrq',          label: 'Multiple Response (MRQ)', group: 'Open Choices' },
  { value: 'true_false',   label: 'True / False',            group: 'Limited Choices' },
  { value: 'short_answer', label: 'Short Answer',            group: 'Complete' },
  { value: 'essay',        label: 'Essay',                   group: 'Series' },
  { value: 'fill_blank',   label: 'Fill in the Blank',       group: 'Complete' },
  { value: 'matching',     label: 'Matching',                group: 'Matching & Ordering' },
  { value: 'ordering',     label: 'Ordering',                group: 'Matching & Ordering' },
  { value: 'coding',       label: 'Coding Challenge',        group: 'Advanced' },
  { value: 'file_upload',  label: 'File Submission',         group: 'Advanced' },
];

interface TestCaseRow {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export default function NewItemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bankId = searchParams.get('bankId');
  const [qType, setQType] = useState<QuestionType>('mcq');
  // matchText is form-only state for matching questions (stored in correctAnswer on save, not in options)
  const [options, setOptions] = useState<(Option & { matchText?: string })[]>([
    { id: 'opt-1', text: '', isCorrect: false },
    { id: 'opt-2', text: '', isCorrect: false },
    { id: 'opt-3', text: '', isCorrect: false },
    { id: 'opt-4', text: '', isCorrect: false },
  ]);
  // fill_blank / short_answer correct answer text (no option list for these types)
  const [correctAnswerText, setCorrectAnswerText] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stemValue, setStemValue] = useState('');

  // CLO mapping via CurriculumPicker
  const [cloSelection, setCloSelection] = useState<CurriculumSelection | null>(null);

  // Coding type state
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('python');
  const [starterCode, setStarterCode] = useState('');
  const [testCases, setTestCases] = useState<TestCaseRow[]>([
    { id: 'tc-1', input: '', expectedOutput: '', isHidden: false },
  ]);

  // File upload type state
  const [allowedExts, setAllowedExts] = useState<string[]>(['.pdf', '.doc', '.docx', '.md', '.txt']);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(10);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { difficulty: 'medium', marks: 4, status: 'draft' },
  });

  const stemField = register('stem');

  async function handleAIAssist() {
    if (!stemValue.trim()) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 600));
    const results = generateQuestions({ text: stemValue, count: 3, difficulty: 'medium', type: qType });
    setAiSuggestions(results.map(r => r.stem));
    setIsGenerating(false);
  }

  function addOption() {
    setOptions(prev => [...prev, { id: `opt-${Date.now()}`, text: '', isCorrect: false }]);
  }

  function removeOption(id: string) {
    setOptions(prev => prev.filter(o => o.id !== id));
  }

  function toggleCorrect(id: string) {
    if (qType === 'mcq' || qType === 'true_false') {
      setOptions(prev => prev.map(o => ({ ...o, isCorrect: o.id === id })));
    } else {
      setOptions(prev => prev.map(o => o.id === id ? { ...o, isCorrect: !o.isCorrect } : o));
    }
  }

  function updateOption(id: string, text: string) {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  }

  function updateMatchText(id: string, matchText: string) {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, matchText } : o));
  }

  // Test case helpers
  function addTestCase() {
    setTestCases(prev => [...prev, { id: `tc-${Date.now()}`, input: '', expectedOutput: '', isHidden: false }]);
  }

  function removeTestCase(id: string) {
    setTestCases(prev => prev.filter(tc => tc.id !== id));
  }

  function updateTestCase(id: string, field: keyof Omit<TestCaseRow, 'id'>, value: string | boolean) {
    setTestCases(prev => prev.map(tc => tc.id === id ? { ...tc, [field]: value } : tc));
  }

  function toggleExt(ext: string) {
    setAllowedExts(prev =>
      prev.includes(ext) ? prev.filter(e => e !== ext) : [...prev, ext]
    );
  }

  async function onSubmit(data: FormData) {
    if (!bankId) return;
    const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const showOptions = ['mcq', 'mrq', 'true_false', 'matching', 'ordering'].includes(qType);
    const filledOptions = options.filter(o => o.text.trim());

    // Matching: correctAnswer is ordered array of right-side labels (one per option, same index = same pair).
    // Options store only the left-side term; isCorrect is irrelevant for matching.
    let correctAnswer: string | string[] | undefined;
    if (qType === 'matching') {
      correctAnswer = filledOptions.map(o => o.matchText?.trim() ?? '');
    } else if (qType === 'mrq') {
      correctAnswer = options.filter(o => o.isCorrect).map(o => o.text);
    } else if (qType === 'fill_blank' || qType === 'short_answer') {
      correctAnswer = correctAnswerText.trim() || undefined;
    } else {
      correctAnswer = options.find(o => o.isCorrect)?.text;
    }

    await createItem({
      type: qType,
      stem: data.stem,
      options: showOptions ? filledOptions.map(({ matchText: _mt, ...o }) => o) : undefined,
      correctAnswer,
      marks: data.marks,
      difficulty: data.difficulty,
      order: 0,
      status: data.status,
      tags,
      authorId: '',
      bankId,
      learningObjectiveId: cloSelection?.cloId || undefined,
      ...(qType === 'coding' ? {
        codeLanguage,
        starterCode: starterCode || undefined,
        testCases: testCases
          .filter(tc => tc.input.trim() || tc.expectedOutput.trim())
          .map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput, isHidden: tc.isHidden })),
      } : {}),
      ...(qType === 'file_upload' ? {
        allowedFileTypes: allowedExts,
        maxFileSizeMB,
      } : {}),
    });
    setSaved(true);
    setTimeout(() => router.push(`/teacher/items/${bankId}`), 1000);
  }

  const showOptions = ['mcq', 'mrq', 'true_false', 'matching', 'ordering'].includes(qType);

  if (!bankId) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-3">
        <p className="text-muted-foreground">No item bank selected.</p>
        <Link href="/teacher/items" className="text-blue-600 hover:underline text-sm">
          Choose a bank to add a question to
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/items" className="hover:text-[#1A1D23] transition-colors">Item Banks</Link>
        <span className="select-none">›</span>
        <Link href={`/teacher/items/${bankId}`} className="hover:text-[#1A1D23] transition-colors">Bank</Link>
        <span className="select-none">›</span>
        <span className="font-medium text-[#1A1D23]">Create Item</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue="basic">
          <TabsList className="mb-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="mapping">CLO Mapping</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Basic Tab */}
          <TabsContent value="basic" className="space-y-4">
            {/* Question type */}
            <Card>
              <CardHeader><CardTitle>Question Type</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUESTION_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setQType(t.value)}
                      className={`border rounded-lg p-3 text-start text-xs transition-colors ${
                        qType === t.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium flex items-center gap-1">
                        {t.value === 'coding'      && <Code2 className="h-3 w-3" />}
                        {t.value === 'file_upload' && <FileUp className="h-3 w-3" />}
                        {t.label}
                      </p>
                      <p className="text-muted-foreground text-xs mt-0.5">{t.group}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Stem */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Question Stem</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAIAssist}
                  disabled={isGenerating || !stemValue.trim()}
                  className="gap-1"
                >
                  <Sparkles className="h-4 w-4" />
                  {isGenerating ? 'Thinking...' : 'AI Assist'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Enter your question here..."
                  rows={4}
                  {...stemField}
                  onChange={e => { void stemField.onChange(e); setStemValue(e.target.value); }}
                />
                {errors.stem && <p className="text-sm text-red-500">{errors.stem.message}</p>}

                {aiSuggestions.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2 bg-blue-50">
                    <p className="text-xs font-medium text-blue-700">AI Suggestions:</p>
                    {aiSuggestions.map((s, i) => (
                      <p key={i} className="text-xs text-gray-600 border-s-2 border-blue-300 ps-2">{s}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Options / Alternatives */}
            {showOptions && (
              <Card>
                <CardHeader>
                  <CardTitle>{qType === 'matching' ? 'Matching Pairs' : 'Answer Options'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {qType === 'matching' && (
                    <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 mb-1 px-1">
                      <span className="text-xs font-medium text-muted-foreground">Term (left column)</span>
                      <span />
                      <span className="text-xs font-medium text-muted-foreground">Match (right column)</span>
                      <span />
                    </div>
                  )}
                  {options.map((opt, i) => (
                    <div key={opt.id} className={`flex items-center gap-2 ${qType === 'matching' ? 'grid grid-cols-[1fr_auto_1fr_auto] gap-2' : ''}`}>
                      {qType !== 'matching' && (
                        <button
                          type="button"
                          onClick={() => toggleCorrect(opt.id)}
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            opt.isCorrect ? 'border-green-500 bg-green-500' : 'border-gray-300'
                          }`}
                        >
                          {opt.isCorrect && <Check className="h-3 w-3 text-white" />}
                        </button>
                      )}
                      {qType !== 'matching' && (
                        <span className="text-xs font-medium text-gray-400 w-4">{String.fromCharCode(65 + i)}</span>
                      )}
                      <Input
                        placeholder={qType === 'matching' ? `Term ${i + 1}` : `Option ${String.fromCharCode(65 + i)}`}
                        value={opt.text}
                        onChange={e => updateOption(opt.id, e.target.value)}
                        className="flex-1"
                      />
                      {qType === 'matching' && (
                        <>
                          <span className="text-gray-400 text-xs">→</span>
                          <Input
                            placeholder={`Match ${i + 1}`}
                            value={opt.matchText ?? ''}
                            onChange={e => updateMatchText(opt.id, e.target.value)}
                            className="flex-1"
                          />
                        </>
                      )}
                      <button type="button" onClick={() => removeOption(opt.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1">
                    <Plus className="h-3 w-3" /> {qType === 'matching' ? 'Add Pair' : 'Add Option'}
                  </Button>
                  {qType !== 'matching' && (
                    <p className="text-xs text-muted-foreground">Click the circle to mark the correct answer(s)</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Correct answer for text-based types */}
            {(qType === 'fill_blank' || qType === 'short_answer') && (
              <Card>
                <CardHeader><CardTitle>Correct Answer</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    placeholder={qType === 'fill_blank' ? 'Expected answer (exact match, case-insensitive)' : 'Model answer for auto-grading'}
                    value={correctAnswerText}
                    onChange={e => setCorrectAnswerText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {qType === 'fill_blank'
                      ? 'Student responses are compared case-insensitively.'
                      : 'Short-answer auto-grading uses exact case-insensitive match. Leave blank for manual grading.'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Essay rubric */}
            {qType === 'essay' && (
              <Card>
                <CardHeader><CardTitle>Scoring Rubric</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border rounded-lg overflow-hidden">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-start px-3 py-2 font-medium">Dimension</th>
                          <th className="px-3 py-2 font-medium text-center">Excellent (4)</th>
                          <th className="px-3 py-2 font-medium text-center">Good (3)</th>
                          <th className="px-3 py-2 font-medium text-center">Fair (2)</th>
                          <th className="px-3 py-2 font-medium text-center">Poor (1)</th>
                          <th className="px-3 py-2 font-medium text-center">Weight %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {['Content Accuracy', 'Critical Thinking', 'Structure & Clarity', 'Evidence & Examples'].map((dim) => (
                          <tr key={dim} className="hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{dim}</td>
                            <td className="px-3 py-2"><Input placeholder="Describe..." className="text-xs h-7" /></td>
                            <td className="px-3 py-2"><Input placeholder="Describe..." className="text-xs h-7" /></td>
                            <td className="px-3 py-2"><Input placeholder="Describe..." className="text-xs h-7" /></td>
                            <td className="px-3 py-2"><Input placeholder="Describe..." className="text-xs h-7" /></td>
                            <td className="px-3 py-2"><Input type="number" defaultValue={25} className="text-xs h-7 w-16" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Coding type ── */}
            {qType === 'coding' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-blue-600" />
                    Coding Challenge Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Language */}
                  <div className="space-y-2">
                    <Label>Programming Language</Label>
                    <Select value={codeLanguage} onValueChange={v => setCodeLanguage(v as CodeLanguage)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CODE_LANGUAGES.map(lang => (
                          <SelectItem key={lang} value={lang} className="capitalize">{lang.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Starter code */}
                  <div className="space-y-2">
                    <Label>Starter Code (optional)</Label>
                    <textarea
                      value={starterCode}
                      onChange={e => setStarterCode(e.target.value)}
                      rows={6}
                      placeholder={`def solution():\n    # Your code here\n    pass`}
                      className="w-full font-mono text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y bg-slate-950 text-slate-100"
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">Students will see this code pre-filled in the editor.</p>
                  </div>

                  {/* Test cases */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Test Cases</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addTestCase} className="gap-1 h-7 text-xs">
                        <Plus className="h-3 w-3" /> Add Test Case
                      </Button>
                    </div>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-start px-3 py-2 font-medium text-muted-foreground">#</th>
                            <th className="text-start px-3 py-2 font-medium text-muted-foreground">Input</th>
                            <th className="text-start px-3 py-2 font-medium text-muted-foreground">Expected Output</th>
                            <th className="text-center px-3 py-2 font-medium text-muted-foreground" title="Hidden test cases are not shown to students">Hidden</th>
                            <th className="px-3 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {testCases.map((tc, i) => (
                            <tr key={tc.id} className={tc.isHidden ? 'bg-slate-50' : ''}>
                              <td className="px-3 py-2 text-muted-foreground font-medium">{i + 1}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={tc.input}
                                  onChange={e => updateTestCase(tc.id, 'input', e.target.value)}
                                  placeholder="e.g. [1,2,3]"
                                  className="w-full font-mono border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={tc.expectedOutput}
                                  onChange={e => updateTestCase(tc.id, 'expectedOutput', e.target.value)}
                                  placeholder="e.g. 6"
                                  className="w-full font-mono border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => updateTestCase(tc.id, 'isHidden', !tc.isHidden)}
                                  className={`p-1 rounded transition-colors ${tc.isHidden ? 'text-slate-600' : 'text-muted-foreground/40 hover:text-slate-400'}`}
                                  title={tc.isHidden ? 'Hidden from student' : 'Visible to student'}
                                >
                                  {tc.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => removeTestCase(tc.id)} className="text-red-400 hover:text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <EyeOff className="h-3 w-3 inline me-1" />
                      Hidden test cases are not shown to students — use them to prevent hard-coding.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── File Upload type ── */}
            {qType === 'file_upload' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-purple-600" />
                    File Submission Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Allowed File Types</Label>
                    <div className="flex flex-wrap gap-2">
                      {ALLOWED_EXTENSIONS.map(ext => (
                        <button
                          key={ext}
                          type="button"
                          onClick={() => toggleExt(ext)}
                          className={`rounded-full px-3 py-1 text-xs font-mono font-medium border transition-colors ${
                            allowedExts.includes(ext)
                              ? 'bg-purple-100 text-purple-700 border-purple-300'
                              : 'border-muted text-muted-foreground hover:border-purple-300'
                          }`}
                        >
                          {ext}
                        </button>
                      ))}
                    </div>
                    {allowedExts.length === 0 && (
                      <p className="text-xs text-red-500">Select at least one allowed file type.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Maximum File Size (MB)</Label>
                    <div className="flex items-center gap-3 max-w-xs">
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={maxFileSizeMB}
                        onChange={e => setMaxFileSizeMB(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">MB</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-purple-50 border border-purple-100 p-3 text-xs text-purple-700 space-y-1">
                    <p className="font-semibold">Manual Review Required</p>
                    <p>File submissions are not auto-graded. After the exam ends, teachers must open each submission and assign a score manually.</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {allowedExts.map(ext => <Badge key={ext} variant="info" className="text-[10px] font-mono">{ext}</Badge>)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Meta */}
            <Card>
              <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select defaultValue="medium" onValueChange={() => {}}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Marks</Label>
                    <Input type="number" defaultValue={4} {...register('marks')} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input placeholder="algorithms, sorting, complexity" {...register('tags')} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CLO Mapping Tab — replaces old free-text mapping fields */}
          <TabsContent value="mapping" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>CLO Mapping</CardTitle>
              </CardHeader>
              <CardContent>
                <CurriculumPicker
                  value={cloSelection}
                  onChange={setCloSelection}
                  institutionId={undefined}
                />
                {!cloSelection?.cloId && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Linking a CLO is optional but recommended — it enables Bloom&apos;s taxonomy analytics and accreditation exports.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Item Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Review Status</Label>
                  <Select defaultValue="draft">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="review">Submit for Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Allow use in auto-generated exams', defaultChecked: true },
                    { label: 'Visible to other teachers in institution', defaultChecked: false },
                    { label: 'Randomize answer order when used', defaultChecked: true },
                  ].map(opt => (
                    <label key={opt.label} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked={opt.defaultChecked} className="h-4 w-4" />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Discard</Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {saved ? <><Check className="h-4 w-4" /> Saved!</> : isSubmitting ? 'Saving...' : 'Save Item'}
          </Button>
        </div>
      </form>
    </div>
  );
}
