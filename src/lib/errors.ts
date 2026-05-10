/**
 * Normalize an unknown thrown value into a human-readable string.
 *
 * Supabase mutation hooks can throw three flavours of thing:
 *   - `Error` subclasses (native, `AuthError`, `FunctionsHttpError`…)
 *   - PostgREST error objects — plain `{ message, details, hint, code }`
 *     — which fail `instanceof Error`
 *   - Anything else (strings, undefined, promises, etc.)
 *
 * Always prefer the structured PostgREST fields when present because
 * they carry the actionable context (e.g. `code = 42P01` → "relation
 * does not exist") that makes misconfig bugs debuggable.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (!e) return fallback;
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'object') {
    const obj = e as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts: string[] = [];
    if (typeof obj.message === 'string' && obj.message) parts.push(obj.message);
    if (typeof obj.details === 'string' && obj.details) parts.push(obj.details);
    if (typeof obj.hint === 'string' && obj.hint) parts.push(`(hint: ${obj.hint})`);
    if (typeof obj.code === 'string' && obj.code) parts.push(`[${obj.code}]`);
    if (parts.length > 0) return parts.join(' ');
  }
  return fallback;
}
