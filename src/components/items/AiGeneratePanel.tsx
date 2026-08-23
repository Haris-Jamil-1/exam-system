'use client';
import { useState, useRef, useEffect } from 'react';
import type { QuestionType } from '@/types';
import { MAX_BATCH_SIZE } from '@/lib/ai/constants';
import { CurriculumPicker, type CurriculumSelection } from '@/components/shared/CurriculumPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Upload, Check, X, Loader2, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Mirrors the server's own `text: z.string().min(10)` on /api/ai/generate-questions. */
const MIN_SOURCE_CHARS = 10;

const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'csv'] as const;
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map(e => `.${e}`).join(',');

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
  /** Called when a generation job finishes with at least one item created. */
  onGenerated: () => void;
  onClose: () => void;
}

interface GenerationJobStatus {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  producedCount: number;
  requestedCount: number;
  error: string | null;
}

export function AiGeneratePanel({ bankId, onGenerated, onClose }: AiGeneratePanelProps) {
  const [docText, setDocText] = useState('');
  const [fileName, setFileName] = useState('');
  // Extraction used to be invisible: the filename appeared instantly while the PDF was still
  // being parsed server-side, and any failure was swallowed by a bare catch — leaving the
  // Generate button silently disabled with nothing on screen explaining why.
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [genDifficulty, setGenDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [genType, setGenType] = useState<QuestionType>('mcq');
  const [quantity, setQuantity] = useState(5);
  const [cloSelection, setCloSelection] = useState<CurriculumSelection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  const [partialNote, setPartialNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quantityInvalid = quantity < 1 || quantity > MAX_BATCH_SIZE;
  const sourceChars = docText.trim().length;
  // An upload on its own is a complete path: whatever text the file yields IS the source
  // material, so nothing has to be pasted. This is the single gate for both routes.
  const sourceReady = sourceChars >= MIN_SOURCE_CHARS;

  /** Why the Generate button can't run yet — shown instead of an inert disabled button. */
  const blockedReason = (() => {
    if (extracting) return 'Reading the document — this finishes on its own, then you can generate.';
    if (fileError) return fileError;
    if (sourceChars === 0) return 'Upload a document above, or paste the content, to generate questions from it.';
    if (!sourceReady) return `That is only ${sourceChars} character${sourceChars === 1 ? '' : 's'} of source material — at least ${MIN_SOURCE_CHARS} are needed.`;
    if (quantityInvalid) return `Quantity must be between 1 and ${MAX_BATCH_SIZE}.`;
    return null;
  })();

  async function ingestFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    setFileName(file.name);
    setFileError(null);
    setDocText('');

    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      setFileError(`"${file.name}" isn't a supported file type. Use PDF, DOC, DOCX, TXT, MD or CSV.`);
      return;
    }

    // Plain-text formats are read in the browser; PDF/Word need server-side extraction.
    if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      const text = await file.text().catch(() => '');
      if (!text.trim()) {
        setFileError(`"${file.name}" appears to be empty.`);
        return;
      }
      setDocText(text);
      return;
    }

    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract-text', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        setFileError(typeof json.error === 'string' ? json.error : `Could not read "${file.name}".`);
        return;
      }
      const text = (json.text ?? '').trim();
      if (!text) {
        // Overwhelmingly a scanned/image-only PDF — there is no text layer to extract, and no
        // amount of retrying will change that, so say so rather than failing mutely.
        setFileError(
          `No selectable text was found in "${file.name}". If it's a scan or images, run OCR first, or paste the content below instead.`,
        );
        return;
      }
      setDocText(text);
    } catch {
      setFileError(`Could not read "${file.name}" — check your connection and try again.`);
    } finally {
      setExtracting(false);
    }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allows re-picking the same file after a failure
    if (file) await ingestFile(file);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await ingestFile(file);
  }

  function clearFile() {
    setFileName('');
    setFileError(null);
    setDocText('');
  }

  // Generation is an async job (Phase 3): POST returns 202 {jobId}; this
  // effect polls the job until it reaches a terminal state. Polling matches
  // the codebase's established idiom (notifications 30s, results 15s).
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/jobs/${jobId}`);
        if (!res.ok || cancelled) return;
        const job = (await res.json()) as GenerationJobStatus;
        if (job.status === 'queued' || job.status === 'running') return;
        clearInterval(timer);
        setIsGenerating(false);
        setJobId(null);
        if (job.status === 'failed') {
          setError(job.error ?? 'Generation failed');
          return;
        }
        setGeneratedCount(job.producedCount);
        if (job.status === 'partial') {
          setPartialNote(`Only ${job.producedCount} of ${job.requestedCount} requested items could be created.`);
        }
        onGenerated();
      } catch {
        // Transient polling failure — next tick retries.
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onGenerated is a fresh closure per parent render; jobId alone drives the poll lifecycle
  }, [jobId]);

  async function handleGenerate() {
    if (!sourceReady || quantityInvalid) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedCount(null);
    setPartialNote(null);
    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: docText,
          count: quantity,
          difficulty: genDifficulty,
          type: genType,
          itemBankId: bankId,
          learningObjectiveId: cloSelection?.cloId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : 'Generation failed');
      }
      const { jobId: createdJobId } = (await res.json()) as { jobId: string };
      setJobId(createdJobId); // polling effect takes over; isGenerating stays true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
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
        <div className="space-y-3">
          <Label>Source material</Label>

          {/* Centred upload area. Uploading is the primary route — it used to be a small text
              link tucked beside the label, which read as a secondary afterthought to the paste
              box. Drag-and-drop lands on the same handler as the file picker. */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors',
              dragging ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 bg-muted/20',
            )}
          >
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              {extracting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
              className="mx-auto mt-3 gap-2"
            >
              <Upload className="h-4 w-4" />
              {fileName ? 'Choose a different file' : 'Choose a file'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileInputChange}
            />

            {/* The instruction line: what to upload, and that an upload alone is sufficient. */}
            <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
              Upload the material you want the questions written from — a lecture PDF, a Word
              document, or plain-text notes. The text is pulled out of the file automatically, so
              an upload on its own is enough; you don&apos;t need to paste anything as well. You
              can also drag a file straight onto this box.
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              PDF · DOC · DOCX · TXT · MD · CSV
            </p>

            {extracting && (
              <p className="mt-3 text-xs text-blue-700">Reading text from {fileName}…</p>
            )}

            {!extracting && fileError && (
              <div className="mx-auto mt-3 flex max-w-md items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-start">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-red-700">{fileError}</p>
                  <button type="button" onClick={clearFile} className="mt-1 text-xs font-medium text-red-700 underline">
                    Remove
                  </button>
                </div>
              </div>
            )}

            {!extracting && !fileError && fileName && sourceChars > 0 && (
              <div className="mx-auto mt-3 flex max-w-md items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-start">
                <FileText className="h-4 w-4 shrink-0 text-green-700" />
                <p className="min-w-0 flex-1 truncate text-xs text-green-800">
                  <span className="font-medium">{fileName}</span> — {sourceChars.toLocaleString()} characters ready
                </p>
                <button type="button" onClick={clearFile} className="shrink-0 text-xs font-medium text-green-800 underline">
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or paste the content yourself</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Textarea
            placeholder="Paste lecture notes, a textbook excerpt, or a topic description here…"
            rows={6}
            value={docText}
            onChange={e => { setDocText(e.target.value); setFileError(null); }}
          />
          {sourceChars > 0 && (
            <p className="text-xs text-muted-foreground">
              {sourceChars.toLocaleString()} characters of source material
              {fileName && !fileError ? ` (from ${fileName} — edit freely)` : ''}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="space-y-2">
            <Label>Quantity <span className="text-muted-foreground font-normal">(max {MAX_BATCH_SIZE})</span></Label>
            <Input
              type="number"
              min={1}
              max={MAX_BATCH_SIZE}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className={quantityInvalid ? 'border-red-400' : undefined}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Target CLO <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <CurriculumPicker value={cloSelection} onChange={setCloSelection} />
        </div>

        {quantityInvalid && (
          <p className="text-xs text-red-600">Quantity must be between 1 and {MAX_BATCH_SIZE}.</p>
        )}
        <div className="space-y-1.5">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !sourceReady || quantityInvalid}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? (jobId ? 'Generating… (you can keep working, this runs in the background)' : 'Starting…') : `Generate ${quantity} Question${quantity === 1 ? '' : 's'}`}
          </Button>
          {/* A disabled button with no explanation was a dead end — especially after an upload
              whose extraction returned nothing. */}
          {!isGenerating && blockedReason && !quantityInvalid && (
            <p className="text-xs text-muted-foreground">{blockedReason}</p>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {partialNote && <p className="text-sm text-amber-700">{partialNote}</p>}
        {generatedCount !== null && (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <Check className="h-4 w-4" /> {generatedCount} question{generatedCount !== 1 ? 's' : ''} added to this bank as drafts — review and submit them for approval below. Items flagged as possible duplicates carry a &quot;possible duplicate&quot; badge.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
