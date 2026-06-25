'use client';
// Admin Curriculum Management — 3-level hierarchy: Course → Topic → CLO
// Phase 2: all mutations go through Prisma via server actions
// CLO metadata (Bloom's + Domain) is inherited by all linked questions automatically
import { useState, useEffect } from 'react';
import {
  getCourses, getTopics, getCLOs,
  createCourse, createTopic, createCLO,
} from '@/lib/data';
import type { Course, Topic, LearningObjective, BloomsLevel, LearningDomain } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BookOpen, Layers, Target, ChevronRight } from 'lucide-react';

const BLOOMS_OPTIONS: BloomsLevel[] = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const DOMAIN_OPTIONS: LearningDomain[] = ['Knowledge', 'Skill', 'Values'];

const BLOOMS_COLOR: Record<BloomsLevel, string> = {
  Remember:   'outline',
  Understand: 'info',
  Apply:      'success',
  Analyze:    'warning',
  Evaluate:   'danger',
  Create:     'secondary',
} as const;

export default function CurriculumPage() {
  const [courses, setCourses]           = useState<Course[]>([]);
  const [topics, setTopics]             = useState<Topic[]>([]);
  const [clos, setClos]                 = useState<LearningObjective[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTopic, setSelectedTopic]   = useState<Topic | null>(null);

  // Add forms
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddTopic, setShowAddTopic]   = useState(false);
  const [showAddCLO, setShowAddCLO]       = useState(false);

  const [newCourseCode, setNewCourseCode]   = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newTopicTitle, setNewTopicTitle]   = useState('');
  const [newCLOText, setNewCLOText]         = useState('');
  const [newCLOBlooms, setNewCLOBlooms]     = useState<BloomsLevel>('Remember');
  const [newCLODomain, setNewCLODomain]     = useState<LearningDomain>('Knowledge');
  const [saving, setSaving]                 = useState(false);

  useEffect(() => {
    getCourses().then(setCourses);
  }, []);

  useEffect(() => {
    async function update() {
      if (!selectedCourse) { setTopics([]); setClos([]); setSelectedTopic(null); return; }
      const data = await getTopics(selectedCourse.id);
      setTopics(data);
      setClos([]);
      setSelectedTopic(null);
    }
    void update();
  }, [selectedCourse]);

  useEffect(() => {
    async function update() {
      if (!selectedTopic) { setClos([]); return; }
      const data = await getCLOs(selectedTopic.id);
      setClos(data);
    }
    void update();
  }, [selectedTopic]);

  async function handleAddCourse() {
    if (!newCourseCode.trim() || !newCourseTitle.trim()) return;
    setSaving(true);
    const c = await createCourse({ code: newCourseCode.trim().toUpperCase(), title: newCourseTitle.trim(), institutionId: '' });
    setCourses(prev => [...prev, c]);
    setNewCourseCode(''); setNewCourseTitle('');
    setShowAddCourse(false);
    setSaving(false);
  }

  async function handleAddTopic() {
    if (!selectedCourse || !newTopicTitle.trim()) return;
    setSaving(true);
    const t = await createTopic({ courseId: selectedCourse.id, title: newTopicTitle.trim(), order: topics.length + 1 });
    setTopics(prev => [...prev, t]);
    setNewTopicTitle('');
    setShowAddTopic(false);
    setSaving(false);
  }

  async function handleAddCLO() {
    if (!selectedTopic || !newCLOText.trim()) return;
    setSaving(true);
    const code = selectedCourse && selectedTopic
      ? `${selectedCourse.code}-${selectedTopic.order}-CLO${clos.length + 1}`
      : undefined;
    const c = await createCLO({
      topicId: selectedTopic.id,
      code,
      text: newCLOText.trim(),
      bloomsLevel: newCLOBlooms,
      learningDomain: newCLODomain,
    });
    setClos(prev => [...prev, c]);
    setNewCLOText(''); setNewCLOBlooms('Remember'); setNewCLODomain('Knowledge');
    setShowAddCLO(false);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        en="Curriculum Architecture"
        ar="هيكل المنهج الدراسي"
        subEn="Manage the Course → Topic → Learning Objective hierarchy used for CLO mapping and accreditation reports"
        subAr="إدارة هيكل المقرر → الموضوع → المخرج التعليمي"
        action={
          <Button onClick={() => setShowAddCourse(true)} className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Plus className="h-4 w-4" /> Add Course
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Column 1: Courses ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-blue-600" />
              Courses
              <Badge variant="outline" className="ms-auto text-xs">{courses.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3 pt-0">
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCourse(c)}
                className={`w-full text-start rounded-lg px-3 py-2.5 transition-colors ${
                  selectedCourse?.id === c.id
                    ? 'bg-blue-50 border border-blue-200 text-blue-900'
                    : 'hover:bg-muted/50 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                    <p className="text-sm font-medium leading-snug">{c.title}</p>
                  </div>
                  {selectedCourse?.id === c.id && <ChevronRight className="h-4 w-4 text-blue-500 shrink-0" />}
                </div>
              </button>
            ))}

            {courses.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No courses yet</p>
            )}

            {showAddCourse ? (
              <div className="rounded-lg border border-dashed p-3 space-y-2 mt-2">
                <Input
                  placeholder="Course code (e.g. CS101)"
                  value={newCourseCode}
                  onChange={e => setNewCourseCode(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
                <Input
                  placeholder="Course title"
                  value={newCourseTitle}
                  onChange={e => setNewCourseTitle(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddCourse} disabled={saving} className="h-7 text-xs">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddCourse(false)} className="h-7 text-xs">Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddCourse(true)}
                className="w-full rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-1 mt-1"
              >
                <Plus className="h-3 w-3" /> Add Course
              </button>
            )}
          </CardContent>
        </Card>

        {/* ── Column 2: Topics ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-purple-600" />
              Topics
              {selectedCourse
                ? <span className="text-xs font-normal text-muted-foreground">— {selectedCourse.code}</span>
                : <span className="text-xs font-normal text-muted-foreground">— select a course</span>
              }
              <Badge variant="outline" className="ms-auto text-xs">{topics.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3 pt-0">
            {!selectedCourse && (
              <p className="text-center text-sm text-muted-foreground py-6">← Select a course first</p>
            )}

            {selectedCourse && topics.map(t => (
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

            {selectedCourse && topics.length === 0 && !showAddTopic && (
              <p className="text-center text-sm text-muted-foreground py-4">No topics yet</p>
            )}

            {selectedCourse && (
              showAddTopic ? (
                <div className="rounded-lg border border-dashed p-3 space-y-2 mt-2">
                  <Input
                    placeholder="Topic / chapter title"
                    value={newTopicTitle}
                    onChange={e => setNewTopicTitle(e.target.value)}
                    className="h-8 text-sm"
                  />
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

        {/* ── Column 3: CLOs ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-green-600" />
              Learning Objectives (CLOs)
              {selectedTopic
                ? <span className="text-xs font-normal text-muted-foreground truncate">— {selectedTopic.title}</span>
                : <span className="text-xs font-normal text-muted-foreground">— select a topic</span>
              }
              <Badge variant="outline" className="ms-auto text-xs shrink-0">{clos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
            {!selectedTopic && (
              <p className="text-center text-sm text-muted-foreground py-6">← Select a topic first</p>
            )}

            {selectedTopic && clos.map(clo => (
              <div key={clo.id} className="rounded-lg border p-3 space-y-1.5 hover:bg-muted/20 transition-colors">
                {clo.code && (
                  <p className="font-mono text-[10px] text-muted-foreground">{clo.code}</p>
                )}
                <p className="text-xs font-medium leading-snug">{clo.text}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge
                    variant={(BLOOMS_COLOR[clo.bloomsLevel] as 'outline' | 'info' | 'success' | 'warning' | 'danger' | 'secondary')}
                    className="text-[10px]"
                  >
                    {clo.bloomsLevel}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{clo.learningDomain}</Badge>
                </div>
              </div>
            ))}

            {selectedTopic && clos.length === 0 && !showAddCLO && (
              <p className="text-center text-sm text-muted-foreground py-4">No CLOs yet</p>
            )}

            {selectedTopic && (
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
                  <div className="grid grid-cols-2 gap-2">
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

      {/* Info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">How CLO Mapping Works</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          When you create a question, select a Learning Objective from the Mapping tab.
          The question automatically inherits the CLO&apos;s Bloom&apos;s Taxonomy level and Learning Domain.
          Analytics reports (including NCAAA accreditation exports) aggregate student performance
          by these inherited attributes — no manual taxonomy entry needed.
        </p>
      </div>
    </div>
  );
}
