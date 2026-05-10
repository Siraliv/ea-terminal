import { Navigate, useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Route-level auth gate. While the auth state resolves, renders a
 * minimal terminal-styled boot line. Anonymous users are redirected to
 * `/login`, preserving the attempted path in `state.from` so the
 * LoginPage can bounce them back on success.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-term-bg text-term-muted font-mono p-5 flex items-center justify-center">
        <span>└─ booting terminal…</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <>{children}</>;
}
