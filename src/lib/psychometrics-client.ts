// App-side client for the Python psychometrics service (Phase 3, doc 05).
// The service is optional infrastructure: when PSYCHOMETRICS_URL is unset,
// callers report "not configured" instead of failing — stats simply stay at
// their last computed values.

export function isPsychometricsConfigured(): boolean {
  return Boolean(process.env.PSYCHOMETRICS_URL);
}

export async function requestComputation(examId: string): Promise<
  { ok: true; result: unknown } | { ok: false; error: string }
> {
  const url = process.env.PSYCHOMETRICS_URL;
  if (!url) return { ok: false, error: 'Psychometrics service not configured' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PSYCHOMETRICS_SECRET
          ? { 'X-Service-Key': process.env.PSYCHOMETRICS_SECRET }
          : {}),
      },
      body: JSON.stringify({ exam_id: examId }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Service responded ${res.status}` };
    }
    return { ok: true, result: await res.json() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Service unreachable' };
  }
}
