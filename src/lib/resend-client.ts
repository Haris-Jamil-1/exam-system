// Lazy Resend client — constructing `new Resend(apiKey)` eagerly at module scope crashes
// immediately if RESEND_API_KEY is unset, and Next.js's build-time "Collecting page data" step
// statically imports every route module (including transitively through the `@/lib/data` barrel
// export), so a module-scope construction anywhere in that import graph runs at build time even
// for a route that never sends email. This surfaced as a real, previously-latent production
// build failure (`/api/analytics` — which never touches Resend at all — failing to build because
// importing `@/lib/data` pulled in `invites.ts`'s eager `new Resend(...)`). Constructing on first
// actual use avoids that entirely; the failure mode this was masking (no RESEND_API_KEY
// configured) still surfaces normally, just at the point an email is actually attempted.
import { Resend } from 'resend';

let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}
