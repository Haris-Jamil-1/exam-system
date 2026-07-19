'use client';
import { useEffect, useState } from 'react';
import { getAllUsers, getMyInstitution, setUserSuspension } from '@/lib/data';
import type { CurrentUser, Role } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search } from 'lucide-react';

type InstitutionData = { id: string; name: string };

export default function UsersPage() {
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [institution, setInstitution] = useState<InstitutionData | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [instFilter, setInstFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAllUsers(), getMyInstitution()]).then(([u, inst]) => {
      setUsers(u);
      if (inst) setInstitution({ id: inst.id, name: inst.name });
    });
  }, []);

  async function handleToggleSuspend(user: CurrentUser) {
    const suspend = !user.suspendedAt;
    if (!confirm(`${suspend ? 'Deactivate' : 'Reactivate'} ${user.name}'s account?`)) return;
    setBusyId(user.id);
    try {
      const updated = await setUserSuspension(user.id, suspend);
      if (updated) setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } finally {
      setBusyId(null);
    }
  }

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchInst = instFilter === 'all' || u.institutionId === instFilter;
    return matchSearch && matchRole && matchInst;
  });

  const ROLE_VARIANTS: Record<Role, string> = {
    admin: 'danger',
    teacher: 'info',
    student: 'secondary',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="ps-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
        <Select value={instFilter} onValueChange={setInstFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All institutions</SelectItem>
            {institution && (
              <SelectItem value={institution.id}>{institution.name}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Institution</th>
                <th className="text-end px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(user => {
                const inst = institution?.id === user.institutionId ? institution : null;
                return (
                  <tr key={user.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={ROLE_VARIANTS[user.role] as 'danger' | 'info' | 'secondary'} className="capitalize text-xs">
                          {user.role}
                        </Badge>
                        {user.suspendedAt && (
                          <Badge variant="destructive" className="text-xs">Suspended</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {inst?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-1">
                        {user.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={user.suspendedAt ? '' : 'text-red-500'}
                            disabled={busyId === user.id}
                            onClick={() => handleToggleSuspend(user)}
                          >
                            {user.suspendedAt ? 'Reactivate' : 'Deactivate'}
                          </Button>
                        )}
                      </div>
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
