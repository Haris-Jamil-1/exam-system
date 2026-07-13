'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getMyClasses, createClass } from '@/lib/data';
import type { ClassSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, GraduationCap, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

function ClassCard({ cls }: { cls: ClassSummary }) {
  return (
    <Link href={`/teacher/classes/${cls.id}`}>
      <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <GraduationCap className="h-4 w-4" />
              </span>
              <p className="font-medium text-sm truncate">{cls.name}</p>
            </div>
            {cls.archivedAt && <Badge variant="secondary" className="text-xs shrink-0">Archived</Badge>}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users2 className="h-3 w-3" /> {cls.studentCount} student{cls.studentCount === 1 ? '' : 's'}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground col-span-full">
      <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  function refresh() {
    getMyClasses().then(setClasses);
  }

  useEffect(refresh, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createClass(name);
      setCreateOpen(false);
      setName('');
      refresh();
    } finally {
      setCreating(false);
    }
  }

  const visible = classes.filter(c => showArchived || !c.archivedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        en="Classes"
        ar="الفصول"
        subEn="Create classes and invite students to join them"
        subAr="أنشئ الفصول وادعُ الطلاب للانضمام إليها"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Plus className="h-4 w-4" /> New Class
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowArchived(v => !v)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.length === 0
          ? <EmptyState text="No classes yet. Create your first class to start inviting students." />
          : visible.map(c => <ClassCard key={c.id} cls={c} />)}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Class</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. CS101 — Fall 2026" value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
