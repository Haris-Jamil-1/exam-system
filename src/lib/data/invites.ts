'use server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api-auth';
import { resolveAcceptInviteAssignment } from '@/lib/invite-accept-decision';
import { getResend } from '@/lib/resend-client';

const TEACHER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Same rationale/cap as MAX_BULK_INVITES in classes.ts — keeps one bulk request bounded.
const MAX_BULK_TEACHER_INVITES = 50;

export type BulkTeacherInviteResult = {
  email: string;
  outcome: 'invited' | 'already_member' | 'already_invited' | 'cross_institution' | 'failed';
};

function teacherInviteEmailHtml(acceptUrl: string) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
      <div style="margin-bottom:24px">
        <div style="display:inline-flex;width:44px;height:44px;background:#1E88E5;border-radius:10px;align-items:center;justify-content:center">
          <span style="color:#fff;font-size:20px;font-weight:700">E</span>
        </div>
        <span style="margin-left:10px;font-size:18px;font-weight:700;color:#1A1D23;vertical-align:middle">Evalix</span>
      </div>
      <h2 style="font-size:22px;font-weight:700;color:#1A1D23;margin:0 0 8px">You've been invited</h2>
      <p style="color:#6B7280;font-size:15px;margin:0 0 24px">
        You've been invited to join Evalix as a <strong>Teacher</strong>.
        Click the button below to accept your invitation and set up your account.
      </p>
      <a href="${acceptUrl}" style="display:inline-block;background:#1E88E5;color:#fff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">
        Accept Invitation
      </a>
      <p style="color:#9CA3AF;font-size:13px;margin:24px 0 0">
        This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  `;
}

// Mirrors createClassInvites in classes.ts (same dedup/cap/rollback-on-send-failure shape) —
// the institution-level equivalent for admin bulk teacher invites, backed by InviteToken instead
// of ClassInvite since teachers aren't scoped to a class.
export async function createBulkTeacherInvites(emails: string[]): Promise<BulkTeacherInviteResult[] | null> {
  const caller = await getAuthUser();
  if (!caller || caller.role !== 'admin') return null;

  const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()))].slice(0, MAX_BULK_TEACHER_INVITES);
  const results: BulkTeacherInviteResult[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  for (const email of uniqueEmails) {
    const existingMember = await prisma.user.findUnique({
      where: { email },
      select: { institutionId: true, suspendedAt: true },
    });
    if (existingMember && existingMember.institutionId === caller.institutionId) {
      results.push({ email, outcome: 'already_member' });
      continue;
    }
    if (resolveAcceptInviteAssignment(existingMember, caller.institutionId).blocked) {
      results.push({ email, outcome: 'cross_institution' });
      continue;
    }

    const pendingInvite = await prisma.inviteToken.findFirst({
      where: { email, institutionId: caller.institutionId, role: 'teacher', acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) {
      results.push({ email, outcome: 'already_invited' });
      continue;
    }

    const invite = await prisma.inviteToken.create({
      data: {
        email,
        role: 'teacher',
        institutionId: caller.institutionId,
        invitedById: caller.id,
        expiresAt: new Date(Date.now() + TEACHER_INVITE_TTL_MS),
      },
    });

    const acceptUrl = `${appUrl}/invite/${invite.token}`;
    const { error: emailError } = await getResend().emails.send({
      from: 'Evalix <noreply@aurixy.store>',
      to: email,
      subject: `You're invited to Evalix as a Teacher`,
      html: teacherInviteEmailHtml(acceptUrl),
    });

    if (emailError) {
      console.error('[invites] Resend error (bulk teacher):', emailError);
      await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {});
      results.push({ email, outcome: 'failed' });
      continue;
    }

    results.push({ email, outcome: 'invited' });
  }

  return results;
}
