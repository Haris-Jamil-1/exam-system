'use client';
// Shared by every authoring image button (last session's lightweight toolbar and the new Quill
// editor) — uploads to the public item-assets bucket (src/app/api/upload/route.ts's `public=true`
// branch) and returns a stable, non-expiring public URL suitable for embedding directly into
// question stem/option content.
export async function uploadItemImage(file: File): Promise<string | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', 'item-assets');
  form.append('public', 'true');
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) return null;
  const data = (await res.json()) as { url: string | null };
  return data.url;
}
