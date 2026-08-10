import { NextResponse } from 'next/server';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';
import { adminSupabase } from '@/lib/supabase/admin';

const BUCKET = 'exam-uploads';
// Separate, genuinely-public bucket for content teachers embed *into* authored questions (the
// rich-text toolbar's image button) — unlike proctoring evidence/submissions, an image inside a
// question stem needs to keep rendering for the life of the item, so a signed URL (max practical
// TTL, still expires) doesn't work. A public bucket with a stable URL is the correct fit; it never
// shares a bucket with the private evidence path, so nothing evidence-related becomes public.
const PUBLIC_BUCKET = 'item-assets';

async function ensureBucket(bucket: string, isPublic: boolean) {
  const { data: buckets } = await adminSupabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === bucket);
  if (!exists) {
    await adminSupabase.storage.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: 50 * 1024 * 1024, // 50 MB
    });
  }
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string | null) ?? 'misc';
  const isPublicAsset = (formData.get('public') as string | null) === 'true';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const bucket = isPublicAsset ? PUBLIC_BUCKET : BUCKET;
  await ensureBucket(bucket, isPublicAsset);

  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${folder}/${user.id}/${Date.now()}.${ext}`;

  // Storage ops go through the service-role client: the bucket is private with no storage
  // RLS policies, so the user-scoped client's upload was rejected with "new row violates
  // row-level security policy" — every proctoring evidence snapshot (multi-face/phone/
  // sustained-no-face, and teacher-requested snapshots) silently failed to land. The caller
  // is already authenticated above and the path is scoped under their own user id; the
  // read side (/api/evidence) was already using the admin client the same way.
  const arrayBuffer = await file.arrayBuffer();
  const { error } = await adminSupabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (isPublicAsset) {
    const { data: pub } = adminSupabase.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ path, url: pub.publicUrl }, { status: 201 });
  }

  // Generate a signed URL valid for 1 hour (files are private)
  const { data: signed } = await adminSupabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    path,
    url: signed?.signedUrl ?? null,
  }, { status: 201 });
});
