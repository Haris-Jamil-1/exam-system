'use client';
import { useEffect, useState } from 'react';
import { getAllUsers, getExams, getMyInstitution } from '@/lib/data';
import type { CurrentUser, Exam } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type InstitutionData = { id: string; name: string; domain: string; joinCode: string };

export default function InstitutionsPage() {
  const [institution, setInstitution] = useState<InstitutionData | null>(null);
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    Promise.all([getAllUsers(), getExams(), getMyInstitution()]).then(([u, e, inst]) => {
      setUsers(u);
      setExams(e);
      if (inst) setInstitution({ id: inst.id, name: inst.name, domain: inst.domain, joinCode: inst.joinCode });
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button>Provision Institution</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Institution</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Domain</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Users</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Exams</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-end px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {institution ? (
                <tr className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{institution.name}</p>
                    <p className="text-xs text-muted-foreground">Join: {institution.joinCode}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{institution.domain}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">{users.length}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{exams.length}</td>
                  <td className="px-4 py-3">
                    <Badge variant="success">Active</Badge>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">View</Button>
                      <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600">Suspend</Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
