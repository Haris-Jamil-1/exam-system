'use client';
import { useMemo, useState } from 'react';
import { getStudents, setStudentTags } from '@/lib/data';
import { useServerData } from '@/hooks/useServerData';
import { invalidateData } from '@/lib/data-refresh';
import type { StudentRosterEntry } from '@/lib/data/students';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { trustScoreTextClass } from '@/lib/trust-score';
import { Search, Mail, X, Plus, Tag as TagIcon } from 'lucide-react';

// Stable empty-array reference so `students` doesn't change identity every render while data is
// still loading — a fresh `data ?? []` literal would otherwise re-trigger the allTags useMemo
// below on every render.
const NO_STUDENTS: StudentRosterEntry[] = [];

// Inline, per-row tag editor — a removable chip per existing tag plus a small "+" affordance
// that reveals a text input on click. No standalone reusable tag-input component exists
// elsewhere in this codebase yet (CLO/violation-type "tags" are read-only Badge displays, not
// editable inputs), so this is purpose-built rather than force-fitting an unrelated component.
function TagEditor({ tags, onAdd, onRemove }: { tags: string[]; onAdd: (tag: string) => void; onRemove: (tag: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
          {tag}
          <button onClick={() => onRemove(tag)} className="text-blue-400 hover:text-blue-700" title={`Remove ${tag}`}>
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(''); setAdding(false); } }}
          onBlur={commit}
          placeholder="Tag name…"
          className="h-6 w-24 text-[11px] px-1.5"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-blue-600 hover:border-blue-300">
          <Plus className="h-2.5 w-2.5" /> Tag
        </button>
      )}
    </div>
  );
}

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagValue, setBulkTagValue] = useState('');
  const { data } = useServerData(() => getStudents(), [], { scope: 'users' });
  const students: StudentRosterEntry[] = data ?? NO_STUDENTS;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => s.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [students]);

  const filtered = students.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())) &&
    (!tagFilter || s.tags.includes(tagFilter))
  );

  async function mutateTag(studentIds: string[], tag: string, action: 'add' | 'remove') {
    if (!tag.trim() || studentIds.length === 0) return;
    await setStudentTags(studentIds, tag.trim(), action);
    invalidateData('users');
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        en="Students"
        ar="الطلاب"
        subEn="Students enrolled across your exams — invite students from a class in the Classes tab"
        subAr="الطلاب المسجلون في اختباراتك"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#E8ECF4] bg-white ps-9 pe-4 text-[13px] text-[#1A1D23] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#1E88E5] focus:ring-4 focus:ring-[#1E88E5]/10"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${!tagFilter ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${tagFilter === tag ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-medium text-blue-800">{selected.size} selected</span>
          <Input
            value={bulkTagValue}
            onChange={e => setBulkTagValue(e.target.value)}
            placeholder="Tag name…"
            className="h-7 w-40 text-xs bg-white"
          />
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={!bulkTagValue.trim()}
            onClick={() => mutateTag(Array.from(selected), bulkTagValue, 'add')}
          >
            <Plus className="h-3 w-3" /> Bulk Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={!bulkTagValue.trim()}
            onClick={() => mutateTag(Array.from(selected), bulkTagValue, 'remove')}
          >
            <X className="h-3 w-3" /> Remove Tag
          </Button>
          <button onClick={() => setSelected(new Set())} className="ms-auto text-xs text-blue-700 hover:underline">Clear selection</button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#EBF0F8] bg-[#F9FBFE]">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(s => selected.has(s.id))}
                    onChange={e => setSelected(e.target.checked ? new Set(filtered.map(s => s.id)) : new Set())}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Student</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] md:table-cell">Email</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] lg:table-cell">Class</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] xl:table-cell">Tags</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Trust Score</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] sm:table-cell">Violations</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF0F8]">
              {filtered.map(s => {
                const vCount = s.violationCount;
                const hasTrust = s.trustScore !== null;
                return (
                  <tr key={s.id} className="transition-colors hover:bg-[#F9FBFE]">
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="rounded-lg bg-[#E3F0FD] text-[11px] font-bold text-[#1E88E5]">
                            {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[13px] font-semibold text-[#1A1D23]">{s.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
                        <Mail className="h-3 w-3 text-[#9CA3AF]" />
                        {s.email}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 lg:table-cell">
                      {s.classNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.classNames.map(name => (
                            <Badge key={name} variant="secondary" className="text-[11px] font-normal">{name}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#C4C9D4]">No class</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 xl:table-cell">
                      <TagEditor
                        tags={s.tags}
                        onAdd={tag => mutateTag([s.id], tag, 'add')}
                        onRemove={tag => mutateTag([s.id], tag, 'remove')}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      {hasTrust ? (
                        <span className={`text-[13px] font-semibold ${trustScoreTextClass(s.trustScore!)}`}>
                          {Math.round(s.trustScore!)}%
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#9CA3AF]">Not yet computed</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 text-[13px] text-[#6B7280] sm:table-cell">{vCount}</td>
                    <td className="px-4 py-3.5">
                      <Badge variant={vCount === 0 ? 'success' : vCount > 2 ? 'danger' : 'warning'}>
                        {vCount === 0 ? 'Clean' : vCount > 2 ? 'Flagged' : 'Warning'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
