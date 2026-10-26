export type MsiState = 'Modified' | 'Shared' | 'Invalid';

export interface ClusterNode {
  id: number;
  name: string;
  ip: string;
  port?: number;
  status: string;
  cpu: string;
  mem: string;
  latency?: string;
  lamport: number;
  phi: number;
}

export interface MemoryStats {
  usedMB: number;
  totalMB: number;
  percentage: number;
  cacheHits: number;
  cacheMisses: number;
  invalidations: number;
  pageFaults: number;
}

export interface MsiPage {
  pageId: number;
  addrHex: string;
  homeNode: number;
  dirState: MsiState;
  owner: number | null;
  sharers: number[];
  nodeStates: Record<number, MsiState>;
  version?: number;
}

export interface ActiveLock {
  name: string;
  owner: string;
  timestamp: number;
  grantedAt?: number;
}

export interface QueueItem {
  node: string;
  timestamp: number;
  lockName: string;
}

export interface MutexState {
  activeLocks: ActiveLock[];
  queue: QueueItem[];
  deferred: Record<string, string[]>;
}

export interface LogEntry {
  time: string;
  tag: string;
  text: string;
}

export interface MetricsData {
  labels: string[];
  read: number[];
  write: number[];
  sync: number[];
}

export interface HexRow {
  addr: string;
  bytes: string[];
}

export interface HighlightedCell {
  row: number;
  col: number;
  type: 'outline' | 'solid';
}

export interface FlashingCell {
  row: number;
  col: number;
  val: string;
  type: 'write' | 'read';
  timestamp: number;
}

export interface ClusterStatusResponse {
  simState: 'running' | 'paused' | 'stopped';
  nodes: ClusterNode[];
  memoryStats: MemoryStats;
  highlightedCells?: HighlightedCell[];
  mutexState: MutexState;
  msiPages: MsiPage[];
}

export interface LinkPulse {
  n1: boolean;
  n2: boolean;
  n3: boolean;
  n4: boolean;
  color: string;
  label: string;
}

export interface StepEvent {
  id: number;
  time: string;
  from: string;
  to: string;
  message: string;
  result: string;
}
