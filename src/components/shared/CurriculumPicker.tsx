'use client';
// CurriculumPicker — cascading Course → Topic → CLO dropdowns
// Phase 2: replace getCourses/getTopics/getCLOs with server-action calls or SWR hooks
// The selected cloId is stored on the Question/Item as learning_objective_id FK
import { useState, useEffect } from 'react';
import { getCourses, getTopics, getCLOs } from '@/lib/data';
import type { Course, Topic, LearningObjective, BloomsLevel, LearningDomain } from '@/types';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Layers, Target } from 'lucide-react';

export interface CurriculumSelection {
  courseId: string;
  topicId: string;
  cloId: string;
}

interface Props {
  value: CurriculumSelection | null;
  onChange: (v: CurriculumSelection) => void;
  institutionId?: string;
}

const BLOOMS_COLOR: Record<BloomsLevel, string> = {
  Remember:   'bg-slate-100 text-slate-700',
  Understand: 'bg-blue-100 text-blue-700',
  Apply:      'bg-green-100 text-green-700',
  Analyze:    'bg-yellow-100 text-yellow-700',
  Evaluate:   'bg-orange-100 text-orange-700',
  Create:     'bg-purple-100 text-purple-700',
};

const DOMAIN_COLOR: Record<LearningDomain, string> = {
  Knowledge: 'bg-indigo-100 text-indigo-700',
  Skill:     'bg-emerald-100 text-emerald-700',
  Values:    'bg-rose-100 text-rose-700',
};

export function CurriculumPicker({ value, onChange, institutionId }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics]   = useState<Topic[]>([]);
  const [clos, setClos]       = useState<LearningObjective[]>([]);

  const courseId = value?.courseId ?? '';
  const topicId  = value?.topicId  ?? '';
  const cloId    = value?.cloId    ?? '';

  // Derived — no separate state needed; avoids synchronous setState-in-effect
  const selectedCLO = clos.find(c => c.id === cloId) ?? null;

  useEffect(() => {
    getCourses(institutionId).then(setCourses);
  }, [institutionId]);

  useEffect(() => {
    async function update() {
      if (!courseId) { setTopics([]); setClos([]); return; }
      const data = await getTopics(courseId);
      setTopics(data);
      setClos([]);
    }
    void update();
  }, [courseId]);

  useEffect(() => {
    async function update() {
      if (!topicId) { setClos([]); return; }
      const data = await getCLOs(topicId);
      setClos(data);
    }
    void update();
  }, [topicId]);

  function handleCourse(id: string) {
    onChange({ courseId: id, topicId: '', cloId: '' });
  }
  function handleTopic(id: string) {
    onChange({ courseId, topicId: id, cloId: '' });
  }
  function handleCLO(id: string) {
    onChange({ courseId, topicId, cloId: id });
  }

  return (
    <div className="space-y-4">
      {/* Course */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          Course
        </Label>
        <Select value={courseId} onValueChange={handleCourse}>
          <SelectTrigger>
            <SelectValue placeholder="Select course…" />
          </SelectTrigger>
          <SelectContent>
            {courses.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <span className="font-mono text-xs text-muted-foreground me-2">{c.code}</span>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Topic — only visible when course selected */}
      {courseId && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            Topic / Chapter
          </Label>
          <Select value={topicId} onValueChange={handleTopic} disabled={topics.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder={topics.length === 0 ? 'No topics found' : 'Select topic…'} />
            </SelectTrigger>
            <SelectContent>
              {topics.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* CLO — only visible when topic selected */}
      {topicId && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            Learning Objective (CLO)
          </Label>
          <Select value={cloId} onValueChange={handleCLO} disabled={clos.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder={clos.length === 0 ? 'No CLOs found' : 'Select objective…'} />
            </SelectTrigger>
            <SelectContent>
              {clos.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code && (
                    <span className="font-mono text-xs text-muted-foreground me-2">{c.code}</span>
                  )}
                  {c.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Inherited metadata — read-only, populated when CLO is selected */}
      {selectedCLO && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Inherited Metadata (read-only)</p>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${BLOOMS_COLOR[selectedCLO.bloomsLevel]}`}>
              Bloom&apos;s: {selectedCLO.bloomsLevel}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${DOMAIN_COLOR[selectedCLO.learningDomain]}`}>
              Domain: {selectedCLO.learningDomain}
            </span>
            {selectedCLO.code && (
              <Badge variant="outline" className="text-xs font-mono">{selectedCLO.code}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">&ldquo;{selectedCLO.text}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
