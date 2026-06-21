import { create } from 'zustand';
import type { Exam } from '@/types';

interface ExamStore {
  currentExam: Exam | null;
  currentQuestionIndex: number;
  answers: Record<string, string | string[]>;
  flaggedQuestions: Set<string>;
  timeRemaining: number;
  setCurrentExam: (exam: Exam) => void;
  setAnswer: (questionId: string, response: string | string[]) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  goToQuestion: (index: number) => void;
  flagQuestion: (questionId: string) => void;
  setTimeRemaining: (seconds: number) => void;
  resetExam: () => void;
}

export const useExamStore = create<ExamStore>((set) => ({
  currentExam: null,
  currentQuestionIndex: 0,
  answers: {},
  flaggedQuestions: new Set(),
  timeRemaining: 0,

  setCurrentExam: (exam) => set({ currentExam: exam, timeRemaining: exam.duration * 60 }),

  setAnswer: (questionId, response) =>
    set(state => ({ answers: { ...state.answers, [questionId]: response } })),

  nextQuestion: () =>
    set(state => ({ currentQuestionIndex: state.currentQuestionIndex + 1 })),

  prevQuestion: () =>
    set(state => ({
      currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
    })),

  goToQuestion: (index) => set({ currentQuestionIndex: index }),

  flagQuestion: (questionId) =>
    set(state => {
      const newFlagged = new Set(state.flaggedQuestions);
      if (newFlagged.has(questionId)) {
        newFlagged.delete(questionId);
      } else {
        newFlagged.add(questionId);
      }
      return { flaggedQuestions: newFlagged };
    }),

  setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

  resetExam: () =>
    set({
      currentExam: null,
      currentQuestionIndex: 0,
      answers: {},
      flaggedQuestions: new Set(),
      timeRemaining: 0,
    }),
}));
