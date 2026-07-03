/**
 * Seeds TWO fully isolated tenants (institutions) into the TEST database +
 * TEST Supabase project, for use by the security/IDOR and golden-path
 * suites. Tenant B's users are used to attempt cross-tenant access against
 * Tenant A's resources.
 *
 * Requires TEST_DATABASE_URL / TEST_SUPABASE_URL / TEST_SUPABASE_SECRET_KEY
 * to point at a non-prod project — see guard-non-prod.ts, which this refuses
 * to run without.
 *
 * Run: npx tsx tests/fixtures/seed-tenants.ts
 * Writes tests/fixtures/.qa-fixture.json with every created id + credential,
 * which downstream Playwright specs read via loadFixture().
 * Teardown: npx tsx tests/fixtures/teardown-tenants.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertNonProd, qaPrefix } from './guard-non-prod';

assertNonProd();

const prefix = qaPrefix();
const PASSWORD = 'QaTest@1234';

const adapter = new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const adminSupabase = createClient(
  process.env.TEST_SUPABASE_URL!,
  process.env.TEST_SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function createAuthUser(email: string, name: string, role: string, institutionId: string) {
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { name, role, institutionId },
  });
  if (error || !data.user) throw new Error(`Failed to create auth user ${email}: ${error?.message}`);
  return data.user.id;
}

type TenantFixture = {
  institutionId: string;
  institutionName: string;
  admin: { id: string; email: string; password: string };
  teacher: { id: string; email: string; password: string };
  student: { id: string; email: string; password: string };
  exam: { id: string; title: string; startTime: string; endTime: string };
  questions: Record<string, string>; // type -> questionId
};

async function buildTenant(label: 'A' | 'B'): Promise<TenantFixture> {
  const institution = await prisma.institution.create({
    data: { name: `${prefix}Tenant ${label}`, domain: `${prefix}tenant-${label.toLowerCase()}.qa` },
  });

  const adminEmail = `${prefix}admin-${label.toLowerCase()}@qa.exampro.test`;
  const teacherEmail = `${prefix}teacher-${label.toLowerCase()}@qa.exampro.test`;
  const studentEmail = `${prefix}student-${label.toLowerCase()}@qa.exampro.test`;

  const adminAuthId = await createAuthUser(adminEmail, `QA Admin ${label}`, 'admin', institution.id);
  const teacherAuthId = await createAuthUser(teacherEmail, `QA Teacher ${label}`, 'teacher', institution.id);
  const studentAuthId = await createAuthUser(studentEmail, `QA Student ${label}`, 'student', institution.id);

  const admin = await prisma.user.create({ data: { supabaseId: adminAuthId, name: `QA Admin ${label}`, email: adminEmail, role: 'admin', institutionId: institution.id } });
  const teacher = await prisma.user.create({ data: { supabaseId: teacherAuthId, name: `QA Teacher ${label}`, email: teacherEmail, role: 'teacher', institutionId: institution.id } });
  const student = await prisma.user.create({ data: { supabaseId: studentAuthId, name: `QA Student ${label}`, email: studentEmail, role: 'student', institutionId: institution.id } });

  await prisma.teacherStudent.create({ data: { teacherId: teacher.id, studentId: student.id } });

  const now = Date.now();
  const startTime = new Date(now - 60_000); // started 1 min ago -> immediately available
  const endTime = new Date(now + 60 * 60_000); // ends in 1 hour

  const exam = await prisma.exam.create({
    data: {
      title: `${prefix}Exam ${label}`,
      subject: 'QA Subject',
      duration: 60,
      totalMarks: 0, // updated below once question marks are known
      passingMarks: 0,
      status: 'live',
      approvalStatus: 'approved',
      startTime,
      endTime,
      settings: { navigationMode: 'free', proctoringLevel: 'low', resultsVisibility: 'immediate' },
      institutionId: institution.id,
      teacherId: teacher.id,
    },
  });

  await prisma.examEnrollment.create({ data: { examId: exam.id, studentId: student.id } });

  // One question per type relevant to the checklist, in the *current* (non-legacy) data shapes.
  const mcq = await prisma.question.create({
    data: {
      examId: exam.id, type: 'mcq', stem: 'QA: 2 + 2 = ?', marks: 4, order: 1,
      options: { create: [
        { text: '3', isCorrect: false, order: 1 },
        { text: '4', isCorrect: true, order: 2 },
        { text: '5', isCorrect: false, order: 3 },
      ] },
    },
  });

  const mrq = await prisma.question.create({
    data: {
      examId: exam.id, type: 'mrq', stem: 'QA: select all primes', marks: 6, order: 2,
      options: { create: [
        { text: '2', isCorrect: true, order: 1 },
        { text: '3', isCorrect: true, order: 2 },
        { text: '4', isCorrect: false, order: 3 },
      ] },
    },
  });

  const fillBlank = await prisma.question.create({
    data: { examId: exam.id, type: 'fill_blank', stem: 'QA: capital of France is ___', marks: 2, order: 3, correctAnswer: 'Paris' },
  });

  // Matching, new format: options = left terms only; correctAnswer = ordered right labels.
  // 8 marks / 3 pairs deliberately NOT evenly divisible -> exercises SCR-05.
  const matching = await prisma.question.create({
    data: {
      examId: exam.id, type: 'matching', stem: 'QA: match term to definition', marks: 8, order: 4,
      correctAnswer: ['Definition A', 'Definition B', 'Definition C'],
      options: { create: [
        { text: 'Term A', isCorrect: false, order: 1 },
        { text: 'Term B', isCorrect: false, order: 2 },
        { text: 'Term C', isCorrect: false, order: 3 },
      ] },
    },
  });

  // Ordering, 10 marks / 3 items -> also not evenly divisible.
  const ordering = await prisma.question.create({
    data: {
      examId: exam.id, type: 'ordering', stem: 'QA: order the steps', marks: 10, order: 5,
      correctAnswer: ['Step A', 'Step B', 'Step C'],
      options: { create: [
        { text: 'Step A', isCorrect: false, order: 1 },
        { text: 'Step B', isCorrect: false, order: 2 },
        { text: 'Step C', isCorrect: false, order: 3 },
      ] },
    },
  });

  const essay = await prisma.question.create({
    data: { examId: exam.id, type: 'essay', stem: 'QA: discuss X', marks: 10, order: 6 },
  });

  const totalMarks = 4 + 6 + 2 + 8 + 10 + 10;
  await prisma.exam.update({ where: { id: exam.id }, data: { totalMarks, passingMarks: Math.round(totalMarks * 0.5) } });

  return {
    institutionId: institution.id,
    institutionName: institution.name,
    admin: { id: admin.id, email: adminEmail, password: PASSWORD },
    teacher: { id: teacher.id, email: teacherEmail, password: PASSWORD },
    student: { id: student.id, email: studentEmail, password: PASSWORD },
    exam: { id: exam.id, title: exam.title, startTime: startTime.toISOString(), endTime: endTime.toISOString() },
    questions: { mcq: mcq.id, mrq: mrq.id, fill_blank: fillBlank.id, matching: matching.id, ordering: ordering.id, essay: essay.id },
  };
}

async function main() {
  console.log(`Seeding QA fixtures with prefix "${prefix}" into TEST_DATABASE_URL / TEST_SUPABASE_URL...`);
  const tenantA = await buildTenant('A');
  const tenantB = await buildTenant('B');

  const fixture = { prefix, tenantA, tenantB, createdAt: new Date().toISOString() };
  const outPath = path.join(__dirname, '.qa-fixture.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log('Tenant A institution:', tenantA.institutionId, '| Tenant B institution:', tenantB.institutionId);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
