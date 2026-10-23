import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useToast } from '@/components/ui';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { errorMessage?: string };
  }
}

const FALLBACK = "Couldn't save your changes. Try again.";

/**
 * Shows an error toast whenever a save or delete fails, using the mutation's `meta.errorMessage`.
 * Rendered once inside ToastProvider; sheets show it through their own ToastViewport.
 */
export function SaveErrorToasts() {
  const client = useQueryClient();
  const { show } = useToast();
  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'error') {
          show({ message: event.mutation.meta?.errorMessage ?? FALLBACK, tone: 'error', durationMs: 4000 });
        }
      }),
    [client, show],
  );
  return null;
}
