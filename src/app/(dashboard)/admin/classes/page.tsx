'use client';
import { useState } from 'react';
import { getInstitutionClasses, createClass, getClassCollaborators, addClassCollaborator, removeClassCollaborator } from '@/lib/data';
import { useServerData } from '@/hooks/useServerData';
import { invalidateData } from '@/lib/data-refresh';
import type { ClassSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Building2, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ManageAccessDialog } from '@/components/shared/ManageAccessDialog';

export default function AdminClassesPage() {
  const { data: classesData } = useServerData(() => getInstitutionClasses(), [], { scope: 'classes' });
  const classes: ClassSummary[] = classesData ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [accessClass, setAccessClass] = useState<ClassSummary | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createClass(name, 'institutional');
      setCreateOpen(false);
      setName('');
      invalidateData('classes');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        en="Classes"
        ar="الفصول"
        subEn="Institutional class rosters — assign teachers as editors to let them manage the roster"
        subAr="فصول المؤسسة"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]">
            <Plus className="h-4 w-4" /> New Institutional Class
          </Button>
        }
      />

      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No institutional classes yet. Create one and assign teachers as editors.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {classes.map(cls => (
            <Card key={cls.id}>
              <CardContent className="p-4 space-y-3">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" /> {cls.name}
                </p>
                <p className="text-xs text-muted-foreground">{cls.studentCount} student{cls.studentCount === 1 ? '' : 's'}</p>
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAccessClass(cls)}>
                  <Users2 className="h-3.5 w-3.5" /> Manage Editors
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Institutional Class</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Department of Computer Science — Cohort 2026" value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {accessClass && (
        <ManageAccessDialog
          resourceId={accessClass.id}
          resourceOwnerId={accessClass.ownerId}
          open={!!accessClass}
          onClose={() => setAccessClass(null)}
          fetchCollaborators={getClassCollaborators}
          onAdd={addClassCollaborator}
          onRemove={removeClassCollaborator}
        />
      )}
    </div>
  );
}
