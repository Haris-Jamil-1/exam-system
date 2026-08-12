'use client';
// Two-field date + time picker — avoids the clunky single datetime-local popup. Shared between
// the exam creation wizard and the exam edit page's schedule fields.
import { useState } from 'react';

function splitIso(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  // Local-time components (not UTC) so the two inputs show what the browser's own timezone
  // would render, matching what the teacher originally typed in.
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function DateTimeField({ onChange, initialValue, disabled }: { onChange: (v: string) => void; initialValue?: string; disabled?: boolean }) {
  const initial = splitIso(initialValue);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  function handleDate(e: React.ChangeEvent<HTMLInputElement>) {
    const d = e.target.value;
    setDate(d);
    // Convert to UTC ISO using browser timezone so server stores the correct UTC instant
    onChange(d && time ? new Date(`${d}T${time}`).toISOString() : '');
  }

  function handleTime(e: React.ChangeEvent<HTMLInputElement>) {
    const t = e.target.value;
    setTime(t);
    onChange(date && t ? new Date(`${date}T${t}`).toISOString() : '');
  }

  return (
    <div className="flex gap-2">
      <input
        type="date"
        value={date}
        onChange={handleDate}
        disabled={disabled}
        className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <input
        type="time"
        value={time}
        onChange={handleTime}
        disabled={disabled}
        className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
