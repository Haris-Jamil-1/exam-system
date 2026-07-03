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
      settings: { navigationMode: 'free', proctoringLevel: 'standard' },
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
    data: { title: `${fixture.prefix}Conflict A`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5, startTime: start, endTime: end, settings: { navigationMode: 'free', proctoringLevel: 'standard' } },
  }).then(r => r.json()).then((e: { id: string }) => e.id);
  const examBId = await page.request.post('/api/exams', {
    data: { title: `${fixture.prefix}Conflict B`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5, startTime: start, endTime: end, settings: { navigationMode: 'free', proctoringLevel: 'standard' } },
  }).then(r => r.json()).then((e: { id: string }) => e.id);

  await page.request.put(`/api/exams/${examAId}`, { data: { approvalStatus: 'pending' } });
  await page.request.put(`/api/exams/${examBId}`, { data: { approvalStatus: 'pending' } });

  await page.context().clearCookies();
  await loginAs(page, fixture.tenantA.admin.email, fixture.tenantA.admin.password, 'admin');
  // status must move to 'live'/'scheduled' too — checkScheduleConflicts only
  // considers status: {in: ['scheduled','live']} exams; approvalStatus alone
  // isn't enough (confirmed: an earlier run of this test left status:'draft'
  // and the conflict query silently excluded both exams, producing a false
  // "no conflict" result that was a test defect, not a real app finding).
  const firstApproval = await page.request.put(`/api/exams/${examAId}`, { data: { approvalStatus: 'approved', status: 'live' } });
  expect(firstApproval.status(), await firstApproval.text()).toBe(200);

  const secondApproval = await page.request.put(`/api/exams/${examBId}`, { data: { approvalStatus: 'approved', status: 'live' } });
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
      settings: { navigationMode: 'free', proctoringLevel: 'standard' },
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
      settings: { navigationMode: 'free', proctoringLevel: 'standard', resultsVisibility: 'held' },
    },
  });
  expect(createRes.status(), await createRes.text()).toBe(201);
  const exam = await createRes.json() as { id: string };
  // publish-results doesn't require approval/live status (confirmed by reading
  // the route — it only checks ownership), so not asserting on this PUT's
  // result here; it's fine if it 409s on a schedule conflict with the
  // tenant's other live exams, unrelated to what this test verifies.
  await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'approved', status: 'live' } });

  const beforeRes = await page.request.get(`/api/exams/${exam.id}`);
  const before = await beforeRes.json() as { resultsPublishedAt: string | null | undefined };
  // REAL FINDING (confirmed, minor): src/lib/data/exams.ts's mapExam does
  // `e.resultsPublishedAt?.toISOString()` — optional chaining on a `null`
  // Prisma value evaluates to `undefined`, not `null`, so JSON.stringify
  // drops the key entirely instead of sending `"resultsPublishedAt": null`.
  // Accepting either here so the actual publish-results behavior below can
  // still be verified; see QA_RESULTS.md for this as its own finding.
  expect([null, undefined]).toContain(before.resultsPublishedAt);

  const publishRes = await page.request.patch(`/api/exams/${exam.id}/publish-results`);
  expect(publishRes.status(), await publishRes.text()).toBe(200);

  const afterRes = await page.request.get(`/api/exams/${exam.id}`);
  const after = await afterRes.json() as { resultsPublishedAt: string | null };
  expect(after.resultsPublishedAt, 'resultsPublishedAt must be set after PATCH publish-results').not.toBeNull();
});

test('ERR-03 — two students submitting concurrently does not corrupt either attempt (each isolated by [examId,studentId])', async ({ browser }) => {
  const fixture = loadFixture();
  // Each side gets its OWN freshly-created, approved exam — NOT fixture.tenantA/B.exam,
  // which several other tests in this suite (ERR-06, ERR-07, SEC-*) also start/submit
  // attempts against. Reusing that shared exam caused a false failure in an earlier run:
  // ERR-07 had already driven that attempt to status:"submitted" before this test got to
  // it, so the "concurrent submit" call correctly 409'd for a reason unrelated to
  // concurrency. A dedicated exam per test avoids any cross-test attempt-state collision.
  async function createFreshLiveExam(page: import('@playwright/test').Page, teacher: { email: string; password: string }, admin: { email: string; password: string }, label: string) {
    await loginAs(page, teacher.email, teacher.password, 'teacher');
    // Window deliberately far outside the seed script's ~[-60s, +3600s] range
    // so this doesn't collide with the tenant's other already-live exams
    // (exam, goldExam) via the real, correctly-functioning schedule-conflict
    // check — confirmed in an earlier run: POST /api/attempts has no
    // time-window enforcement at all (see STU-01/TIME-02, SEC-07), so a
    // future-dated window here doesn't prevent the student from starting
    // and submitting an attempt immediately.
    const createRes = await page.request.post('/api/exams', {
      data: {
        title: `${fixture.prefix}ERR-03 ${label}`, subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5,
        startTime: new Date(Date.now() + 3 * 3_600_000).toISOString(),
        endTime: new Date(Date.now() + 4 * 3_600_000).toISOString(),
        settings: { proctoringLevel: 'standard' },
      },
    });
    if (createRes.status() !== 201) throw new Error(`ERR-03 setup: exam creation failed: ${await createRes.text()}`);
    const exam = await createRes.json() as { id: string };
    await page.context().clearCookies();
    await loginAs(page, admin.email, admin.password, 'admin');
    const approveRes = await page.request.put(`/api/exams/${exam.id}`, { data: { approvalStatus: 'approved', status: 'live' } });
    if (approveRes.status() !== 200) throw new Error(`ERR-03 setup: exam approval failed: ${await approveRes.text()}`);
    await page.context().clearCookies();
    return exam.id;
  }

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const examAId = await createFreshLiveExam(pageA, fixture.tenantA.teacher, fixture.tenantA.admin, 'Tenant A');
  await loginAs(pageA, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
  const attemptA = await pageA.request.post('/api/attempts', { data: { examId: examAId } }).then(r => r.json()) as { id: string };

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const examBId = await createFreshLiveExam(pageB, fixture.tenantB.teacher, fixture.tenantB.admin, 'Tenant B');
  await loginAs(pageB, fixture.tenantB.student.email, fixture.tenantB.student.password, 'student');
  const attemptB = await pageB.request.post('/api/attempts', { data: { examId: examBId } }).then(r => r.json()) as { id: string };

  const [resA, resB] = await Promise.all([
    pageA.request.post(`/api/attempts/${attemptA.id}/submit`, { data: { examId: examAId, answers: {} } }),
    pageB.request.post(`/api/attempts/${attemptB.id}/submit`, { data: { examId: examBId, answers: {} } }),
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
