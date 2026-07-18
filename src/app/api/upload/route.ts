import { NextResponse } from 'next/server';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';
import { adminSupabase } from '@/lib/supabase/admin';

const BUCKET = 'exam-uploads';

async function ensureBucket() {
  const { data: buckets } = await adminSupabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    await adminSupabase.storage.createBucket(BUCKET, {
      public: false,
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

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  await ensureBucket();

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
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
