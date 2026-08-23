'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getClassesPageData, createClass } from '@/lib/data';
import { useServerData } from '@/hooks/useServerData';
import { invalidateData } from '@/lib/data-refresh';
import type { ClassSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, GraduationCap, Building2, Lock, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const ROLE_BADGE: Record<string, 'success' | 'info' | 'outline'> = {
  owner: 'success',
  editor: 'info',
  viewer: 'outline',
};

function ClassCard({ cls }: { cls: ClassSummary }) {
  return (
    <Link href={`/teacher/classes/${cls.id}`}>
      <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {cls.classLevel === 'institutional' ? <Building2 className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
              </span>
              <p className="font-medium text-sm truncate">{cls.name}</p>
            </div>
            {cls.myRole && (
              <Badge variant={ROLE_BADGE[cls.myRole]} className="text-xs capitalize shrink-0">{cls.myRole}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cls.archivedAt && <Badge variant="secondary" className="text-xs">Archived</Badge>}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users2 className="h-3 w-3" /> {cls.studentCount} student{cls.studentCount === 1 ? '' : 's'}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof GraduationCap; text: string }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground col-span-full">
      <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

export default function TeacherClassesPage() {
  const { data: classesData } = useServerData(() => getClassesPageData(), [], { scope: 'classes' });
  const institutionClasses: ClassSummary[] = classesData?.institutionClasses ?? [];
  const privateClasses: ClassSummary[] = classesData?.privateClasses ?? [];
  const sharedClasses: ClassSummary[] = classesData?.sharedClasses ?? [];
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createClass(name, 'personal');
      setCreateOpen(false);
      setName('');
      invalidateData('classes');
    } finally {
      setCreating(false);
    }
  }

  const filterArchived = (list: ClassSummary[]) => list.filter(c => showArchived || !c.archivedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        en="Classes"
        ar="الفصول"
        subEn="Institutional classes and your own collaborative rosters"
        subAr="فصول المؤسسة وقوائم طلابك التعاونية"
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

      <Tabs defaultValue="institution">
        <TabsList className="mb-4">
          <TabsTrigger value="institution" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Institution Classes ({institutionClasses.length})</TabsTrigger>
          <TabsTrigger value="private" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> My Private Classes ({privateClasses.length})</TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Shared with Me ({sharedClasses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="institution">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filterArchived(institutionClasses).length === 0
              ? <EmptyState icon={Building2} text="No institutional classes yet. Ask your admin to create one and assign you as an editor." />
              : filterArchived(institutionClasses).map(c => <ClassCard key={c.id} cls={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="private">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filterArchived(privateClasses).length === 0
              ? <EmptyState icon={GraduationCap} text="No classes yet. Create your first class to start inviting students." />
              : filterArchived(privateClasses).map(c => <ClassCard key={c.id} cls={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="shared">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filterArchived(sharedClasses).length === 0
              ? <EmptyState icon={Users2} text="No one has shared a class with you yet." />
              : filterArchived(sharedClasses).map(c => <ClassCard key={c.id} cls={c} />)}
          </div>
        </TabsContent>
      </Tabs>

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
