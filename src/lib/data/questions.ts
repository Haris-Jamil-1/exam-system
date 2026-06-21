// Phase 2: replace each function body with Supabase/Prisma query.
import type { Question, PublicQuestion } from '@/types';
import { mockQuestions } from '@/lib/mock-data/questions';

const questionsDb = [...mockQuestions];

// Returns questions stripped of all answer data — safe to send to student browsers.
// Phase 2: this will be the only function called from client; answer keys stay server-side.
export async function getQuestionsForStudent(examId: string): Promise<PublicQuestion[]> {
  const all = await getQuestions(examId);
  return all.map(({ correctAnswer: _ca, explanation: _ex, options, ...rest }) => ({
    ...rest,
    options: options?.map(({ isCorrect: _ic, ...opt }) => opt),
  }));
}

export async function getQuestions(examId: string): Promise<Question[]> {
  // Phase 2: return prisma.question.findMany({ where: { examId }, orderBy: { order: 'asc' } })
  return questionsDb.filter(q => q.examId === examId).sort((a, b) => a.order - b.order);
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  // Phase 2: return prisma.question.findUnique({ where: { id } }) ?? undefined
  return questionsDb.find(q => q.id === id);
}

export async function createQuestion(data: Omit<Question, 'id'>): Promise<Question> {
  // Phase 2: return prisma.question.create({ data })
  const newQuestion: Question = { ...data, id: `q-${Date.now()}` };
  questionsDb.push(newQuestion);
  return newQuestion;
}

export async function updateQuestion(id: string, data: Partial<Question>): Promise<Question | undefined> {
  // Phase 2: return prisma.question.update({ where: { id }, data })
  const index = questionsDb.findIndex(q => q.id === id);
  if (index === -1) return undefined;
  questionsDb[index] = { ...questionsDb[index], ...data };
  return questionsDb[index];
}

export async function deleteQuestion(id: string): Promise<boolean> {
  // Phase 2: await prisma.question.delete({ where: { id } })
  const index = questionsDb.findIndex(q => q.id === id);
  if (index === -1) return false;
  questionsDb.splice(index, 1);
  return true;
}

export async function reorderQuestions(examId: string, orderedIds: string[]): Promise<Question[]> {
  // Phase 2: bulk update order field via prisma.$transaction
  orderedIds.forEach((id, index) => {
    const q = questionsDb.find(q => q.id === id && q.examId === examId);
    if (q) q.order = index + 1;
  });
  return getQuestions(examId);
}
