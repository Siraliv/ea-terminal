import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    'Supabase credentials missing. Copy .env.example → .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

/**
 * Typed Supabase client. Use this everywhere in the app — there is no
 * second path into the database.
 *
 * - Auth: persists session in localStorage (see @supabase/supabase-js
 *   defaults). That handles multi-device sign-in automatically.
 * - Realtime: subscribe via `supabase.channel(...)` in feature hooks.
 * - RLS: enforced server-side; we do NOT filter by user_id in queries.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ea-terminal-auth',
  },
});
