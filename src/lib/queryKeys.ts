/**
 * Centralised TanStack Query key factory for EA Terminal.
 * Keep all keys here so realtime invalidation has a single source of truth.
 */
export const qk = {
  tests: {
    all: ['tests'] as const,
    list: (filters?: unknown) => ['tests', 'list', filters] as const,
    detail: (id: string) => ['tests', 'detail', id] as const,
    rawCurve: (id: string) => ['tests', 'rawCurve', id] as const,
  },
  eaSchemas: {
    all: ['ea_schemas'] as const,
    list: () => ['ea_schemas', 'list'] as const,
  },
  tags: {
    all: ['tags'] as const,
    list: () => ['tags', 'list'] as const,
  },
} as const;
