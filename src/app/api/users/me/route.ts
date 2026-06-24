import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

async function getSupabaseUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : user;
}

function userResponse(u: { id: string; name: string; email: string; role: string; institutionId: string; avatarUrl: string | null }) {
  return NextResponse.json({
    id: u.id, name: u.name, email: u.email,
    role: u.role, institutionId: u.institutionId,
    avatarUrl: u.avatarUrl ?? undefined,
  });
}

export async function GET() {
  const user = await getSupabaseUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prismaUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!prismaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return userResponse(prismaUser);
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function PATCH(request: Request) {
  const user = await getSupabaseUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const prismaUser = await prisma.user.update({
    where: { supabaseId: user.id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.avatarUrl && { avatarUrl: parsed.data.avatarUrl }),
    },
  });

  return userResponse(prismaUser);
}
