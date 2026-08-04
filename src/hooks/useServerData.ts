'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToDataInvalidation, scopeMatches, type DataScope } from '@/lib/data-refresh';

export type UseServerDataOptions = {
  /**
   * Advisory tag. A scoped `invalidateData('exams')` refreshes subscribers
   * tagged `exams` plus every untagged subscriber; an unscoped
   * `invalidateData()` refreshes all of them.
   */
  scope?: DataScope;
  /** Refetch when the tab regains focus after `staleAfterMs`. Default true. */
  refreshOnFocus?: boolean;
  /** How old data must be before a refocus triggers a refetch. Default 15s. */
  staleAfterMs?: number;
  /** Skip fetching entirely (e.g. an id isn't known yet). Default true. */
  enabled?: boolean;
};

export type UseServerDataResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  /** Refetch now. */
  refresh: () => void;
  /** Local write, for optimistic updates ahead of the server round trip. */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
};

/**
 * The single way a client page loads data from a `'use server'` function.
 *
 * Replaces the repo-wide `useEffect(() => { getX().then(setX) }, [])` idiom,
 * which loads once per mount and then never again — the direct cause of the
 * "page needs a manual refresh to show updates" reports, since the stale copy
 * lives in browser React state that no server-side cache directive can touch.
 *
 * On top of the initial load this adds three refetch triggers:
 *   1. `refresh()` — imperative.
 *   2. A broadcast from `invalidateData()` — what mutation handlers call, so a
 *      change made in one component refreshes every other component showing it.
 *   3. Tab refocus, once the data is older than `staleAfterMs` — covers coming
 *      back to a long-open tab, and mutations made in another tab or by another
 *      user.
 *
 * `deps` behaves like a `useEffect` dependency list (route params and filters
 * that change which data is wanted) and is compared by value.
 */
export function useServerData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: UseServerDataOptions = {},
): UseServerDataResult<T> {
  const { scope, refreshOnFocus = true, staleAfterMs = 15_000, enabled = true } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Kept in refs so a fetcher re-created on every render (the normal case, since
  // call sites pass an inline arrow) doesn't retrigger the fetch effect.
  const fetcherRef = useRef(fetcher);
  const runIdRef = useRef(0);
  const lastFetchedAtRef = useRef(0);

  // Ref writes live in an effect, never in the render body (React Compiler `refs` rule).
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(() => {
    setReloadToken(t => t + 1);
  }, []);

  // Value-compared dependency key — a literal spread of `deps` into the array
  // below would be a variable-length dependency list.
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    let cancelled = false;

    // Every setState below runs inside an async continuation, never synchronously
    // in the effect body — this repo's established shape for satisfying the
    // react-hooks/set-state-in-effect rule.
    void (async () => {
      try {
        const result = await fetcherRef.current();
        if (cancelled || runId !== runIdRef.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (cancelled || runId !== runIdRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled && runId === runIdRef.current) {
          lastFetchedAtRef.current = Date.now();
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, depsKey, reloadToken]);

  // Refetch when any mutation broadcasts.
  useEffect(() => {
    if (!enabled) return;
    return subscribeToDataInvalidation(broadcastScope => {
      if (scopeMatches(broadcastScope, scope)) refresh();
    });
  }, [enabled, scope, refresh]);

  // Refetch on refocus, but only once the data has actually gone stale.
  useEffect(() => {
    if (!enabled || !refreshOnFocus) return;
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchedAtRef.current < staleAfterMs) return;
      refresh();
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [enabled, refreshOnFocus, staleAfterMs, refresh]);

  return { data, loading, error, refresh, setData };
}
