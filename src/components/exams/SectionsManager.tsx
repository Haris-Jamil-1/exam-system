'use client';
import { useState } from 'react';
import { createSection, updateSection, deleteSection } from '@/lib/data';
import type { ExamSection } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, AlertTriangle, GripVertical } from 'lucide-react';

interface SectionsManagerProps {
  examId: string;
  sections: ExamSection[];
  onChange: (sections: ExamSection[]) => void;
  isSectionSequential: boolean;
  onToggleSectionSequential: (v: boolean) => void;
  isItemSequential: boolean;
  onToggleItemSequential: (v: boolean) => void;
}

interface SectionFormState {
  title: string;
  instructions: string;
  durationMinutes: string;
  orderIndex: number;
  sectionWeight: number;
  passingThreshold: string;
}

const EMPTY_FORM: SectionFormState = { title: '', instructions: '', durationMinutes: '', orderIndex: 1, sectionWeight: 0, passingThreshold: '' };

export function SectionsManager({
  examId, sections, onChange, isSectionSequential, onToggleSectionSequential, isItemSequential, onToggleItemSequential,
}: SectionsManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<SectionFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const totalWeight = sections.reduce((s, sec) => s + sec.sectionWeight, 0);

  function startCreate() {
    setForm({ ...EMPTY_FORM, orderIndex: sections.length + 1 });
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(section: ExamSection) {
    setForm({
      title: section.title,
      instructions: section.instructions ?? '',
      durationMinutes: section.durationMinutes?.toString() ?? '',
      orderIndex: section.orderIndex,
      sectionWeight: section.sectionWeight,
      passingThreshold: section.passingThreshold?.toString() ?? '',
    });
    setEditingId(section.id);
    setCreating(false);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        examId,
        title: form.title,
        instructions: form.instructions || undefined,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        orderIndex: form.orderIndex,
        sectionWeight: form.sectionWeight,
        passingThreshold: form.passingThreshold ? Number(form.passingThreshold) : undefined,
      };
      if (editingId) {
        const updated = await updateSection(editingId, payload);
        if (updated) onChange(sections.map(s => (s.id === editingId ? updated : s)));
      } else {
        const created = await createSection(payload);
        onChange([...sections, created]);
      }
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function remove(section: ExamSection) {
    const count = section.questionCount ?? 0;
    if (count > 0 && !confirm(`Delete "${section.title}"? This will also delete its ${count} question${count === 1 ? '' : 's'}.`)) return;
    await deleteSection(section.id);
    onChange(sections.filter(s => s.id !== section.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Sections</p>
          <p className="text-xs text-muted-foreground">
            Total weight: <span className={totalWeight === 100 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{totalWeight}%</span>
            {totalWeight !== 100 && sections.length > 0 && ' — should sum to 100%'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={startCreate} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add Section
        </Button>
      </div>

      {sections.length === 0 && !creating && (
        <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm">
          No sections yet. This exam behaves as a normal single-part exam until you add one.
        </div>
      )}

      <div className="space-y-2">
        {sections
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map(section => (
            <div key={section.id}>
              {editingId === section.id ? (
                <SectionForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />
              ) : (
                <div className="flex items-start gap-3 border rounded-lg p-3 bg-gray-50">
                  <GripVertical className="h-4 w-4 text-gray-300 mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">#{section.orderIndex}</span>
                      <p className="font-medium text-sm">{section.title}</p>
                      <Badge variant="outline" className="text-xs">{section.sectionWeight}% weight</Badge>
                      {section.durationMinutes && <Badge variant="outline" className="text-xs">{section.durationMinutes} min</Badge>}
                      {section.passingThreshold !== undefined && <Badge variant="outline" className="text-xs">pass ≥ {section.passingThreshold}%</Badge>}
                      <span className="text-xs text-muted-foreground">{section.questionCount ?? 0} question{section.questionCount === 1 ? '' : 's'}</span>
                    </div>
                    {section.instructions && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{section.instructions}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(section)} className="p-1.5 text-muted-foreground hover:text-gray-900" title="Edit section">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(section)} className="p-1.5 text-red-400 hover:text-red-600" title="Delete section">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        {creating && <SectionForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />}
      </div>

      {sections.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isSectionSequential} onChange={e => onToggleSectionSequential(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <div>
              <span className="text-sm font-medium">Lock Completed Sections</span>
              <p className="text-xs text-muted-foreground">Students cannot go back to a section once they submit it.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isItemSequential} onChange={e => onToggleItemSequential(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <div>
              <span className="text-sm font-medium">Lock Answered Questions</span>
              <p className="text-xs text-muted-foreground">Within a section, answering a question auto-advances and hides Previous.</p>
            </div>
          </label>
        </div>
      )}

      {totalWeight !== 100 && sections.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Section weights sum to {totalWeight}%, not 100% — the composite score will not represent a full 0-100 scale until they do.
        </div>
      )}
    </div>
  );
}

function SectionForm({ form, setForm, onSave, onCancel, saving }: {
  form: SectionFormState; setForm: (f: SectionFormState) => void; onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-3 bg-blue-50/50 border-blue-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Reading Comprehension" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Order</Label>
          <Input type="number" min={1} value={form.orderIndex} onChange={e => setForm({ ...form, orderIndex: Number(e.target.value) })} className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Instructions <span className="text-muted-foreground font-normal">(shown before this section starts)</span></Label>
        <Textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={2} className="text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Duration (min) <span className="text-muted-foreground font-normal">optional</span></Label>
          <Input type="number" min={1} value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} placeholder="No limit" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Weight (%)</Label>
          <Input type="number" min={0} max={100} value={form.sectionWeight} onChange={e => setForm({ ...form, sectionWeight: Number(e.target.value) })} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pass threshold (%) <span className="text-muted-foreground font-normal">optional</span></Label>
          <Input type="number" min={0} max={100} value={form.passingThreshold} onChange={e => setForm({ ...form, passingThreshold: e.target.value })} placeholder="None" className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving || !form.title.trim()}>{saving ? 'Saving…' : 'Save Section'}</Button>
      </div>
    </div>
  );
}
