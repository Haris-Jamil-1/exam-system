// Phase 2: replace in-memory state with Supabase Realtime channel subscriptions.
// Violations and snapshots will be persisted to DB via POST /api/violations.
// Trust score will be recomputed server-side on each violation insert.
import { create } from 'zustand';
import type { ViolationType } from '@/types';

export interface ViolationSnapshot {
  timestamp: string;
  dataUrl: string;        // base64 webcam frame captured at violation time
  violationType: ViolationType;
  description: string;
}

interface LastViolation {
  type: ViolationType;
  timestamp: string;
  description: string;
}

interface ProctoringStore {
  violationCount: number;
  lastViolation: LastViolation | null;
  isWarningVisible: boolean;
  trustScore: number;
  // Phase 2: snapshots uploaded to Supabase Storage, URL stored in violations.screenshot_url
  snapshots: ViolationSnapshot[];
  addViolation: (violation?: LastViolation) => void;
  addSnapshot: (snapshot: ViolationSnapshot) => void;
  dismissWarning: () => void;
  resetProctoring: () => void;
}

export const useProctoringStore = create<ProctoringStore>((set) => ({
  violationCount: 0,
  lastViolation: null,
  isWarningVisible: false,
  trustScore: 100,
  snapshots: [],

  addViolation: (violation) =>
    set(state => {
      const newCount = state.violationCount + 1;
      // Phase 2: severity-weighted deduction from server, not flat 10
      const deduction = violation?.type === 'no_face' || violation?.type === 'multiple_faces' ? 15 : 10;
      const newTrust = Math.max(0, state.trustScore - deduction);
      return {
        violationCount: newCount,
        lastViolation: violation ?? state.lastViolation,
        isWarningVisible: true,
        trustScore: newTrust,
      };
    }),

  addSnapshot: (snapshot) =>
    set(state => ({ snapshots: [...state.snapshots, snapshot] })),

  dismissWarning: () => set({ isWarningVisible: false }),

  resetProctoring: () =>
    set({
      violationCount: 0,
      lastViolation: null,
      isWarningVisible: false,
      trustScore: 100,
      snapshots: [],
    }),
}));
