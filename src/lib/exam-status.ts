// Pure, read-time "effective status" derivation for Exam — mirrors the established pattern
// already used for InviteToken (deriveInviteStatus in class-permissions.ts): the DB column is
// the source of truth for explicit teacher actions (draft, and 'live'→'completed' via "End
// Exam"), but a 'scheduled' exam whose startTime has already passed should read as 'live'
// without needing a cron or a manual "Go Live Now" click — and symmetrically, a 'live' (or still
// 'scheduled', e.g. the teacher never opened it) exam whose endTime has already passed should
// read as 'completed', so the teacher/admin dashboard doesn't keep showing a pulsing "Live"
// badge and a dead "Monitor" link forever for an exam nobody can still take. No cron flips the
// DB column itself — this is deliberate, matching this codebase's established preference (see
// CLAUDE.md) for not adding automatic background status-changing jobs; every consumer that
// displays exam status to a teacher/admin calls this at read time instead, the same way
// student-facing pages already (separately, inconsistently) computed "is this live now"
// themselves before this existed. Never touches 'draft' — an unpublished exam has no
// student-facing availability window to have expired.
import type { Exam } from '@/types';

export function computeEffectiveExamStatus(
  status: Exam['status'],
  startTime: Date,
  now: Date,
  endTime?: Date,
): Exam['status'] {
  if (endTime && status !== 'draft' && status !== 'completed' && endTime <= now) return 'completed';
  if (status === 'scheduled' && startTime <= now) return 'live';
  return status;
}
