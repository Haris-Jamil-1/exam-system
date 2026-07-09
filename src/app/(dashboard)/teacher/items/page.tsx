'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getInstitutionBanks, getMyPrivateBanks, getSharedWithMeBanks, createItemBank } from '@/lib/data';
import type { ItemBank } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Library, Building2, Lock, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const ROLE_BADGE: Record<string, 'success' | 'info' | 'outline'> = {
  owner: 'success',
  editor: 'info',
  viewer: 'outline',
};

function BankCard({ bank }: { bank: ItemBank }) {
  return (
    <Link href={`/teacher/items/${bank.id}`}>
      <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {bank.bankLevel === 'institutional' ? <Building2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <p className="font-medium text-sm truncate">{bank.name}</p>
            </div>
            {bank.myRole && (
              <Badge variant={ROLE_BADGE[bank.myRole]} className="text-xs capitalize shrink-0">{bank.myRole}</Badge>
            )}
          </div>
          {bank.description && <p className="text-xs text-muted-foreground line-clamp-2">{bank.description}</p>}
          <p className="text-xs text-muted-foreground">{bank.itemCount ?? 0} item{bank.itemCount === 1 ? '' : 's'}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Library; text: string }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground col-span-full">
      <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

export default function ItemBanksPage() {
  const [institutionBanks, setInstitutionBanks] = useState<ItemBank[]>([]);
  const [privateBanks, setPrivateBanks] = useState<ItemBank[]>([]);
  const [sharedBanks, setSharedBanks] = useState<ItemBank[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  function refresh() {
    getInstitutionBanks().then(setInstitutionBanks);
    getMyPrivateBanks().then(setPrivateBanks);
    getSharedWithMeBanks().then(setSharedBanks);
  }

  useEffect(refresh, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createItemBank({ name, description: description || undefined, bankLevel: 'personal' });
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
        subEn="Institutional repositories and your own collaborative question banks"
        subAr="مستودعات المؤسسة وبنوك أسئلتك التعاونية"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Plus className="h-4 w-4" /> New Private Bank
          </Button>
        }
      />

      <Tabs defaultValue="institution">
        <TabsList className="mb-4">
          <TabsTrigger value="institution" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Institution Banks ({institutionBanks.length})</TabsTrigger>
          <TabsTrigger value="private" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> My Private Banks ({privateBanks.length})</TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Shared with Me ({sharedBanks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="institution">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {institutionBanks.length === 0
              ? <EmptyState icon={Building2} text="No institutional banks yet. Ask your admin to create one and assign you as an editor." />
              : institutionBanks.map(b => <BankCard key={b.id} bank={b} />)}
          </div>
        </TabsContent>
        <TabsContent value="private">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {privateBanks.length === 0
              ? <EmptyState icon={Lock} text="You haven't created a private bank yet." />
              : privateBanks.map(b => <BankCard key={b.id} bank={b} />)}
          </div>
        </TabsContent>
        <TabsContent value="shared">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sharedBanks.length === 0
              ? <EmptyState icon={Users2} text="No one has shared a private bank with you yet." />
              : sharedBanks.map(b => <BankCard key={b.id} bank={b} />)}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Private Bank</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Midterm Question Pool" value={name} onChange={e => setName(e.target.value)} />
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
    </div>
  );
}
