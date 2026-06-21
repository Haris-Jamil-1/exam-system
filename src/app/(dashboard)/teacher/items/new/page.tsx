'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createItem } from '@/lib/data';
import { generateQuestions } from '@/lib/ai/question-generator';
import type { QuestionType, Option } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Sparkles, Check } from 'lucide-react';

const schema = z.object({
  stem: z.string().min(5, 'Question stem is required'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  marks: z.number().min(1),
  tags: z.string().optional(),
  status: z.enum(['draft', 'review', 'approved']),
});

type FormData = z.infer<typeof schema>;

const QUESTION_TYPES: { value: QuestionType; label: string; group: string }[] = [
  { value: 'mcq', label: 'Multiple Choice (MCQ)', group: 'Open Choices' },
  { value: 'mrq', label: 'Multiple Response (MRQ)', group: 'Open Choices' },
  { value: 'true_false', label: 'True / False', group: 'Limited Choices' },
  { value: 'short_answer', label: 'Short Answer', group: 'Complete' },
  { value: 'essay', label: 'Essay', group: 'Series' },
  { value: 'fill_blank', label: 'Fill in the Blank', group: 'Complete' },
  { value: 'matching', label: 'Matching', group: 'Matching & Ordering' },
  { value: 'ordering', label: 'Ordering', group: 'Matching & Ordering' },
];

export default function NewItemPage() {
  const router = useRouter();
  const [qType, setQType] = useState<QuestionType>('mcq');
  const [options, setOptions] = useState<Option[]>([
    { id: 'opt-1', text: '', isCorrect: false },
    { id: 'opt-2', text: '', isCorrect: false },
    { id: 'opt-3', text: '', isCorrect: false },
    { id: 'opt-4', text: '', isCorrect: false },
  ]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stemValue, setStemValue] = useState('');

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

  async function onSubmit(data: FormData) {
    const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const showOptions = ['mcq', 'mrq', 'true_false', 'matching', 'ordering'].includes(qType);
    const correct = options.filter(o => o.isCorrect).map(o => o.text);

    await createItem({
      type: qType,
      stem: data.stem,
      options: showOptions ? options.filter(o => o.text.trim()) : undefined,
      correctAnswer: qType === 'mrq' ? correct : correct[0],
      marks: data.marks,
      difficulty: data.difficulty,
      order: 0,
      status: data.status,
      tags,
      authorId: 'teacher-1',
    });
    setSaved(true);
    setTimeout(() => router.push('/teacher/items'), 1000);
  }

  const showOptions = ['mcq', 'mrq', 'true_false', 'matching', 'ordering'].includes(qType);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/items" className="hover:text-[#1A1D23] transition-colors">Item Bank</Link>
        <span className="select-none">›</span>
        <span className="font-medium text-[#1A1D23]">Create Item</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue="basic">
          <TabsList className="mb-4">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
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
                      <p className="font-medium">{t.label}</p>
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
                <CardHeader><CardTitle>Answer Options</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCorrect(opt.id)}
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          opt.isCorrect ? 'border-green-500 bg-green-500' : 'border-gray-300'
                        }`}
                      >
                        {opt.isCorrect && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <span className="text-xs font-medium text-gray-400 w-4">{String.fromCharCode(65 + i)}</span>
                      <Input
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        value={opt.text}
                        onChange={e => updateOption(opt.id, e.target.value)}
                        className="flex-1"
                      />
                      <button type="button" onClick={() => removeOption(opt.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1">
                    <Plus className="h-3 w-3" /> Add Option
                  </Button>
                  <p className="text-xs text-muted-foreground">Click the circle to mark the correct answer(s)</p>
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

          {/* Mapping Tab */}
          <TabsContent value="mapping" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Curriculum Mapping</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Learning Objective</Label>
                  <Input placeholder="Students will be able to..." />
                </div>
                <div className="space-y-2">
                  <Label>Bloom&apos;s Taxonomy Level</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      {['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'].map(l => (
                        <SelectItem key={l} value={l.toLowerCase()}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Topic / Chapter</Label>
                  <Input placeholder="Chapter 3: Sorting Algorithms" />
                </div>
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
