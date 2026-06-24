// Phase 2: replace each function body with Prisma query.
// Schema: Course (1) → Topic (N) → LearningObjective (N) → Question/Item (N via FK)
// All JOIN queries for analytics run in a single round-trip via Prisma include
import type { Course, Topic, LearningObjective } from '@/types';
import { mockCourses, mockTopics, mockCLOs } from '@/lib/mock-data/curriculum';

// In-memory stores — Phase 2: prisma.course / prisma.topic / prisma.learningObjective
const coursesDb = [...mockCourses];
const topicsDb  = [...mockTopics];
const closDb    = [...mockCLOs];

export async function getCourses(institutionId?: string): Promise<Course[]> {
  // Phase 2: prisma.course.findMany({ where: { institutionId } })
  if (institutionId) return coursesDb.filter(c => c.institutionId === institutionId);
  return coursesDb;
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  // Phase 2: prisma.course.findUnique({ where: { id } }) ?? undefined
  return coursesDb.find(c => c.id === id);
}

export async function createCourse(data: Omit<Course, 'id' | 'createdAt'>): Promise<Course> {
  // Phase 2: prisma.course.create({ data })
  const course: Course = { ...data, id: `course-${Date.now()}`, createdAt: new Date().toISOString() };
  coursesDb.push(course);
  return course;
}

export async function getTopics(courseId: string): Promise<Topic[]> {
  // Phase 2: prisma.topic.findMany({ where: { courseId }, orderBy: { order: 'asc' } })
  return topicsDb.filter(t => t.courseId === courseId).sort((a, b) => a.order - b.order);
}

export async function getTopicById(id: string): Promise<Topic | undefined> {
  // Phase 2: prisma.topic.findUnique({ where: { id } }) ?? undefined
  return topicsDb.find(t => t.id === id);
}

export async function createTopic(data: Omit<Topic, 'id' | 'createdAt'>): Promise<Topic> {
  // Phase 2: prisma.topic.create({ data })
  const topic: Topic = { ...data, id: `topic-${Date.now()}`, createdAt: new Date().toISOString() };
  topicsDb.push(topic);
  return topic;
}

export async function getCLOs(topicId: string): Promise<LearningObjective[]> {
  // Phase 2: prisma.learningObjective.findMany({ where: { topicId } })
  return closDb.filter(c => c.topicId === topicId);
}

export async function getCLOById(id: string): Promise<LearningObjective | undefined> {
  // Phase 2: prisma.learningObjective.findUnique({ where: { id } }) ?? undefined
  return closDb.find(c => c.id === id);
}

export async function createCLO(data: Omit<LearningObjective, 'id' | 'createdAt'>): Promise<LearningObjective> {
  // Phase 2: prisma.learningObjective.create({ data })
  const clo: LearningObjective = { ...data, id: `clo-${Date.now()}`, createdAt: new Date().toISOString() };
  closDb.push(clo);
  return clo;
}

export async function updateCLO(id: string, data: Partial<LearningObjective>): Promise<LearningObjective | undefined> {
  // Phase 2: check if any questions reference this CLO first
  // If yes, archive original and create v2 to protect historical reports
  const idx = closDb.findIndex(c => c.id === id);
  if (idx === -1) return undefined;
  closDb[idx] = { ...closDb[idx], ...data };
  return closDb[idx];
}

// Phase 2: used by analytics engine to aggregate scores by domain/topic/bloom level
// SELECT clo.learning_domain, SUM(q.marks) FROM questions q
//   JOIN learning_objectives clo ON q.learning_objective_id = clo.id
//   WHERE q.exam_id = ? GROUP BY clo.learning_domain
export async function getCLOWithAncestors(cloId: string): Promise<{
  clo: LearningObjective;
  topic: Topic;
  course: Course;
} | undefined> {
  const clo = closDb.find(c => c.id === cloId);
  if (!clo) return undefined;
  const topic = topicsDb.find(t => t.id === clo.topicId);
  if (!topic) return undefined;
  const course = coursesDb.find(c => c.id === topic.courseId);
  if (!course) return undefined;
  return { clo, topic, course };
}
