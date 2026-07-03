/**
 * Removes everything created by seed-tenants.ts. Deletes in FK-safe order —
 * several relations in prisma/schema.prisma default to onDelete: Restrict
 * (Exam.teacher, ExamAttempt.exam, Violation.exam/.student), so institution
 * deletion alone will NOT cascade cleanly (this is itself DAT-02's finding).
 *
 * Run: npx tsx tests/fixtures/teardown-tenants.ts
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertNonProd } from './guard-non-prod';

assertNonProd();

const adapter = new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const adminSupabase = createClient(
  process.env.TEST_SUPABASE_URL!,
  process.env.TEST_SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function teardownTenant(institutionId: string) {
  const examIds = (await prisma.exam.findMany({ where: { institutionId }, select: { id: true } })).map(e => e.id);
  const attemptIds = (await prisma.examAttempt.findMany({ where: { examId: { in: examIds } }, select: { id: true } })).map(a => a.id);

  await prisma.violation.deleteMany({ where: { examId: { in: examIds } } });
  await prisma.answer.deleteMany({ where: { attemptId: { in: attemptIds } } });
  await prisma.examAttempt.deleteMany({ where: { examId: { in: examIds } } });
  await prisma.examEnrollment.deleteMany({ where: { examId: { in: examIds } } });
  await prisma.question.deleteMany({ where: { examId: { in: examIds } } }); // options cascade
  await prisma.exam.deleteMany({ where: { institutionId } });
  await prisma.teacherStudent.deleteMany({ where: { teacher: { institutionId } } });

  const users = await prisma.user.findMany({ where: { institutionId }, select: { id: true, supabaseId: true } });
  await prisma.user.deleteMany({ where: { institutionId } });
  await prisma.institution.delete({ where: { id: institutionId } });

  for (const u of users) {
    await adminSupabase.auth.admin.deleteUser(u.supabaseId).catch(() => {});
  }
}

async function main() {
  const fixturePath = path.join(__dirname, '.qa-fixture.json');
  if (!existsSync(fixturePath)) {
    console.log('No .qa-fixture.json found — nothing to tear down.');
    return;
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
    tenantA: { institutionId: string }; tenantB: { institutionId: string };
  };

  await teardownTenant(fixture.tenantA.institutionId);
  await teardownTenant(fixture.tenantB.institutionId);
  unlinkSync(fixturePath);
  console.log('Teardown complete.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
