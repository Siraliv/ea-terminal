import { Outlet } from 'react-router-dom';
import { OfflineBanner, Sidebar } from '@/components/layout';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRealtimeSync } from '@/lib/realtime';
import { useBackfillTestCodes } from '@/hooks/useBackfillTestCodes';

/**
 * Top-level layout for every authenticated page: persistent sidebar on
 * the left, scrollable main column on the right. Individual pages
 * render their own `<PageHeader>` so the title can be page-specific.
 *
 * Also the single mount point for:
 *
 * - `useRealtimeSync` — one channel per session; invalidates the query
 *   cache on remote writes and feeds the `flashBus` so visible rows
 *   briefly glow.
 * - `<OfflineBanner>` — top strip surfacing `navigator.onLine` +
 *   realtime channel state.
 * - The a11y skip link — the first focusable element on every page,
 *   landing focus on the `<main>` content and bypassing the sidebar.
 *
 * Mounted by `routes.tsx` behind `<ProtectedRoute>`, so `Outlet` only
 * ever resolves once auth is confirmed.
 */
export function AppShell() {
  const online = useOnlineStatus();
  const realtime = useRealtimeSync();
  // Lazy backfill for tests missing the new `test_code` column.
  // No-op once every row is coded (after the first session).
  useBackfillTestCodes();

  return (
    <div className="min-h-screen bg-term-bg text-term-text flex flex-col">
      {/* Skip link — visually hidden until focused, then floats in the
          top-left corner so keyboard users can jump past the sidebar. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-1 focus:z-50 focus:bg-term-greenBright focus:text-term-bg focus:px-2 focus:py-1 font-mono text-xs uppercase tracking-wide"
      >
        Skip to main content
      </a>

      <OfflineBanner online={online} realtime={realtime} />

      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-w-0 p-5 focus:outline-none"
        >
          <div className="mx-auto max-w-[1240px] flex flex-col gap-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
