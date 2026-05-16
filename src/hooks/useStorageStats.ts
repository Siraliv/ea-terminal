import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface StorageObject {
  /** Filename within the user's prefix, e.g. `"{testId}.json.gz"`. */
  name: string;
  /** Full bucket path including the user prefix. */
  path: string;
  /** Bytes on disk in the `raw-curves` bucket. */
  size: number;
  /** Maps back to a Test by the embedded UUID. */
  testId: string | null;
}

export interface StorageStats {
  objects: StorageObject[];
  totalBytes: number;
}

/**
 * Walk the signed-in user's prefix of the `raw-curves` bucket and
 * roll the per-object sizes up to a total. The list endpoint is
 * paginated; we fetch one page of 1000 entries which is enough
 * headroom for any realistic personal account — extend later if a
 * user crosses that threshold.
 *
 * Cached with `staleTime: 60s` to avoid hammering the bucket every
 * time the System page re-renders.
 */
export function useStorageStats(): UseQueryResult<StorageStats, Error> {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['storageStats', user?.id ?? ''],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) throw new Error('Not signed in.');
      const { data, error } = await supabase.storage
        .from('raw-curves')
        .list(user.id, {
          limit: 1000,
          sortBy: { column: 'updated_at', order: 'desc' },
        });
      if (error) throw new Error(`Storage list failed: ${error.message}`);
      const objects: StorageObject[] = (data ?? []).map((f) => {
        const size =
          typeof f.metadata?.size === 'number' ? f.metadata.size : 0;
        const testId = f.name.replace(/\.json\.gz$/i, '') || null;
        return {
          name: f.name,
          path: `${user.id}/${f.name}`,
          size,
          testId,
        };
      });
      const totalBytes = objects.reduce((acc, o) => acc + o.size, 0);
      return { objects, totalBytes };
    },
  });
}
