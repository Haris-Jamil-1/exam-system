import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/api-auth';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const now = new Date();

  function relTime(d: Date): string {
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  type RawNotif = { id: string; title: string; body: string; time: string; icon: string; iconBg: string; iconColor: string; read: boolean };
  const notifs: RawNotif[] = [];

  if (user.role === 'admin') {
    // Pending exam approvals
    const pendingExams = await prisma.exam.findMany({
      where: { institutionId: user.institutionId, approvalStatus: 'pending', updatedAt: { gte: cutoff } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, teacher: { select: { name: true } }, updatedAt: true },
    });
    for (const e of pendingExams) {
      notifs.push({ id: `exam-${e.id}`, title: 'Exam submitted for review', body: `${e.teacher.name} submitted "${e.title}" for your approval.`, time: relTime(e.updatedAt), icon: 'ClipboardCheck', iconBg: '#FEF3C7', iconColor: '#D97706', read: false });
    }
    // Recently accepted invites
    const accepted = await prisma.inviteToken.findMany({
      where: { invitedBy: { institutionId: user.institutionId }, acceptedAt: { gte: cutoff } },
      orderBy: { acceptedAt: 'desc' },
      take: 5,
      select: { id: true, email: true, role: true, acceptedAt: true },
    });
    for (const inv of accepted) {
      if (inv.acceptedAt) {
        notifs.push({ id: `invite-${inv.id}`, title: `${inv.role === 'teacher' ? 'Teacher' : 'Student'} invite accepted`, body: `${inv.email} joined your institution.`, time: relTime(inv.acceptedAt), icon: 'UserPlus', iconBg: '#DCFCE7', iconColor: '#16A34A', read: false });
      }
    }
  } else if (user.role === 'teacher') {
    // Recent violations on teacher's exams. window_blur is excluded — it's a low-signal
    // companion of tab_switch and was drowning out the detections teachers actually act on
    // (gaze/voice); those get explicit labels below instead of the raw enum name.
    const VIOLATION_LABELS: Record<string, string> = {
      gaze_away: 'gaze violation (looking away)',
      audio_detected: 'voice violation (background noise)',
      tab_switch: 'tab switch',
      fullscreen_exit: 'fullscreen exit',
      no_face: 'face not visible',
      multiple_faces: 'multiple faces detected',
      phone_detected: 'phone detected',
      prohibited_object: 'prohibited object detected',
    };
    const violations = await prisma.violation.findMany({
      where: { exam: { teacherId: user.id }, type: { not: 'window_blur' }, timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: { id: true, type: true, severity: true, description: true, timestamp: true, student: { select: { name: true } }, exam: { select: { title: true } } },
    });
    for (const v of violations) {
      const label = VIOLATION_LABELS[v.type] ?? v.type.replace(/_/g, ' ');
      notifs.push({ id: `viol-${v.id}`, title: `${v.severity === 'high' ? 'High-severity' : 'Proctoring'} violation`, body: `${v.student.name} — ${label} in "${v.exam.title}".`, time: relTime(v.timestamp), icon: 'AlertTriangle', iconBg: '#FEE2E2', iconColor: '#E53935', read: false });
    }
    // Exam approval updates
    const reviewed = await prisma.exam.findMany({
      where: { teacherId: user.id, approvalStatus: { in: ['approved', 'rejected'] }, updatedAt: { gte: cutoff } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, approvalStatus: true, updatedAt: true },
    });
    for (const e of reviewed) {
      const approved = e.approvalStatus === 'approved';
      notifs.push({ id: `review-${e.id}`, title: `Exam ${approved ? 'approved' : 'rejected'}`, body: `Your exam "${e.title}" was ${approved ? 'approved and is ready to schedule' : 'rejected by the admin'}.`, time: relTime(e.updatedAt), icon: approved ? 'CheckCircle2' : 'XCircle', iconBg: approved ? '#DCFCE7' : '#FEE2E2', iconColor: approved ? '#16A34A' : '#E53935', read: false });
    }
  } else {
    // Student: upcoming enrolled exams
    const enrollments = await prisma.examEnrollment.findMany({
      where: { studentId: user.id, exam: { status: { in: ['scheduled', 'live'] } } },
      orderBy: { enrolledAt: 'desc' },
      take: 5,
      select: { id: true, exam: { select: { id: true, title: true, startTime: true, status: true } } },
    });
    for (const en of enrollments) {
      const isLive = en.exam.status === 'live';
      notifs.push({ id: `enroll-${en.id}`, title: isLive ? 'Exam is live now' : 'Upcoming exam', body: `"${en.exam.title}" ${isLive ? 'is open — start when ready' : 'is scheduled for ' + en.exam.startTime.toLocaleDateString()}.`, time: isLive ? 'Now' : relTime(en.exam.startTime), icon: isLive ? 'Radio' : 'Clock', iconBg: isLive ? '#DCFCE7' : '#E3F0FD', iconColor: isLive ? '#16A34A' : '#1E88E5', read: false });
    }
  }

  // Sort by most recent first
  return NextResponse.json(notifs.slice(0, 8));
}
