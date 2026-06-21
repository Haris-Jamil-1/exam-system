'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getItems, updateItem } from '@/lib/data';
import type { Item, ItemStatus, QuestionType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ChevronDown, ChevronUp, Check, Clock, Hourglass } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const STATUS_STYLES: Record<ItemStatus, 'outline' | 'warning' | 'success'> = {
  draft: 'outline',
  review: 'warning',
  approved: 'success',
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ',
  mrq: 'MRQ',
  true_false: 'T/F',
  short_answer: 'Short',
  essay: 'Essay',
  fill_blank: 'Fill',
  matching: 'Match',
  ordering: 'Order',
};

const DIFF_STYLES: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

function ItemRow({ item, onSubmit }: { item: Item; onSubmit: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const hasOptions = item.options && item.options.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    await onSubmit(item.id);
    setSubmitting(false);
  }

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            {hasOptions && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-0.5 text-muted-foreground hover:text-gray-700 shrink-0"
                title={expanded ? 'Collapse' : 'Show options'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            {!hasOptions && <span className="w-4 shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium text-sm leading-snug line-clamp-2">{item.stem}</p>
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
        <td className="px-4 py-3">
          <Badge variant={STATUS_STYLES[item.status]} className="text-xs capitalize">{item.status}</Badge>
        </td>
        <td className="px-4 py-3">
          {item.status === 'draft' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1 h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              <Clock className="h-3 w-3" />
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </Button>
          ) : item.status === 'review' ? (
            <span className="text-xs text-orange-600 flex items-center gap-1">
              <Hourglass className="h-3 w-3" /> Awaiting admin approval
            </span>
          ) : (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Approved
            </span>
          )}
        </td>
      </tr>

      {/* Expanded options row */}
      {expanded && hasOptions && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-4 pb-3 pt-0">
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
                      <td className="px-3 py-1.5">
                        {opt.isCorrect && <Check className="h-3.5 w-3.5 text-green-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {item.explanation && (
              <p className="ms-6 mt-2 text-xs text-muted-foreground italic border-s-2 border-blue-200 ps-2">{item.explanation}</p>
            )}
            {!hasOptions && item.correctAnswer && (
              <p className="ms-6 mt-2 text-xs">
                <span className="font-medium">Answer: </span>
                <span className="text-green-700">{Array.isArray(item.correctAnswer) ? item.correctAnswer.join(', ') : item.correctAnswer}</span>
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ItemBankPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');

  useEffect(() => {
    getItems().then(setItems);
  }, []);

  async function handleSubmitForReview(id: string) {
    const updated = await updateItem(id, { status: 'review' });
    if (updated) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'review' as ItemStatus } : i));
    }
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

  function ItemTable({ items }: { items: Item[] }) {
    return (
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground">Question</th>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type</th>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Difficulty</th>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Usage</th>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-start px-4 py-3 font-medium text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-8 text-muted-foreground">No items found</td>
            </tr>
          ) : items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onSubmit={handleSubmitForReview}
            />
          ))}
        </tbody>
      </table>
    );
  }

  const counts = {
    all: items.length,
    approved: items.filter(i => i.status === 'approved').length,
    review: items.filter(i => i.status === 'review').length,
    draft: items.filter(i => i.status === 'draft').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        en="Item Bank"
        ar="بنك الأسئلة"
        subEn="Create and manage your question items for exams"
        subAr="إنشاء وإدارة أسئلتك للاختبارات"
        action={
          <Link href="/teacher/items/new">
            <Button className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
              <Plus className="h-4 w-4" />
              Create Item
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by stem or tag…" className="ps-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="mcq">MCQ</SelectItem>
            <SelectItem value="mrq">MRQ</SelectItem>
            <SelectItem value="true_false">True/False</SelectItem>
            <SelectItem value="short_answer">Short Answer</SelectItem>
            <SelectItem value="essay">Essay</SelectItem>
            <SelectItem value="fill_blank">Fill in Blank</SelectItem>
            <SelectItem value="matching">Matching</SelectItem>
            <SelectItem value="ordering">Ordering</SelectItem>
          </SelectContent>
        </Select>
        <Select value={diffFilter} onValueChange={setDiffFilter}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="All" />
          </SelectTrigger>
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
                ] as const).map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 pb-2"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {(['all', 'approved', 'review', 'draft'] as const).map(status => (
              <TabsContent key={status} value={status} className="mt-0">
                <ItemTable items={filterItems(status)} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
