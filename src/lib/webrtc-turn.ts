// Server-only: mints short-lived Cloudflare Realtime TURN credentials on demand
// (https://developers.cloudflare.com/realtime/turn/generate-credentials/). CLOUDFLARE_TURN_API_TOKEN
// grants the ability to mint credentials against this Cloudflare account, so it must never reach
// the browser — that's the whole reason this is a server module behind an authenticated route
// (src/app/api/webrtc/turn-credentials) rather than a NEXT_PUBLIC_ env var like plain STUN could
// be. Callers fetch fresh credentials right before opening each RTCPeerConnection (see
// fetchIceServers in webrtc-signaling.ts) rather than reusing one indefinitely.

const TURN_CREDENTIAL_TTL_SECONDS = 3600; // 1 hour — comfortably covers one live-view session

interface CloudflareIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

// Cloudflare's own docs flag port 53 as commonly blocked by browsers; stripping it here rather
// than trusting every returned URL to be usable (the other ports — 3478/80/443/5349 — aren't).
function stripBlockedPorts(urls: string[]): string[] {
  return urls.filter(u => !u.includes(':53'));
}

/** Returns Cloudflare's STUN+TURN ice server list, or null on any failure (missing config,
 *  network error, non-OK response) — the caller falls back to STUN-only, never a hard error. */
export async function generateTurnIceServers(): Promise<RTCIceServer[] | null> {
  const tokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!tokenId || !apiToken) return null;

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.error('[webrtc-turn] Cloudflare credential request failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { iceServers?: CloudflareIceServer[] };
    if (!data.iceServers || data.iceServers.length === 0) return null;
    return data.iceServers.map(s => ({ ...s, urls: stripBlockedPorts(s.urls) }));
  } catch (err) {
    console.error('[webrtc-turn] Cloudflare credential request errored:', err);
    return null;
  }
}
