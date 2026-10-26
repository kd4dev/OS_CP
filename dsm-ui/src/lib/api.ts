import { ClusterStatusResponse, HexRow, LogEntry, MemoryStats, MetricsData } from './types';
import { INITIAL_HEX_GRID, INITIAL_LOGS, INITIAL_MEMORY_STATS, INITIAL_METRICS, INITIAL_MSI_PAGES, INITIAL_MUTEX_STATE, INITIAL_NODES } from './demoData';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchStatus(): Promise<ClusterStatusResponse> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new ApiError(`Failed to fetch status: ${res.statusText}`, res.status);
  return res.json();
}

export async function fetchMemory(): Promise<{ grid: HexRow[]; memoryStats: MemoryStats }> {
  const res = await fetch(`${API_BASE}/memory`);
  if (!res.ok) throw new ApiError(`Failed to fetch memory: ${res.statusText}`, res.status);
  return res.json();
}

export async function fetchLogs(): Promise<{ logs: LogEntry[] }> {
  const res = await fetch(`${API_BASE}/logs`);
  if (!res.ok) throw new ApiError(`Failed to fetch logs: ${res.statusText}`, res.status);
  return res.json();
}

export async function fetchMetrics(): Promise<MetricsData> {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) throw new ApiError(`Failed to fetch metrics: ${res.statusText}`, res.status);
  return res.json();
}

export async function sendCommand(command: string): Promise<any> {
  const res = await fetch(`${API_BASE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new ApiError(`Command failed: ${res.statusText}`, res.status);
  return res.json();
}

export async function runScenarioApi(scenario: string): Promise<any> {
  const res = await fetch(`${API_BASE}/scenario/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new ApiError(`Scenario failed: ${res.statusText}`, res.status);
  return res.json();
}

export async function setSimulationState(action: 'run' | 'pause' | 'stop'): Promise<any> {
  const res = await fetch(`${API_BASE}/simulation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new ApiError(`Simulation action failed: ${res.statusText}`, res.status);
  return res.json();
}
