/**
 * Client-side data invalidation bus.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every dashboard page in this app is a `'use client'` component that loads its
 * data once, in a `useEffect(..., [])`, into `useState`. There is no SWR, no
 * React Query, and — because the data never travels through the RSC payload or
 * `fetch()` — neither Next's Data Cache, its Full Route Cache, `revalidatePath`,
 * `revalidateTag` nor `router.refresh()` has anything to invalidate. That is why
 * none of the usual cache directives fixed the "needs a manual refresh" reports:
 * the stale copy lives in React state in the browser, not in any server cache.
 *
 * Concretely: an admin approves an exam, the handler pushes the id into a local
 * `approvedIds` Set, and the pending-approvals stat card, the approved-exams
 * table and the sidebar's pending badge — all fetched once on mount, some of
 * them in a different component entirely — keep showing pre-approval numbers
 * until the tab is hard-reloaded.
 *
 * THE PATTERN
 * -----------
 * Mutations call `invalidateData()`. Every mounted `useServerData` subscriber
 * re-runs its fetcher. One broadcast, no cross-page wiring, no per-page hacks —
 * a component that shows data affected by someone else's mutation does not need
 * to know the mutation exists.
 *
 * Scopes are advisory: `invalidateData('exams')` refreshes subscribers that
 * asked for `exams` plus every unscoped subscriber. `invalidateData()` with no
 * argument refreshes everything.
 */

export type DataScope = string;

const listeners = new Set<(scope: DataScope | null) => void>();

/** Broadcast that server data changed. Call after any successful mutation. */
export function invalidateData(scope?: DataScope): void {
  for (const listener of listeners) listener(scope ?? null);
}

/** Subscribe to invalidations. Returns an unsubscribe function. */
export function subscribeToDataInvalidation(listener: (scope: DataScope | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True when a broadcast for `broadcastScope` should refresh a `subscriberScope` consumer. */
export function scopeMatches(broadcastScope: DataScope | null, subscriberScope?: DataScope): boolean {
  if (broadcastScope === null) return true;
  if (!subscriberScope) return true;
  return broadcastScope === subscriberScope;
}
