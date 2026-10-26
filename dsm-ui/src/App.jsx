import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Terminal, 
  Cpu, 
  Database, 
  RefreshCw, 
  Play, 
  Pause, 
  RotateCcw, 
  Send,
  Award,
  Zap,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Download,
  Lock,
  Unlock,
  Radio,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FastForward,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
  Binary
} from 'lucide-react';

const API_BASE = '/api';

export default function DSMDashboard() {
  const [activeHeaderTab, setActiveHeaderTab] = useState('Overview'); // 'Overview', 'MSI', 'Mutex'
  const [simState, setSimState] = useState('running');
  const [currentTime, setCurrentTime] = useState('');
  const [commandInput, setCommandInput] = useState('');

  // ---------------------------------------------------------------------------
  // 1. STEP-BY-STEP DEBUG / SIMULATION MODE (CISCO PACKET TRACER STYLE)
  // ---------------------------------------------------------------------------
  const [debugMode, setDebugMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // 0 = idle, 1..4 = steps
  const [stepScenarioType, setStepScenarioType] = useState('write'); // 'write' or 'read'
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayTimerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // 2. ACTIVE PACKET PULSES ON TOPOLOGY LINKS
  // ---------------------------------------------------------------------------
  const [activeLinkPulse, setActiveLinkPulse] = useState({
    n1: false,
    n2: false,
    n3: false,
    n4: false,
    color: '#00ffa3', // '#00ffa3', '#00c8ff', '#ef4444', '#f59e0b'
    label: ''
  });

  // ---------------------------------------------------------------------------
  // 3. TARGET PAGE & PER-NODE MSI STATES (COLOR-CODED NODES)
  // ---------------------------------------------------------------------------
  const [targetPageId, setTargetPageId] = useState(1); // Page 1 = 0x1A3F / 0x1000
  const [targetAddr, setTargetAddr] = useState('0x1A3F');

  // Node states for target page: 1: 'Shared'|'Modified'|'Invalid'
  const [nodeMsiStates, setNodeMsiStates] = useState({
    1: 'Shared',
    2: 'Shared',
    3: 'Invalid',
    4: 'Invalid'
  });

  // ---------------------------------------------------------------------------
  // 4. MEMORY GRID & FLASHING CELL HIGHLIGHT
  // ---------------------------------------------------------------------------
  const [flashingCell, setFlashingCell] = useState(null); // { row, col, type, val, timestamp }

  // 4 Cluster Nodes
  const [nodes, setNodes] = useState([
    { id: 1, name: 'Node 1 (Home)', ip: '192.168.1.1', status: 'Online', cpu: '38%', mem: '62%', lamport: 14, phi: 0.12 },
    { id: 2, name: 'Node 2', ip: '192.168.1.2', status: 'Online', cpu: '29%', mem: '48%', lamport: 16, phi: 0.18 },
    { id: 3, name: 'Node 3', ip: '192.168.1.3', status: 'Online', cpu: '45%', mem: '69%', lamport: 19, phi: 0.24 },
    { id: 4, name: 'Node 4', ip: '192.168.1.4', status: 'Online', cpu: '22%', mem: '41%', lamport: 22, phi: 0.15 }
  ]);

  // Memory & Cache Statistics
  const [memoryStats, setMemoryStats] = useState({
    usedMB: 27.1,
    totalMB: 64.0,
    percentage: 42,
    cacheHits: 412,
    cacheMisses: 38,
    invalidations: 24,
    pageFaults: 18
  });

  // Hex Shared Memory Grid (8 rows x 16 cols = 128 bytes)
  const [hexGrid, setHexGrid] = useState([
    { addr: '0x0000', bytes: ['00', '1A', '3F', '2B', '7C', '7C', '10', '00', 'FF', '3A', '2C', '00', '11', '9E', '3F', '00'] },
    { addr: '0x0010', bytes: ['12', '00', '00', '4F', '6A', '00', '00', '00', 'A3', '1F', '00', '00', '00', '2B', '7F', '00'] },
    { addr: '0x0020', bytes: ['FF', '2C', '91', '00', '00', '10', '7A', '3F', '00', '00', '00', '5E', '11', '00', '00', '00'] },
    { addr: '0x0030', bytes: ['00', '00', '60', '2A', '3F', '4C', '4C', '00', '00', '00', '1B', '00', '00', '00', '00', '00'] },
    { addr: '0x0040', bytes: ['7E', '00', '00', '00', '11', '00', '00', '00', '2C', '3F', '00', '00', '00', '00', '00', '00'] },
    { addr: '0x0050', bytes: ['00', '00', '9E', '3F', '00', '00', '00', '7A', '7A', '00', '00', '11', '00', '00', '00', '00'] },
    { addr: '0x0060', bytes: ['3F', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '2B', '2B', '00', '00', '00'] },
    { addr: '0x0070', bytes: ['11', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00'] }
  ]);

  const [highlightedCells, setHighlightedCells] = useState([
    { row: 1, col: 7, type: 'outline' },
    { row: 5, col: 2, type: 'solid' }
  ]);

  // Console Logs
  const [logs, setLogs] = useState([
    { time: '12:00:01', tag: 'INFO', text: 'DSM Kernel online: 64 MB backing store reserved via VirtualAlloc / mmap.' },
    { time: '12:00:02', tag: 'NET', text: '4 cluster nodes connected via non-blocking TCP mesh.' },
    { time: '12:00:03', tag: 'SYNC', text: 'Coherence protocol: Directory-Based MSI Write-Invalidate initialized.' },
    { time: '12:00:06', tag: 'REQ', text: 'Node 2 read 0x1A3F -> Page Fault trapped (VEH/SIGSEGV) -> State: Shared' },
    { time: '12:00:08', tag: 'WRITE', text: 'Node 3 write 0x1A3F -> Directory broadcast INV to Node 2 -> State: Modified' },
    { time: '12:00:10', tag: 'SYNC', text: 'Node 1 acquired distributed lock on 0x1A3F (Lamport timestamp #14)' }
  ]);

  // MSI Pages (16 Virtual Pages)
  const [msiPages, setMsiPages] = useState(
    Array.from({ length: 16 }, (_, i) => ({
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
      }
    }))
  );

  // Ricart-Agrawala Distributed Mutex State
  const [mutexInfo, setMutexInfo] = useState({
    activeLocks: [{ name: '0x1A3F', owner: 'Node 1', timestamp: 14 }],
    queue: [{ node: 'Node 3', timestamp: 19, lockName: '0x1A3F' }],
    deferred: { 'Node 1': ['Node 3'], 'Node 2': [], 'Node 3': [], 'Node 4': [] }
  });

  const [activeScenario, setActiveScenario] = useState(null);
  const [scenarioBanner, setScenarioBanner] = useState('');
  const logContainerRef = useRef(null);

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Backend Data (Non-intrusive)
  const fetchBackendData = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.nodes) setNodes(data.nodes);
        if (data.memoryStats) setMemoryStats(data.memoryStats);
        if (data.simState) setSimState(data.simState);
        if (data.highlightedCells) setHighlightedCells(data.highlightedCells);
        if (data.mutexState) setMutexInfo(data.mutexState);
        if (data.msiPages) {
          setMsiPages(data.msiPages);
          if (data.msiPages[targetPageId]) {
            setNodeMsiStates(data.msiPages[targetPageId].nodeStates);
          }
        }
      }

      const lRes = await fetch(`${API_BASE}/logs`);
      if (lRes.ok) {
        const lData = await lRes.json();
        if (lData.logs !== undefined) setLogs(lData.logs);
      }

      const mRes = await fetch(`${API_BASE}/memory`);
      if (mRes.ok) {
        const mData = await mRes.json();
        if (mData.grid) setHexGrid(mData.grid);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchBackendData();
    const interval = setInterval(fetchBackendData, 2500);
    return () => clearInterval(interval);
  }, [targetPageId]);

  // Keep internal terminal scrolled to bottom without moving the page window
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // ---------------------------------------------------------------------------
  // TRIGGER TOPOLOGY LINK PULSE ANIMATION
  // ---------------------------------------------------------------------------
  const fireLinkPulse = (nodesToPulse, color, label, duration = 2200) => {
    setActiveLinkPulse({
      n1: nodesToPulse.includes(1),
      n2: nodesToPulse.includes(2),
      n3: nodesToPulse.includes(3),
      n4: nodesToPulse.includes(4),
      color,
      label
    });

    setTimeout(() => {
      setActiveLinkPulse(prev => ({
        ...prev,
        n1: false,
        n2: false,
        n3: false,
        n4: false,
        label: ''
      }));
    }, duration);
  };

  // ---------------------------------------------------------------------------
  // TRIGGER MEMORY MATRIX CELL FLASH
  // ---------------------------------------------------------------------------
  const triggerCellFlash = (row, col, val = '64', type = 'write') => {
    setFlashingCell({ row, col, val, type, timestamp: Date.now() });

    // Update hex byte directly in memory grid state for instant feedback
    setHexGrid(prev => {
      const next = [...prev];
      if (next[row] && next[row].bytes) {
        const bytes = [...next[row].bytes];
        bytes[col] = val;
        next[row] = { ...next[row], bytes };
      }
      return next;
    });

    setTimeout(() => {
      setFlashingCell(prev => (prev?.timestamp ? { ...prev, active: false } : null));
    }, 2500);
  };

  // ---------------------------------------------------------------------------
  // STEP-BY-STEP SIMULATION CONTROLLER (FEATURE 4)
  // ---------------------------------------------------------------------------
  const advanceStep = (stepNumber) => {
    const nextStep = stepNumber !== undefined ? stepNumber : (currentStep >= 4 ? 1 : currentStep + 1);
    setCurrentStep(nextStep);

    if (stepScenarioType === 'write') {
      // 4 Textbook Steps for Write Invalidation:
      if (nextStep === 1) {
        // Step 1: Request travels from Node 3 to Directory
        fireLinkPulse([3], '#00c8ff', 'Step 1: WRITE_REQ(0x1A3F, 100) traveling to Directory', 3000);
        setScenarioBanner('Step 1/4: Node 3 sends WRITE_REQ for 0x1A3F to Home Directory (Node 1). Request packet traveling...');
        addLocalLog('REQ', 'Step 1/4: Node 3 -> WRITE_REQ(0x1A3F, 100) sent to Home Node 1.');
      } else if (nextStep === 2) {
        // Step 2: Directory broadcasts Invalidation (INV) pulses to sharers (Nodes 1 & 2)
        fireLinkPulse([1, 2], '#f59e0b', 'Step 2: Directory broadcasting Invalidate (INV) to Sharers', 3000);
        setScenarioBanner('Step 2/4: Directory looks up Sharers [Node 1, Node 2] and broadcasts Invalidate (INV) pulses over the mesh.');
        addLocalLog('SYNC', 'Step 2/4: Directory broadcasting INV to Sharers [Node 1, Node 2].');
      } else if (nextStep === 3) {
        // Step 3: Peers acknowledge and drop to Invalid (I) - Nodes 1 & 2 flash grey
        setNodeMsiStates(prev => ({ ...prev, 1: 'Invalid', 2: 'Invalid' }));
        fireLinkPulse([1, 2], '#ef4444', 'Step 3: Peers ACK invalidation -> Dropping to Invalid', 3000);
        setScenarioBanner('Step 3/4: Node 1 and Node 2 invalidate local copies and drop to Invalid state (Grey).');
        addLocalLog('COHERENCE', 'Step 3/4: Node 1 & Node 2 caches invalidated. Local state set to INVALID.');
        setMemoryStats(prev => ({ ...prev, invalidations: prev.invalidations + 1 }));
      } else if (nextStep === 4) {
        // Step 4: Exclusivity granted -> Node 3 turns Bright Red (Modified) & Memory cell flashes yellow
        setNodeMsiStates(prev => ({ ...prev, 1: 'Invalid', 2: 'Invalid', 3: 'Modified' }));
        fireLinkPulse([3], '#ef4444', 'Step 4: Exclusivity granted -> Modified state active', 3000);
        triggerCellFlash(1, 7, '64', 'write'); // 0x1A3F = 100 (0x64 in hex)
        setScenarioBanner('Step 4/4: Node 3 promoted to MODIFIED (Bright Red). Memory cell 0x1A3F written with 0x64 (100).');
        addLocalLog('WRITE', 'Step 4/4: Node 3 is now EXCLUSIVE OWNER (Modified). Memory cell 0x1A3F updated.');
        setMemoryStats(prev => ({ ...prev, cacheMisses: prev.cacheMisses + 1, pageFaults: prev.pageFaults + 1 }));
      }
    } else {
      // 4 Steps for Read Miss Flow:
      if (nextStep === 1) {
        fireLinkPulse([2], '#00ffa3', 'Step 1: READ_REQ(0x1A3F) traveling to Directory', 3000);
        setScenarioBanner('Step 1/4: Node 2 reads 0x1A3F. Cache Miss! Page Fault trapped. Sending READ_REQ to Directory.');
        addLocalLog('REQ', 'Step 1/4: Node 2 cache miss on 0x1A3F. VEH handler sending READ_REQ to Directory.');
      } else if (nextStep === 2) {
        fireLinkPulse([1], '#00ffa3', 'Step 2: Directory fetching page from Home Memory', 3000);
        setScenarioBanner('Step 2/4: Home Node 1 fetches 4KB page from backing store and registers Node 2 in sharers list.');
        addLocalLog('MEM', 'Step 2/4: Directory fetches page 0x1A3F from backing RAM.');
      } else if (nextStep === 3) {
        fireLinkPulse([2], '#00c8ff', 'Step 3: DATA_REPLY returned to Node 2', 3000);
        setScenarioBanner('Step 3/4: Data packet returned across TCP socket to Node 2.');
        addLocalLog('GRANT', 'Step 3/4: DATA_REPLY returned to Node 2 over TCP socket.');
      } else if (nextStep === 4) {
        setNodeMsiStates(prev => ({ ...prev, 2: 'Shared' }));
        triggerCellFlash(1, 7, hexGrid[1]?.bytes[7] || '4F', 'read');
        setScenarioBanner('Step 4/4: Node 2 protection set to PAGE_READONLY. State upgraded to SHARED (Blue/Cyan).');
        addLocalLog('COHERENCE', 'Step 4/4: Node 2 mapped page as Shared (Read-Only). Cache hit recorded.');
        setMemoryStats(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
      }
    }
  };

  const addLocalLog = (tag, text) => {
    const time = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [...prev.slice(-40), { time, tag, text }]);
  };

  // Auto-play timer for step-through
  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayTimerRef.current = setInterval(() => {
        advanceStep();
      }, 2200);
    } else {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    }
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [isAutoPlaying, currentStep, stepScenarioType]);

  // ---------------------------------------------------------------------------
  // RUN COMMAND (LIVE MODE WITH PACKET TRACER ANIMATIONS)
  // ---------------------------------------------------------------------------
  const runCommand = async (cmdStr) => {
    const cleanCmd = (cmdStr || commandInput).trim();
    if (!cleanCmd) return;
    setCommandInput('');

    const parts = cleanCmd.split(' ');
    const op = parts[0].toLowerCase();

    // Handle 'clear' instantly on the frontend too
    if (op === 'clear') {
      setLogs([]);
      try {
        await fetch(`${API_BASE}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cleanCmd })
        });
      } catch (err) {}
      return;
    }

    const addr = parts[1] || '0x1A3F';
    const val = parts[2] || '100';

    // Parse address row/col
    const row = Math.min(7, Math.max(0, parseInt(addr.slice(2, 4) || '1', 16) % 8));
    const col = Math.min(15, Math.max(0, parseInt(addr.slice(4) || '7', 16) % 16));
    const hexVal = (parseInt(val, 10) & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    if (op === 'write') {
      // 1. Packet pulse on link 3 (Node 3 writing)
      fireLinkPulse([3], '#00c8ff', `Node 3 WRITE_REQ(${addr}, ${val}) -> Directory`);
      
      // 2. Pulse invalidation to sharers after 400ms
      setTimeout(() => {
        fireLinkPulse([1, 2], '#ef4444', `Directory broadcasting INV to Sharers`);
        // Color-code nodes: Node 3 turns Bright Red (Modified), Nodes 1 & 2 drop to Grey (Invalid)
        setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Modified', 4: 'Invalid' });
      }, 600);

      // 3. Highlight memory cell with flash animation
      setTimeout(() => {
        triggerCellFlash(row, col, hexVal, 'write');
      }, 1000);
    } else if (op === 'read') {
      // Packet pulse for read miss (Node 2 reading)
      fireLinkPulse([2], '#00ffa3', `Node 2 READ_REQ(${addr}) -> Directory`);
      setTimeout(() => {
        setNodeMsiStates(prev => ({ ...prev, 2: 'Shared' }));
        triggerCellFlash(row, col, hexGrid[row]?.bytes[col] || '3F', 'read');
      }, 800);
    } else if (op === 'lock') {
      fireLinkPulse([1, 2, 3, 4], '#c084fc', `Ricart-Agrawala REQUEST broadcast for ${addr}`);
    } else if (op === 'unlock') {
      fireLinkPulse([1, 3], '#00ffa3', `Lock released on ${addr} -> Sent UNLOCK_ACK`);
    }

    // Call backend API
    try {
      await fetch(`${API_BASE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cleanCmd })
      });
      fetchBackendData();
    } catch (err) {}
  };

  // Run Preset Scenarios
  const runScenario = async (key, title, desc) => {
    setActiveScenario(key);
    setScenarioBanner(`${title}: ${desc}`);

    if (key === 'msi_walkthrough') {
      setStepScenarioType('write');
      setCurrentStep(1);
      advanceStep(1);
    } else if (key === 'false_sharing') {
      fireLinkPulse([1, 2], '#f59e0b', 'False Sharing: Ping-pong invalidations on same 4KB page');
      triggerCellFlash(1, 3, 'AA', 'write');
      setTimeout(() => triggerCellFlash(1, 7, 'BB', 'write'), 1200);
    } else if (key === 'mutex_race') {
      fireLinkPulse([2, 4], '#c084fc', 'Mutex Race: Node 2 & Node 4 competing with Lamport timestamps');
    } else if (key === 'phi_failure') {
      fireLinkPulse([4], '#ef4444', 'Phi-Accrual: Heartbeat failure on Node 4 -> Eviction');
    }

    try {
      await fetch(`${API_BASE}/scenario/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: key })
      });
      fetchBackendData();
    } catch (e) {}
  };

  // Toggle Simulation State
  const toggleSimulation = async (action) => {
    setSimState(action);
    try {
      await fetch(`${API_BASE}/simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      fetchBackendData();
    } catch (e) {}
  };

  // Export Project Report
  const exportReport = () => {
    const text = `
================================================================================
       DISTRIBUTED SHARED MEMORY (DSM) SYSTEM — OS EVALUATION REPORT
================================================================================
Course Subject: Operating Systems
Date: ${new Date().toLocaleString()}
Kernel Status: ${simState.toUpperCase()}

1. CORE OS OBJECTIVES:
   - OS Virtual Memory: Intercepting page faults via VEH / mmap (4 KiB pages)
   - Coherence Protocol: Directory-Based MSI with Write-Invalidate
   - Mutual Exclusion: Ricart-Agrawala Distributed Mutex with Lamport Logical Clocks
   - Failure Detection: Phi-Accrual failure detector (Hayashibara et al.)

2. CLUSTER METRICS:
   - Shared Memory Allocated: ${memoryStats.usedMB} MB / ${memoryStats.totalMB} MB (${memoryStats.percentage}%)
   - Total Hardware Page Faults: ${memoryStats.pageFaults}
   - Cache Hits / Misses: ${memoryStats.cacheHits} / ${memoryStats.cacheMisses}
   - Hit Ratio: ${Math.round((memoryStats.cacheHits / (memoryStats.cacheHits + memoryStats.cacheMisses || 1)) * 100)}%
   - Bus Invalidation Storms (INV): ${memoryStats.invalidations}

3. CLUSTER NODES:
${nodes.map(n => `   * ${n.name} (${n.ip}): ${n.status} | Lamport Clock: #${n.lamport} | CPU: ${n.cpu} | Mem: ${n.mem}`).join('\n')}

4. ACTIVE DISTRIBUTED LOCKS:
${mutexInfo.activeLocks?.map(l => `   * Resource "${l.name}" held by ${l.owner} (Timestamp: #${l.timestamp})`).join('\n') || '   * None'}
================================================================================
    `;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DSM_OS_Project_Report_${Date.now()}.txt`;
    a.click();
  };

  const getTagColor = (tag) => {
    switch (tag) {
      case 'PAGE_FAULT':
      case 'MEM': return '#f472b6';
      case 'WRITE':
      case 'MSI_INV': return '#ef4444';
      case 'SYNC':
      case 'MUTEX_LOCK': return '#c084fc';
      case 'GRANT':
      case 'COHERENCE': return '#38bdf8';
      case 'REQ': return '#facc15';
      default: return '#00ffa3';
    }
  };

  // Helper for Node Color-Coding by MSI State (Feature 2)
  const getNodeColorConfig = (nodeId) => {
    const st = nodeMsiStates[nodeId] || 'Invalid';
    if (st === 'Modified') {
      return {
        border: '2px solid #ef4444',
        shadow: '0 0 18px rgba(239, 68, 68, 0.55)',
        bg: 'rgba(50, 10, 15, 0.95)',
        badgeBg: '#ef4444',
        badgeText: '#000000',
        badgeLabel: 'MODIFIED (Exclusive Owner)',
        dotColor: '#ef4444',
        glowPulse: true
      };
    }
    if (st === 'Shared') {
      return {
        border: '2px solid #00c8ff',
        shadow: '0 0 16px rgba(0, 200, 255, 0.45)',
        bg: 'rgba(5, 25, 40, 0.95)',
        badgeBg: '#00c8ff',
        badgeText: '#000000',
        badgeLabel: 'SHARED (Read-Only Copy)',
        dotColor: '#00c8ff',
        glowPulse: false
      };
    }
    // Invalid
    return {
      border: '1px solid #475569',
      shadow: 'none',
      bg: 'rgba(15, 23, 42, 0.75)',
      badgeBg: '#334155',
      badgeText: '#94a3b8',
      badgeLabel: 'INVALID (Stale / Unmapped)',
      dotColor: '#64748b',
      glowPulse: false
    };
  };

  return (
    <div style={{
      backgroundColor: '#020907',
      color: '#e5e7eb',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: '14px 18px',
      gap: '12px'
    }}>

      {/* ========================================================================= */}
      {/* 1. TOP HEADER: PROJECT TITLE, OBJECTIVES & CONTROLS                       */}
      {/* ========================================================================= */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(5, 20, 16, 0.95)',
        border: '1px solid #0d382b',
        borderRadius: '12px',
        padding: '12px 18px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Title & Subject */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#072e23',
            border: '1px solid #00ffa3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(0, 255, 163, 0.3)'
          }}>
            <Cpu size={22} color="#00ffa3" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.2px', margin: 0 }}>
                Distributed Shared Memory (DSM) System
              </h1>
              <span style={{
                backgroundColor: 'rgba(0, 255, 163, 0.15)',
                border: '1px solid rgba(0, 255, 163, 0.4)',
                color: '#00ffa3',
                fontSize: '10.5px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '5px'
              }}>
                Operating Systems Course Project
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#7a9e94', margin: '2px 0 0 0' }}>
              Virtual Memory Interception (VEH/mmap) • Directory MSI Write-Invalidate • Ricart-Agrawala Mutex
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{
          display: 'flex',
          backgroundColor: '#03140f',
          border: '1px solid #0d382b',
          borderRadius: '8px',
          padding: '3px',
          gap: '3px'
        }}>
          {[
            { id: 'Overview', label: 'Cluster Topology & Console' },
            { id: 'MSI', label: 'MSI Virtual Pages' },
            { id: 'Mutex', label: 'Ricart-Agrawala Mutex' }
          ].map(tab => {
            const isSel = activeHeaderTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveHeaderTab(tab.id)}
                style={{
                  backgroundColor: isSel ? '#093a2c' : 'transparent',
                  color: isSel ? '#00ffa3' : '#70968b',
                  border: isSel ? '1px solid rgba(0, 255, 163, 0.5)' : '1px solid transparent',
                  borderRadius: '6px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: isSel ? '700' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* System Status, Sim Controls & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Debug Step-Through Mode Toggle (Feature 4) */}
          <button
            onClick={() => {
              setDebugMode(!debugMode);
              if (!debugMode) {
                setCurrentStep(1);
                advanceStep(1);
              } else {
                setIsAutoPlaying(false);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: debugMode ? '#f59e0b' : '#03140f',
              color: debugMode ? '#000000' : '#d1fae5',
              border: debugMode ? '1px solid #f59e0b' : '1px solid #0d382b',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: debugMode ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none'
            }}
          >
            <SlidersHorizontal size={13} />
            <span>{debugMode ? 'Debug Step Mode: ON' : 'Live Mode'}</span>
          </button>

          <button
            onClick={exportReport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: '#072e23',
              border: '1px solid rgba(0, 255, 163, 0.4)',
              color: '#00ffa3',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <Download size={12} />
            <span>Export Report</span>
          </button>

          <span style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#658a7f',
            backgroundColor: '#03140f',
            border: '1px solid #0d382b',
            borderRadius: '6px',
            padding: '5px 8px'
          }}>
            {currentTime}
          </span>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. CISCO PACKET TRACER STYLE STEP-THROUGH DEBUG CONTROLLER (FEATURE 4)   */}
      {/* ========================================================================= */}
      {debugMode && (
        <section style={{
          backgroundColor: '#0a221a',
          border: '2px solid #f59e0b',
          borderRadius: '10px',
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 0 16px rgba(245, 158, 11, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              backgroundColor: '#f59e0b',
              color: '#000000',
              fontWeight: '800',
              padding: '3px 8px',
              borderRadius: '5px',
              fontSize: '11px'
            }}>
              PACKET TRACER DEBUG MODE
            </span>

            {/* Scenario Selector */}
            <select
              value={stepScenarioType}
              onChange={(e) => {
                setStepScenarioType(e.target.value);
                setCurrentStep(1);
                advanceStep(1);
              }}
              style={{
                backgroundColor: '#041611',
                border: '1px solid #0d4032',
                borderRadius: '5px',
                color: '#ffffff',
                fontSize: '11px',
                padding: '4px 8px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="write">Protocol Walkthrough: Write Invalidation (INV Storm)</option>
              <option value="read">Protocol Walkthrough: Read Miss (Page Fault Trap)</option>
            </select>
          </div>

          {/* Stepper Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => advanceStep(Math.max(1, currentStep - 1))}
              disabled={currentStep <= 1}
              style={{
                backgroundColor: currentStep <= 1 ? '#041611' : '#073224',
                color: currentStep <= 1 ? '#475569' : '#00ffa3',
                border: '1px solid #0d382b',
                borderRadius: '5px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: currentStep <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <ChevronLeft size={14} />
              <span>Prev Step</span>
            </button>

            {/* Step Indicators (1 to 4) */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3, 4].map(s => (
                <button
                  key={s}
                  onClick={() => advanceStep(s)}
                  style={{
                    backgroundColor: currentStep === s ? '#f59e0b' : '#03140f',
                    color: currentStep === s ? '#000000' : '#7a9e94',
                    border: currentStep === s ? '1px solid #f59e0b' : '1px solid #0d382b',
                    borderRadius: '4px',
                    width: '26px',
                    height: '24px',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => advanceStep()}
              style={{
                backgroundColor: '#f59e0b',
                color: '#000000',
                border: 'none',
                borderRadius: '5px',
                padding: '5px 14px',
                fontSize: '11.5px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              <span>Next Step ({currentStep}/4)</span>
              <ChevronRight size={14} />
            </button>

            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              style={{
                backgroundColor: isAutoPlaying ? '#ef4444' : '#072e23',
                color: isAutoPlaying ? '#ffffff' : '#00ffa3',
                border: '1px solid rgba(0, 255, 163, 0.4)',
                borderRadius: '5px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isAutoPlaying ? <Pause size={12} fill="#ffffff" /> : <Play size={12} fill="#00ffa3" />}
              <span>{isAutoPlaying ? 'Pause Auto' : 'Auto-Play (2s)'}</span>
            </button>

            <button
              onClick={() => {
                setCurrentStep(1);
                advanceStep(1);
              }}
              style={{
                backgroundColor: '#041611',
                border: '1px solid #0d382b',
                color: '#7a9e94',
                borderRadius: '5px',
                padding: '5px 8px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Reset simulation step"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </section>
      )}

      {/* QUICK 1-CLICK ACADEMIC DEMO SCENARIOS BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: '#041410',
        border: '1px solid #0d382b',
        borderRadius: '8px',
        padding: '6px 14px',
        fontSize: '11px'
      }}>
        <span style={{ color: '#00ffa3', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Zap size={13} />
          <span>Course Demo Scenarios:</span>
        </span>
        {[
          { id: 'msi_walkthrough', label: '1. MSI Cache Coherence Flow', color: '#00ffa3' },
          { id: 'false_sharing', label: '2. False Sharing Thrashing', color: '#f472b6' },
          { id: 'mutex_race', label: '3. Ricart-Agrawala Mutex Race', color: '#c084fc' },
          { id: 'phi_failure', label: '4. Phi-Accrual Failure Detection', color: '#f59e0b' }
        ].map(demo => (
          <button
            key={demo.id}
            onClick={() => runScenario(demo.id, demo.label, 'Simulating distributed memory operations in real-time...')}
            style={{
              backgroundColor: activeScenario === demo.id ? demo.color : '#072e23',
              color: activeScenario === demo.id ? '#000000' : '#ffffff',
              border: `1px solid ${demo.color}66`,
              borderRadius: '5px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '11px',
              transition: 'all 0.15s ease'
            }}
          >
            {demo.label}
          </button>
        ))}
      </div>

      {/* DYNAMIC SCENARIO / STEP BANNER */}
      {scenarioBanner && (
        <div style={{
          backgroundColor: '#073224',
          border: '1px solid #00ffa3',
          borderRadius: '8px',
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#ffffff',
          boxShadow: '0 0 12px rgba(0, 255, 163, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={16} color="#00ffa3" />
            <span style={{ fontWeight: '600' }}>{scenarioBanner}</span>
          </div>
          <button
            onClick={() => setScenarioBanner('')}
            style={{ background: 'none', border: 'none', color: '#70968b', cursor: 'pointer', fontSize: '11px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MAIN VIEW 1: NETWORK TOPOLOGY (PACKET PULSES & COLOR NODES) & CONSOLE  */}
      {/* ========================================================================= */}
      {activeHeaderTab === 'Overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>

          {/* TOP SECTION: NETWORK TOPOLOGY (LEFT) & CONSOLE / LOGS (RIGHT) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.45fr 1fr',
            gap: '12px'
          }}>

            {/* ------------------------------------------------------------- */}
            {/* THE NETWORK TOPOLOGY: CISCO PACKET TRACER ANIMATIONS (1 & 2)  */}
            {/* ------------------------------------------------------------- */}
            <div style={{
              backgroundColor: 'rgba(5, 20, 16, 0.95)',
              border: '1px solid #0d382b',
              borderRadius: '12px',
              padding: '14px 16px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '380px'
            }}>
              {/* Header & Dynamic Pulse Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff' }}>
                      Network Topology & Packet Flow
                    </span>
                    {activeLinkPulse.label && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: activeLinkPulse.color,
                        backgroundColor: `${activeLinkPulse.color}22`,
                        border: `1px solid ${activeLinkPulse.color}66`,
                        padding: '1px 7px',
                        borderRadius: '4px'
                      }}>
                        ⚡ {activeLinkPulse.label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#658a7f', marginTop: '2px' }}>
                    Active Page Target: <strong style={{ color: '#00ffa3' }}>Page #{targetPageId} ({targetAddr})</strong> • Nodes Color-Coded by Cache State
                  </div>
                </div>

                {/* Packet Tracer Style Legend */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />
                    <span style={{ color: '#fca5a5', fontWeight: '600' }}>Modified (M)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
                    <span style={{ color: '#bae6fd', fontWeight: '600' }}>Shared (S)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
                    <span style={{ color: '#94a3b8', fontWeight: '600' }}>Invalid (I)</span>
                  </div>
                </div>
              </div>

              {/* Animated SVG Visualization Container (Feature 1: Packet Pulses) */}
              <div style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '10px 0'
              }}>
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }}
                  viewBox="0 0 600 300"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#00ffa3" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#00ffa3" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00ffa3" stopOpacity="0.4" />
                      <stop offset="50%" stopColor="#00c8ff" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#00ffa3" stopOpacity="0.4" />
                    </linearGradient>

                    {/* Vector Paths for Traveling Packet Envelopes */}
                    <path id="pathN1toCenter" d="M 120 70 Q 210 95 300 150" />
                    <path id="pathCentertoN1" d="M 300 150 Q 210 95 120 70" />

                    <path id="pathN2toCenter" d="M 480 70 Q 390 95 300 150" />
                    <path id="pathCentertoN2" d="M 300 150 Q 390 95 480 70" />

                    <path id="pathN3toCenter" d="M 120 230 Q 210 205 300 150" />
                    <path id="pathCentertoN3" d="M 300 150 Q 210 205 120 230" />

                    <path id="pathN4toCenter" d="M 480 230 Q 390 205 300 150" />
                    <path id="pathCentertoN4" d="M 300 150 Q 390 205 480 230" />

                    <path id="pathN1toN2" d="M 120 70 L 480 70" />
                    <path id="pathN3toN4" d="M 120 230 L 480 230" />
                    <path id="pathN1toN3" d="M 120 70 L 120 230" />
                    <path id="pathN2toN4" d="M 480 70 L 480 230" />
                  </defs>

                  {/* Outer Orbital Orbit Ring */}
                  <ellipse cx="300" cy="150" rx="200" ry="95" fill="none" stroke="url(#orbitGrad)" strokeWidth="1" strokeDasharray="5 5" opacity="0.4" />

                  {/* Mesh Inter-Node Connection Lines */}
                  <line x1="120" y1="70" x2="480" y2="70" stroke="rgba(13, 64, 49, 0.6)" strokeWidth="1.2" strokeDasharray="3 3" />
                  <line x1="120" y1="230" x2="480" y2="230" stroke="rgba(13, 64, 49, 0.6)" strokeWidth="1.2" strokeDasharray="3 3" />
                  <line x1="120" y1="70" x2="120" y2="230" stroke="rgba(13, 64, 49, 0.6)" strokeWidth="1.2" strokeDasharray="3 3" />
                  <line x1="480" y1="70" x2="480" y2="230" stroke="rgba(13, 64, 49, 0.6)" strokeWidth="1.2" strokeDasharray="3 3" />

                  {/* ------------------------------------------------------- */}
                  {/* DYNAMIC TOPOLOGY CONNECTION LINES (GLOW ON PACKET PULSE) */}
                  {/* ------------------------------------------------------- */}
                  {/* Link 1: Node 1 <-> Center */}
                  <path
                    d="M 120 70 Q 210 95 300 150"
                    fill="none"
                    stroke={activeLinkPulse.n1 ? activeLinkPulse.color : 'rgba(0, 255, 163, 0.35)'}
                    strokeWidth={activeLinkPulse.n1 ? '3.5' : '1.5'}
                    style={{
                      transition: 'stroke 0.3s, stroke-width 0.3s',
                      filter: activeLinkPulse.n1 ? `drop-shadow(0 0 8px ${activeLinkPulse.color})` : 'none'
                    }}
                  />

                  {/* Link 2: Node 2 <-> Center */}
                  <path
                    d="M 480 70 Q 390 95 300 150"
                    fill="none"
                    stroke={activeLinkPulse.n2 ? activeLinkPulse.color : 'rgba(0, 200, 255, 0.35)'}
                    strokeWidth={activeLinkPulse.n2 ? '3.5' : '1.5'}
                    style={{
                      transition: 'stroke 0.3s, stroke-width 0.3s',
                      filter: activeLinkPulse.n2 ? `drop-shadow(0 0 8px ${activeLinkPulse.color})` : 'none'
                    }}
                  />

                  {/* Link 3: Node 3 <-> Center */}
                  <path
                    d="M 120 230 Q 210 205 300 150"
                    fill="none"
                    stroke={activeLinkPulse.n3 ? activeLinkPulse.color : 'rgba(255, 183, 3, 0.35)'}
                    strokeWidth={activeLinkPulse.n3 ? '3.5' : '1.5'}
                    style={{
                      transition: 'stroke 0.3s, stroke-width 0.3s',
                      filter: activeLinkPulse.n3 ? `drop-shadow(0 0 8px ${activeLinkPulse.color})` : 'none'
                    }}
                  />

                  {/* Link 4: Node 4 <-> Center */}
                  <path
                    d="M 480 230 Q 390 205 300 150"
                    fill="none"
                    stroke={activeLinkPulse.n4 ? activeLinkPulse.color : 'rgba(0, 255, 163, 0.35)'}
                    strokeWidth={activeLinkPulse.n4 ? '3.5' : '1.5'}
                    style={{
                      transition: 'stroke 0.3s, stroke-width 0.3s',
                      filter: activeLinkPulse.n4 ? `drop-shadow(0 0 8px ${activeLinkPulse.color})` : 'none'
                    }}
                  />

                  {/* Central Hub Glow & Pulsing Core */}
                  <circle cx="300" cy="150" r="62" fill="url(#centerGlow)" />
                  <circle cx="300" cy="150" r="42" fill="#041b15" stroke="#00ffa3" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85" />
                  <circle cx="300" cy="150" r="32" fill="#072c21" stroke="rgba(0, 255, 163, 0.6)" strokeWidth="1" />

                  {/* ------------------------------------------------------- */}
                  {/* PACKET PULSE ENVELOPE / TRAVELING GLOWING DOTS          */}
                  {/* ------------------------------------------------------- */}
                  {/* Active Pulse for Node 1 */}
                  {activeLinkPulse.n1 ? (
                    <circle r="5" fill={activeLinkPulse.color} filter={`drop-shadow(0 0 8px ${activeLinkPulse.color})`}>
                      <animateMotion dur="1.2s" repeatCount="indefinite">
                        <mpath href="#pathCentertoN1" />
                      </animateMotion>
                    </circle>
                  ) : (
                    <circle r="3.5" fill="#00ffa3" opacity="0.6">
                      <animateMotion dur="3.5s" repeatCount="indefinite">
                        <mpath href="#pathN1toCenter" />
                      </animateMotion>
                    </circle>
                  )}

                  {/* Active Pulse for Node 2 */}
                  {activeLinkPulse.n2 ? (
                    <circle r="5" fill={activeLinkPulse.color} filter={`drop-shadow(0 0 8px ${activeLinkPulse.color})`}>
                      <animateMotion dur="1.2s" repeatCount="indefinite">
                        <mpath href="#pathCentertoN2" />
                      </animateMotion>
                    </circle>
                  ) : (
                    <circle r="3" fill="#00c8ff" opacity="0.6">
                      <animateMotion dur="4s" repeatCount="indefinite">
                        <mpath href="#pathN2toCenter" />
                      </animateMotion>
                    </circle>
                  )}

                  {/* Active Pulse for Node 3 */}
                  {activeLinkPulse.n3 ? (
                    <circle r="5.5" fill={activeLinkPulse.color} filter={`drop-shadow(0 0 10px ${activeLinkPulse.color})`}>
                      <animateMotion dur="1.1s" repeatCount="indefinite">
                        <mpath href="#pathN3toCenter" />
                      </animateMotion>
                    </circle>
                  ) : (
                    <circle r="3" fill="#ffb703" opacity="0.6">
                      <animateMotion dur="3.2s" repeatCount="indefinite">
                        <mpath href="#pathN3toCenter" />
                      </animateMotion>
                    </circle>
                  )}

                  {/* Active Pulse for Node 4 */}
                  {activeLinkPulse.n4 ? (
                    <circle r="5" fill={activeLinkPulse.color} filter={`drop-shadow(0 0 8px ${activeLinkPulse.color})`}>
                      <animateMotion dur="1.2s" repeatCount="indefinite">
                        <mpath href="#pathCentertoN4" />
                      </animateMotion>
                    </circle>
                  ) : (
                    <circle r="3.5" fill="#00ffa3" opacity="0.6">
                      <animateMotion dur="3.8s" repeatCount="indefinite">
                        <mpath href="#pathN4toCenter" />
                      </animateMotion>
                    </circle>
                  )}
                </svg>

                {/* Central DSM Shared Memory Hub Label */}
                <div style={{
                  position: 'absolute',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  zIndex: 5
                }}>
                  <Database size={18} color="#00ffa3" style={{ margin: '0 auto 2px auto', display: 'block' }} />
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#ffffff' }}>DSM Directory</div>
                  <div style={{ fontSize: '9px', color: '#00ffa3', fontFamily: 'monospace' }}>Home Node 1</div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* 4 CONNECTED NODE CARDS (COLOR-CODED BY MSI STATE: FEATURE 2) */}
                {/* ------------------------------------------------------------- */}
                {[
                  { node: nodes[0], id: 1, pos: { top: '8px', left: '10px' } },
                  { node: nodes[1], id: 2, pos: { top: '8px', right: '10px' } },
                  { node: nodes[2], id: 3, pos: { bottom: '8px', left: '10px' } },
                  { node: nodes[3], id: 4, pos: { bottom: '8px', right: '10px' } }
                ].map(({ node, id, pos }) => {
                  const cfg = getNodeColorConfig(id);
                  const st = nodeMsiStates[id] || 'Invalid';
                  return (
                    <div
                      key={id}
                      onClick={() => runCommand(`write ${targetAddr} 100`)}
                      title={`Node ${id}: Click to simulate write request for ${targetAddr}`}
                      style={{
                        position: 'absolute',
                        ...pos,
                        backgroundColor: cfg.bg,
                        border: cfg.border,
                        borderRadius: '8px',
                        padding: '7px 10px',
                        width: '142px',
                        boxShadow: cfg.shadow,
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Server size={12} color={cfg.dotColor} />
                          <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#ffffff' }}>{node?.name}</span>
                        </div>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: cfg.dotColor,
                          boxShadow: cfg.glowPulse ? `0 0 8px ${cfg.dotColor}` : 'none'
                        }} />
                      </div>

                      {/* MSI State Pill Badge (The Packet Tracer Way) */}
                      <div style={{
                        marginTop: '3px',
                        marginBottom: '3px',
                        backgroundColor: cfg.badgeBg,
                        color: cfg.badgeText,
                        fontSize: '9px',
                        fontWeight: '800',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        textAlign: 'center',
                        letterSpacing: '0.3px'
                      }}>
                        {cfg.badgeLabel}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#7a9e94', borderTop: '1px solid rgba(13, 56, 43, 0.4)', paddingTop: '3px' }}>
                        <span>Clock: #{node?.lamport}</span>
                        <span>CPU: {node?.cpu}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Quick Trigger Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid rgba(13, 56, 43, 0.5)',
                fontSize: '11px'
              }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => runCommand('write 0x1A3F 100')}
                    style={{
                      backgroundColor: '#ef4444',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontWeight: '800',
                      fontSize: '10.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Flame size={12} fill="#000000" />
                    <span>Trigger Write (Node 3 Writes 100)</span>
                  </button>
                  <button
                    onClick={() => runCommand('read 0x1A3F')}
                    style={{
                      backgroundColor: '#072e23',
                      border: '1px solid rgba(0, 200, 255, 0.5)',
                      color: '#00c8ff',
                      borderRadius: '5px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: '10.5px'
                    }}
                  >
                    Trigger Read (Node 2 Read Miss)
                  </button>
                </div>

                <span style={{ color: '#7a9e94', fontSize: '10.5px' }}>
                  Watch Node 3 turn <strong>Red (M)</strong> and Sharers turn <strong>Grey (I)</strong>
                </span>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CONSOLE / SYSTEM LOGS & INTERACTIVE COMMAND RUNNER           */}
            {/* ------------------------------------------------------------- */}
            <div style={{
              backgroundColor: 'rgba(5, 20, 16, 0.95)',
              border: '1px solid #0d382b',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '380px'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={15} color="#00ffa3" />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                    Console / System Logs
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#05261d',
                  border: '1px solid rgba(0, 255, 163, 0.3)',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  color: '#00ffa3',
                  fontWeight: '600'
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#00ffa3' }} />
                  <span>Live</span>
                </div>
              </div>

              {/* Quick Operation Buttons */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                marginBottom: '8px'
              }}>
                {[
                  { label: 'Read 0x1A3F', cmd: 'read 0x1A3F' },
                  { label: 'Write 0x1A3F 100', cmd: 'write 0x1A3F 100' },
                  { label: 'Lock 0x1A3F', cmd: 'lock 0x1A3F' },
                  { label: 'Unlock', cmd: 'unlock 0x1A3F' },
                  { label: 'Alloc 64M', cmd: 'allocate 64' },
                  { label: 'Clear', cmd: 'clear' }
                ].map(op => (
                  <button
                    key={op.cmd}
                    onClick={() => runCommand(op.cmd)}
                    style={{
                      backgroundColor: '#041a14',
                      border: '1px solid #0d382b',
                      color: '#d1fae5',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#00ffa3'; e.currentTarget.style.color = '#00ffa3'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#0d382b'; e.currentTarget.style.color = '#d1fae5'; }}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              {/* Live Log Area (Internal Scroll Only) */}
              <div 
                ref={logContainerRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                  fontSize: '10.5px',
                  lineHeight: '1.45',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  padding: '8px',
                  backgroundColor: '#010604',
                  border: '1px solid #0d382b',
                  borderRadius: '6px',
                  maxHeight: '230px',
                  minHeight: '190px'
                }}
              >
                {logs.map((item, idx) => (
                  <div key={idx} style={{ color: '#d1d5db' }}>
                    <span style={{ color: '#4d7367', marginRight: '6px' }}>[{item.time}]</span>
                    <span style={{ color: getTagColor(item.tag), marginRight: '6px', fontWeight: '700' }}>
                      [{item.tag}]
                    </span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Command Prompt Input */}
              <form
                onSubmit={(e) => { e.preventDefault(); runCommand(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#020d0a',
                  border: '1px solid #00ffa3',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  marginTop: '8px'
                }}
              >
                <span style={{ color: '#00ffa3', fontSize: '11px', marginRight: '6px', fontWeight: '800' }}>&gt;</span>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Type: 'write 0x1A3F 100', 'read 0x1A3F', 'lock 0x1A3F'..."
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontFamily: "'JetBrains Mono', Consolas, monospace"
                  }}
                />
                <button type="submit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00ffa3' }}>
                  <Send size={12} />
                </button>
              </form>
            </div>

          </div>

          {/* ------------------------------------------------------------- */}
          {/* BOTTOM SECTION: MEMORY MATRIX (CELL FLASH) | MSI | MUTEX     */}
          {/* ------------------------------------------------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            gap: '12px'
          }}>

            {/* CARD 1: DISTRIBUTED SHARED MEMORY (FEATURE 3: CELL FLASH HIGHLIGHT) */}
            <div style={{
              backgroundColor: 'rgba(5, 20, 16, 0.95)',
              border: '1px solid #0d382b',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>Memory View (Hex Grid)</div>
                  <div style={{ fontSize: '10px', color: '#658a7f' }}>Click any cell to issue kernel write and watch it flash!</div>
                </div>
                <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700' }}>
                  Target: 0x1A3F (Row 1, Col 7)
                </div>
              </div>

              {/* Hex Table with Cell Pulse Highlight */}
              <div style={{
                backgroundColor: '#010604',
                border: '1px solid #0d382b',
                borderRadius: '6px',
                padding: '8px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                overflowX: 'auto'
              }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ color: '#4b7064', textAlign: 'center', borderBottom: '1px solid #0d382b' }}>
                      <th style={{ textAlign: 'left', paddingBottom: '3px' }}>Addr</th>
                      {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'].map(h => (
                        <th key={h} style={{ padding: '0 2px 3px 2px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hexGrid.slice(0, 6).map((row, rIdx) => (
                      <tr key={row.addr}>
                        <td style={{ color: '#5b8277', paddingRight: '4px' }}>{row.addr}</td>
                        {row.bytes.map((byte, cIdx) => {
                          const isFlashing = flashingCell && flashingCell.row === rIdx && flashingCell.col === cIdx;
                          const isHighlighted = (rIdx === 1 && cIdx === 7); // 0x1A3F default
                          return (
                            <td
                              key={cIdx}
                              onClick={() => {
                                runCommand(`write ${row.addr} 100`);
                                triggerCellFlash(rIdx, cIdx, '64', 'write');
                              }}
                              title={`Address: ${row.addr}:${cIdx} = 0x${byte} (Click to Write)`}
                              style={{
                                textAlign: 'center',
                                padding: '1px 2px',
                                cursor: 'pointer',
                                backgroundColor: isFlashing ? '#f59e0b' : (isHighlighted ? 'rgba(0, 255, 163, 0.25)' : 'transparent'),
                                color: isFlashing ? '#000000' : (isHighlighted ? '#00ffa3' : '#d1fae5'),
                                fontWeight: isFlashing || isHighlighted ? '800' : '500',
                                borderRadius: '2px',
                                boxShadow: isFlashing ? '0 0 16px #f59e0b' : (isHighlighted ? '0 0 6px #00ffa3' : 'none'),
                                transform: isFlashing ? 'scale(1.2)' : 'scale(1)',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                              }}
                            >
                              {isFlashing ? flashingCell.val : byte}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Usage Progress Bar */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#7a9e94', marginBottom: '3px' }}>
                  <span>Backing Store: {memoryStats.usedMB} MB / {memoryStats.totalMB} MB</span>
                  <span style={{ color: '#f472b6' }}>Page Faults: {memoryStats.pageFaults}</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#03140f', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ width: `${memoryStats.percentage}%`, height: '100%', backgroundColor: '#00ffa3', boxShadow: '0 0 8px #00ffa3' }} />
                </div>
              </div>
            </div>

            {/* CARD 2: MSI PROTOCOL STATE & CACHE STATS */}
            <div style={{
              backgroundColor: 'rgba(5, 20, 16, 0.95)',
              border: '1px solid #0d382b',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>MSI Cache Coherence</div>
                  <span style={{ fontSize: '10px', color: '#7a9e94' }}>Write-Invalidate</span>
                </div>

                {/* 3 State Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ backgroundColor: '#211018', border: '1px solid #ef4444', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#ef4444' }}>Modified (M)</div>
                    <div style={{ fontSize: '8.5px', color: '#9ca3af' }}>Bright Red Card</div>
                  </div>
                  <div style={{ backgroundColor: '#06202b', border: '1px solid #00c8ff', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#00c8ff' }}>Shared (S)</div>
                    <div style={{ fontSize: '8.5px', color: '#9ca3af' }}>Cyan Blue Card</div>
                  </div>
                  <div style={{ backgroundColor: '#111827', border: '1px solid #64748b', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8' }}>Invalid (I)</div>
                    <div style={{ fontSize: '8.5px', color: '#64748b' }}>Dimmed Grey Card</div>
                  </div>
                </div>

                {/* Sample Page State Breakdown */}
                <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {msiPages.slice(0, 3).map(p => (
                    <div key={p.pageId} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#03140f',
                      padding: '3px 6px',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontFamily: 'monospace', color: '#ffffff' }}>Page #{p.pageId} ({p.addrHex})</span>
                      <span style={{
                        color: p.dirState === 'Modified' ? '#ef4444' : (p.dirState === 'Shared' ? '#00c8ff' : '#94a3b8'),
                        fontWeight: '700'
                      }}>
                        {p.dirState}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cache Stats */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px solid rgba(13, 56, 43, 0.4)',
                fontSize: '10px'
              }}>
                <span style={{ color: '#00ffa3' }}>Hits: {memoryStats.cacheHits}</span>
                <span style={{ color: '#f59e0b' }}>Misses: {memoryStats.cacheMisses}</span>
                <span style={{ color: '#ef4444' }}>Bus Inval: {memoryStats.invalidations}</span>
              </div>
            </div>

            {/* CARD 3: RICART-AGRAWALA MUTEX & LOCK STATUS */}
            <div style={{
              backgroundColor: 'rgba(5, 20, 16, 0.95)',
              border: '1px solid #0d382b',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>Distributed Mutex</div>
                  <span style={{ fontSize: '10px', color: '#c084fc', fontWeight: '600' }}>Ricart-Agrawala</span>
                </div>

                {/* Active Lock Card */}
                {mutexInfo.activeLocks?.length > 0 ? (
                  <div style={{
                    backgroundColor: '#073224',
                    border: '1px solid #00ffa3',
                    borderRadius: '6px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px'
                  }}>
                    <Lock size={16} color="#00ffa3" />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff' }}>
                        Locked: "{mutexInfo.activeLocks[0].name}"
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#88aba1' }}>
                        Held by {mutexInfo.activeLocks[0].owner} (Lamport TS: #{mutexInfo.activeLocks[0].timestamp})
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#03140f',
                    border: '1px dashed #0d382b',
                    borderRadius: '6px',
                    padding: '8px',
                    textAlign: 'center',
                    color: '#658a7f',
                    fontSize: '11px',
                    marginBottom: '8px'
                  }}>
                    Critical Section Idle
                  </div>
                )}

                {/* 4 Lamport Clocks Preview */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center' }}>
                  {nodes.map(n => (
                    <div key={n.id} style={{ backgroundColor: '#03140f', padding: '4px', borderRadius: '4px', border: '1px solid #0d382b' }}>
                      <div style={{ fontSize: '8.5px', color: '#7a9e94' }}>{n.name.split(' ')[0]}</div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#00ffa3', fontFamily: 'monospace' }}>
                        #{n.lamport}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px', paddingTop: '6px', borderTop: '1px solid rgba(13, 56, 43, 0.4)' }}>
                <button
                  onClick={() => runCommand('lock 0x1A3F')}
                  style={{
                    flex: 1,
                    backgroundColor: '#00ffa3',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 0',
                    fontSize: '10px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Acquire Lock
                </button>
                <button
                  onClick={() => runCommand('unlock 0x1A3F')}
                  style={{
                    flex: 1,
                    backgroundColor: '#072e23',
                    border: '1px solid rgba(0, 255, 163, 0.4)',
                    color: '#00ffa3',
                    borderRadius: '4px',
                    padding: '4px 0',
                    fontSize: '10px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Release
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MAIN VIEW 2: FULL MSI VIRTUAL MEMORY DIRECTORY MATRIX                  */}
      {/* ========================================================================= */}
      {activeHeaderTab === 'MSI' && (
        <div style={{
          backgroundColor: 'rgba(5, 20, 16, 0.95)',
          border: '1px solid #0d382b',
          borderRadius: '12px',
          padding: '16px',
          flex: 1
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#ffffff' }}>
                Virtual Page Directory & Cache States (16 Sample 4 KiB Pages)
              </div>
              <div style={{ fontSize: '11px', color: '#7a9e94' }}>
                Home Node 0 (127.0.0.1:7000) stores directory ownership records
              </div>
            </div>
            <button
              onClick={() => runCommand('write 0x1000 42')}
              style={{
                backgroundColor: '#00ffa3',
                color: '#000000',
                fontWeight: '700',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Simulate Write Invalidation Storm
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ color: '#5b8277', textAlign: 'left', borderBottom: '1px solid #0d382b' }}>
                <th style={{ padding: '8px' }}>Page ID</th>
                <th style={{ padding: '8px' }}>Virtual Address</th>
                <th style={{ padding: '8px' }}>Home Directory State</th>
                <th style={{ padding: '8px' }}>Node 1</th>
                <th style={{ padding: '8px' }}>Node 2</th>
                <th style={{ padding: '8px' }}>Node 3</th>
                <th style={{ padding: '8px' }}>Node 4</th>
                <th style={{ padding: '8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {msiPages.map(page => (
                <tr key={page.pageId} style={{ borderBottom: '1px solid rgba(13, 56, 43, 0.3)' }}>
                  <td style={{ padding: '8px', color: '#00ffa3', fontWeight: '700' }}>#{page.pageId}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace', color: '#ffffff' }}>{page.addrHex}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: page.dirState === 'Modified' ? '#073224' : (page.dirState === 'Shared' ? '#072430' : '#23141d'),
                      color: page.dirState === 'Modified' ? '#ef4444' : (page.dirState === 'Shared' ? '#00c8ff' : '#94a3b8')
                    }}>
                      {page.dirState}
                    </span>
                  </td>
                  {[1, 2, 3, 4].map(nid => {
                    const st = page.nodeStates[nid] || 'Invalid';
                    return (
                      <td key={nid} style={{ padding: '8px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '600',
                          color: st === 'Modified' ? '#ef4444' : (st === 'Shared' ? '#00c8ff' : '#6b7280')
                        }}>
                          {st}
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => runCommand(`read ${page.addrHex}`)}
                      style={{
                        backgroundColor: '#072e23',
                        border: '1px solid rgba(0, 200, 255, 0.4)',
                        color: '#00c8ff',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      Read
                    </button>
                    <button
                      onClick={() => runCommand(`write ${page.addrHex} 42`)}
                      style={{
                        backgroundColor: '#072e23',
                        border: '1px solid rgba(0, 255, 163, 0.4)',
                        color: '#00ffa3',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      Write
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MAIN VIEW 3: RICART-AGRAWALA MUTEX & ACADEMIC THEORY                  */}
      {/* ========================================================================= */}
      {activeHeaderTab === 'Mutex' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1 }}>
          {/* Algorithm Rules */}
          <div style={{
            backgroundColor: 'rgba(5, 20, 16, 0.95)',
            border: '1px solid #0d382b',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#00ffa3', marginBottom: '8px' }}>
              Ricart-Agrawala Mutual Exclusion Algorithm
            </div>
            <div style={{ fontSize: '12px', color: '#88aba1', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong style={{ color: '#00ffa3' }}>1. Requesting CS:</strong> A node increments its Lamport clock <code>L = L + 1</code> and broadcasts <code>REQUEST(L, id)</code> to all other <code>N - 1</code> nodes.
              </div>
              <div>
                <strong style={{ color: '#00c8ff' }}>2. Receiving Request:</strong> If the receiver is in CS or also wants CS with a lower timestamp <code>(L_local, id_local) &lt; (L_req, id_req)</code>, it defers its reply. Otherwise, it sends <code>REPLY</code> immediately.
              </div>
              <div>
                <strong style={{ color: '#f59e0b' }}>3. Entry & Release:</strong> The requesting node enters the critical section once it receives <code>N - 1</code> replies. Upon exit, it sends replies to all nodes in its deferred queue.
              </div>
            </div>
          </div>

          {/* Waiter Queues & Lamport Tracker */}
          <div style={{
            backgroundColor: 'rgba(5, 20, 16, 0.95)',
            border: '1px solid #0d382b',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '800', color: '#ffffff' }}>
              Cluster Waiter Queue & Clocks
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {nodes.map(n => {
                const waiters = mutexInfo.deferred?.[n.name] || [];
                return (
                  <div key={n.id} style={{
                    backgroundColor: '#03140f',
                    border: '1px solid #0d382b',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>{n.name}</div>
                      <div style={{ fontSize: '10px', color: waiters.length > 0 ? '#f59e0b' : '#6e968b' }}>
                        {waiters.length > 0 ? `Deferred: [${waiters.join(', ')}]` : 'No deferred waiters'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '9px', color: '#7a9e94' }}>Lamport Clock</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#00ffa3', fontFamily: 'monospace' }}>
                        #{n.lamport}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
