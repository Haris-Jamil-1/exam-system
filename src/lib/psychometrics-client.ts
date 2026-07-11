// App-side client for the psychometrics compute function (follow-up task 2):
// now a Vercel Python Function inside this same project
// (api/psychometrics/compute.py) instead of an externally hosted service —
// called as an internal route, no PSYCHOMETRICS_URL needed. Stateless
// batch/on-demand computation; nothing needs a persistent worker.

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function isPsychometricsConfigured(): boolean {
  // The function deploys with the app; the only hard requirement is a DB URL,
  // which the app itself already has.
  return true;
}

export async function requestComputation(examId: string): Promise<
  { ok: true; result: unknown } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${baseUrl()}/api/psychometrics/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PSYCHOMETRICS_SECRET
          ? { 'X-Service-Key': process.env.PSYCHOMETRICS_SECRET }
          : {}),
      },
      body: JSON.stringify({ exam_id: examId }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Compute function responded ${res.status}` };
    }
    return { ok: true, result: await res.json() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Compute function unreachable' };
  }
}
