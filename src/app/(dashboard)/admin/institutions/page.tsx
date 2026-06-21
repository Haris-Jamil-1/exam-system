'use client';
import { useEffect, useState } from 'react';
import { getAllUsers, getExams } from '@/lib/data';
import type { CurrentUser, Exam } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mockInstitutions } from '@/lib/mock-data/institutions';

export default function InstitutionsPage() {
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  useEffect(() => {
    Promise.all([getAllUsers(), getExams()]).then(([u, e]) => {
      setUsers(u);
      setExams(e);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button>Provision Institution</Button>
      </div>
      <Card>
        <CardContent className="p-0">
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
              {mockInstitutions.map(inst => {
                const instUsers = users.filter(u => u.institutionId === inst.id);
                const instExams = exams.filter(e => e.institutionId === inst.id);
                return (
                  <tr key={inst.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{inst.name}</p>
                      <p className="text-xs text-muted-foreground">Join: {inst.joinCode}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{inst.domain}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{instUsers.length}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{instExams.length}</td>
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
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
