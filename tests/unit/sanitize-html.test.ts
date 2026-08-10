import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAllowedImageSrc } from '@/components/rich/sanitize-html-loader';

const PROJECT_URL = 'https://rlbtdpnmdnaxlccelxdr.supabase.co';

describe('isAllowedImageSrc', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows a public item-assets URL under our own Supabase project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT_URL);
    expect(isAllowedImageSrc(`${PROJECT_URL}/storage/v1/object/public/item-assets/foo/bar.png`)).toBe(true);
  });

  it('rejects a different origin entirely', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT_URL);
    expect(isAllowedImageSrc('https://evil.example/tracking.png')).toBe(false);
  });

  it('rejects our own origin but a different (e.g. private evidence) bucket path', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT_URL);
    expect(isAllowedImageSrc(`${PROJECT_URL}/storage/v1/object/public/exam-uploads/evidence/x.jpg`)).toBe(false);
  });

  it('rejects a lookalike host (prefix/suffix attack on the origin string)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT_URL);
    expect(isAllowedImageSrc('https://rlbtdpnmdnaxlccelxdr.supabase.co.evil.example/storage/v1/object/public/item-assets/x.png')).toBe(false);
    expect(isAllowedImageSrc('https://evil-rlbtdpnmdnaxlccelxdr.supabase.co/storage/v1/object/public/item-assets/x.png')).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', PROJECT_URL);
    expect(isAllowedImageSrc('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageSrc('data:image/png;base64,AAAA')).toBe(false);
  });

  it('rejects everything when the upload origin cannot be determined', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(isAllowedImageSrc(`${PROJECT_URL}/storage/v1/object/public/item-assets/x.png`)).toBe(false);
  });
});
