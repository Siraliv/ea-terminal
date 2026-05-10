import { Component, type ReactNode, type ErrorInfo } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Top-level React error boundary.
 *
 * Catches render errors anywhere in the tree and shows a kit-styled
 * recovery panel instead of letting the page white-screen. Two recovery
 * affordances:
 *
 *   - `[ Reload page ]` — the most common fix; React's "broken-tree
 *      stuck rendering" almost always clears with a hard reload.
 *   - `[ Sign out & reset ]` — clears Supabase session + localStorage,
 *     useful when a stale auth state is the root cause.
 *
 * The component is intentionally a class — the `ErrorBoundary` API only
 * exists for class components in React 19. The kit-styled chrome (Unicode
 * frame, BracketedButton vocabulary) is rendered via raw HTML/CSS so a
 * fault in any UI primitive can't recurse the boundary into a render
 * loop. No imports from `@/components/ui` here on purpose — if the bug
 * lives in FramedPanel or BracketedButton, the recovery UI still renders.
 *
 * In dev, the full `Error.stack` is dumped to console so the user can
 * grab it. In prod, only the `.message` is shown to the user; the stack
 * stays in `console.error` for whatever telemetry hook the deployment
 * target has wired up (e.g. Sentry).
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Single source of truth for telemetry. Any production deployment
    // with Sentry / Logflare / similar wires through console.error,
    // so we don't need to know which sink is attached.
    console.error(
      '[AppErrorBoundary] uncaught render error:',
      error,
      '\nComponent stack:',
      info.componentStack,
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleSignOutReset = (): void => {
    // Clear every storage key we own — auth session, theme, filter
    // state — then reload. We intentionally don't await any signOut
    // RPC because (a) we may be unable to talk to Supabase and (b)
    // wiping localStorage already invalidates the session locally.
    try {
      window.localStorage.removeItem('trading-journal-auth');
      window.localStorage.removeItem('trading-journal-theme');
    } catch {
      // localStorage may be blocked in private mode — reloading still
      // works because the session is gone after page refresh anyway.
    }
    window.location.assign('/login');
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // The recovery panel uses raw HTML/CSS rather than the UI primitives
    // because the bug might LIVE in those primitives. Inline-style
    // colors so the panel renders even if the Tailwind/CSS bundle was
    // the failure source.
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: '100vh',
          background: '#000',
          color: '#DCDCDC',
          fontFamily:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 14,
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: 640, width: '100%' }}>
          <pre
            style={{
              color: '#FF4D4D',
              margin: 0,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}
          >
{`┌─ APPLICATION ERROR ──────────────────────────────────────┐
│                                                          │
│  Something went wrong while rendering the page.          │
│  The error has been logged to the browser console.       │
│                                                          │
└──────────────────────────────────────────────────────────┘`}
          </pre>

          <div style={{ marginTop: 16, color: '#8A8A8A' }}>
            ▼ {error.message || 'Unknown error'}
          </div>

          <div
            style={{
              marginTop: 24,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#3DDC84',
                fontFamily: 'inherit',
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.025em',
              }}
            >
              [ ↻ Reload page ]
            </button>
            <button
              type="button"
              onClick={this.handleSignOutReset}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#DCDCDC',
                fontFamily: 'inherit',
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.025em',
              }}
            >
              [ Sign out &amp; reset ]
            </button>
          </div>

          <div
            style={{
              marginTop: 24,
              color: '#4A4A4A',
              fontSize: 12,
            }}
          >
            └─ If this persists, copy the console error and report it.
          </div>
        </div>
      </div>
    );
  }
}
