'use client';
import { useState, useEffect, useRef } from 'react';

interface UseExamTimerReturn {
  timeRemaining: string;
  secondsLeft: number;
  isLow: boolean;
}

export function useExamTimer(
  initialSeconds: number,
  onTimeUp: () => void,
  isPaused?: boolean,
): UseExamTimerReturn {
  // initialSeconds is stable by the time this hook is first called:
  // the exam page gates on initialSeconds === 0 so we never start with 0.
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const onTimeUpRef = useRef(onTimeUp);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (isPaused) return; // interval stopped while paused; resumes on next render
    if (secondsLeft <= 0) {
      onTimeUpRef.current();
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          onTimeUpRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft, isPaused]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeRemaining = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isLow = secondsLeft < 300;

  return { timeRemaining, secondsLeft, isLow };
}
