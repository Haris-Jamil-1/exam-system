'use client';
import { useState, useRef } from 'react';

const AVATAR_KEY = 'exam_avatar';

export function useAvatarUpload() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AVATAR_KEY);
  });
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() { inputRef.current?.click(); }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      localStorage.setItem(AVATAR_KEY, url);
      setAvatarUrl(url);
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    localStorage.removeItem(AVATAR_KEY);
    setAvatarUrl(null);
  }

  return { avatarUrl, openPicker, onFileChange, inputRef, removeAvatar };
}
