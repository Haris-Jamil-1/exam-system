'use client';
import { useState, useRef } from 'react';
import type { QuestionType, Item } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Upload, Check, X } from 'lucide-react';

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

interface AiGeneratePanelProps {
  bankId: string;
  onGenerated: (items: Item[]) => void;
  onClose: () => void;
}

export function AiGeneratePanel({ bankId, onGenerated, onClose }: AiGeneratePanelProps) {
  const [docText, setDocText] = useState('');
  const [fileName, setFileName] = useState('');
  const [genDifficulty, setGenDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [genType, setGenType] = useState<QuestionType>('mcq');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
      setDocText('');
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/api/extract-text', { method: 'POST', body: fd });
        const json = await res.json();
        setDocText(json.text ?? '');
      } catch {
        setDocText('');
      }
    } else {
      const reader = new FileReader();
      reader.onload = ev => setDocText((ev.target?.result as string) ?? '');
      reader.readAsText(file);
    }
  }

  async function handleGenerate() {
    if (!docText.trim()) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedCount(null);
    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: docText, count: 5, difficulty: genDifficulty, type: genType, itemBankId: bankId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.toString() ?? 'Generation failed');
      }
      const { items } = await res.json() as { items: Item[] };
      setGeneratedCount(items.length);
      onGenerated(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" /> Generate Questions with AI
        </CardTitle>
        <button onClick={onClose} className="text-muted-foreground hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
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
              {fileName ? fileName : 'Upload file (.pdf, .doc, .docx, .txt, .md)'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          <Textarea
            placeholder="Paste your lecture notes, textbook excerpt, or topic description here — or upload a PDF / Word / .txt file above…"
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
            <Select value={genDifficulty} onValueChange={v => setGenDifficulty(v as 'easy' | 'medium' | 'hard')}>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        {generatedCount !== null && (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <Check className="h-4 w-4" /> {generatedCount} question{generatedCount !== 1 ? 's' : ''} added to this bank as drafts — review and submit them for approval below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
