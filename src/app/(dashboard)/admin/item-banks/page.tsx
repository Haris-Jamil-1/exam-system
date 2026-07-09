'use client';
import { useState, useEffect } from 'react';
import { getInstitutionBanks, createItemBank } from '@/lib/data';
import type { ItemBank } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Building2, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ManageAccessDialog } from '@/components/shared/ManageAccessDialog';

export default function AdminItemBanksPage() {
  const [banks, setBanks] = useState<ItemBank[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [accessBank, setAccessBank] = useState<ItemBank | null>(null);

  function refresh() {
    getInstitutionBanks().then(setBanks);
  }

  useEffect(refresh, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createItemBank({ name, description: description || undefined, bankLevel: 'institutional' });
      setCreateOpen(false);
      setName('');
      setDescription('');
      refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        en="Item Banks"
        ar="بنوك الأسئلة"
        subEn="Institutional question repositories — assign instructors as editors to let them contribute"
        subAr="مستودعات أسئلة المؤسسة"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]">
            <Plus className="h-4 w-4" /> New Institutional Bank
          </Button>
        }
      />

      {banks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No institutional banks yet. Create one and assign teachers as editors.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {banks.map(bank => (
            <Card key={bank.id}>
              <CardContent className="p-4 space-y-3">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" /> {bank.name}
                </p>
                {bank.description && <p className="text-xs text-muted-foreground line-clamp-2">{bank.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {bank.itemCount ?? 0} item{bank.itemCount === 1 ? '' : 's'} · review submissions in Item Review
                </p>
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAccessBank(bank)}>
                  <Users2 className="h-3.5 w-3.5" /> Manage Editors
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Institutional Bank</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Department of Computer Science" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="What is this bank for?" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {accessBank && (
        <ManageAccessDialog
          bankId={accessBank.id}
          bankOwnerId={accessBank.ownerId}
          open={!!accessBank}
          onClose={() => setAccessBank(null)}
        />
      )}
    </div>
  );
}
