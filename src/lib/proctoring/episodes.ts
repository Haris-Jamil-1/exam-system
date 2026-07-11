// Consecutive-pass hysteresis for detector conditions (Phase 3, doc 01): a
// condition must hold for N passes before an episode opens (debounce — leaning
// out of frame for a moment never flags) and clear for M passes before it
// closes. One episode = one emitted event carrying its full duration.
export type EpisodeTransition =
  | { kind: 'opened'; startedAt: number }
  | { kind: 'closed'; startedAt: number; endedAt: number }
  | null;

export class ConditionEpisode {
  private activeRun = 0;
  private inactiveRun = 0;
  private firstActiveAt: number | null = null;
  private lastActiveAt: number | null = null;
  private openState = false;

  constructor(
    private readonly openAfterPasses: number,
    private readonly closeAfterPasses: number = 2,
  ) {}

  get isOpen(): boolean {
    return this.openState;
  }

  update(active: boolean, now: number): EpisodeTransition {
    if (active) {
      this.activeRun += 1;
      this.inactiveRun = 0;
      if (this.firstActiveAt === null) this.firstActiveAt = now;
      this.lastActiveAt = now;

      if (!this.openState && this.activeRun >= this.openAfterPasses) {
        this.openState = true;
        return { kind: 'opened', startedAt: this.firstActiveAt };
      }
      return null;
    }

    this.inactiveRun += 1;
    this.activeRun = 0;

    if (this.openState && this.inactiveRun >= this.closeAfterPasses) {
      const transition = {
        kind: 'closed' as const,
        startedAt: this.firstActiveAt ?? now,
        endedAt: this.lastActiveAt ?? now,
      };
      this.reset();
      return transition;
    }
    if (!this.openState && this.inactiveRun >= this.closeAfterPasses) {
      // Condition fizzled before reaching the open threshold — forget the run.
      this.firstActiveAt = null;
      this.lastActiveAt = null;
    }
    return null;
  }

  /** Force-close an open episode (e.g. component unmount). */
  finalize(now: number): EpisodeTransition {
    if (!this.openState) return null;
    const transition = {
      kind: 'closed' as const,
      startedAt: this.firstActiveAt ?? now,
      endedAt: this.lastActiveAt ?? now,
    };
    this.reset();
    return transition;
  }

  private reset() {
    this.activeRun = 0;
    this.inactiveRun = 0;
    this.firstActiveAt = null;
    this.lastActiveAt = null;
    this.openState = false;
  }
}
