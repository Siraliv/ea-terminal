import type { RealtimeStatus } from '@/lib/realtime';

export type OfflineBannerProps = {
  online: boolean;
  realtime: RealtimeStatus;
};

/**
 * Persistent top strip that surfaces two connectivity signals:
 *
 * 1. Browser offline — rendered in red as a hard warning. Mutations
 *    will fail loudly (no offline queueing — see V1 exclusions).
 * 2. Realtime disconnected while the browser is online — rendered in
 *    amber as a softer note. Reads still work over HTTPS; the only
 *    thing missing is push updates from other tabs / devices.
 *
 * Renders nothing when everything is healthy. The banner uses
 * `role="status"` + `aria-live="polite"` so screen readers announce
 * state changes without interrupting the user.
 */
export function OfflineBanner({ online, realtime }: OfflineBannerProps) {
  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-term-red/25 text-term-red font-mono text-xs uppercase tracking-wide px-4 py-1 border-b border-term-red/60 flex items-center gap-2"
      >
        <span aria-hidden="true">■</span>
        <span>OFFLINE — mutations will fail until the connection returns.</span>
      </div>
    );
  }

  if (realtime === 'disconnected' || realtime === 'error') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-term-amber/20 text-term-amber font-mono text-xs uppercase tracking-wide px-4 py-1 border-b border-term-amber/60 flex items-center gap-2"
      >
        <span aria-hidden="true">◇</span>
        <span>
          REALTIME DISCONNECTED — data is fresh on refresh; push updates
          paused.
        </span>
      </div>
    );
  }

  return null;
}
