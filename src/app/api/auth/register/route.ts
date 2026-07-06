import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/api-auth';

const schema = z.object({
  institutionName: z.string().min(2),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export const POST = withErrorHandling(async (request: Request) => {
  const body = await request.json() as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { institutionName, adminName, email, password } = parsed.data;

  // Create institution first to get the ID
  const institution = await prisma.institution.create({
    data: {
      name: institutionName,
      domain: email.split('@')[1] ?? 'unknown.com',
    },
  });

  // Create Supabase auth user (confirmed immediately, no email verification step)
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: adminName,
      role: 'admin',
      institutionId: institution.id,
    },
  });

  if (authError || !authData.user) {
    // Roll back institution
    await prisma.institution.delete({ where: { id: institution.id } }).catch(() => {});
    return NextResponse.json({ error: authError?.message ?? 'Failed to create account' }, { status: 400 });
  }

  // Create Prisma User record
  const prismaUser = await prisma.user.create({
    data: {
      supabaseId: authData.user.id,
      name: adminName,
      email,
      role: 'admin',
      institutionId: institution.id,
    },
  });

  return NextResponse.json({
    id: prismaUser.id,
    name: prismaUser.name,
    email: prismaUser.email,
    role: prismaUser.role,
    institutionId: prismaUser.institutionId,
  });
});
