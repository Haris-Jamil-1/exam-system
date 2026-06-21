'use client';
import { useState, useEffect } from 'react';
import { getAnalyticsKpis, getScoreDistribution, getTrustTrend, getQuestionDifficulty } from '@/lib/data';
import type { StatValue } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';

export default function AnalyticsPage() {
  const [kpis, setKpis] = useState<StatValue[]>([]);
  const [scoreDist, setScoreDist] = useState<{ range: string; count: number }[]>([]);
  const [trustTrend, setTrustTrend] = useState<{ week: string; avgTrust: number }[]>([]);
  const [diffData, setDiffData] = useState<{ difficulty: string; correct: number; incorrect: number }[]>([]);

  useEffect(() => {
    Promise.all([
      getAnalyticsKpis(),
      getScoreDistribution(),
      getTrustTrend(),
      getQuestionDifficulty(),
    ]).then(([k, sd, tt, dd]) => {
      setKpis(k);
      setScoreDist(sd);
      setTrustTrend(tt);
      setDiffData(dd);
    });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader en="Analytics" ar="التحليلات" subEn="Performance insights across your exams and students" subAr="رؤى الأداء عبر اختباراتك وطلابك" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="text-2xl font-bold mt-1">{kpi.value}</p>
              {kpi.change !== undefined && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${kpi.trend === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                  {kpi.trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {kpi.change > 0 ? '+' : ''}{kpi.change} from last period
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Score distribution */}
      <Card>
        <CardHeader><CardTitle>Score Distribution</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreDist}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Trust trend */}
      <Card>
        <CardHeader><CardTitle>Average Trust Score Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trustTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis domain={[60, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avgTrust" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Question difficulty */}
      <Card>
        <CardHeader><CardTitle>Question Difficulty Breakdown</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={diffData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="difficulty" type="category" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="correct" name="Correct %" fill="#22c55e" stackId="a" />
              <Bar dataKey="incorrect" name="Incorrect %" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
