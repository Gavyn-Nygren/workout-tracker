import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { todayISO } from './dates';
import { withDevFaults } from './devFaults';
import { buildFakeDataset } from './fake';
import { createFakeRepository, type DataRepository } from './repository';

const RepositoryContext = createContext<DataRepository | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => {
    const repo = createFakeRepository(buildFakeDataset(todayISO()));
    // Developer switches (slow or failing reads and writes) for checking loading and error states.
    return __DEV__ ? withDevFaults(repo) : repo;
  });
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  );

  return (
    <RepositoryContext.Provider value={repository}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RepositoryContext.Provider>
  );
}

export function useRepository(): DataRepository {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('useRepository must be used inside DataProvider');
  return repository;
}
