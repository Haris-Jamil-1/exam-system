import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildIceServers } from '@/lib/webrtc-signaling';

const ENV_KEYS = ['NEXT_PUBLIC_TURN_URL', 'NEXT_PUBLIC_TURN_USERNAME', 'NEXT_PUBLIC_TURN_CREDENTIAL'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('buildIceServers', () => {
  it('always includes the public STUN server', () => {
    const servers = buildIceServers();
    expect(servers).toContainEqual({ urls: 'stun:stun.l.google.com:19302' });
  });

  it('is STUN-only when no TURN env vars are set', () => {
    expect(buildIceServers()).toHaveLength(1);
  });

  it('is STUN-only when only some TURN env vars are set (partial config never used)', () => {
    process.env.NEXT_PUBLIC_TURN_URL = 'turn:example.com:3478';
    process.env.NEXT_PUBLIC_TURN_USERNAME = 'user';
    // credential intentionally left unset
    expect(buildIceServers()).toHaveLength(1);
  });

  it('adds a TURN server once all three env vars are set', () => {
    process.env.NEXT_PUBLIC_TURN_URL = 'turn:example.com:3478';
    process.env.NEXT_PUBLIC_TURN_USERNAME = 'user';
    process.env.NEXT_PUBLIC_TURN_CREDENTIAL = 'secret';
    const servers = buildIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({ urls: ['turn:example.com:3478'], username: 'user', credential: 'secret' });
  });

  it('splits a comma-separated NEXT_PUBLIC_TURN_URL into multiple urls on one server entry', () => {
    process.env.NEXT_PUBLIC_TURN_URL = 'turn:example.com:3478, turns:example.com:443?transport=tcp';
    process.env.NEXT_PUBLIC_TURN_USERNAME = 'user';
    process.env.NEXT_PUBLIC_TURN_CREDENTIAL = 'secret';
    const servers = buildIceServers();
    expect(servers[1].urls).toEqual(['turn:example.com:3478', 'turns:example.com:443?transport=tcp']);
  });
});
