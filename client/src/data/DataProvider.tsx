import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { todayISO } from './dates';
import { openAppDatabase } from './db/openDatabase';
import { eraseAllData, holdsSampleData, loadSampleData } from './db/sampleData';
import { createSqliteRepository } from './db/sqliteRepository';
import type { SqlDb } from './db/sql';
import { withDevFaults } from './devFaults';
import type { DataRepository } from './repository';

type DevDataTools = {
  /** Whether the database holds the sample data rather than the user's own. */
  holdsSampleData: () => boolean;
  /** Removes every workout, plan, weigh-in, goal, and recording; settings stay. */
  eraseAll: () => Promise<void>;
  /** Replaces everything with eight weeks of sample history ending today. */
  loadSample: () => Promise<void>;
};

type DataContextValue = { repository: DataRepository; dev: DevDataTools };

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [db] = useState<SqlDb>(openAppDatabase);
  const [store] = useState(() => createSqliteRepository(db));
  // Developer switches (slow or failing reads and writes) for checking loading and error states.
  const [repository] = useState<DataRepository>(() => (__DEV__ ? withDevFaults(store) : store));
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  );

  const value = useMemo<DataContextValue>(() => {
    // Every screen reloads from the database after the contents are swapped.
    const reload = () => {
      store.forgetCache();
      return queryClient.resetQueries();
    };
    return {
      repository,
      dev: {
        holdsSampleData: () => holdsSampleData(db),
        eraseAll: async () => {
          eraseAllData(db);
          await reload();
        },
        loadSample: async () => {
          loadSampleData(db, todayISO());
          await reload();
        },
      },
    };
  }, [db, store, repository, queryClient]);

  return (
    <DataContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </DataContext.Provider>
  );
}

function useDataContext(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('Data hooks must be used inside DataProvider');
  return value;
}

export function useRepository(): DataRepository {
  return useDataContext().repository;
}

/** Developer tools for the sample data (Profile → Developer → Component gallery). */
export function useDevData(): DevDataTools {
  return useDataContext().dev;
}
