// Judge0 execution client (Phase 3, doc 03 / decision 7): student code runs in
// a self-hosted Judge0 sandbox (docker-compose in /judge0), NEVER in the app
// process. The service receives only { language, source, stdin } — no tenant
// data. When JUDGE0_URL is unconfigured or unreachable, execution is reported
// unavailable and the answer stays pending for manual grading — marks are
// never awarded on "execution unavailable".

const JUDGE0_URL = process.env.JUDGE0_URL; // e.g. http://localhost:2358

// Judge0 language IDs for the languages the question editor offers.
const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63, // Node.js
  typescript: 74,
  python: 71, // Python 3
  java: 62,
  c: 50,
  cpp: 54,
  csharp: 51,
  go: 60,
  ruby: 72,
  rust: 73,
  php: 68,
  sql: 82, // SQLite
};

export interface TestCaseResult {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  passed: boolean;
  stdout: string | null;
  stderr: string | null;
  statusDescription: string;
  timedOut: boolean;
}

export interface ExecutionResult {
  available: boolean;
  language: string;
  results: TestCaseResult[];
  passedCount: number;
  totalCount: number;
  error?: string;
}

interface Judge0Submission {
  stdout: string | null;
  stderr: string | null;
  status: { id: number; description: string };
}

export function isJudge0Configured(): boolean {
  return Boolean(JUDGE0_URL);
}

export async function runTestCases(
  language: string,
  sourceCode: string,
  testCases: { input: string; expectedOutput: string; isHidden?: boolean }[],
): Promise<ExecutionResult> {
  const languageId = LANGUAGE_IDS[language.toLowerCase()];
  if (!JUDGE0_URL || !languageId) {
    return {
      available: false,
      language,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      error: !JUDGE0_URL ? 'Execution sandbox not configured' : `Unsupported language: ${language}`,
    };
  }

  const results: TestCaseResult[] = [];
  try {
    for (const tc of testCases) {
      const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_id: languageId,
          source_code: Buffer.from(sourceCode).toString('base64'),
          stdin: Buffer.from(tc.input).toString('base64'),
          // Per-run resource caps — sandbox hygiene, not grading policy.
          cpu_time_limit: 5,
          memory_limit: 256_000,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Judge0 responded ${res.status}`);
      const sub = (await res.json()) as Judge0Submission;
      const stdout = sub.stdout ? Buffer.from(sub.stdout, 'base64').toString() : null;
      const stderr = sub.stderr ? Buffer.from(sub.stderr, 'base64').toString() : null;
      results.push({
        input: tc.isHidden ? '[hidden]' : tc.input,
        expectedOutput: tc.isHidden ? '[hidden]' : tc.expectedOutput,
        isHidden: tc.isHidden ?? false,
        passed: sub.status.id === 3 && (stdout ?? '').trim() === tc.expectedOutput.trim(),
        stdout: tc.isHidden ? null : stdout,
        stderr: tc.isHidden ? null : stderr,
        statusDescription: sub.status.description,
        timedOut: sub.status.id === 5,
      });
    }
  } catch (err) {
    return {
      available: false,
      language,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      error: err instanceof Error ? err.message : 'Execution failed',
    };
  }

  return {
    available: true,
    language,
    results,
    passedCount: results.filter(r => r.passed).length,
    totalCount: results.length,
  };
}
