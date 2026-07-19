import { describe, it, expect } from 'vitest';
import { faceMatchDistance, isSamePerson, FACE_MATCH_THRESHOLD } from '@/lib/face-verification';

// The detector/recognizer themselves need a browser + model weights (covered by live QA);
// these tests pin the pure embedding-distance math and the threshold contract.

function vec(fill: number, len = 128): Float32Array {
  return new Float32Array(len).fill(fill);
}

describe('faceMatchDistance', () => {
  it('is zero for identical embeddings', () => {
    const a = vec(0.5);
    expect(faceMatchDistance(a, a)).toBe(0);
  });

  it('computes plain Euclidean distance', () => {
    // 128 dimensions each differing by 0.1 → sqrt(128 * 0.01) ≈ 1.1314
    expect(faceMatchDistance(vec(0.1), vec(0.2))).toBeCloseTo(Math.sqrt(128 * 0.01), 5);
  });

  it('is symmetric', () => {
    const a = new Float32Array([0.1, 0.9, 0.4]);
    const b = new Float32Array([0.7, 0.2, 0.5]);
    expect(faceMatchDistance(a, b)).toBeCloseTo(faceMatchDistance(b, a), 10);
  });
});

describe('isSamePerson', () => {
  it('accepts distances under the threshold', () => {
    const a = vec(0);
    const b = new Float32Array(128);
    // just inside the threshold (an exact-threshold value is unstable under float32 storage)
    b[0] = FACE_MATCH_THRESHOLD - 0.01;
    expect(isSamePerson(a, b)).toBe(true);
  });

  it('rejects distances over the threshold', () => {
    const a = vec(0);
    const b = new Float32Array(128);
    b[0] = FACE_MATCH_THRESHOLD + 0.01;
    expect(isSamePerson(a, b)).toBe(false);
  });

  it('uses a threshold in the sane FaceNet range (below different-person territory)', () => {
    expect(FACE_MATCH_THRESHOLD).toBeGreaterThanOrEqual(0.5);
    expect(FACE_MATCH_THRESHOLD).toBeLessThanOrEqual(0.7);
  });
});
