/**
 * server.js — DSM Backend API, Simulation & Academic Presentation Controller
 *
 * Coordinates C++ DSM nodes, MSI coherence protocol simulation,
 * live hex memory map, Ricart-Agrawala distributed locking,
 * real-time performance metrics, command execution, and
 * educational course project presentation scenarios.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3001;
const DSM_EXE = fs.existsSync(path.join(__dirname, 'bin', 'dsm_node'))
  ? path.join(__dirname, 'bin', 'dsm_node')
  : path.join(__dirname, 'bin', 'dsm_node.exe');

// Cluster State
let simState = 'running'; // 'running', 'paused', 'stopped'
let spawnedProcesses = [];

// 4 Cluster Nodes with Lamport Logical Clocks
let clusterNodes = [
  { id: 1, name: 'Node 1', ip: '192.168.1.1', port: 7000, status: 'Online', cpu: '42%', mem: '68%', latency: '12 ms', lamport: 14, phi: 0.12 },
  { id: 2, name: 'Node 2', ip: '192.168.1.2', port: 7001, status: 'Online', cpu: '35%', mem: '61%', latency: '15 ms', lamport: 16, phi: 0.18 },
  { id: 3, name: 'Node 3', ip: '192.168.1.3', port: 7002, status: 'Online', cpu: '27%', mem: '45%', latency: '18 ms', lamport: 19, phi: 0.24 },
  { id: 4, name: 'Node 4', ip: '192.168.1.4', port: 7003, status: 'Online', cpu: '51%', mem: '73%', latency: '14 ms', lamport: 22, phi: 0.15 }
];

// MSI Protocol Page States (16 virtual pages, 4KB each = 64KB sample view)
// Each page has: state on Node 1..4, Directory Owner, Sharers set, Sequence Num
let msiPages = Array.from({ length: 16 }, (_, i) => ({
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
    4: 'Invalid'
  },
  version: 1
}));

// Memory State: 8 rows of 16 bytes = 128 bytes displayed
let memoryMap = [
  { addr: '0x0000', bytes: ['00', '1A', '3F', '2B', '7C', '7C', '10', '00', 'FF', '3A', '2C', '00', '11', '9E', '3F', '00'] },
  { addr: '0x0010', bytes: ['12', '00', '00', '4F', '6A', '00', '00', '00', 'A3', '1F', '00', '00', '00', '2B', '7F', '00'] },
  { addr: '0x0020', bytes: ['FF', '2C', '91', '00', '00', '10', '7A', '3F', '00', '00', '00', '5E', '11', '00', '00', '00'] },
  { addr: '0x0030', bytes: ['00', '00', '60', '2A', '3F', '4C', '4C', '00', '00', '00', '1B', '00', '00', '00', '00', '00'] },
  { addr: '0x0040', bytes: ['7E', '00', '00', '00', '11', '00', '00', '00', '2C', '3F', '00', '00', '00', '00', '00', '00'] },
  { addr: '0x0050', bytes: ['00', '00', '9E', '3F', '00', '00', '00', '7A', '7A', '00', '00', '11', '00', '00', '00', '00'] },
  { addr: '0x0060', bytes: ['3F', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '2B', '2B', '00', '00', '00'] },
  { addr: '0x0070', bytes: ['11', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00'] }
];

let memoryStats = {
  usedMB: 27.1,
  totalMB: 64.0,
  percentage: 42,
  cacheHits: 412,
  cacheMisses: 38,
  invalidations: 24,
  pageFaults: 18
};

let highlightedCells = [
  { row: 1, col: 7, type: 'outline' }, // 0x0010:07
  { row: 5, col: 2, type: 'solid' }    // 0x0050:02
];

// Ricart-Agrawala Distributed Mutex State
let mutexState = {
  activeLocks: [
    { name: 'demo_lock', owner: 'Node 1', timestamp: 14, grantedAt: Date.now() - 4000 }
  ],
  queue: [
    { node: 'Node 3', timestamp: 19, lockName: 'demo_lock' }
  ],
  deferred: {
    'Node 1': ['Node 3'],
    'Node 2': [],
    'Node 3': [],
    'Node 4': []
  }
};

// Logs Array
let logs = [
  { time: '22:14:01', tag: 'INFO', text: 'Node 1 connected (192.168.1.1)' },
  { time: '22:14:02', tag: 'INFO', text: 'Node 2 connected (192.168.1.2)' },
  { time: '22:14:03', tag: 'INFO', text: 'Node 3 connected (192.168.1.3)' },
  { time: '22:14:04', tag: 'INFO', text: 'Node 4 connected (192.168.1.4)' },
  { time: '22:14:05', tag: 'SYNC', text: 'Initializing directory service (home-node directory scheme)...' },
  { time: '22:14:06', tag: 'MEM', text: 'Shared region created (Size: 64 MB backing memory)' },
  { time: '22:14:07', tag: 'INFO', text: 'Consistency protocol: MSI Directory-based Write Invalidate' },
  { time: '22:14:10', tag: 'REQ', text: 'Node 2 requesting address 0x1A3F (Read Miss -> Home Directory)' },
  { time: '22:14:10', tag: 'GRANT', text: 'Access granted (State: Shared, Sharers: [Node 1, Node 2])' },
  { time: '22:14:12', tag: 'WRITE', text: 'Node 3 writing to 0x1A3F (Write Miss on Shared Page)' },
  { time: '22:14:12', tag: 'SYNC', text: 'Directory broadcasting INV to Node 1, Node 2 (Downgrade to Invalid)' },
  { time: '22:14:13', tag: 'UPDATE', text: 'Node 3 promoted to Modified (Exclusive Owner), memory updated' },
  { time: '22:14:15', tag: 'INFO', text: 'All nodes synchronized via centralized barrier' }
];

function addLog(tag, text) {
  const time = new Date().toTimeString().split(' ')[0];
  logs.push({ time, tag, text });
  if (logs.length > 200) logs.shift();
}

// Performance Metrics Time Series
let metrics = {
  labels: ['22:13', '22:14', '22:15', '22:16', '22:17'],
  read: [75, 82, 68, 88, 79],
  write: [38, 45, 32, 48, 41],
  sync: [15, 20, 12, 22, 17]
};

// Start C++ DSM Node background process
function startCppNode() {
  if (fs.existsSync(DSM_EXE) && spawnedProcesses.length === 0) {
    try {
      const child = spawn(DSM_EXE, ['--id', '0', '--port', '7100', '--no-ui', '--mem', '64'], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
          let tag = 'INFO';
          if (line.includes('[ERROR]')) tag = 'ERROR';
          else if (line.includes('SyncManager') || line.includes('lock')) tag = 'SYNC';
          else if (line.includes('PageTable') || line.includes('Memory')) tag = 'MEM';
          addLog(tag, line.trim());
        });
      });

      child.on('error', (err) => {
        addLog('ERROR', `C++ DSM node error: ${err.message}`);
      });

      child.on('exit', (code) => {
        addLog('INFO', `C++ DSM node process exited with code ${code}`);
      });

      spawnedProcesses.push(child);
      addLog('INFO', 'C++ DSM Manager kernel running (Node 0 on port 7100)');
    } catch (e) {
      addLog('ERROR', `Failed to spawn C++ node: ${e.message}`);
    }
  }
}

function stopCppNodes() {
  spawnedProcesses.forEach(proc => {
    try { proc.kill(); } catch (e) {}
  });
  spawnedProcesses = [];
}

// Background simulation ticker for dynamic live data
const ticker = setInterval(() => {
  if (simState !== 'running') return;

  // Jitter CPU / Memory / Lamport clocks slightly
  clusterNodes = clusterNodes.map(node => {
    const cpuBase = parseInt(node.cpu);
    const cpuDelta = Math.floor(Math.random() * 5) - 2;
    const newCpu = Math.max(15, Math.min(90, cpuBase + cpuDelta));

    const memBase = parseInt(node.mem);
    const memDelta = Math.floor(Math.random() * 3) - 1;
    const newMem = Math.max(30, Math.min(85, memBase + memDelta));

    const latencyNum = parseInt(node.latency);
    const latDelta = Math.floor(Math.random() * 3) - 1;
    const newLat = Math.max(8, Math.min(25, latencyNum + latDelta));

    return {
      ...node,
      cpu: `${newCpu}%`,
      mem: `${newMem}%`,
      latency: `${newLat} ms`,
      lamport: node.lamport + (Math.random() > 0.6 ? 1 : 0),
      phi: Math.max(0.05, Math.min(1.5, node.phi + (Math.random() * 0.1 - 0.05)))
    };
  });

  // Shift performance metrics
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (metrics.labels[metrics.labels.length - 1] !== timeStr) {
    metrics.labels.shift();
    metrics.labels.push(timeStr);
    metrics.read.shift();
    metrics.read.push(Math.floor(65 + Math.random() * 25));
    metrics.write.shift();
    metrics.write.push(Math.floor(30 + Math.random() * 20));
    metrics.sync.shift();
    metrics.sync.push(Math.floor(10 + Math.random() * 15));
  }
}, 3000);
if (ticker.unref) ticker.unref();

// Initialize C++ node when run standalone
if (require.main === module) {
  startCppNode();
}

// HTTP Request Handler
function handleRequest(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 1. GET /api/status — Comprehensive cluster & simulation status
  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      simState,
      nodes: clusterNodes,
      memoryStats,
      highlightedCells,
      mutexState,
      msiPages
    }));
    return;
  }

  // 2. GET /api/memory — Shared memory hex map
  if (req.method === 'GET' && url.pathname === '/api/memory') {
    const nodeParam = url.searchParams.get('node') || 'Node 1';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      node: nodeParam,
      grid: memoryMap,
      highlightedCells,
      memoryStats
    }));
    return;
  }

  // 3. GET /api/coherence — MSI Protocol Details
  if (req.method === 'GET' && url.pathname === '/api/coherence') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      protocol: 'Directory-based MSI',
      pageSize: 4096,
      pages: msiPages,
      stats: {
        cacheHits: memoryStats.cacheHits,
        cacheMisses: memoryStats.cacheMisses,
        invalidations: memoryStats.invalidations,
        pageFaults: memoryStats.pageFaults,
        hitRatio: `${Math.round((memoryStats.cacheHits / (memoryStats.cacheHits + memoryStats.cacheMisses)) * 100)}%`
      }
    }));
    return;
  }

  // 4. GET /api/sync — Ricart-Agrawala Mutex State
  if (req.method === 'GET' && url.pathname === '/api/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      algorithm: 'Ricart-Agrawala Distributed Mutual Exclusion',
      clocks: clusterNodes.map(n => ({ node: n.name, lamport: n.lamport })),
      mutexState
    }));
    return;
  }

  // 5. GET /api/logs — Live console logs
  if (req.method === 'GET' && url.pathname === '/api/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return;
  }

  // 6. GET /api/metrics — Performance metrics time series
  if (req.method === 'GET' && url.pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
    return;
  }

  // 7. POST /api/simulation — Run, Pause, Stop simulation control
  if (req.method === 'POST' && url.pathname === '/api/simulation') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { action } = JSON.parse(body);
        if (action === 'run') {
          simState = 'running';
          clusterNodes.forEach(n => n.status = 'Online');
          startCppNode();
          addLog('INFO', 'Cluster simulation resumed: all nodes active');
        } else if (action === 'pause') {
          simState = 'paused';
          addLog('SYNC', 'Cluster simulation paused: memory bus frozen');
        } else if (action === 'stop') {
          simState = 'stopped';
          clusterNodes.forEach(n => n.status = 'Offline');
          stopCppNodes();
          addLog('INFO', 'Cluster simulation stopped: all nodes disconnected');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, simState }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 8. POST /api/scenario/run — 1-Click Interactive Academic Scenarios
  if (req.method === 'POST' && url.pathname === '/api/scenario/run') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { scenario } = JSON.parse(body);
        
        if (scenario === 'msi_walkthrough') {
          // Scenario 1: MSI Coherence Step-by-Step
          addLog('INFO', '=== [ACADEMIC DEMO 1] MSI Cache Coherence Walkthrough ===');
          addLog('REQ', 'Step 1: Node 1 reads Page 0 (0x0000). Cache miss! Fetching from Directory.');
          msiPages[0].nodeStates[1] = 'Shared';
          msiPages[0].dirState = 'Shared';
          msiPages[0].sharers = [1];
          memoryStats.pageFaults++;
          memoryStats.cacheMisses++;

          setTimeout(() => {
            addLog('REQ', 'Step 2: Node 2 reads Page 0 (0x0000). Cache miss! Directory adds Node 2 to sharers.');
            msiPages[0].nodeStates[2] = 'Shared';
            msiPages[0].sharers = [1, 2];
            memoryStats.cacheHits++;
          }, 1000);

          setTimeout(() => {
            addLog('WRITE', 'Step 3: Node 3 writes 0x55 to Page 0. Write fault on non-exclusive page!');
            addLog('SYNC', 'Directory broadcasts INVAL to Sharers: Node 1, Node 2 (Downgraded to Invalid).');
            msiPages[0].nodeStates[1] = 'Invalid';
            msiPages[0].nodeStates[2] = 'Invalid';
            msiPages[0].nodeStates[3] = 'Modified';
            msiPages[0].owner = 3;
            msiPages[0].sharers = [3];
            msiPages[0].dirState = 'Modified';
            memoryMap[0].bytes[0] = '55';
            highlightedCells = [{ row: 0, col: 0, type: 'solid' }];
            memoryStats.invalidations += 2;
            addLog('UPDATE', 'Step 4: Node 3 granted exclusive Modified state. Coherence preserved.');
          }, 2200);

        } else if (scenario === 'false_sharing') {
          // Scenario 2: False Sharing Ping-Pong Thrashing
          addLog('INFO', '=== [ACADEMIC DEMO 2] False Sharing Demonstration ===');
          addLog('MEM', 'Page 2 (0x2000): Node 1 writing var_A at offset 0, Node 2 writing var_B at offset 4.');
          addLog('WRITE', 'Node 1 writes 0xAA to offset 0 -> Page 2 becomes Modified by Node 1.');
          msiPages[2].nodeStates[1] = 'Modified';
          msiPages[2].nodeStates[2] = 'Invalid';
          memoryMap[2].bytes[0] = 'AA';
          memoryStats.invalidations++;

          setTimeout(() => {
            addLog('WRITE', 'Node 2 writes 0xBB to offset 4 -> Invalidation storm! Node 1 must writeback and invalidate.');
            msiPages[2].nodeStates[1] = 'Invalid';
            msiPages[2].nodeStates[2] = 'Modified';
            memoryMap[2].bytes[4] = 'BB';
            highlightedCells = [{ row: 2, col: 4, type: 'solid' }, { row: 2, col: 0, type: 'outline' }];
            memoryStats.invalidations += 2;
            addLog('WARN', 'Ping-pong thrashing detected! 2 independent variables sharing the same 4KB page cause high bus traffic.');
          }, 1200);

        } else if (scenario === 'mutex_race') {
          // Scenario 3: Ricart-Agrawala Mutex Race
          addLog('INFO', '=== [ACADEMIC DEMO 3] Ricart-Agrawala Mutex Contention ===');
          addLog('SYNC', 'Nodes 2 and 4 simultaneously request critical section "shared_counter".');
          addLog('SYNC', 'Node 2 broadcasts REQUEST(T=18, Node=2). Node 4 broadcasts REQUEST(T=23, Node=4).');
          
          setTimeout(() => {
            addLog('SYNC', 'Comparison: Lamport timestamp (18, Node 2) < (23, Node 4).');
            addLog('GRANT', 'Node 2 wins arbitration! Node 4 defers its reply to Node 2.');
            mutexState.activeLocks = [{ name: 'shared_counter', owner: 'Node 2', timestamp: 18 }];
            mutexState.deferred['Node 4'] = ['Node 2'];
            clusterNodes[1].lamport = 20;
          }, 1100);

          setTimeout(() => {
            addLog('UPDATE', 'Node 2 exits critical section. Sends deferred REPLY to Node 4.');
            addLog('GRANT', 'Node 4 receives all N-1 replies and enters critical section.');
            mutexState.activeLocks = [{ name: 'shared_counter', owner: 'Node 4', timestamp: 23 }];
            mutexState.deferred['Node 4'] = [];
          }, 2400);

        } else if (scenario === 'phi_failure') {
          // Scenario 4: Phi-Accrual Failure Detection
          addLog('INFO', '=== [ACADEMIC DEMO 4] Phi-Accrual Failure Detector ===');
          addLog('WARN', 'Simulating network partition on Node 3 (192.168.1.3)...');
          clusterNodes[2].status = 'Degraded';
          clusterNodes[2].phi = 4.2;

          setTimeout(() => {
            addLog('WARN', 'Heartbeat missed for 1500ms. Phi suspicion metric rising: phi = 8.7 (threshold = 8.0).');
            clusterNodes[2].status = 'Offline';
            clusterNodes[2].phi = 12.4;
            addLog('INFO', 'Node 3 accrued suspicion threshold exceeded. Directory evicts Node 3 from sharer sets.');
          }, 1500);

          setTimeout(() => {
            addLog('INFO', 'Cluster healed: Failover complete. 3 healthy nodes remaining.');
          }, 2600);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, scenario }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 9. POST /api/command — Execute live DSM kernel commands
  if (req.method === 'POST' && url.pathname === '/api/command') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        const cmd = (command || '').trim();
        addLog('CMD', `> ${cmd}`);

        const parts = cmd.split(' ');
        const op = parts[0].toLowerCase();
        let result = {};

        if (op === 'write') {
          // write <address> <value>
          const addr = parts[1] || '0x1A3F';
          const val = parts[2] || '100';
          const numVal = parseInt(val, 10);
          const hexByte = (isNaN(numVal) ? 0x2A : numVal & 0xFF).toString(16).toUpperCase().padStart(2, '0');

          const rowIdx = Math.min(7, Math.max(0, parseInt(addr.slice(2, 4) || '0', 16) % 8));
          const colIdx = Math.min(15, Math.max(0, parseInt(addr.slice(4) || '0', 16) % 16));

          memoryMap[rowIdx].bytes[colIdx] = hexByte;
          highlightedCells = [
            { row: rowIdx, col: colIdx, type: 'solid' },
            { row: 1, col: 7, type: 'outline' }
          ];

          msiPages[rowIdx].dirState = 'Modified';
          msiPages[rowIdx].owner = 3;
          msiPages[rowIdx].nodeStates[3] = 'Modified';
          msiPages[rowIdx].nodeStates[1] = 'Invalid';
          msiPages[rowIdx].nodeStates[2] = 'Invalid';
          memoryStats.invalidations++;

          addLog('WRITE', `Node 3 writing ${val} (0x${hexByte}) to ${addr}`);
          addLog('SYNC', `Directory broadcasting Invalidate (INV) to Node 1, Node 2`);
          addLog('UPDATE', `Memory address ${addr} updated successfully (State: Modified)`);

          result = { success: true, addr, value: hexByte, state: 'Modified' };
        } else if (op === 'read') {
          // read <address>
          const addr = parts[1] || '0x1A3F';
          const rowIdx = Math.min(7, Math.max(0, parseInt(addr.slice(2, 4) || '0', 16) % 8));
          const colIdx = Math.min(15, Math.max(0, parseInt(addr.slice(4) || '0', 16) % 16));
          const val = memoryMap[rowIdx].bytes[colIdx];

          highlightedCells = [
            { row: rowIdx, col: colIdx, type: 'outline' },
            { row: 5, col: 2, type: 'solid' }
          ];

          msiPages[rowIdx].nodeStates[2] = 'Shared';
          if (msiPages[rowIdx].dirState === 'Invalid') msiPages[rowIdx].dirState = 'Shared';
          memoryStats.cacheHits++;

          addLog('REQ', `Node 2 requesting read on address ${addr}`);
          addLog('GRANT', `Access granted (State: Shared, Value: 0x${val})`);
          result = { success: true, addr, value: val, state: 'Shared' };
        } else if (op === 'allocate') {
          const size = parseInt(parts[1] || '64', 10);
          memoryStats.usedMB = Math.min(memoryStats.totalMB, Math.round((memoryStats.usedMB + size / 4) * 10) / 10);
          memoryStats.percentage = Math.round((memoryStats.usedMB / memoryStats.totalMB) * 100);

          addLog('MEM', `Allocated ${size} MB shared region via mmap/VirtualAlloc at 0x${(0x10000000 + Math.floor(Math.random()*0xFFFFF)).toString(16)}`);
          result = { success: true, size, memoryStats };
        } else if (op === 'lock') {
          const lockAddr = parts[1] || '0x1A3F';
          mutexState.activeLocks.push({ name: lockAddr, owner: 'Node 1', timestamp: clusterNodes[0].lamport });
          addLog('SYNC', `Acquiring distributed Ricart-Agrawala lock for ${lockAddr}...`);
          addLog('SYNC', `Lock acquired on ${lockAddr} by Node 1 (Lamport clock: ${clusterNodes[0].lamport})`);
          result = { success: true, lock: lockAddr, owner: 'Node 1' };
        } else if (op === 'unlock') {
          const lockAddr = parts[1] || '0x1A3F';
          mutexState.activeLocks = mutexState.activeLocks.filter(l => l.name !== lockAddr);
          addLog('SYNC', `Distributed lock on ${lockAddr} released. Sent broadcast UNLOCK_ACK to cluster.`);
          result = { success: true, released: lockAddr };
        } else if (op === 'show') {
          const sub = (parts[1] || '').toLowerCase();
          if (sub === 'memory') {
            addLog('INFO', `DSM Memory: 64 MB total, ${memoryStats.usedMB} MB used (MSI Coherent Directory)`);
          } else if (sub === 'nodes') {
            addLog('INFO', `Active Cluster Nodes: 4 online, Phi-Accrual failure detector active`);
          } else if (sub === 'logs') {
            addLog('INFO', `Dumping ${logs.length} ring buffer log events...`);
          }
          result = { success: true };
        } else if (op === 'clear') {
          logs = [];
          result = { success: true };
        } else {
          addLog('INFO', `Executed custom command: ${cmd}`);
          result = { success: true };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static UI files from dsm-ui/dist if available
  const distDir = path.join(__dirname, 'dsm-ui', 'dist');
  let filePath = path.join(distDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DSM Backend Server] listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = handleRequest;
