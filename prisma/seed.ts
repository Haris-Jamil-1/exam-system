import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createClient } from '@supabase/supabase-js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ensureSupabaseUser(email: string, password: string, name: string, role: string, institutionId: string) {
  const { data: existing } = await adminSupabase.auth.admin.listUsers();
  const found = existing.users.find(u => u.email === email);
  if (found) {
    await adminSupabase.auth.admin.updateUserById(found.id, {
      user_metadata: { name, role, institutionId },
    });
    return found.id;
  }
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, institutionId },
  });
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  return data.user.id;
}

async function main() {
  console.log('Seeding database...');

  // Institution
  const institution = await prisma.institution.upsert({
    where: { domain: 'demo.exampro.com' },
    update: {},
    create: {
      name: 'ExamPro Demo University',
      domain: 'demo.exampro.com',
    },
  });
  console.log('Institution:', institution.id);

  const instId = institution.id;

  // Admin
  const adminSupaId = await ensureSupabaseUser(
    'admin@demo.exampro.com', 'Demo@1234', 'Admin User', 'admin', instId,
  );
  await prisma.user.upsert({
    where: { email: 'admin@demo.exampro.com' },
    update: { supabaseId: adminSupaId },
    create: {
      supabaseId: adminSupaId,
      name: 'Admin User',
      email: 'admin@demo.exampro.com',
      role: 'admin',
      institutionId: instId,
    },
  });
  console.log('Admin created');

  // Teacher
  const teacherSupaId = await ensureSupabaseUser(
    'teacher@demo.exampro.com', 'Demo@1234', 'Sara Khan', 'teacher', instId,
  );
  await prisma.user.upsert({
    where: { email: 'teacher@demo.exampro.com' },
    update: { supabaseId: teacherSupaId },
    create: {
      supabaseId: teacherSupaId,
      name: 'Sara Khan',
      email: 'teacher@demo.exampro.com',
      role: 'teacher',
      department: 'Computer Science',
      institutionId: instId,
    },
  });
  console.log('Teacher created');

  // Student
  const studentSupaId = await ensureSupabaseUser(
    'student@demo.exampro.com', 'Demo@1234', 'Ali Hassan', 'student', instId,
  );
  await prisma.user.upsert({
    where: { email: 'student@demo.exampro.com' },
    update: { supabaseId: studentSupaId },
    create: {
      supabaseId: studentSupaId,
      name: 'Ali Hassan',
      email: 'student@demo.exampro.com',
      role: 'student',
      institutionId: instId,
    },
  });
  console.log('Student created');

  console.log('\nSeed complete. Demo credentials:');
  console.log('  admin@demo.exampro.com   / Demo@1234');
  console.log('  teacher@demo.exampro.com / Demo@1234');
  console.log('  student@demo.exampro.com / Demo@1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
