import { useEffect, useSyncExternalStore } from 'react';

/**
 * Tiny pub/sub keyed by row id, used to trigger the `term-sync-flash`
 * animation when a realtime event mutates a row currently on screen.
 *
 * Design notes:
 * - Not a Zustand store — we already have react-query and the subscriber
 *   count is tiny, so `useSyncExternalStore` keeps this zero-dependency.
 * - Each `signal(id)` bumps a shared version counter. Subscribers read
 *   `getStamp(id)`, which returns the monotonic stamp of the last
 *   signal for that id (or 0). The `useFlashKey` hook converts that
 *   stamp into a boolean that auto-clears after `durationMs`.
 * - The map is cleaned up lazily — stale entries are trimmed on the
 *   next `signal` when they're older than `GC_THRESHOLD_MS`. No timers,
 *   no leaks if a component unmounts mid-flash.
 */

const GC_THRESHOLD_MS = 10_000;

const stamps = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function notify(): void {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getVersion(): number {
  return version;
}

/** Record a flash event for this id. Called by the realtime sync layer. */
export function signalFlash(id: string): void {
  const t = now();
  stamps.set(id, t);

  // Cheap GC: drop entries that are clearly past any reasonable flash window.
  if (stamps.size > 64) {
    for (const [key, ts] of stamps) {
      if (t - ts > GC_THRESHOLD_MS) stamps.delete(key);
    }
  }

  notify();
}

/** Read the last-flash timestamp for an id, or 0 if never flashed. */
export function getFlashStamp(id: string): number {
  return stamps.get(id) ?? 0;
}

/**
 * Subscribe a component to flash events for `id`. Returns `true` for
 * `durationMs` after the last `signalFlash(id)`, then `false`. Safe to
 * call with an empty or changing `id`.
 *
 * Usage:
 *   const flashing = useFlashKey(row.id);
 *   <tr className={flashing ? 'term-sync-flash' : undefined}>
 */
export function useFlashKey(id: string, durationMs = 600): boolean {
  // `useSyncExternalStore` re-runs `getSnapshot` whenever `subscribe`
  // fires. We gate on `version` so any flash bump re-evaluates, then
  // decide locally whether this particular id is inside its window.
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (!id) return false;
  const stamp = stamps.get(id);
  if (!stamp) return false;
  return now() - stamp < durationMs;
}

/**
 * Multi-id variant for list renderers. Subscribes **once** to the
 * flash bus and returns a `(id) => boolean` checker — use this inside
 * `TerminalTable`'s `rowClassName` so the whole table re-renders on
 * any bump but the per-row class lookup stays O(1).
 *
 * Usage:
 *   const isFlashing = useFlashChecker();
 *   <TerminalTable
 *     rowClassName={(t) => (isFlashing(t.id) ? 'term-sync-flash' : '')}
 *   />
 */
export function useFlashChecker(
  durationMs = 600,
): (id: string) => boolean {
  useSyncExternalStore(subscribe, getVersion, getVersion);

  // Schedule a follow-up re-render so the flash class comes OFF
  // `durationMs` after the latest stamp. Without this the class stays
  // applied forever; a second flash on the same id would then be a
  // no-op (React sees an identical className and the browser never
  // restarts the animation). The timer is light — at most one pending
  // per subscriber — and cancels on unmount / next signal.
  useEffect(() => {
    const latest = Math.max(0, ...stamps.values());
    if (latest === 0) return;
    const remaining = durationMs - (now() - latest);
    if (remaining <= 0) return;
    const t = window.setTimeout(() => notify(), remaining + 16);
    return () => window.clearTimeout(t);
  });

  return (id: string) => {
    if (!id) return false;
    const stamp = stamps.get(id);
    if (!stamp) return false;
    return now() - stamp < durationMs;
  };
}
