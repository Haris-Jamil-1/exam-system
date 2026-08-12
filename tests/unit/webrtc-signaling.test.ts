import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchIceServers, STUN_ONLY_ICE_SERVERS } from '@/lib/webrtc-signaling';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchIceServers', () => {
  it('returns the server-provided iceServers on a successful response', async () => {
    const cloudflareServers = [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ iceServers: cloudflareServers }),
    }));
    expect(await fetchIceServers()).toEqual(cloudflareServers);
  });

  it('falls back to STUN-only when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchIceServers()).toEqual(STUN_ONLY_ICE_SERVERS);
  });

  it('falls back to STUN-only when iceServers is null (server-side TURN not configured)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: null }) }));
    expect(await fetchIceServers()).toEqual(STUN_ONLY_ICE_SERVERS);
  });

  it('falls back to STUN-only when the fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await fetchIceServers()).toEqual(STUN_ONLY_ICE_SERVERS);
  });
});
