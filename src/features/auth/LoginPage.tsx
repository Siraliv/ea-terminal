import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { BracketedButton, BracketedTag, FramedPanel } from '@/components/ui';

type Mode = 'signin' | 'signup';

/**
 * Minimal RFC-5322-friendly email pattern. Deliberately not the full
 * RFC because (a) Supabase re-validates server-side and (b) the full
 * regex is unmaintainable. This catches the common typos (missing @,
 * trailing space, no TLD) and lets the network round-trip handle the
 * obscure rest.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mirrors Supabase's project-level password minimum (default 6 chars).
 * Bumping requires changing both the Supabase dashboard setting and
 * this constant — kept in sync as `MIN_PASSWORD_LENGTH`.
 */
const MIN_PASSWORD_LENGTH = 6;

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Toggled by the [ SHOW ] / [ HIDE ] button next to the PASSWORD
  // label. Resets to `false` (masked) on submit so the next visit
  // never shows a previously-typed password by default.
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Honor the path the user was trying to reach before being bounced to
  // /login (set by ProtectedRoute via `state.from`). Fallback is the
  // dashboard — the actual home of the app — not /demo, which is the
  // design-system showcase and would be confusing on first sign-in.
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? '/dashboard';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setInfo(null);

    // Client-side pre-flight — avoids a network round-trip for the
    // common typo cases. Supabase re-validates server-side (and is
    // the source of truth for whether the credentials match), so
    // this is purely a UX layer.
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }

    setSubmitting(true);
    // Re-mask the password while we're submitting so it isn't
    // accidentally left visible if the page lingers post-submit
    // (slow network, error response, browser back-button).
    setShowPassword(false);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(trimmedEmail, password);
        if (error) {
          setError(error.message);
          return;
        }
        navigate(redirectTo, { replace: true });
      } else {
        const { error, needsEmailConfirmation } = await signUp(
          trimmedEmail,
          password,
        );
        if (error) {
          setError(error.message);
          return;
        }
        if (needsEmailConfirmation) {
          setInfo(
            `Check ${trimmedEmail} for a confirmation link, then sign in. (You can disable this in Supabase → Authentication → Providers → Email.)`,
          );
          setMode('signin');
          return;
        }
        navigate(redirectTo, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-term-bg text-term-text flex items-center justify-center p-5">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <span className="font-pixel text-term-gold text-[28px] leading-none tracking-tight text-glow">
            ORB·JNL
          </span>
          <span className="text-term-muted text-xs uppercase tracking-widest">
            Trading Journal — Terminal
          </span>
        </div>

        <FramedPanel
          title={mode === 'signin' ? 'SIGN IN' : 'SIGN UP'}
          titleRight={
            <BracketedTag variant="active" leadingGlyph="●">
              SECURE
            </BracketedTag>
          }
        >
          <form onSubmit={onSubmit} className="flex flex-col gap-3 py-1">
            {/* Tabs */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={[
                  'font-mono uppercase tracking-wide text-xs select-none',
                  'transition-colors duration-[80ms]',
                  mode === 'signin'
                    ? 'text-term-gold text-glow'
                    : 'text-term-muted hover:text-term-text',
                ].join(' ')}
              >
                {mode === 'signin' ? '▶ SIGN IN ◀' : '▸ SIGN IN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={[
                  'font-mono uppercase tracking-wide text-xs select-none',
                  'transition-colors duration-[80ms]',
                  mode === 'signup'
                    ? 'text-term-gold text-glow'
                    : 'text-term-muted hover:text-term-text',
                ].join(' ')}
              >
                {mode === 'signup' ? '▶ SIGN UP ◀' : '▸ SIGN UP'}
              </button>
            </div>

            {/* Email */}
            <label className="flex flex-col gap-1">
              <span className="uppercase text-xs text-term-muted tracking-wide">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={[
                  'bg-term-bg text-term-text font-mono px-1 py-1',
                  'border-0 border-b border-term-green/70',
                  'focus:outline-none focus:border-term-greenBright caret-term-greenBright',
                ].join(' ')}
                placeholder="trader@example.com"
              />
            </label>

            {/* Password — with [ SHOW ] / [ HIDE ] toggle on the right
                of the label row. The toggle flips the input `type`
                between `password` and `text`; nothing else changes
                (autoComplete, minLength, value all stay). */}
            <label className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="uppercase text-xs text-term-muted tracking-wide">
                  Password
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  className="text-term-muted hover:text-term-text font-mono text-xs uppercase tracking-wide select-none"
                >
                  [ {showPassword ? 'HIDE' : 'SHOW'} ]
                </button>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={[
                  'bg-term-bg text-term-text font-mono px-1 py-1',
                  'border-0 border-b border-term-green/70',
                  'focus:outline-none focus:border-term-greenBright caret-term-greenBright',
                ].join(' ')}
                placeholder="••••••••"
              />
              {mode === 'signup' ? (
                <span className="text-term-dim text-xs">Minimum 6 characters.</span>
              ) : null}
            </label>

            {/* Error / info */}
            {error ? (
              <div className="text-term-red text-xs font-mono">▼ {error}</div>
            ) : null}
            {info ? (
              <div className="text-term-amber text-xs font-mono">♦ {info}</div>
            ) : null}

            <div className="flex items-center gap-3 pt-1">
              <BracketedButton type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? mode === 'signin'
                    ? 'Signing in…'
                    : 'Creating…'
                  : mode === 'signin'
                    ? 'Sign In'
                    : 'Create Account'}
              </BracketedButton>
              <span className="text-term-muted text-xs">
                {mode === 'signin'
                  ? 'First time? Click SIGN UP above.'
                  : 'Already have an account? Click SIGN IN.'}
              </span>
            </div>
          </form>
        </FramedPanel>

        <div className="text-term-muted text-xs pt-2 text-center">
          └─ Single-user journal · RLS-protected · Multi-device sync
        </div>
      </div>
    </div>
  );
}
