import { create } from 'zustand';
import type { ViolationType } from '@/types';

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
  addViolation: (violation?: LastViolation) => void;
  dismissWarning: () => void;
  resetProctoring: () => void;
}

export const useProctoringStore = create<ProctoringStore>((set) => ({
  violationCount: 0,
  lastViolation: null,
  isWarningVisible: false,
  trustScore: 100,

  addViolation: (violation) =>
    set(state => {
      const newCount = state.violationCount + 1;
      const deduction = 10;
      const newTrust = Math.max(0, state.trustScore - deduction);
      return {
        violationCount: newCount,
        lastViolation: violation ?? state.lastViolation,
        isWarningVisible: true,
        trustScore: newTrust,
      };
    }),

  dismissWarning: () => set({ isWarningVisible: false }),

  resetProctoring: () =>
    set({
      violationCount: 0,
      lastViolation: null,
      isWarningVisible: false,
      trustScore: 100,
    }),
}));
