'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getCoursePageData, getCLOs, createTopic, createCLO,
  getCourseCollaborators, addCourseCollaborator, removeCourseCollaborator,
} from '@/lib/data';
import type { Course, Topic, LearningObjective, BloomsLevel, LearningDomain } from '@/types';
import type { CloPerformance } from '@/lib/data/curriculum';
import { PageHeader } from '@/components/shared/PageHeader';
import { ManageAccessDialog } from '@/components/shared/ManageAccessDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Layers, Target, ChevronRight, Users } from 'lucide-react';

const BLOOMS_OPTIONS: BloomsLevel[] = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const DOMAIN_OPTIONS: LearningDomain[] = ['Knowledge', 'Skill', 'Values'];

const BLOOMS_COLOR: Record<BloomsLevel, string> = {
  Remember: 'outline', Understand: 'info', Apply: 'success',
  Analyze: 'warning', Evaluate: 'danger', Create: 'secondary',
} as const;

const ROLE_BADGE: Record<string, 'success' | 'info' | 'outline'> = {
  owner: 'success', editor: 'info', viewer: 'outline',
};

export default function TeacherCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [cloPerformance, setCloPerformance] = useState<CloPerformance[]>([]);
  const [clos, setClos] = useState<LearningObjective[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);

  const [showAddTopic, setShowAddTopic] = useState(false);
  const [showAddCLO, setShowAddCLO] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newCLOText, setNewCLOText] = useState('');
  const [newCLOBlooms, setNewCLOBlooms] = useState<BloomsLevel>('Remember');
  const [newCLODomain, setNewCLODomain] = useState<LearningDomain>('Knowledge');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCoursePageData(courseId).then(({ course: c, topics: t, cloPerformance: p }) => {
      setCourse(c);
      setTopics(t);
      setCloPerformance(p);
    });
  }, [courseId]);

  useEffect(() => {
    async function update() {
      if (!selectedTopic) { setClos([]); return; }
      setClos(await getCLOs(selectedTopic.id));
    }
    void update();
  }, [selectedTopic]);

  const canEdit = course?.myRole === 'owner' || course?.myRole === 'editor';
  const isOwner = course?.myRole === 'owner';

  async function handleAddTopic() {
    if (!newTopicTitle.trim()) return;
    setSaving(true);
    const t = await createTopic({ courseId, title: newTopicTitle.trim(), order: topics.length + 1 });
    setTopics(prev => [...prev, t]);
    setNewTopicTitle('');
    setShowAddTopic(false);
    setSaving(false);
  }

  async function handleAddCLO() {
    if (!selectedTopic || !newCLOText.trim() || !course) return;
    setSaving(true);
    const code = `${course.code}-${selectedTopic.order}-CLO${clos.length + 1}`;
    const c = await createCLO({
      topicId: selectedTopic.id, code, text: newCLOText.trim(),
      bloomsLevel: newCLOBlooms, learningDomain: newCLODomain,
    });
    setClos(prev => [...prev, c]);
    setNewCLOText(''); setNewCLOBlooms('Remember'); setNewCLODomain('Knowledge');
    setShowAddCLO(false);
    setSaving(false);
  }

  if (!course) {
    return <div className="text-center py-12 text-muted-foreground">Loading course…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        <Link href="/teacher/curriculum" className="hover:text-[#1A1D23] transition-colors">Curriculum</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-[#1A1D23]">{course.code}</span>
      </div>

      <PageHeader
        en={course.title}
        ar={course.title}
        subEn={course.code}
        subAr={course.code}
        action={
          <div className="flex items-center gap-2">
            {course.myRole && <Badge variant={ROLE_BADGE[course.myRole]} className="capitalize">{course.myRole}</Badge>}
            {isOwner && (
              <Button variant="outline" onClick={() => setAccessOpen(true)} className="gap-2">
                <Users className="h-4 w-4" /> Manage Access
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Topics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-purple-600" /> Topics
              <Badge variant="outline" className="ms-auto text-xs">{topics.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3 pt-0">
            {topics.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTopic(t)}
                className={`w-full text-start rounded-lg px-3 py-2.5 transition-colors ${
                  selectedTopic?.id === t.id
                    ? 'bg-purple-50 border border-purple-200 text-purple-900'
                    : 'hover:bg-muted/50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Chapter {t.order}</p>
                    <p className="text-sm font-medium leading-snug">{t.title}</p>
                  </div>
                  {selectedTopic?.id === t.id && <ChevronRight className="h-4 w-4 text-purple-500 shrink-0" />}
                </div>
              </button>
            ))}

            {topics.length === 0 && !showAddTopic && (
              <p className="text-center text-sm text-muted-foreground py-4">No topics yet</p>
            )}

            {canEdit && (
              showAddTopic ? (
                <div className="rounded-lg border border-dashed p-3 space-y-2 mt-2">
                  <Input placeholder="Topic / chapter title" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} className="h-8 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddTopic} disabled={saving} className="h-7 text-xs">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddTopic(false)} className="h-7 text-xs">Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddTopic(true)}
                  className="w-full rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-purple-600 hover:border-purple-300 transition-colors flex items-center justify-center gap-1 mt-1"
                >
                  <Plus className="h-3 w-3" /> Add Topic
                </button>
              )
            )}
          </CardContent>
        </Card>

        {/* CLOs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-green-600" /> Learning Objectives (CLOs)
              {selectedTopic
                ? <span className="text-xs font-normal text-muted-foreground truncate">— {selectedTopic.title}</span>
                : <span className="text-xs font-normal text-muted-foreground">— select a topic</span>}
              <Badge variant="outline" className="ms-auto text-xs shrink-0">{clos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
            {!selectedTopic && (
              <p className="text-center text-sm text-muted-foreground py-6">← Select a topic first</p>
            )}

            {selectedTopic && clos.map(clo => {
              const perf = cloPerformance.find(p => p.cloId === clo.id);
              return (
                <div key={clo.id} className="rounded-lg border p-3 space-y-1.5 hover:bg-muted/20 transition-colors">
                  {clo.code && <p className="font-mono text-[10px] text-muted-foreground">{clo.code}</p>}
                  <p className="text-xs font-medium leading-snug">{clo.text}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={BLOOMS_COLOR[clo.bloomsLevel] as 'outline' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'} className="text-[10px]">
                      {clo.bloomsLevel}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{clo.learningDomain}</Badge>
                    {perf?.averageScorePercent !== undefined ? (
                      <Badge
                        variant={perf.averageScorePercent >= 70 ? 'success' : perf.averageScorePercent >= 50 ? 'warning' : 'danger'}
                        className="text-[10px] ms-auto"
                        title={`Average score across ${perf.gradedAnswerCount} graded answers mapped to this CLO`}
                      >
                        {perf.averageScorePercent}% avg
                      </Badge>
                    ) : perf && perf.gradedAnswerCount > 0 ? (
                      <span className="text-[10px] text-muted-foreground ms-auto" title="Fewer than 10 graded answers — not enough data for a reliable average">
                        {perf.gradedAnswerCount} graded (not enough data)
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {selectedTopic && clos.length === 0 && !showAddCLO && (
              <p className="text-center text-sm text-muted-foreground py-4">No CLOs yet</p>
            )}

            {selectedTopic && canEdit && (
              showAddCLO ? (
                <div className="rounded-lg border border-dashed p-3 space-y-2 mt-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Objective text</Label>
                    <textarea
                      placeholder="Students will be able to…"
                      value={newCLOText}
                      onChange={e => setNewCLOText(e.target.value)}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Bloom&apos;s Level</Label>
                      <Select value={newCLOBlooms} onValueChange={v => setNewCLOBlooms(v as BloomsLevel)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BLOOMS_OPTIONS.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Learning Domain</Label>
                      <Select value={newCLODomain} onValueChange={v => setNewCLODomain(v as LearningDomain)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DOMAIN_OPTIONS.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddCLO} disabled={saving} className="h-7 text-xs">Save CLO</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddCLO(false)} className="h-7 text-xs">Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCLO(true)}
                  className="w-full rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-green-600 hover:border-green-300 transition-colors flex items-center justify-center gap-1 mt-1"
                >
                  <Plus className="h-3 w-3" /> Add CLO
                </button>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {isOwner && (
        <ManageAccessDialog
          resourceId={courseId}
          resourceOwnerId={course.ownerId}
          open={accessOpen}
          onClose={() => setAccessOpen(false)}
          fetchCollaborators={getCourseCollaborators}
          onAdd={addCourseCollaborator}
          onRemove={removeCourseCollaborator}
        />
      )}
    </div>
  );
}
