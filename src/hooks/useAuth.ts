import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/hooks/authContext';

export type { AuthContextValue } from '@/hooks/authContext';

/**
 * Access the current auth state + sign-in / sign-up / sign-out actions.
 * Must be rendered inside `<AuthProvider>` (mounted in `src/app/providers.tsx`).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
