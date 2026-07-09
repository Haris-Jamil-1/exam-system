'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getItemBankById, getItems, updateItem } from '@/lib/data';
import type { Item, ItemBank, ItemStatus, QuestionType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ChevronDown, ChevronUp, Check, Clock, Hourglass, Archive, AlertTriangle, Upload, Users2, Sparkles, ChevronRight, Building2, Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { BulkImportModal } from '@/components/shared/BulkImportModal';
import { ManageAccessDialog } from '@/components/shared/ManageAccessDialog';
import { AiGeneratePanel } from '@/components/items/AiGeneratePanel';

const STATUS_STYLES: Record<ItemStatus, 'outline' | 'warning' | 'success' | 'secondary'> = {
  draft: 'outline',
  review: 'warning',
  approved: 'success',
  archived: 'secondary',
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ', mrq: 'MRQ', true_false: 'T/F', short_answer: 'Short',
  essay: 'Essay', fill_blank: 'Fill', matching: 'Match', ordering: 'Order',
  coding: 'Code', file_upload: 'File',
};

const DIFF_STYLES: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success', medium: 'warning', hard: 'danger',
};

function psychometricFlag(item: Item): { label: string; title: string } | null {
  const fi = item.facilityIndex;
  const di = item.discriminationIndex;
  if (fi !== undefined && fi > 0.9) return { label: 'Too Easy', title: `Facility Index ${(fi * 100).toFixed(0)}% — consider increasing difficulty` };
  if (fi !== undefined && fi < 0.2) return { label: 'Too Hard', title: `Facility Index ${(fi * 100).toFixed(0)}% — consider decreasing difficulty` };
  if (di !== undefined && di < 0.2) return { label: 'Low Disc.', title: `Discrimination Index ${di.toFixed(2)} — item does not differentiate well between high/low performers` };
  return null;
}

