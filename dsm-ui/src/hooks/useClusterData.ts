import { useQuery } from '@tanstack/react-query';
import { fetchLogs, fetchMemory, fetchMetrics, fetchStatus } from '../lib/api';
import { INITIAL_HEX_GRID, INITIAL_LOGS, INITIAL_MEMORY_STATS, INITIAL_METRICS, INITIAL_MSI_PAGES, INITIAL_MUTEX_STATE, INITIAL_NODES } from '../lib/demoData';
import { ClusterStatusResponse, HexRow, LogEntry, MemoryStats, MetricsData } from '../lib/types';
import { useSimStore } from '../store/sim';
import { useEffect } from 'react';

export function useClusterData() {
  const targetPageId = useSimStore((state) => state.targetPageId);
  const setNodeMsiStates = useSimStore((state) => state.setNodeMsiStates);
  const setSimState = useSimStore((state) => state.setSimState);

  // Status Query
  const statusQuery = useQuery<ClusterStatusResponse>({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
    retry: 1,
    initialData: {
      simState: 'running',
      nodes: INITIAL_NODES,
      memoryStats: INITIAL_MEMORY_STATS,
      mutexState: INITIAL_MUTEX_STATE,
      msiPages: INITIAL_MSI_PAGES,
    },
  });

  // Memory Query
  const memoryQuery = useQuery<{ grid: HexRow[]; memoryStats: MemoryStats }>({
    queryKey: ['memory'],
    queryFn: fetchMemory,
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
    retry: 1,
    initialData: {
      grid: INITIAL_HEX_GRID,
      memoryStats: INITIAL_MEMORY_STATS,
    },
  });

  // Logs Query
  const logsQuery = useQuery<{ logs: LogEntry[] }>({
    queryKey: ['logs'],
    queryFn: fetchLogs,
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
    retry: 1,
    initialData: {
      logs: INITIAL_LOGS,
    },
  });

  // Metrics Query
  const metricsQuery = useQuery<MetricsData>({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 2500,
    refetchIntervalInBackground: false,
    retry: 1,
    initialData: INITIAL_METRICS,
  });

  // Check if backend is reachable
  const isOffline = statusQuery.isError || memoryQuery.isError || logsQuery.isError;

  // Sync node states for current target page
  useEffect(() => {
    if (statusQuery.data?.msiPages && statusQuery.data.msiPages[targetPageId]) {
      setNodeMsiStates(statusQuery.data.msiPages[targetPageId].nodeStates);
    }
  }, [statusQuery.data?.msiPages, targetPageId, setNodeMsiStates]);

  // Sync sim state
  useEffect(() => {
    if (statusQuery.data?.simState) {
      setSimState(statusQuery.data.simState);
    }
  }, [statusQuery.data?.simState, setSimState]);

  return {
    isOffline,
    nodes: statusQuery.data?.nodes || INITIAL_NODES,
    memoryStats: memoryQuery.data?.memoryStats || statusQuery.data?.memoryStats || INITIAL_MEMORY_STATS,
    hexGrid: memoryQuery.data?.grid || INITIAL_HEX_GRID,
    logs: logsQuery.data?.logs || INITIAL_LOGS,
    metrics: metricsQuery.data || INITIAL_METRICS,
    msiPages: statusQuery.data?.msiPages || INITIAL_MSI_PAGES,
    mutexState: statusQuery.data?.mutexState || INITIAL_MUTEX_STATE,
    highlightedCells: statusQuery.data?.highlightedCells || [],
    refetchAll: () => {
      statusQuery.refetch();
      memoryQuery.refetch();
      logsQuery.refetch();
      metricsQuery.refetch();
    },
  };
}
