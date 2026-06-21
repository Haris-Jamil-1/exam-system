'use client';
import { useState, useEffect } from 'react';
import { getItems, updateItem } from '@/lib/data';
import type { Item, QuestionType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, ChevronDown, ChevronUp, Search, ClipboardCheck, Package } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'MCQ', mrq: 'MRQ', true_false: 'T/F', short_answer: 'Short',
  essay: 'Essay', fill_blank: 'Fill', matching: 'Match', ordering: 'Order',
};

const DIFF_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success', medium: 'warning', hard: 'danger',
};

const MOCK_AUTHORS: Record<string, string> = {
  'teacher-1': 'Dr. Sarah Mitchell',
  'teacher-2': 'Prof. James Chen',
  'teacher-3': 'Ms. Amira Hassan',
};

function ItemReviewCard({ item, onApprove, onReturn }: {
  item: Item;
  onApprove: (id: string) => void;
  onReturn: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState<'approve' | 'return' | null>(null);
  const hasOptions = item.options && item.options.length > 0;

  async function handleApprove() {
    setLoading('approve');
    await onApprove(item.id);
    setLoading(null);
  }

  async function handleReturn() {
    setLoading('return');
    await onReturn(item.id);
    setLoading(null);
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start gap-4 p-4 border-b bg-muted/20">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
              <Badge variant={DIFF_VARIANT[item.difficulty]} className="text-xs capitalize">{item.difficulty}</Badge>
              <Badge variant="outline" className="text-xs">{item.marks} pts</Badge>
              <span className="text-xs text-muted-foreground">by {MOCK_AUTHORS[item.authorId] ?? item.authorId}</span>
              <span className="text-xs text-muted-foreground">· {new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="font-medium text-sm leading-snug">{item.stem}</p>
            {item.tags.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {item.tags.map(tag => (
                  <span key={tag} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={loading !== null}
              className="gap-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <Check className="h-3.5 w-3.5" />
              {loading === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReturn}
              disabled={loading !== null}
              className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5" />
              {loading === 'return' ? 'Returning…' : 'Return'}
            </Button>
          </div>
        </div>

        {/* Options */}
        {hasOptions && (
          <div className="px-4 py-2">
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide options' : `Show ${item.options!.length} options`}
            </button>
            {expanded && (
              <div className="mt-2 border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {item.options!.map((opt, j) => (
                      <tr key={opt.id} className={opt.isCorrect ? 'bg-green-50' : 'bg-white'}>
                        <td className="px-3 py-2 font-semibold text-muted-foreground w-6">{String.fromCharCode(65 + j)}</td>
                        <td className={`px-3 py-2 ${opt.isCorrect ? 'font-medium text-green-800' : 'text-gray-700'}`}>{opt.text}</td>
                        <td className="px-3 py-2 w-8">{opt.isCorrect && <Check className="h-3.5 w-3.5 text-green-600" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Short/fill answer */}
        {!hasOptions && item.correctAnswer && (
          <div className="px-4 py-2 border-t">
            <span className="text-xs text-muted-foreground">Expected answer: </span>
            <span className="text-xs font-medium text-green-700">
              {Array.isArray(item.correctAnswer) ? item.correctAnswer.join(' → ') : item.correctAnswer}
            </span>
          </div>
        )}

        {item.explanation && (
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-muted-foreground italic">Explanation: {item.explanation}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [authorFilter, setAuthorFilter] = useState('all');

  useEffect(() => {
    getItems().then(setItems);
  }, []);

  async function handleApprove(id: string) {
    await updateItem(id, { status: 'approved' });
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' } : i));
  }

  async function handleReturn(id: string) {
    await updateItem(id, { status: 'draft' });
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'draft' } : i));
  }

  function filterItems(status: string) {
    return items.filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (authorFilter !== 'all' && item.authorId !== authorFilter) return false;
      if (search && !item.stem.toLowerCase().includes(search.toLowerCase()) &&
          !item.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }

  const pending = items.filter(i => i.status === 'review');
  const approved = items.filter(i => i.status === 'approved');
  const pendingFiltered = filterItems('review');
  const allFiltered = filterItems('all');

  return (
    <div className="space-y-6">
      <PageHeader en="Item Review" ar="مراجعة الأسئلة" subEn="Review and approve question items submitted by teachers" subAr="مراجعة وموافقة على أسئلة المعلمين" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Review', value: pending.length, icon: <ClipboardCheck className="h-5 w-5 text-orange-500" />, color: 'text-orange-600' },
          { label: 'Approved Items', value: approved.length, icon: <Check className="h-5 w-5 text-green-500" />, color: 'text-green-600' },
          { label: 'Total in Bank', value: items.length, icon: <Package className="h-5 w-5 text-blue-500" />, color: 'text-blue-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              {stat.icon}
              <div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
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
        <Select value={authorFilter} onValueChange={setAuthorFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All teachers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teachers</SelectItem>
            {Object.entries(MOCK_AUTHORS).map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="review">
        <TabsList className="mb-4">
          <TabsTrigger value="review" className="gap-2">
            Pending Review
            {pending.length > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center leading-none">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="all">All Items ({items.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="review">
          {pendingFiltered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground font-medium">
                  {pending.length === 0 ? 'No items pending review' : 'No items match your filters'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {pending.length === 0 ? 'Teachers will submit items here for your approval.' : 'Try adjusting filters above.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{pendingFiltered.length} item{pendingFiltered.length !== 1 ? 's' : ''} awaiting your review</p>
              {pendingFiltered.map(item => (
                <ItemReviewCard key={item.id} item={item} onApprove={handleApprove} onReturn={handleReturn} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved">
          <div className="space-y-3">
            {filterItems('approved').length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">No approved items match your filters.</CardContent>
              </Card>
            ) : (
              filterItems('approved').map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
                        <Badge variant={DIFF_VARIANT[item.difficulty]} className="text-xs capitalize">{item.difficulty}</Badge>
                        <Badge variant="outline" className="text-xs">{item.marks} pts</Badge>
                        <span className="text-xs text-muted-foreground">by {MOCK_AUTHORS[item.authorId] ?? item.authorId}</span>
                        <span className="text-xs text-muted-foreground">· used {item.usageCount}×</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{item.stem}</p>
                      {item.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {item.tags.map(tag => (
                            <span key={tag} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="success" className="text-xs gap-1">
                        <Check className="h-3 w-3" /> Approved
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 gap-1"
                        onClick={() => handleReturn(item.id)}
                      >
                        <X className="h-3 w-3" /> Revoke
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground">Question</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Author</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allFiltered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No items match your filters</td></tr>
                  ) : allFiltered.map(item => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium line-clamp-1">{item.stem}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info" className="text-xs">{TYPE_LABELS[item.type]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell text-xs">
                        {MOCK_AUTHORS[item.authorId] ?? item.authorId}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={item.status === 'approved' ? 'success' : item.status === 'review' ? 'warning' : 'outline'}
                          className="text-xs capitalize"
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {item.status === 'review' && (
                          <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleApprove(item.id)}>
                            <Check className="h-3 w-3" /> Approve
                          </Button>
                        )}
                        {item.status === 'approved' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50" onClick={() => handleReturn(item.id)}>
                            <X className="h-3 w-3" /> Revoke
                          </Button>
                        )}
                        {item.status === 'draft' && (
                          <span className="text-xs text-muted-foreground">Draft (teacher submits)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
