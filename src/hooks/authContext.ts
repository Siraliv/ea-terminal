import { createContext } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export type AuthResult = {
  /** `null` on success, an error object on failure. */
  error: AuthError | null;
  /** True when sign-up succeeded but email confirmation is required. */
  needsEmailConfirmation?: boolean;
};

export type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
