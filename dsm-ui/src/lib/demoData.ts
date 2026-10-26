import { ClusterNode, MemoryStats, MsiPage, MutexState, HexRow, LogEntry, MetricsData } from './types';

export const INITIAL_NODES: ClusterNode[] = [
  { id: 1, name: 'Node 1 (Home)', ip: '192.168.1.1', status: 'Online', cpu: '38%', mem: '62%', latency: '12 ms', lamport: 14, phi: 0.12 },
  { id: 2, name: 'Node 2', ip: '192.168.1.2', status: 'Online', cpu: '29%', mem: '48%', latency: '15 ms', lamport: 16, phi: 0.18 },
  { id: 3, name: 'Node 3', ip: '192.168.1.3', status: 'Online', cpu: '45%', mem: '69%', latency: '18 ms', lamport: 19, phi: 0.24 },
  { id: 4, name: 'Node 4', ip: '192.168.1.4', status: 'Online', cpu: '22%', mem: '41%', latency: '14 ms', lamport: 22, phi: 0.15 },
];

export const INITIAL_MEMORY_STATS: MemoryStats = {
  usedMB: 27.1,
  totalMB: 64.0,
  percentage: 42,
  cacheHits: 412,
  cacheMisses: 38,
  invalidations: 24,
  pageFaults: 18,
};

export const INITIAL_MSI_PAGES: MsiPage[] = Array.from({ length: 16 }, (_, i) => ({
  pageId: i,
  addrHex: `0x${(i * 0x1000).toString(16).toUpperCase().padStart(4, '0')}`,
  homeNode: 0,
  dirState: i === 0 ? 'Shared' : (i === 1 ? 'Modified' : 'Invalid'),
  owner: i === 1 ? 3 : null,
  sharers: i === 0 ? [1, 2] : (i === 1 ? [3] : []),
  nodeStates: {
    1: i === 0 ? 'Shared' : 'Invalid',
    2: i === 0 ? 'Shared' : 'Invalid',
    3: i === 1 ? 'Modified' : 'Invalid',
    4: 'Invalid',
  },
  version: 1,
}));

export const INITIAL_HEX_GRID: HexRow[] = [
  { addr: '0x0000', bytes: ['00', '1A', '3F', '2B', '7C', '7C', '10', '00', 'FF', '3A', '2C', '00', '11', '9E', '3F', '00'] },
  { addr: '0x0010', bytes: ['12', '00', '00', '4F', '6A', '00', '00', '00', 'A3', '1F', '00', '00', '00', '2B', '7F', '00'] },
  { addr: '0x0020', bytes: ['FF', '2C', '91', '00', '00', '10', '7A', '3F', '00', '00', '00', '5E', '11', '00', '00', '00'] },
  { addr: '0x0030', bytes: ['00', '00', '60', '2A', '3F', '4C', '4C', '00', '00', '00', '1B', '00', '00', '00', '00', '00'] },
  { addr: '0x0040', bytes: ['7E', '00', '00', '00', '11', '00', '00', '00', '2C', '3F', '00', '00', '00', '00', '00', '00'] },
  { addr: '0x0050', bytes: ['00', '00', '9E', '3F', '00', '00', '00', '7A', '7A', '00', '00', '11', '00', '00', '00', '00'] },
  { addr: '0x0060', bytes: ['3F', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '2B', '2B', '00', '00', '00'] },
  { addr: '0x0070', bytes: ['11', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00'] },
];

export const INITIAL_MUTEX_STATE: MutexState = {
  activeLocks: [
    { name: 'demo_lock', owner: 'Node 1', timestamp: 14, grantedAt: Date.now() - 4000 },
  ],
  queue: [
    { node: 'Node 3', timestamp: 19, lockName: 'demo_lock' },
  ],
  deferred: {
    'Node 1': ['Node 3'],
    'Node 2': [],
    'Node 3': [],
    'Node 4': [],
  },
};

export const INITIAL_LOGS: LogEntry[] = [
  { time: '22:14:01', tag: 'INFO', text: 'Node 1 connected (192.168.1.1)' },
  { time: '22:14:02', tag: 'INFO', text: 'Node 2 connected (192.168.1.2)' },
  { time: '22:14:03', tag: 'INFO', text: 'Node 3 connected (192.168.1.3)' },
  { time: '22:14:04', tag: 'INFO', text: 'Node 4 connected (192.168.1.4)' },
  { time: '22:14:05', tag: 'SYNC', text: 'Initializing directory service (home-node directory scheme)...' },
  { time: '22:14:06', tag: 'MEM', text: 'Shared region created (Size: 64 MB backing memory)' },
  { time: '22:14:07', tag: 'COHERENCE', text: 'Consistency protocol: MSI Directory-based Write Invalidate' },
  { time: '22:14:10', tag: 'REQ', text: 'Node 2 requesting address 0x1A3F (Read Miss -> Home Directory)' },
  { time: '22:14:10', tag: 'GRANT', text: 'Access granted (State: Shared, Sharers: [Node 1, Node 2])' },
  { time: '22:14:12', tag: 'WRITE', text: 'Node 3 writing to 0x1A3F (Write Miss on Shared Page)' },
  { time: '22:14:12', tag: 'MSI_INV', text: 'Directory broadcasting INV to Node 1, Node 2 (Downgrade to Invalid)' },
  { time: '22:14:13', tag: 'GRANT', text: 'Node 3 promoted to Modified (Exclusive Owner), memory updated' },
  { time: '22:14:15', tag: 'SYNC', text: 'All nodes synchronized via centralized barrier' },
];

export const INITIAL_METRICS: MetricsData = {
  labels: ['22:13', '22:14', '22:15', '22:16', '22:17'],
  read: [75, 82, 68, 88, 79],
  write: [38, 45, 32, 48, 41],
  sync: [15, 20, 12, 22, 17],
};
