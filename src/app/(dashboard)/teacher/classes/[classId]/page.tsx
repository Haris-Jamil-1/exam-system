'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getClassById, updateClass, archiveClass, getEnrollments, removeEnrollment,
  getClassInvites, createClassInvites,
} from '@/lib/data';
import { parseBulkEmails } from '@/lib/class-permissions';
import type { ClassSummary, ClassEnrollmentSummary, ClassInviteSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronRight, Users2, UserPlus, Archive, ArchiveRestore, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const INVITE_STATUS_BADGE: Record<ClassInviteSummary['status'], 'warning' | 'success' | 'secondary'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'secondary',
};

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const [cls, setCls] = useState<ClassSummary | null>(null);
  const [enrollments, setEnrollments] = useState<ClassEnrollmentSummary[]>([]);
  const [invites, setInvites] = useState<ClassInviteSummary[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ email: string; outcome: string }[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getClassById(classId).then(c => { setCls(c ?? null); if (c) setName(c.name); });
    getEnrollments(classId).then(setEnrollments);
    getClassInvites(classId).then(setInvites);
  }, [classId]);

  useEffect(refresh, [refresh]);

  const parsedEmails = parseBulkEmails(bulkText);

  async function handleSendInvites() {
    if (parsedEmails.length === 0) return;
    setSending(true);
    try {
      const results = await createClassInvites(classId, parsedEmails);
      setSendResults(results);
      setBulkText('');
      refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleRename() {
    if (!name.trim()) return;
    const updated = await updateClass(classId, name);
    if (updated) setCls(updated);
    setRenameOpen(false);
  }

  async function handleToggleArchive() {
    if (!cls) return;
    const updated = await archiveClass(classId, !cls.archivedAt);
    if (updated) setCls(updated);
  }

  async function handleRemove(studentId: string, studentName: string) {
    if (!confirm(`Remove ${studentName} from this class? This does not delete their account.`)) return;
    setRemovingId(studentId);
    try {
      const ok = await removeEnrollment(classId, studentId);
      if (ok) setEnrollments(prev => prev.filter(e => e.studentId !== studentId));
    } finally {
      setRemovingId(null);
    }
  }

  if (!cls) {
    return <div className="text-center py-12 text-muted-foreground">Loading class…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/classes" className="hover:text-[#1A1D23] transition-colors">Classes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-[#1A1D23]">{cls.name}</span>
      </div>

      <PageHeader
        en={cls.name}
        ar={cls.name}
        subEn={`${enrollments.length} student${enrollments.length === 1 ? '' : 's'}`}
        subAr=""
        action={
          <div className="flex items-center gap-2">
            {cls.archivedAt && <Badge variant="secondary">Archived</Badge>}
            <Button variant="outline" onClick={() => setRenameOpen(true)}>Rename</Button>
            <Button variant="outline" onClick={handleToggleArchive} className="gap-2">
              {cls.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {cls.archivedAt ? 'Unarchive' : 'Archive'}
            </Button>
            <Button onClick={() => { setSendResults(null); setInviteOpen(true); }} className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
              <UserPlus className="h-4 w-4" /> Invite Students
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <Users2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Roster</h2>
          </div>
          {enrollments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No students enrolled yet.</div>
          ) : (
            <ul className="divide-y">
              {enrollments.map(e => {
                const initials = e.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#16A34A] text-white text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{e.studentName}</p>
                      <p className="text-xs text-muted-foreground truncate">{e.studentEmail}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removingId === e.studentId}
                      onClick={() => handleRemove(e.studentId, e.studentName)}
                      className="gap-1 text-xs text-muted-foreground hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Invitations</h2>
            </div>
            <ul className="divide-y">
              {invites.map(inv => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <p className="text-sm flex-1 truncate">{inv.email}</p>
                  <Badge variant={INVITE_STATUS_BADGE[inv.status]} className="text-xs capitalize">{inv.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Class</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Students</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Emails <span className="text-muted-foreground font-normal">(comma or newline separated)</span></Label>
              <Textarea
                rows={5}
                placeholder={'student1@example.com\nstudent2@example.com'}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {parsedEmails.length} valid email{parsedEmails.length === 1 ? '' : 's'} detected
              </p>
            </div>
            {sendResults && (
              <div className="space-y-1 rounded-md border bg-muted/30 p-2 max-h-40 overflow-y-auto">
                {sendResults.map(r => (
                  <p key={r.email} className="text-xs">
                    <span className="font-medium">{r.email}</span> — {r.outcome.replaceAll('_', ' ')}
                  </p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Close</Button>
            <Button onClick={handleSendInvites} disabled={sending || parsedEmails.length === 0}>
              {sending ? 'Sending…' : `Send ${parsedEmails.length || ''} Invite${parsedEmails.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
