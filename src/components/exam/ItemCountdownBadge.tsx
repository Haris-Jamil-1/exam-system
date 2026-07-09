'use client';
import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ItemCountdownBadgeProps {
  limitSeconds: number;
  paused: boolean;
  onExpire: () => void;
}

// Mount with `key={question.id}` from the caller — remounting on question change resets the
// countdown via lazy useState init, instead of a setState-in-effect resync.
export function ItemCountdownBadge({ limitSeconds, paused, onExpire }: ItemCountdownBadgeProps) {
  const [secondsLeft, setSecondsLeft] = useState(limitSeconds);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (paused) return;
    if (secondsLeft <= 0) {
      onExpireRef.current();
      return;
    }
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          onExpireRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [secondsLeft, paused]);

  const isLow = secondsLeft < 10;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-semibold',
      isLow ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'
    )}>
      <Timer className="h-3 w-3" />
      {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
    </span>
  );
}
