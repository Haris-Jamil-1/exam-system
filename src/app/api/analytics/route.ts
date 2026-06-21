import { NextResponse } from 'next/server';
import { getDashboardStats, getScoreDistribution, getTrustTrend, getQuestionDifficulty } from '@/lib/data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId') ?? undefined;

  const [stats, scoreDist, trustTrend, questionDiff] = await Promise.all([
    getDashboardStats(),
    getScoreDistribution(examId),
    getTrustTrend(examId),
    getQuestionDifficulty(examId),
  ]);

  return NextResponse.json({ stats, scoreDist, trustTrend, questionDiff });
}
