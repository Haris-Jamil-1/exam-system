'use client';
// Master Admin Panel (follow-up task 3): platform-level view across ALL
// institutions. Deliberately minimal — functional dashboard, not a design
// pass. Access = User.isSuperAdmin (own gate, separate from institution RBAC).
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface InstitutionRow {
  id: string;
  name: string;
  domain: string;
  suspendedAt: string | null;
  teachers: number;
  students: number;
  activeExams: number;
  usage: {
    month: string;
    judgeSubmissions: number;
    judgeQuota: number;
    judgeCostUsd: number;
    aiCalls: number;
    aiQuota: number;
    aiCostUsd: number;
  };
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  suspendedAt: string | null;
}

export default function SuperAdminPage() {
  const [institutions, setInstitutions] = useState<InstitutionRow[] | null>(null);
  const [month, setMonth] = useState('');
  const [denied, setDenied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [users, setUsers] = useState<Record<string, UserRow[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/super/overview');
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    const data = (await res.json()) as { month: string; institutions: InstitutionRow[] };
    setMonth(data.month);
    setInstitutions(data.institutions);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  async function toggleUsers(institutionId: string) {
    if (expanded === institutionId) {
      setExpanded(null);
      return;
    }
    setExpanded(institutionId);
    if (!users[institutionId]) {
      const res = await fetch(`/api/super/institutions/${institutionId}/users`);
      if (res.ok) {
        const data = (await res.json()) as { users: UserRow[] };
        setUsers(prev => ({ ...prev, [institutionId]: data.users }));
      }
    }
  }

  async function setSuspended(kind: 'institution' | 'user', id: string, suspend: boolean, institutionId?: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/super/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, suspend }),
      });
      if (!res.ok) return;
      if (kind === 'institution') {
        await load();
      } else if (institutionId) {
        const refreshed = await fetch(`/api/super/institutions/${institutionId}/users`);
        if (refreshed.ok) {
          const data = (await refreshed.json()) as { users: UserRow[] };
          setUsers(prev => ({ ...prev, [institutionId]: data.users }));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        403 — this panel requires platform Super Admin access.
      </div>
    );
  }
  if (!institutions) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const totals = institutions.reduce(
    (acc, i) => ({
      teachers: acc.teachers + i.teachers,
      students: acc.students + i.students,
      activeExams: acc.activeExams + i.activeExams,
      cost: acc.cost + i.usage.judgeCostUsd + i.usage.aiCostUsd,
    }),
    { teachers: 0, students: 0, activeExams: 0, cost: 0 },
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Master Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          {institutions.length} institutions · {totals.teachers} teachers · {totals.students} students ·{' '}
          {totals.activeExams} active exams · est. ${totals.cost.toFixed(2)} usage in {month}
        </p>
      </div>

      {institutions.map(inst => (
        <Card key={inst.id} className={inst.suspendedAt ? 'border-red-300' : undefined}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {inst.name}
              <span className="text-xs font-normal text-muted-foreground">{inst.domain}</span>
              {inst.suspendedAt && <Badge variant="destructive">Suspended</Badge>}
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void toggleUsers(inst.id)}>
                {expanded === inst.id ? 'Hide users' : 'View users'}
              </Button>
              <Button
                size="sm"
                variant={inst.suspendedAt ? 'outline' : 'destructive'}
                disabled={busy}
                onClick={() => void setSuspended('institution', inst.id, !inst.suspendedAt)}
              >
                {inst.suspendedAt ? 'Unsuspend' : 'Suspend'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Teachers</p><p className="font-semibold">{inst.teachers}</p></div>
              <div><p className="text-xs text-muted-foreground">Students</p><p className="font-semibold">{inst.students}</p></div>
              <div><p className="text-xs text-muted-foreground">Active exams</p><p className="font-semibold">{inst.activeExams}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Judge0 ({month})</p>
                <p className="font-semibold">
                  {inst.usage.judgeSubmissions}/{inst.usage.judgeQuota}
                  <span className="text-xs font-normal text-muted-foreground"> · ${inst.usage.judgeCostUsd.toFixed(2)}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claude calls ({month})</p>
                <p className="font-semibold">
                  {inst.usage.aiCalls}/{inst.usage.aiQuota}
                  <span className="text-xs font-normal text-muted-foreground"> · ${inst.usage.aiCostUsd.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {expanded === inst.id && (
              <div className="border-t pt-3">
                {!users[inst.id] ? (
                  <p className="text-sm text-muted-foreground">Loading users…</p>
                ) : users[inst.id].length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {users[inst.id].map(u => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-1.5">{u.name}</td>
                          <td className="py-1.5 text-muted-foreground">{u.email}</td>
                          <td className="py-1.5 capitalize">{u.role}</td>
                          <td className="py-1.5">
                            {u.suspendedAt && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
                          </td>
                          <td className="py-1.5 text-end">
                            <Button
                              size="sm"
                              variant={u.suspendedAt ? 'outline' : 'destructive'}
                              disabled={busy}
                              onClick={() => void setSuspended('user', u.id, !u.suspendedAt, inst.id)}
                            >
                              {u.suspendedAt ? 'Unsuspend' : 'Suspend'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
