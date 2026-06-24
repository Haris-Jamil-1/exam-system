'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { Course, Topic, LearningObjective } from '@/types';

async function getInstitutionId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.institutionId as string | undefined) ?? null;
}

function mapCourse(c: { id: string; code: string; title: string; institutionId: string; createdAt: Date }): Course {
  return { id: c.id, code: c.code, title: c.title, institutionId: c.institutionId, createdAt: c.createdAt.toISOString() };
}

function mapTopic(t: { id: string; courseId: string; title: string; order: number; createdAt: Date }): Topic {
  return { id: t.id, courseId: t.courseId, title: t.title, order: t.order, createdAt: t.createdAt.toISOString() };
}

function mapCLO(c: {
  id: string; topicId: string; code: string | null; text: string;
  bloomsLevel: string; learningDomain: string; createdAt: Date;
}): LearningObjective {
  return {
    id: c.id, topicId: c.topicId, code: c.code ?? undefined, text: c.text,
    bloomsLevel: c.bloomsLevel as LearningObjective['bloomsLevel'],
    learningDomain: c.learningDomain as LearningObjective['learningDomain'],
    createdAt: c.createdAt.toISOString(),
  };
}

export async function getCourses(_institutionId?: string): Promise<Course[]> {
  const institutionId = await getInstitutionId();
  if (!institutionId) return [];
  const rows = await prisma.course.findMany({ where: { institutionId }, orderBy: { createdAt: 'asc' } });
  return rows.map(mapCourse);
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  const row = await prisma.course.findUnique({ where: { id } });
  return row ? mapCourse(row) : undefined;
}

export async function createCourse(data: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
  try {
    const row = await prisma.course.create({ data });
    return mapCourse(row);
  } catch (err) {
    console.error('[createCourse] Prisma error:', err);
    throw err;
  }
}

export async function getTopics(courseId: string): Promise<Topic[]> {
  const rows = await prisma.topic.findMany({ where: { courseId }, orderBy: { order: 'asc' } });
  return rows.map(mapTopic);
}

export async function getTopicById(id: string): Promise<Topic | undefined> {
  const row = await prisma.topic.findUnique({ where: { id } });
  return row ? mapTopic(row) : undefined;
}

export async function createTopic(data: Omit<Topic, 'id' | 'createdAt'>): Promise<Topic> {
  try {
    const row = await prisma.topic.create({ data });
    return mapTopic(row);
  } catch (err) {
    console.error('[createTopic] Prisma error:', err);
    throw err;
  }
}

export async function getCLOs(topicId: string): Promise<LearningObjective[]> {
  const rows = await prisma.learningObjective.findMany({ where: { topicId }, orderBy: { createdAt: 'asc' } });
  return rows.map(mapCLO);
}

export async function getCLOById(id: string): Promise<LearningObjective | undefined> {
  const row = await prisma.learningObjective.findUnique({ where: { id } });
  return row ? mapCLO(row) : undefined;
}

export async function createCLO(data: Omit<LearningObjective, 'id' | 'createdAt'>): Promise<LearningObjective> {
  try {
    const row = await prisma.learningObjective.create({
      data: {
        topicId: data.topicId,
        code: data.code ?? null,
        text: data.text,
        bloomsLevel: data.bloomsLevel,
        learningDomain: data.learningDomain,
      },
    });
    return mapCLO(row);
  } catch (err) {
    console.error('[createCLO] Prisma error:', err);
    throw err;
  }
}

export async function updateCLO(id: string, data: Partial<LearningObjective>): Promise<LearningObjective | undefined> {
  const row = await prisma.learningObjective.update({
    where: { id },
    data: {
      ...(data.text && { text: data.text }),
      ...(data.bloomsLevel && { bloomsLevel: data.bloomsLevel }),
      ...(data.learningDomain && { learningDomain: data.learningDomain }),
      ...(data.code !== undefined && { code: data.code ?? null }),
    },
  });
  return mapCLO(row);
}

export async function getCLOWithAncestors(cloId: string): Promise<{
  clo: LearningObjective; topic: Topic; course: Course;
} | undefined> {
  const clo = await prisma.learningObjective.findUnique({
    where: { id: cloId },
    include: { topic: { include: { course: true } } },
  });
  if (!clo) return undefined;
  return {
    clo: mapCLO(clo),
    topic: mapTopic(clo.topic),
    course: mapCourse(clo.topic.course),
  };
}
