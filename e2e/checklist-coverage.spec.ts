import { test, expect } from '@playwright/test';
import { loadFixture, loginAs } from './fixtures';

/**
 * Remaining [AUTO] checklist items not covered by scoring.test.ts,
 * error-handling.spec.ts, security-idor.spec.ts, or golden-path.spec.ts.
 * Grouped here rather than duplicating another full spec file per item.
 */

test('ADM-03 — approve persists via PUT, survives reload (not UI-only state)', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.teacher.email, fixture.tenantA.teacher.password, 'teacher');
  const createRes = await page.request.post('/api/exams', {
    data: {
      title: `${fixture.prefix}ADM-03 exam`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5,
      startTime: new Date(Date.now() + 3_600_000).toISOString(),
      endTime: new Date(Date.now() + 7_200_000).toISOString(),
      settings: { navigationMode: 'free', proctoringLevel: 'low' },
    },
  });
  expect(createRes.status(), await createRes.text()).toBe(201);
  const exam = await createRes.json() as { id: string };

  // Submit for approval
  await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'pending' } });

  await page.context().clearCookies();
  await loginAs(page, fixture.tenantA.admin.email, fixture.tenantA.admin.password, 'admin');
  const approveRes = await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'approved' } });
  expect(approveRes.status(), await approveRes.text()).toBe(200);

  const getRes = await page.request.get(`/api/exams/${exam.id}`);
  const examAfter = await getRes.json() as { approvalStatus: string };
  expect(examAfter.approvalStatus, 'approval must be persisted server-side, not just local UI state').toBe('approved');
});

test('ADM-04 — schedule conflict on approval returns conflicts, blocks the write', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.teacher.email, fixture.tenantA.teacher.password, 'teacher');

  const start = new Date(Date.now() + 3_600_000).toISOString();
  const end = new Date(Date.now() + 7_200_000).toISOString();

  // Two overlapping exams from the SAME teacher (who shares the seeded student) —
  // sufficient to trigger checkScheduleConflicts's overlap-window logic.
  const examAId = await page.request.post('/api/exams', {
    data: { title: `${fixture.prefix}Conflict A`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5, startTime: start, endTime: end, settings: { navigationMode: 'free', proctoringLevel: 'low' } },
  }).then(r => r.json()).then((e: { id: string }) => e.id);
  const examBId = await page.request.post('/api/exams', {
    data: { title: `${fixture.prefix}Conflict B`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5, startTime: start, endTime: end, settings: { navigationMode: 'free', proctoringLevel: 'low' } },
  }).then(r => r.json()).then((e: { id: string }) => e.id);

  await page.request.put(`/api/exams/${examAId}`, { data: { approvalStatus: 'pending' } });
  await page.request.put(`/api/exams/${examBId}`, { data: { approvalStatus: 'pending' } });

  await page.context().clearCookies();
  await loginAs(page, fixture.tenantA.admin.email, fixture.tenantA.admin.password, 'admin');
  const firstApproval = await page.request.put(`/api/exams/${examAId}`, { data: { approvalStatus: 'approved' } });
  expect(firstApproval.status()).toBe(200);

  const secondApproval = await page.request.put(`/api/exams/${examBId}`, { data: { approvalStatus: 'approved' } });
  const body = await secondApproval.json() as { error?: string; conflicts?: unknown[] };
  expect(body.error, `expected schedule_conflict, got: ${JSON.stringify(body)}`).toBe('schedule_conflict');
  expect(Array.isArray(body.conflicts) && body.conflicts.length > 0).toBe(true);
});

test('STU-04 — GET /api/questions as student strips correctAnswer/isCorrect/explanation (regression on C1)', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const res = await page.request.get(`/api/questions?examId=${fixture.tenantA.exam.id}`);
  expect(res.status()).toBe(200);
  const questions = await res.json() as Array<Record<string, unknown>>;
  expect(questions.length).toBeGreaterThan(0);
  for (const q of questions) {
    expect(q, `question ${q.id} leaked correctAnswer/explanation to a student`).not.toHaveProperty('correctAnswer');
    expect(q).not.toHaveProperty('explanation');
    const options = q.options as Array<Record<string, unknown>> | undefined;
    for (const opt of options ?? []) {
      expect(opt, `option ${opt.id} leaked isCorrect to a student`).not.toHaveProperty('isCorrect');
    }
  }
});

test('ERR-06 — submit with examId mismatched to the attempt is rejected (regression on C5)', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const startRes = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
  const attempt = await startRes.json() as { id: string };

  const res = await page.request.post(`/api/attempts/${attempt.id}/submit`, {
    data: { examId: 'some-other-exam-id-entirely', answers: {} },
  });
  expect(res.status()).toBe(403);
});

test('ERR-07 — double submit is rejected with 409', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const startRes = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
  const attempt = await startRes.json() as { id: string };

  const first = await page.request.post(`/api/attempts/${attempt.id}/submit`, { data: { examId: fixture.tenantA.exam.id, answers: {} } });
  expect(first.status(), await first.text()).toBe(200);

  const second = await page.request.post(`/api/attempts/${attempt.id}/submit`, { data: { examId: fixture.tenantA.exam.id, answers: {} } });
  expect(second.status()).toBe(409);
});

