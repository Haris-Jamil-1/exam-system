import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prismaUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
  });

  if (!prismaUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: prismaUser.id,
    name: prismaUser.name,
    email: prismaUser.email,
    role: prismaUser.role,
    institutionId: prismaUser.institutionId,
    avatarUrl: prismaUser.avatarUrl ?? undefined,
  });
}
