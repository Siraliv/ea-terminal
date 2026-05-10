import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { EaSchemaRow } from '@/types/database';

/**
 * List every EA the signed-in user has uploaded a test for, with the
 * input/result keys that EA emits. Used by:
 *   - The /eas roll-up page (one card per EA).
 *   - The /tests filter chips (per-EA input ranges).
 */
export function useEaSchemasList(): UseQueryResult<EaSchemaRow[]> {
  return useQuery({
    queryKey: qk.eaSchemas.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ea_schemas')
        .select('*')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