test('SEC-04 — admin from Tenant B mutating a Tenant A question (cross-institution admin escalation)', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantB.admin.email, fixture.tenantB.admin.password, 'admin');
  const questionId = fixture.tenantA.questions.mcq;

  const res = await page.request.put(`/api/exams/${fixture.tenantA.exam.id}`, { data: { title: 'IDOR admin rename attempt' } });
  // updateQuestion/deleteQuestion skip ownership checks entirely for admin role (questions.ts:161,194) —
  // this exercises the analogous exam-level admin path since there's no PUT /api/questions/[id] route at all.
  test.info().annotations.push({ type: 'SEC-04', description: `Cross-institution admin PUT /api/exams/[id] status: ${res.status()} (questionId ${questionId} noted for the underlying updateQuestion gap, which has no HTTP route to hit directly)` });
  expect(res.status(), 'expected this to be blocked (400+) if institution scoping existed for admin; predicted to succeed per QA_CHECKLIST.md SEC-04').toBeGreaterThanOrEqual(400);
});

test('STU-01/TIME-02 — starting an attempt after the exam\'s endTime should be blocked (auto-end has no implementation — this is EXPECTED TO FAIL)', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.teacher.email, fixture.tenantA.teacher.password, 'teacher');

  const createRes = await page.request.post('/api/exams', {
    data: {
      title: `${fixture.prefix}Already-ended exam`, subject: 'QA', duration: 5, totalMarks: 10, passingMarks: 5,
      startTime: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      endTime: new Date(Date.now() - 3_600_000).toISOString(), // ended an hour ago
      settings: { navigationMode: 'free', proctoringLevel: 'low' },
    },
  });
  const exam = await createRes.json() as { id: string };
  await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'approved', status: 'completed' } });

  await page.context().clearCookies();
  await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const res = await page.request.post('/api/attempts', { data: { examId: exam.id } });

  // Documents the confirmed gap: POST /api/attempts has no endTime check at all.
  expect(res.status(), 'EXPECTED TO FAIL per QA_CHECKLIST.md STU-01/TIME-02 — no auto-end enforcement exists in POST /api/attempts').toBeGreaterThanOrEqual(400);
});

test('TCH-04 — publish-results PATCH gates resultsPublishedAt correctly', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.teacher.email, fixture.tenantA.teacher.password, 'teacher');

  const createRes = await page.request.post('/api/exams', {
    data: {
      title: `${fixture.prefix}Held-results exam`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5,
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
      settings: { navigationMode: 'free', proctoringLevel: 'low', resultsVisibility: 'held' },
    },
  });
  const exam = await createRes.json() as { id: string };
  await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'approved', status: 'live' } });

  const beforeRes = await page.request.get(`/api/exams/${exam.id}`);
  const before = await beforeRes.json() as { resultsPublishedAt: string | null };
  expect(before.resultsPublishedAt, 'results must be held (null) before the teacher publishes').toBeNull();

  const publishRes = await page.request.patch(`/api/exams/${exam.id}/publish-results`);
  expect(publishRes.status(), await publishRes.text()).toBe(200);

  const afterRes = await page.request.get(`/api/exams/${exam.id}`);
  const after = await afterRes.json() as { resultsPublishedAt: string | null };
  expect(after.resultsPublishedAt, 'resultsPublishedAt must be set after PATCH publish-results').not.toBeNull();
});

test('ERR-03 — two students submitting concurrently does not corrupt either attempt (each isolated by [examId,studentId])', async ({ browser }) => {
  const fixture = loadFixture();
  // Tenant A student + Tenant B student submitting concurrently against their OWN exams —
  // proves no shared mutable state races, not that two students can share one exam attempt
  // (the unique constraint already prevents that scenario from being reachable).
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await loginAs(pageA, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const attemptA = await pageA.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } }).then(r => r.json()) as { id: string };

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await loginAs(pageB, fixture.tenantB.student.email, fixture.tenantB.student.password, 'student');
  const attemptB = await pageB.request.post('/api/attempts', { data: { examId: fixture.tenantB.exam.id } }).then(r => r.json()) as { id: string };

  const [resA, resB] = await Promise.all([
    pageA.request.post(`/api/attempts/${attemptA.id}/submit`, { data: { examId: fixture.tenantA.exam.id, answers: {} } }),
    pageB.request.post(`/api/attempts/${attemptB.id}/submit`, { data: { examId: fixture.tenantB.exam.id, answers: {} } }),
  ]);

  expect(resA.status(), await resA.text()).toBe(200);
  expect(resB.status(), await resB.text()).toBe(200);
  await contextA.close();
  await contextB.close();
});

test('TIME-05 — POST /api/violations ignores a spoofed studentId in the body', async ({ page }) => {
  const fixture = loadFixture();
  await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const startRes = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
  const attempt = await startRes.json() as { id: string };

  const res = await page.request.post('/api/violations', {
    data: {
      attemptId: attempt.id, examId: fixture.tenantA.exam.id,
      type: 'tab_switch', severity: 'low', timestamp: new Date().toISOString(), description: 'qa test',
      studentId: fixture.tenantB.student.id, // spoofed — must be ignored
    },
  });
  expect(res.status()).toBe(201);
  const violation = await res.json() as { studentId: string };
  expect(violation.studentId).toBe(fixture.tenantA.student.id);
});
