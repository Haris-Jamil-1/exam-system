import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTurnIceServers } from '@/lib/webrtc-turn';

const ENV_KEYS = ['CLOUDFLARE_TURN_TOKEN_ID', 'CLOUDFLARE_TURN_API_TOKEN'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  process.env.CLOUDFLARE_TURN_TOKEN_ID = 'test-token-id';
  process.env.CLOUDFLARE_TURN_API_TOKEN = 'test-api-token';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

describe('generateTurnIceServers', () => {
  it('returns null when either env var is missing', async () => {
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    expect(await generateTurnIceServers()).toBeNull();
  });

  it('calls the Cloudflare endpoint with the token id in the URL and the API token as a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await generateTurnIceServers();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/test-token-id/credentials/generate-ice-servers');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-api-token');
  });

  it('strips port-53 URLs (browsers commonly block it)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' },
        ],
      }),
    }));
    const result = await generateTurnIceServers();
    expect(result?.[0].urls).toEqual(['stun:stun.cloudflare.com:3478']);
    expect(result?.[1].urls).toEqual(['turn:turn.cloudflare.com:3478?transport=udp']);
  });

  it('returns null when Cloudflare responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }));
    expect(await generateTurnIceServers()).toBeNull();
  });

  it('returns null when iceServers is missing or empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ iceServers: [] }) }));
    expect(await generateTurnIceServers()).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await generateTurnIceServers()).toBeNull();
  });
});