function ItemRow({ item, onSubmit, onArchive }: { item: Item; onSubmit: (id: string) => void; onArchive: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const hasOptions = item.options && item.options.length > 0;
  const hasExpandable = hasOptions || !!item.correctAnswer;
  const flag = psychometricFlag(item);

  async function handleSubmit() {
    setSubmitting(true);
    await onSubmit(item.id);
    setSubmitting(false);
  }

  async function handleArchive() {
    setArchiving(true);
    await onArchive(item.id);
    setArchiving(false);
  }

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            {hasExpandable && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-0.5 text-muted-foreground hover:text-gray-700 shrink-0"
                title={expanded ? 'Collapse' : hasOptions ? 'Show options' : 'Show answer'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            {!hasExpandable && <span className="w-4 shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-medium text-sm leading-snug line-clamp-2">{item.stem}</p>
                {flag && (
                  <span
                    title={flag.title}
                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-semibold cursor-help"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {flag.label}
                  </span>
                )}
              </div>
              {item.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {item.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
        </td>
        <td className="px-4 py-3 hidden sm:table-cell">
          <Badge variant={DIFF_STYLES[item.difficulty]} className="text-xs capitalize">{item.difficulty}</Badge>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{item.usageCount}×</td>
        <td className="px-4 py-3 hidden xl:table-cell text-sm text-center">
          {item.facilityIndex !== undefined
            ? <span className={`font-mono text-xs ${item.facilityIndex < 0.2 || item.facilityIndex > 0.9 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                {(item.facilityIndex * 100).toFixed(0)}%
              </span>
            : <span className="text-xs text-muted-foreground/50">—</span>
          }
        </td>
        <td className="px-4 py-3 hidden xl:table-cell text-sm text-center">
          {item.discriminationIndex !== undefined
            ? <span className={`font-mono text-xs ${item.discriminationIndex < 0.2 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                {item.discriminationIndex.toFixed(2)}
              </span>
            : <span className="text-xs text-muted-foreground/50">—</span>
          }
        </td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_STYLES[item.status]} className="text-xs capitalize">{item.status}</Badge>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.status === 'draft' && (
              <Button size="sm" variant="outline" onClick={handleSubmit} disabled={submitting} className="gap-1 h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50">
                <Clock className="h-3 w-3" />
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            )}
            {item.status === 'review' && (
              <span className="text-xs text-orange-600 flex items-center gap-1"><Hourglass className="h-3 w-3" /> Awaiting approval</span>
            )}
            {item.status === 'approved' && (
              <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> Approved</span>
            )}
            {item.status === 'archived' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Archive className="h-3 w-3" /> Archived</span>
            )}
            {item.status !== 'archived' && (
              <Button size="sm" variant="ghost" onClick={handleArchive} disabled={archiving} className="gap-1 h-7 text-xs text-muted-foreground hover:text-red-600" title="Archive item">
                <Archive className="h-3 w-3" />
                {archiving ? '…' : 'Archive'}
              </Button>
            )}
          </div>
        </td>
      </tr>

      {expanded && !hasOptions && item.correctAnswer && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-4 pb-3 pt-0">
            <div className="ms-6 flex items-center gap-2 rounded-lg border bg-green-50 px-3 py-2">
              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <span className="text-xs font-medium text-green-800">Correct answer:</span>
              <span className="text-xs text-green-700">{String(item.correctAnswer)}</span>
            </div>
            {item.explanation && <p className="ms-6 mt-2 text-xs text-muted-foreground italic border-s-2 border-blue-200 ps-2">{item.explanation}</p>}
          </td>
        </tr>
      )}

      {expanded && hasOptions && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="px-4 pb-3 pt-0">
            <div className="ms-6 border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-start px-3 py-1.5 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-start px-3 py-1.5 font-medium text-muted-foreground">Option</th>
                    <th className="text-start px-3 py-1.5 font-medium text-muted-foreground w-20">Correct</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {item.options!.map((opt, j) => (
                    <tr key={opt.id} className={opt.isCorrect ? 'bg-green-50' : ''}>
                      <td className="px-3 py-1.5 font-semibold text-muted-foreground">{String.fromCharCode(65 + j)}</td>
                      <td className={`px-3 py-1.5 ${opt.isCorrect ? 'font-medium text-green-800' : 'text-gray-600'}`}>{opt.text}</td>
                      <td className="px-3 py-1.5">{opt.isCorrect && <Check className="h-3.5 w-3.5 text-green-600" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {item.explanation && <p className="ms-6 mt-2 text-xs text-muted-foreground italic border-s-2 border-blue-200 ps-2">{item.explanation}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ItemBankDetailPage() {
  const { bankId } = useParams<{ bankId: string }>();
  const [bank, setBank] = useState<ItemBank | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const refreshItems = useCallback(() => {
    getItems({ bankId }).then(setItems);
  }, [bankId]);

  useEffect(() => {
    getItemBankById(bankId).then(b => setBank(b ?? null));
    refreshItems();
  }, [bankId, refreshItems]);

  async function handleSubmitForReview(id: string) {
    const updated = await updateItem(id, { status: 'review' });
    if (updated) setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'review' as ItemStatus } : i));
  }

  async function handleArchive(id: string) {
    const updated = await updateItem(id, { status: 'archived' });
    if (updated) setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'archived' as ItemStatus } : i));
  }

  function filterItems(status: string) {
    return items.filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (diffFilter !== 'all' && item.difficulty !== diffFilter) return false;
      if (search && !item.stem.toLowerCase().includes(search.toLowerCase()) &&
          !item.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }

  function ItemTable({ items: tableItems }: { items: Item[] }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">Question</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Difficulty</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Usage</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell" title="Facility Index">FI %</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell" title="Discrimination Index">DI</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableItems.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No items found</td></tr>
            ) : tableItems.map(item => (
              <ItemRow key={item.id} item={item} onSubmit={handleSubmitForReview} onArchive={handleArchive} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const counts = {
    all: items.filter(i => i.status !== 'archived').length,
    approved: items.filter(i => i.status === 'approved').length,
    review: items.filter(i => i.status === 'review').length,
    draft: items.filter(i => i.status === 'draft').length,
    archived: items.filter(i => i.status === 'archived').length,
  };

  const atRisk = items.filter(i =>
    i.status === 'approved' && (
      (i.discriminationIndex !== undefined && i.discriminationIndex < 0.2) ||
      (i.facilityIndex !== undefined && (i.facilityIndex < 0.2 || i.facilityIndex > 0.9))
    )
  ).length;

  if (!bank) {
    return <div className="text-center py-12 text-muted-foreground">Loading bank…</div>;
  }

  const canManage = bank.myRole === 'owner';
  const canEdit = bank.myRole === 'owner' || bank.myRole === 'editor';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/items" className="hover:text-[#1A1D23] transition-colors">Item Banks</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-[#1A1D23]">{bank.name}</span>
      </div>

      <PageHeader
        en={bank.name}
        ar={bank.name}
        subEn={bank.description || (bank.bankLevel === 'institutional' ? 'Institutional bank' : 'Private bank')}
        subAr={bank.description || ''}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={bank.bankLevel === 'institutional' ? 'info' : 'outline'} className="gap-1">
              {bank.bankLevel === 'institutional' ? <Building2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {bank.bankLevel}
            </Badge>
            {canManage && (
              <Button variant="outline" onClick={() => setAccessOpen(true)} className="gap-2">
                <Users2 className="h-4 w-4" /> Manage Access
              </Button>
            )}
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
                  <Upload className="h-4 w-4" /> Import CSV
                </Button>
                <Button variant="outline" onClick={() => setAiOpen(o => !o)} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Generate with AI
                </Button>
                <Link href={`/teacher/items/new?bankId=${bankId}`}>
                  <Button className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
                    <Plus className="h-4 w-4" /> Add Question
                  </Button>
                </Link>
              </>
            )}
          </div>
        }
      />

      {aiOpen && canEdit && (
        <AiGeneratePanel
          bankId={bankId}
          onGenerated={() => { refreshItems(); setAiOpen(false); }}
          onClose={() => setAiOpen(false)}
        />
      )}

      {atRisk > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p>
            <strong>{atRisk} approved item{atRisk > 1 ? 's' : ''}</strong> flagged for poor psychometric performance.
            Check the <strong>FI %</strong> and <strong>DI</strong> columns — items with DI &lt; 0.20 or FI outside 20–90% may need revision.
          </p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by stem or tag…" className="ps-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map(t => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={diffFilter} onValueChange={setDiffFilter}>
          <SelectTrigger className="w-28"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="all">
            <div className="border-b px-4 pt-4">
              <TabsList className="bg-transparent p-0 gap-4">
                {([
                  { value: 'all', label: `All (${counts.all})` },
                  { value: 'approved', label: `Approved (${counts.approved})` },
                  { value: 'review', label: `Need Review (${counts.review})` },
                  { value: 'draft', label: `Draft (${counts.draft})` },
                  { value: 'archived', label: `Archived (${counts.archived})` },
                ] as const).map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 pb-2">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {(['all', 'approved', 'review', 'draft', 'archived'] as const).map(status => (
              <TabsContent key={status} value={status} className="mt-0">
                <ItemTable items={filterItems(status)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <BulkImportModal bankId={bankId} open={importOpen} onClose={() => setImportOpen(false)} onImported={refreshItems} />
      {canManage && <ManageAccessDialog bankId={bankId} bankOwnerId={bank.ownerId} open={accessOpen} onClose={() => setAccessOpen(false)} />}
    </div>
  );
}
