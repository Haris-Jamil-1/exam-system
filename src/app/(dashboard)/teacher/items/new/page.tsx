'use client';
// Phase 2: createItem calls prisma.item.create(); cloId stored as learning_objective_id FK
// Phase 2: codeLanguage, starterCode, testCases, allowedFileTypes, maxFileSizeMB stored in Prisma item row
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createItem } from '@/lib/data';
import { invalidateData } from '@/lib/data-refresh';
import { itemFormSchema, type ItemFormData } from '@/lib/item-form-schema';
import type { QuestionType, Option } from '@/types';
import { CurriculumPicker, type CurriculumSelection } from '@/components/shared/CurriculumPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Check, Code2, FileUp, Eye, EyeOff, ChevronRight, Mic, Video } from 'lucide-react';
import { MathTextarea, MathInput } from '@/components/rich/MathTextField';
import { QuillEditor } from '@/components/rich/QuillEditor';
import { RubricEditor } from '@/components/items/RubricEditor';
import {
  type RubricRow, type RubricLevelColumn,
  DEFAULT_RUBRIC_LEVELS, defaultRubricRows, compileRubric, isRubricValid,
} from '@/lib/rubric';

type FormData = ItemFormData;

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
  { value: 'audio_response', label: 'Audio Response',        group: 'Advanced' },
  { value: 'video_response', label: 'Video Response',        group: 'Advanced' },
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
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [stemValue, setStemValue] = useState('');
  // Explanation/feedback shown with the answer key. The column and createItem() already
  // persisted it (AI-generated items fill it in) — the manual builder just never exposed it.
  const [explanation, setExplanation] = useState('');
  // Difficulty/Status are plain controlled state (not react-hook-form fields) — same pattern this
  // file already uses for codeLanguage/allowedExts/maxFileSizeMB — because the Select components
  // previously had no onChange/register wiring at all and always silently saved 'medium'/'draft'
  // regardless of what the user picked.
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [status, setStatus] = useState<'draft' | 'review' | 'approved'>('draft');

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

  // Audio/video response type state — see types/index.ts's MediaSettings for field meanings.
  const [minDurationSeconds, setMinDurationSeconds] = useState(0);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(120);
  const [prepTimeSeconds, setPrepTimeSeconds] = useState(30);
  const [allowScreenShare, setAllowScreenShare] = useState(false);
  const [maxRetries, setMaxRetries] = useState(1);

  // Essay rubric state — hierarchical editor; only the compiled flat criteria list is ever
  // persisted (see lib/rubric.ts's compileRubric), in the shape the AI grading pipeline expects.
  const [rubricEnabled, setRubricEnabled] = useState(true);
  const [rubricLevels, setRubricLevels] = useState<RubricLevelColumn[]>(DEFAULT_RUBRIC_LEVELS);
  const [rubricRows, setRubricRows] = useState<RubricRow[]>(defaultRubricRows());

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { marks: 4, stem: '' },
  });

  // The stem is now a controlled field (the math toolbar has to insert at the caret, which
  // needs the current value), so it feeds react-hook-form through setValue rather than register.
  function handleStemChange(value: string) {
    setStemValue(value);
    setValue('stem', value, { shouldValidate: true });
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
    setSaveError('');

    if (qType === 'essay' && rubricEnabled && !isRubricValid(rubricRows)) {
      setSaveError('Rubric weights must sum to 100% (and each dimension\'s sub-dimensions must sum to its own weight) before saving.');
      return;
    }

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

    try {
      await createItem({
        type: qType,
        stem: data.stem,
        explanation: explanation.trim() || undefined,
        options: showOptions ? filledOptions.map(({ matchText: _mt, ...o }) => o) : undefined,
        correctAnswer,
        marks: data.marks,
        difficulty,
        order: 0,
        status,
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
        ...(qType === 'audio_response' || qType === 'video_response' ? {
          mediaSettings: {
            minDurationSeconds: minDurationSeconds > 0 ? minDurationSeconds : undefined,
            maxDurationSeconds,
            prepTimeSeconds: prepTimeSeconds > 0 ? prepTimeSeconds : undefined,
            ...(qType === 'video_response' ? { allowScreenShare } : {}),
            maxRetries: maxRetries > 0 ? maxRetries : undefined,
          },
        } : {}),
        // AI Auto-Grading off (or no dimensions entered) => no rubric saved at all, which is
        // already this app's existing "no rubric = manual grading only" rule — no new gating
        // needed in the AI grading pipeline itself.
        ...(qType === 'essay' && rubricEnabled && rubricRows.length > 0
          ? { rubric: compileRubric(rubricRows, rubricLevels, data.marks) }
          : {}),
      });
      setSaved(true);
      invalidateData('items');
      setTimeout(() => router.push(`/teacher/items/${bankId}`), 1000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save item.');
    }
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
    <div className="space-y-6">
      {/* Breadcrumb — ChevronRight (not a raw "›" character) so it can flip for RTL below;
          a literal ">" glyph doesn't rotate and points the wrong way once the trail reads
          right-to-left. */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/items" className="hover:text-[#1A1D23] transition-colors">Item Banks</Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <Link href={`/teacher/items/${bankId}`} className="hover:text-[#1A1D23] transition-colors">Bank</Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
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
                        {t.value === 'audio_response' && <Mic className="h-3 w-3" />}
                        {t.value === 'video_response' && <Video className="h-3 w-3" />}
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
              <CardHeader className="pb-2">
                <CardTitle>Question Stem</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <QuillEditor
                  placeholder="Enter your question here..."
                  value={stemValue}
                  onValueChange={handleStemChange}
                />
                {errors.stem && <p className="text-sm text-red-500">{errors.stem.message}</p>}
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
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-2 mb-1 px-1">
                      <span className="text-xs font-medium text-muted-foreground">Term (left column)</span>
                      <span />
                      <span className="text-xs font-medium text-muted-foreground">Match (right column)</span>
                      <span />
                    </div>
                  )}
                  {options.map((opt, i) => (
                    <div key={opt.id} className={`flex items-center gap-2 ${qType === 'matching' ? 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-2' : ''}`}>
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
                      <QuillEditor
                        compact
                        className="flex-1 min-w-0"
                        placeholder={qType === 'matching' ? `Term ${i + 1}` : `Option ${String.fromCharCode(65 + i)}`}
                        value={opt.text}
                        onValueChange={value => updateOption(opt.id, value)}
                      />
                      {qType === 'matching' && (
                        <>
                          <span className="text-gray-400 text-xs">→</span>
                          <QuillEditor
                            compact
                            className="flex-1 min-w-0"
                            placeholder={`Match ${i + 1}`}
                            value={opt.matchText ?? ''}
                            onValueChange={value => updateMatchText(opt.id, value)}
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
                  <MathInput
                    placeholder={qType === 'fill_blank' ? 'Expected answer (exact match, case-insensitive)' : 'Model answer for auto-grading'}
                    value={correctAnswerText}
                    onValueChange={setCorrectAnswerText}
                  />
                  <p className="text-xs text-muted-foreground">
                    {qType === 'fill_blank'
                      ? 'Student responses are compared case-insensitively.'
                      : 'Short-answer auto-grading uses exact case-insensitive match. Leave blank for manual grading.'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Explanation / feedback */}
            <Card>
              <CardHeader className="pb-2"><CardTitle>Explanation</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <MathTextarea
                  placeholder="Why is this the correct answer? Shown with the answer key."
                  rows={3}
                  value={explanation}
                  onValueChange={setExplanation}
                />
                <p className="text-xs text-muted-foreground">Optional. Supports math and chemistry.</p>
              </CardContent>
            </Card>

            {/* Essay rubric */}
            {qType === 'essay' && (
              <Card>
                <CardHeader><CardTitle>Scoring Rubric</CardTitle></CardHeader>
                <CardContent>
                  <RubricEditor
                    enabled={rubricEnabled}
                    onEnabledChange={setRubricEnabled}
                    levels={rubricLevels}
                    onLevelsChange={setRubricLevels}
                    rows={rubricRows}
                    onRowsChange={setRubricRows}
                  />
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

            {/* ── Audio/Video response type ── */}
            {(qType === 'audio_response' || qType === 'video_response') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {qType === 'audio_response' ? <Mic className="h-4 w-4 text-purple-600" /> : <Video className="h-4 w-4 text-purple-600" />}
                    Recording Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Prep Time (seconds)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={300}
                        value={prepTimeSeconds}
                        onChange={e => setPrepTimeSeconds(Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Countdown before recording auto-starts. 0 = no prep time.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Min Duration (seconds)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={maxDurationSeconds}
                        value={minDurationSeconds}
                        onChange={e => setMinDurationSeconds(Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">0 = no minimum.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Max Duration (seconds)</Label>
                      <Input
                        type="number"
                        min={Math.max(1, minDurationSeconds)}
                        max={1800}
                        value={maxDurationSeconds}
                        onChange={e => setMaxDurationSeconds(Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Recording auto-stops at this limit.</p>
                    </div>
                  </div>

                  <div className="space-y-2 max-w-xs">
                    <Label>Retries Allowed</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={maxRetries}
                      onChange={e => setMaxRetries(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">How many times the student can delete and re-record before submitting. 0 = one take only.</p>
                  </div>

                  {qType === 'video_response' && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowScreenShare}
                        onChange={e => setAllowScreenShare(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <div>
                        <span className="text-sm font-medium">Allow screen share</span>
                        <p className="text-xs text-muted-foreground">Records screen + webcam side-by-side instead of webcam only (e.g. for a walkthrough demo).</p>
                      </div>
                    </label>
                  )}

                  <div className="rounded-lg bg-purple-50 border border-purple-100 p-3 text-xs text-purple-700 space-y-1">
                    <p className="font-semibold">Manual Review Required</p>
                    <p>{qType === 'audio_response' ? 'Audio' : 'Video'} responses are not auto-graded. After the exam ends, teachers must listen to / watch each recording and assign a score manually.</p>
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
                    <Select value={difficulty} onValueChange={v => setDifficulty(v as typeof difficulty)}>
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
                    <Input type="number" defaultValue={4} {...register('marks', { valueAsNumber: true })} />
                    {errors.marks && <p className="text-sm text-red-500">{errors.marks.message}</p>}
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
                  <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
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

        <div className="flex items-center justify-between gap-4 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Discard</Button>
          <div className="flex items-center gap-3">
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {saved ? <><Check className="h-4 w-4" /> Saved!</> : isSubmitting ? 'Saving...' : 'Save Item'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
