'use client';
import { useState, useEffect } from 'react';
import { getCollaborators, addCollaborator, removeCollaborator, getAllUsers } from '@/lib/data';
import type { ItemBankCollaborator, ItemBankPermissionRole, CurrentUser } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search, UserPlus } from 'lucide-react';

interface ManageAccessDialogProps {
  bankId: string;
  bankOwnerId: string;
  open: boolean;
  onClose: () => void;
}

export function ManageAccessDialog({ bankId, bankOwnerId, open, onClose }: ManageAccessDialogProps) {
  const [collaborators, setCollaborators] = useState<ItemBankCollaborator[]>([]);
  const [allUsers, setAllUsers] = useState<CurrentUser[]>([]);
  const [search, setSearch] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getCollaborators(bankId).then(setCollaborators);
    getAllUsers().then(setAllUsers);
  }, [open, bankId]);

  const collaboratorIds = new Set(collaborators.map(c => c.userId));
  const q = search.trim().toLowerCase();
  const candidates = allUsers.filter(u =>
    u.role === 'teacher' &&
    u.id !== bankOwnerId &&
    !collaboratorIds.has(u.id) &&
    (q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  );

  async function handleAdd(userId: string) {
    setBusyUserId(userId);
    try {
      const collab = await addCollaborator(bankId, userId, inviteRole);
      setCollaborators(prev => [...prev, collab]);
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setBusyUserId(userId);
    try {
      await removeCollaborator(bankId, userId);
      setCollaborators(prev => prev.filter(c => c.userId !== userId));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRoleChange(userId: string, role: ItemBankPermissionRole) {
    if (role === 'owner') return;
    setBusyUserId(userId);
    try {
      const collab = await addCollaborator(bankId, userId, role);
      setCollaborators(prev => prev.map(c => (c.userId === userId ? collab : c)));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Manage Access</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Collaborators</p>
            {collaborators.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No one else has access yet.</p>
            ) : (
              <div className="space-y-1.5">
                {collaborators.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.userName}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.userEmail}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Select
                        value={c.permissionRole}
                        onValueChange={v => handleRoleChange(c.userId, v as ItemBankPermissionRole)}
                        disabled={busyUserId === c.userId}
                      >
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => handleRemove(c.userId)}
                        disabled={busyUserId === c.userId}
                        className="text-red-400 hover:text-red-600 p-1 disabled:opacity-40"
                        title="Remove access"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Invite Colleagues</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  className="ps-8 h-8 text-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as 'editor' | 'viewer')}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {search && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No matching colleagues found in your institution.</p>
                ) : (
                  candidates.slice(0, 8).map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleAdd(u.id)}
                      disabled={busyUserId === u.id}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <UserPlus className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
