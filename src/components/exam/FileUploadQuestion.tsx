'use client';
// Phase 2: upload to Supabase Storage; store object path in prisma.answer
// Phase 2: teacher reviews uploads in results page — no auto-grading
import { useState, useRef } from 'react';
import type { Question } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUp, X, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  question: Question;
  value: File | null;
  onChange: (file: File | null) => void;
}

export function FileUploadQuestion({ question, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const allowedTypes = question.allowedFileTypes ?? ['.pdf'];
  const maxMB = question.maxFileSizeMB ?? 10;
  const maxBytes = maxMB * 1024 * 1024;

  function validateAndSet(file: File) {
    setError(null);
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(ext)) {
      setError(`File type "${ext}" is not allowed. Accepted: ${allowedTypes.join(', ')}`);
      return;
    }
    if (file.size > maxBytes) {
      setError(`File is too large (${formatBytes(file.size)}). Maximum allowed: ${maxMB} MB`);
      return;
    }
    onChange(file);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSet(file);
  }

  function handleRemove() {
    onChange(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Info bar */}
      <div className="flex items-start gap-3 rounded-lg border bg-purple-50 border-purple-100 p-3 text-xs text-purple-800">
        <FileUp className="h-4 w-4 shrink-0 mt-0.5 text-purple-600" />
        <div className="space-y-0.5">
          <p className="font-semibold">File Submission</p>
          <p>Accepted types: <span className="font-mono">{allowedTypes.join(', ')}</span> · Max size: {maxMB} MB</p>
          <p className="text-purple-600 italic">This submission will be reviewed manually by your teacher after the exam.</p>
        </div>
      </div>

      {/* Allowed types display */}
      <div className="flex flex-wrap gap-1.5">
        {allowedTypes.map(ext => (
          <Badge key={ext} variant="info" className="font-mono text-[10px]">{ext}</Badge>
        ))}
      </div>

      {/* Drop zone */}
      {!value && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-purple-500 bg-purple-50'
              : 'border-muted hover:border-purple-300 hover:bg-purple-50/30'
          }`}
        >
          <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {dragging ? 'Drop your file here' : 'Click or drag & drop your file'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {allowedTypes.join(', ')} · max {maxMB} MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={allowedTypes.join(',')}
            className="hidden"
            onChange={handleInput}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          {error}
        </div>
      )}

      {/* Uploaded file preview */}
      {value && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-green-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800 truncate">{value.name}</p>
            <p className="text-xs text-green-600 mt-0.5">{formatBytes(value.size)}</p>
          </div>
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-red-600 shrink-0 h-7 w-7 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="gap-2 text-xs"
        >
          <FileUp className="h-3.5 w-3.5" /> Replace file
          <input
            ref={inputRef}
            type="file"
            accept={allowedTypes.join(',')}
            className="hidden"
            onChange={handleInput}
          />
        </Button>
      )}

      {question.required && !value && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          This question requires a file submission before you can proceed.
        </p>
      )}
    </div>
  );
}
