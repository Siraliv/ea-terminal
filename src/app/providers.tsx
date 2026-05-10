import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/hooks/AuthProvider';
import { AppErrorBoundary } from './AppErrorBoundary';

export type ProvidersProps = { children: ReactNode };

/**
 * Root provider tree. Order matters:
 *   AppErrorBoundary → QueryClient → AuthProvider.
 *
 * The error boundary sits OUTSIDE QueryClient + AuthProvider so render
 * faults in any provider initialization still reach the recovery UI
 * rather than white-screening. AuthProvider is the inner-most provider
 * because auth writes/reads may invalidate cached queries.
 */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
