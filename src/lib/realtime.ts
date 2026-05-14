import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { signalFlash } from '@/lib/flashBus';

/**
 * Realtime channel state — drives the offline banner so we can tell
 * "network down" apart from "network up but realtime stuck".
 */
export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

type WatchedTable = 'tests' | 'ea_schemas' | 'tags' | 'test_tags';

type ChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

/**
 * Subscribe to Postgres change events scoped to the signed-in user and
 * invalidate the matching TanStack Query keys.
 *
 * Mount once, inside AppShell.
 */
export function useRealtimeSync(): RealtimeStatus {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [channelState, setChannelState] = useState<
    'connected' | 'disconnected' | 'error' | null
  >(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) return;

    const filter = `user_id=eq.${user.id}`;
    const channel = supabase.channel(`ea-sync-${user.id}`);

    const tables: WatchedTable[] = ['tests', 'ea_schemas', 'tags', 'test_tags'];

    for (const table of tables) {
      channel.on(
        'postgres_changes' as never,
        // test_tags has no user_id column — RLS still scopes it but the filter
        // can't apply, so we omit it for that table.
        table === 'test_tags'
          ? { event: '*', schema: 'public', table }
          : { event: '*', schema: 'public', table, filter },
        (payload: ChangePayload) => {
          handleChange(queryClient, table, payload);
        },
      );
    }

    channel.subscribe((state) => {
      // Drop status callbacks that fire after the effect has cleaned
      // up — e.g. user signs out, we tear down the channel, then the
      // server's last `CHANNEL_ERROR` arrives moments later. Without
      // this guard we'd flip `channelState` for a channel that no
      // longer exists, briefly mis-rendering the offline banner.
      if (channelRef.current !== channel) return;
      if (state === 'SUBSCRIBED') setChannelState('connected');
      else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT')
        setChannelState('error');
      else if (state === 'CLOSED') setChannelState('disconnected');
    });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      setChannelState(null);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  if (!user) return 'idle';
  if (channelState === null) return 'connecting';
  return channelState;
}

function handleChange(
  qc: ReturnType<typeof useQueryClient>,
  table: WatchedTable,
  payload: ChangePayload,
): void {
  const row =
    (payload.new as Record<string, unknown> | null) ??
    (payload.old as Record<string, unknown> | null) ??
    null;
  const id = typeof row?.id === 'string' ? row.id : null;

  switch (table) {
    case 'tests':
      void qc.invalidateQueries({ queryKey: qk.tests.all });
      // Test count and "last seen" change at the EA roll-up level too.
      void qc.invalidateQueries({ queryKey: qk.eaSchemas.all });
      break;
    case 'ea_schemas':
      void qc.invalidateQueries({ queryKey: qk.eaSchemas.all });
      break;
    case 'tags':
      void qc.invalidateQueries({ queryKey: qk.tags.all });
      break;
    case 'test_tags':
      // A tag change can affect both the tag list (counts) and any test
      // detail showing tags. Easiest: invalidate both.
      void qc.invalidateQueries({ queryKey: qk.tags.all });
      void qc.invalidateQueries({ queryKey: qk.tests.all });
      break;
  }

  // Don't flash a row that's about to disappear from the UI — the
  // flash would briefly highlight a row already being removed.
  if (id && payload.eventType !== 'DELETE') signalFlash(id);
}
