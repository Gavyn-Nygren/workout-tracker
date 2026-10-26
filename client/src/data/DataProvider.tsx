import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { todayISO } from './dates';
import { openAppDatabase } from './db/openDatabase';
import { eraseAllData, holdsSampleData, loadSampleData } from './db/sampleData';
import { createSqliteRepository } from './db/sqliteRepository';
import type { SqlDb } from './db/sql';
import { withDevFaults } from './devFaults';
import { invalidateKeys, msUntilTomorrow, staleOnForeground } from './invalidation';
import type { DataRepository } from './repository';
import type { ISODate } from './types';

type DevDataTools = {
  /** Whether the database holds the sample data rather than the user's own. */
  holdsSampleData: () => boolean;
  /** Removes every workout, plan, weigh-in, goal, and recording; settings stay. */
  eraseAll: () => Promise<void>;
  /** Replaces everything with eight weeks of sample history ending today. */
  loadSample: () => Promise<void>;
};

type DataContextValue = { repository: DataRepository; dev: DevDataTools; today: ISODate };

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [db] = useState<SqlDb>(openAppDatabase);
  const [store] = useState(() => createSqliteRepository(db));
  // Developer switches (slow or failing reads and writes) for checking loading and error states.
  const [repository] = useState<DataRepository>(() => (__DEV__ ? withDevFaults(store) : store));
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }),
  );

  // Streak weeks, badges, and the calendar depend on today's date, so a new day refreshes them even
  // though nothing was saved: checked when the app comes back, and at midnight while it stays open.
  const [today, setToday] = useState<ISODate>(() => store.today());
  useEffect(() => {
    let lastCheckedDay = store.today();
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const day = store.today();
      void invalidateKeys(queryClient, staleOnForeground(lastCheckedDay, day));
      lastCheckedDay = day;
      setToday(day);
    };
    const scheduleMidnight = () => {
      clearTimeout(midnight);
      midnight = setTimeout(() => {
        check();
        scheduleMidnight();
      }, msUntilTomorrow(new Date()));
    };
    scheduleMidnight();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      check();
      scheduleMidnight();
    });
    return () => {
      clearTimeout(midnight);
      subscription.remove();
    };
  }, [store, queryClient]);

  const value = useMemo<DataContextValue>(() => {
    // Every screen reloads from the database after the contents are swapped.
    const reload = () => {
      store.forgetCache();
      return queryClient.resetQueries();
    };
    return {
      repository,
      today,
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
  }, [db, store, repository, queryClient, today]);

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

/**
 * Today's date, which changes at midnight and when the app comes back on a new day. Screens read
 * it here (not from the repository during render) so they show the new day without a restart.
 */
export function useToday(): ISODate {
  return useDataContext().today;
}

/** Developer tools for the sample data (Profile → Developer → Component gallery). */
export function useDevData(): DevDataTools {
  return useDataContext().dev;
}
