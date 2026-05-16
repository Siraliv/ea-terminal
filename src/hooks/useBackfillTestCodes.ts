import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { useTestsList } from '@/hooks/useTests';
import { assignMissingCodes } from '@/lib/testCode';

/**
 * One-shot lazy backfill for `tests.test_code`.
 *
 * Runs once per signed-in session: when the user's test list resolves
 * for the first time and any row has a null code, compute codes for
 * the missing rows in upload order and PATCH them in a single
 * `supabase.from('tests').update` per row.
 *
 * Cheap and bounded — usually patches 0 rows after the first session
 * (existing rows get codes once, new uploads get them at insert).
 * Wrapped in a ref guard so it can't re-fire if useTestsList
 * refetches mid-session.
 */
export function useBackfillTestCodes(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const testsQ = useTestsList();
  const ranRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (testsQ.isLoading || testsQ.isError) return;
    if (ranRef.current === user.id) return;
    const tests = testsQ.data ?? [];
    if (tests.length === 0) {
      ranRef.current = user.id;
      return;
    }
    const patches = assignMissingCodes(tests);
    ranRef.current = user.id;
    if (patches.size === 0) return;

    // Patch rows in parallel — each row's unique (user_id, test_code)
    // constraint catches any conflict and we log silently rather than
    // hard-failing the session over a label.
    void Promise.all(
      Array.from(patches.entries()).map(async ([id, code]) => {
        const { error } = await supabase
          .from('tests')
          .update({ test_code: code })
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) {
          // Surface in the console for debugging without throwing —
          // a missing label isn't worth crashing the app shell.
          console.warn(
            `[testCode] backfill skipped for ${id}: ${error.message}`,
          );
        }
      }),
    ).then(() => {
      void queryClient.invalidateQueries({ queryKey: qk.tests.all });
    });
  }, [user, testsQ.isLoading, testsQ.isError, testsQ.data, queryClient]);
}
