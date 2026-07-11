import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSuperAdmin, forbidden } from '@/lib/api-auth';

// Super Admin platform overview (follow-up task 3): every institution with
// user/exam counts, this month's Judge0 + Claude usage, and running cost
// estimates. Unit costs are env-tunable — they're estimates for the dashboard,
// not billing records.

const JUDGE0_COST_PER_SUBMISSION = Number(process.env.JUDGE0_COST_PER_SUBMISSION ?? 0.0005);
const AI_COST_PER_CALL = Number(process.env.AI_COST_PER_CALL ?? 0.02);

export async function GET() {
  const superAdmin = await getSuperAdmin();
  if (!superAdmin) return forbidden();

  const month = new Date().toISOString().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00Z`);

  const [institutions, judgeUsage] = await Promise.all([
    prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        domain: true,
        suspendedAt: true,
        createdAt: true,
        aiUsageCount: true,
        aiMonthlyQuota: true,
        aiUsageMonth: true,
        judgeMonthlyQuota: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    }),
    // Judge0 submissions this month from the attribution log (source of truth
    // for cost — the counter is the quota mechanism).
    prisma.judgeUsageLog.groupBy({
      by: ['institutionId'],
      where: { submittedAt: { gte: monthStart } },
      _sum: { submissionCount: true },
    }),
  ]);

  const judgeByInstitution = new Map(
    judgeUsage.map(row => [row.institutionId, row._sum.submissionCount ?? 0]),
  );

  const detail = await Promise.all(
    institutions.map(async inst => {
      const [teachers, students, activeExams] = await Promise.all([
        prisma.user.count({ where: { institutionId: inst.id, role: 'teacher' } }),
        prisma.user.count({ where: { institutionId: inst.id, role: 'student' } }),
        prisma.exam.count({ where: { institutionId: inst.id, status: { in: ['scheduled', 'live'] } } }),
      ]);
      const judgeSubmissions = judgeByInstitution.get(inst.id) ?? 0;
      // aiUsageCount only counts for the current month.
      const aiCalls = inst.aiUsageMonth === month ? inst.aiUsageCount : 0;
      return {
        id: inst.id,
        name: inst.name,
        domain: inst.domain,
        suspendedAt: inst.suspendedAt,
        teachers,
        students,
        activeExams,
        usage: {
          month,
          judgeSubmissions,
          judgeQuota: inst.judgeMonthlyQuota,
          judgeCostUsd: Number((judgeSubmissions * JUDGE0_COST_PER_SUBMISSION).toFixed(2)),
          aiCalls,
          aiQuota: inst.aiMonthlyQuota,
          aiCostUsd: Number((aiCalls * AI_COST_PER_CALL).toFixed(2)),
        },
      };
    }),
  );

  return NextResponse.json({ month, institutions: detail });
}
