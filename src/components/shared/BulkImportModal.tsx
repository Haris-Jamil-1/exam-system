'use client';
// Bulk CSV Import for Item Bank
// Phase 2: send parsed rows to POST /api/items/bulk — validated + inserted via Prisma transaction
// CSV format: stem, type, difficulty, marks, correctAnswer, tags, cloCode
import { useState, useRef } from 'react';
import { createItem } from '@/lib/data';
import type { QuestionType } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface ParsedRow {
  stem: string;
  type: QuestionType;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  correctAnswer: string;
  tags: string[];
  valid: boolean;
  error?: string;
}

const VALID_TYPES = new Set<QuestionType>(['mcq','mrq','true_false','short_answer','essay','fill_blank','matching','ordering','coding','file_upload']);
const VALID_DIFF  = new Set(['easy','medium','hard']);

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  // Skip header row
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const [stem = '', type = '', difficulty = '', marksStr = '', correctAnswer = '', tagsStr = ''] = cols;
    const marks = parseInt(marksStr, 10);
    const tags  = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(Boolean) : [];

    if (!stem) return { stem, type: 'mcq' as QuestionType, difficulty: 'medium', marks: 1, correctAnswer, tags, valid: false, error: 'Stem is required' };
    if (!VALID_TYPES.has(type as QuestionType)) return { stem, type: 'mcq' as QuestionType, difficulty: 'medium', marks: 1, correctAnswer, tags, valid: false, error: `Unknown type: "${type}"` };
    if (!VALID_DIFF.has(difficulty)) return { stem, type: type as QuestionType, difficulty: 'medium', marks: 1, correctAnswer, tags, valid: false, error: `Unknown difficulty: "${difficulty}"` };
    if (isNaN(marks) || marks < 1) return { stem, type: type as QuestionType, difficulty: difficulty as 'easy' | 'medium' | 'hard', marks: 1, correctAnswer, tags, valid: false, error: 'Marks must be a positive number' };

    return { stem, type: type as QuestionType, difficulty: difficulty as 'easy' | 'medium' | 'hard', marks, correctAnswer, tags, valid: true };
  });
}

interface Props {
  bankId: string;
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}

export function BulkImportModal({ bankId, open, onClose, onImported }: Props) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone]         = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setDone(false);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    const valid = rows.filter(r => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    let count = 0;
    for (const row of valid) {
      await createItem({
        type: row.type,
        stem: row.stem,
        correctAnswer: row.correctAnswer || undefined,
        marks: row.marks,
        difficulty: row.difficulty,
        order: 0,
        status: 'draft',
        tags: row.tags,
        authorId: '',
        bankId,
      });
      count++;
    }
    setImportedCount(count);
    setImporting(false);
    setDone(true);
    onImported(count);
  }

  function handleClose() {
    setRows([]);
    setFileName('');
    setDone(false);
    setImportedCount(0);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  }

  const validCount   = rows.filter(r => r.valid).length;
  const invalidCount = rows.filter(r => !r.valid).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Bulk Import Items (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Template info */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 text-muted-foreground">
            <p className="font-semibold text-foreground">CSV Column Format (row 1 = header, ignored)</p>
            <p className="font-mono">stem, type, difficulty, marks, correctAnswer, tags</p>
            <p>• <strong>type:</strong> mcq | mrq | true_false | short_answer | essay | fill_blank | ordering | coding | file_upload</p>
            <p>• <strong>difficulty:</strong> easy | medium | hard</p>
            <p>• <strong>tags:</strong> semicolon-separated (e.g. <em>networking;OSI;protocols</em>)</p>
          </div>

          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {fileName
              ? <p className="text-sm font-medium text-blue-700">{fileName}</p>
              : <p className="text-sm text-muted-foreground">Click to select a .csv file</p>
            }
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          {/* Parse results */}
          {rows.length > 0 && !done && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> {validCount} valid
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="h-4 w-4" /> {invalidCount} invalid
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground">Stem</th>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground w-20">Type</th>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground w-20">Difficulty</th>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground w-16">Marks</th>
                      <th className="text-start px-3 py-2 font-medium text-muted-foreground w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, i) => (
                      <tr key={i} className={row.valid ? '' : 'bg-red-50'}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 max-w-xs truncate">{row.stem || <em className="text-muted-foreground">empty</em>}</td>
                        <td className="px-3 py-2">
                          <Badge variant="info" className="text-[10px]">{row.type}</Badge>
                        </td>
                        <td className="px-3 py-2 capitalize">{row.difficulty}</td>
                        <td className="px-3 py-2">{row.marks}</td>
                        <td className="px-3 py-2">
                          {row.valid
                            ? <Badge variant="success" className="text-[10px]">OK</Badge>
                            : <span className="text-red-600 text-[10px]">{row.error}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {done && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
              <p className="font-semibold text-green-800">{importedCount} item{importedCount !== 1 ? 's' : ''} imported successfully</p>
              <p className="text-xs text-green-700">All items created as Draft — submit for review to use in exams.</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {importing ? `Importing ${validCount} items…` : `Import ${validCount} Valid Items`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
