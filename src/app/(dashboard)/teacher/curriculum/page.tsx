'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getCurriculumPageData, createCourse } from '@/lib/data';
import { useServerData } from '@/hooks/useServerData';
import { invalidateData } from '@/lib/data-refresh';
import type { Course } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, BookOpen, Building2, Lock, Users2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const ROLE_BADGE: Record<string, 'success' | 'info' | 'outline'> = {
  owner: 'success',
  editor: 'info',
  viewer: 'outline',
};

function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/teacher/curriculum/${course.id}`}>
      <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {course.courseLevel === 'institutional' ? <Building2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
                <p className="font-medium text-sm truncate">{course.title}</p>
              </div>
            </div>
            {course.myRole && (
              <Badge variant={ROLE_BADGE[course.myRole]} className="text-xs capitalize shrink-0">{course.myRole}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof BookOpen; text: string }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground col-span-full">
      <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

export default function TeacherCurriculumPage() {
  const { data } = useServerData(() => getCurriculumPageData(), [], { scope: 'curriculum' });
  const institutionCourses: Course[] = data?.institutionCourses ?? [];
  const privateCourses: Course[] = data?.privateCourses ?? [];
  const sharedCourses: Course[] = data?.sharedCourses ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!code.trim() || !title.trim()) return;
    setCreating(true);
    try {
      await createCourse({ code: code.trim().toUpperCase(), title: title.trim(), courseLevel: 'personal' });
      setCreateOpen(false);
      setCode('');
      setTitle('');
      invalidateData('curriculum');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        en="Curriculum"
        ar="المنهج الدراسي"
        subEn="Institutional course structures and your own private CLO trees"
        subAr="هياكل مقررات المؤسسة وأشجار مخرجاتك التعليمية الخاصة"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Plus className="h-4 w-4" /> New Private Course
          </Button>
        }
      />

      <Tabs defaultValue="institution">
        <TabsList className="mb-4">
          <TabsTrigger value="institution" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Institution Courses ({institutionCourses.length})</TabsTrigger>
          <TabsTrigger value="private" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> My Private Courses ({privateCourses.length})</TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Shared with Me ({sharedCourses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="institution">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {institutionCourses.length === 0
              ? <EmptyState icon={Building2} text="No institutional courses yet — ask your admin to add one." />
              : institutionCourses.map(c => <CourseCard key={c.id} course={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="private">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {privateCourses.length === 0
              ? <EmptyState icon={Lock} text="You haven't created a private course yet." />
              : privateCourses.map(c => <CourseCard key={c.id} course={c} />)}
          </div>
        </TabsContent>
        <TabsContent value="shared">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sharedCourses.length === 0
              ? <EmptyState icon={Users2} text="No one has shared a private course with you yet." />
              : sharedCourses.map(c => <CourseCard key={c.id} course={c} />)}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Private Course</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Course Code</Label>
              <Input placeholder="e.g. CS101" value={code} onChange={e => setCode(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="e.g. Introduction to Computer Science" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !code.trim() || !title.trim()}>{creating ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
