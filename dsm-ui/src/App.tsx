import React, { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSimStore, ViewType } from './store/sim';
import { useClusterData } from './hooks/useClusterData';
import { useSequencer } from './hooks/useSequencer';
import { AppShell } from './components/shell/AppShell';
import { OverviewView } from './views/Overview';
import { CoherenceView } from './views/Coherence';
import { SynchronizationView } from './views/Synchronization';
import { sendCommand, runScenarioApi } from './lib/api';

export default function App() {
  const queryClient = useQueryClient();
  const activeView = useSimStore((s) => s.activeView);
  const setActiveView = useSimStore((s) => s.setActiveView);
  const targetAddr = useSimStore((s) => s.targetAddr);
  const fireLinkPulse = useSimStore((s) => s.fireLinkPulse);
  const triggerCellFlash = useSimStore((s) => s.triggerCellFlash);
  const setNodeMsiStates = useSimStore((s) => s.setNodeMsiStates);
  const setStepMode = useSimStore((s) => s.setStepMode);
  const setStepScenarioType = useSimStore((s) => s.setStepScenarioType);
  const setCurrentStep = useSimStore((s) => s.setCurrentStep);
  const addStepEvent = useSimStore((s) => s.addStepEvent);
  const setScenarioBanner = useSimStore((s) => s.setScenarioBanner);
  const setActiveScenario = useSimStore((s) => s.setActiveScenario);
  const stepScenarioType = useSimStore((s) => s.stepScenarioType);

  const { refetchAll } = useClusterData();
  const sequencer = useSequencer();

  // Hash-based view sync (#/overview, #/coherence, #/sync)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#/', '').toLowerCase();
      if (['overview', 'coherence', 'sync'].includes(hash)) {
        setActiveView(hash as ViewType);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [setActiveView]);

  // Step advancement logic
  const handleAdvanceStep = useCallback((step: number) => {
    if (stepScenarioType === 'write') {
      if (step === 1) {
        fireLinkPulse([3], 'var(--info)', 'Step 1: Node 3 WRITE_REQ -> Directory');
        addStepEvent({
          from: 'Node 3',
          to: 'Directory',
          message: 'WRITE_REQ(0x1A3F)',
          result: 'Write fault queued at Home Directory',
        });
        setNodeMsiStates({ 1: 'Shared', 2: 'Shared', 3: 'Invalid', 4: 'Invalid' });
      } else if (step === 2) {
        fireLinkPulse([1, 2], 'var(--state-m)', 'Step 2: Directory broadcasting INV to Sharers');
        addStepEvent({
          from: 'Directory',
          to: 'Node 1, Node 2',
          message: 'INV(Page 1)',
          result: 'Sharers drop permissions to Invalid',
        });
        setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Invalid', 4: 'Invalid' });
      } else if (step === 3) {
        fireLinkPulse([1, 2], 'var(--ok)', 'Step 3: Sharers returning INV_ACK to Directory');
        addStepEvent({
          from: 'Node 1, Node 2',
          to: 'Directory',
          message: 'INV_ACK',
          result: 'Directory confirms clean invalidation',
        });
        setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Invalid', 4: 'Invalid' });
      } else if (step === 4) {
        fireLinkPulse([3], 'var(--ok)', 'Step 4: Directory grants Modified ownership to Node 3');
        addStepEvent({
          from: 'Directory',
          to: 'Node 3',
          message: 'WRITE_GRANT (Modified)',
          result: 'Node 3 exclusive owner; memory cell 0x1A3F updated',
        });
        setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Modified', 4: 'Invalid' });
        triggerCellFlash(1, 7, '64', 'write');
      }
    } else {
      // Read scenario
      if (step === 1) {
        fireLinkPulse([2], 'var(--info)', 'Step 1: Node 2 READ_REQ -> Directory');
        addStepEvent({
          from: 'Node 2',
          to: 'Directory',
          message: 'READ_REQ(0x1A3F)',
          result: 'Read miss trapped at Home Directory',
        });
      } else if (step === 2) {
        fireLinkPulse([1], 'var(--warn)', 'Step 2: Directory directory table lookup');
        addStepEvent({
          from: 'Directory',
          to: 'Directory',
          message: 'DIR_LOOKUP',
          result: 'Owner is Node 3 (Modified)',
        });
      } else if (step === 3) {
        fireLinkPulse([3], 'var(--info)', 'Step 3: Directory fetches dirty block from Node 3');
        addStepEvent({
          from: 'Directory',
          to: 'Node 3',
          message: 'DOWNGRADE_REQ',
          result: 'Node 3 downgrades Modified -> Shared',
        });
        setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Shared', 4: 'Invalid' });
      } else if (step === 4) {
        fireLinkPulse([2, 3], 'var(--ok)', 'Step 4: Data returned to Node 2 with read permission');
        addStepEvent({
          from: 'Node 3 / Dir',
          to: 'Node 2',
          message: 'DATA_REPLY (Shared)',
          result: 'Sharers: [Node 2, Node 3] in Shared state',
        });
        setNodeMsiStates({ 1: 'Invalid', 2: 'Shared', 3: 'Shared', 4: 'Invalid' });
        triggerCellFlash(1, 7, '3F', 'read');
      }
    }
  }, [stepScenarioType, fireLinkPulse, addStepEvent, setNodeMsiStates, triggerCellFlash]);

  // Execute Commands
  const handleSendCommand = useCallback(async (cmdStr: string) => {
    const cleanCmd = cmdStr.trim();
    if (!cleanCmd) return;

    const parts = cleanCmd.split(/\s+/);
    const op = parts[0].toLowerCase();
    const addr = parts[1] || '0x1A3F';
    const val = parts[2] || '100';

    let parsedAddr = parseInt(addr, 16);
    if (isNaN(parsedAddr)) parsedAddr = 0x1A3F;

    let row: number, col: number;
    if (addr.toLowerCase().includes('1a3f')) {
      row = 1;
      col = 7;
    } else {
      row = Math.min(7, Math.max(0, Math.floor((parsedAddr % 128) / 16)));
      col = Math.min(15, Math.max(0, parsedAddr % 16));
    }
    const hexVal = (parseInt(val, 10) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    const pageId = Math.min(15, Math.max(0, Math.floor(parsedAddr / 4096)));
    const nowTime = new Date().toTimeString().split(' ')[0];

    if (op === 'clear') {
      queryClient.setQueryData(['logs'], { logs: [] });
    } else if (op === 'write') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'WRITE', text: `Node 3 writing ${val} (0x${hexVal}) to ${addr} (Row ${row}, Col ${col}, Page ${pageId})` },
          { time: nowTime, tag: 'SYNC', text: `Directory broadcasting Invalidate (INV) to Sharers for Page ${pageId}` },
          { time: nowTime, tag: 'UPDATE', text: `Memory address ${addr} committed (State: Modified by Node 3)` },
        ].slice(-200),
      }));

      queryClient.setQueryData(['memory'], (prev: any) => {
        if (!prev?.grid) return prev;
        const newGrid = prev.grid.map((r: any, rIdx: number) => {
          if (rIdx !== row) return r;
          const newBytes = [...r.bytes];
          newBytes[col] = hexVal;
          return { ...r, bytes: newBytes };
        });
        return {
          ...prev,
          grid: newGrid,
          memoryStats: {
            ...prev.memoryStats,
            invalidations: (prev.memoryStats?.invalidations || 0) + 1,
            cacheMisses: (prev.memoryStats?.cacheMisses || 0) + 1,
          },
        };
      });

      queryClient.setQueryData(['status'], (prev: any) => {
        if (!prev?.msiPages) return prev;
        const newPages = prev.msiPages.map((p: any, idx: number) => {
          if (idx !== pageId) return p;
          return {
            ...p,
            dirState: 'Modified',
            owner: 3,
            sharers: [3],
            nodeStates: { ...p.nodeStates, 1: 'Invalid', 2: 'Invalid', 3: 'Modified', 4: 'Invalid' },
            version: (p.version || 1) + 1,
          };
        });
        return {
          ...prev,
          msiPages: newPages,
          highlightedCells: [
            { row, col, type: 'solid' },
            { row: 1, col: 7, type: 'outline' },
          ],
        };
      });

      fireLinkPulse([3], 'var(--info)', `Node 3 WRITE_REQ(${addr}, ${val}) -> Directory`);
      sequencer.play([
        {
          at: 600,
          run: () => {
            fireLinkPulse([1, 2], 'var(--state-m)', 'Directory broadcasting INV to Sharers');
            setNodeMsiStates({ 1: 'Invalid', 2: 'Invalid', 3: 'Modified', 4: 'Invalid' });
          },
        },
        {
          at: 1100,
          run: () => {
            triggerCellFlash(row, col, hexVal, 'write');
          },
        },
      ]);
    } else if (op === 'read') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'REQ', text: `Node 2 requesting read on address ${addr} (Page ${pageId})` },
          { time: nowTime, tag: 'GRANT', text: `Access granted (State: Shared, Page ${pageId})` },
        ].slice(-200),
      }));

      queryClient.setQueryData(['status'], (prev: any) => {
        if (!prev?.msiPages) return prev;
        const newPages = prev.msiPages.map((p: any, idx: number) => {
          if (idx !== pageId) return p;
          const sharers = p.sharers.includes(2) ? p.sharers : [...p.sharers, 2];
          return {
            ...p,
            dirState: p.dirState === 'Invalid' ? 'Shared' : p.dirState,
            sharers,
            nodeStates: { ...p.nodeStates, 2: 'Shared' },
          };
        });
        return {
          ...prev,
          msiPages: newPages,
          memoryStats: {
            ...prev.memoryStats,
            cacheHits: (prev.memoryStats?.cacheHits || 0) + 1,
          },
        };
      });

      fireLinkPulse([2], 'var(--ok)', `Node 2 READ_REQ(${addr}) -> Directory`);
      sequencer.play([
        {
          at: 800,
          run: () => {
            setNodeMsiStates((prev) => ({ ...prev, 2: 'Shared' }));
            triggerCellFlash(row, col, '3F', 'read');
          },
        },
      ]);
    } else if (op === 'lock') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'SYNC', text: `Acquiring distributed Ricart-Agrawala lock for ${addr}...` },
          { time: nowTime, tag: 'GRANT', text: `Lock acquired on ${addr} by Node 1` },
        ].slice(-200),
      }));

      queryClient.setQueryData(['status'], (prev: any) => {
        if (!prev?.mutexState) return prev;
        const exists = prev.mutexState.activeLocks?.some((l: any) => l.name === addr);
        if (exists) return prev;
        return {
          ...prev,
          mutexState: {
            ...prev.mutexState,
            activeLocks: [...(prev.mutexState.activeLocks || []), { name: addr, owner: 'Node 1', timestamp: 14, grantedAt: Date.now() }],
          },
        };
      });

      fireLinkPulse([1, 2, 3, 4], 'var(--sync)', `Ricart-Agrawala REQUEST broadcast for ${addr}`);
    } else if (op === 'unlock') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'SYNC', text: `Distributed lock on ${addr} released. Sent broadcast UNLOCK_ACK to cluster.` },
        ].slice(-200),
      }));

      queryClient.setQueryData(['status'], (prev: any) => {
        if (!prev?.mutexState) return prev;
        return {
          ...prev,
          mutexState: {
            ...prev.mutexState,
            activeLocks: (prev.mutexState.activeLocks || []).filter((l: any) => l.name !== addr),
          },
        };
      });

      fireLinkPulse([1, 3], 'var(--ok)', `Lock released on ${addr} -> Sent UNLOCK_ACK`);
    } else if (op === 'allocate') {
      const size = parseInt(parts[1] || '64', 10);
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'MEM', text: `Allocated ${size} MB shared region via mmap/VirtualAlloc at 0x10000000` },
        ].slice(-200),
      }));
      queryClient.setQueryData(['memory'], (prev: any) => {
        if (!prev?.memoryStats) return prev;
        const usedMB = Math.min(prev.memoryStats.totalMB, Math.round((prev.memoryStats.usedMB + size / 4) * 10) / 10);
        return {
          ...prev,
          memoryStats: {
            ...prev.memoryStats,
            usedMB,
            percentage: Math.round((usedMB / prev.memoryStats.totalMB) * 100),
          },
        };
      });
    } else if (op === 'show') {
      const sub = (parts[1] || '').toLowerCase();
      let msg = 'Usage: show [memory|nodes|logs]';
      if (sub === 'memory') msg = 'DSM Memory: 64 MB total (MSI Coherent Directory)';
      else if (sub === 'nodes') msg = 'Active Cluster Nodes: 4 online, Ricart-Agrawala & Phi-Accrual active';
      else if (sub === 'logs') msg = 'Ring buffer active with event logging';
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'INFO', text: msg },
        ].slice(-200),
      }));
    } else {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'CMD', text: `> ${cleanCmd}` },
          { time: nowTime, tag: 'INFO', text: `Executed custom command: ${cleanCmd}` },
        ].slice(-200),
      }));
    }

    try {
      await sendCommand(cleanCmd);
      refetchAll();
    } catch (e) {}
  }, [fireLinkPulse, sequencer, setNodeMsiStates, triggerCellFlash, refetchAll, queryClient]);

  // Run Scenarios
  const handleRunScenario = useCallback(async (key: string, title: string, desc: string) => {
    setActiveScenario(key);
    setScenarioBanner(`${title}: ${desc}`);
    const nowTime = new Date().toTimeString().split(' ')[0];

    if (key === 'msi_walkthrough') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'INFO', text: '=== [ACADEMIC DEMO 1] MSI Cache Coherence Walkthrough ===' },
          { time: nowTime, tag: 'REQ', text: 'Step 1: Node 1 reads Page 0 (0x0000). Cache miss! Fetching from Directory.' },
        ].slice(-200),
      }));
      setStepMode(true);
      setStepScenarioType('write');
      setCurrentStep(1);
      handleAdvanceStep(1);
    } else if (key === 'false_sharing') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'INFO', text: '=== [ACADEMIC DEMO 2] False Sharing Demonstration ===' },
          { time: nowTime, tag: 'MEM', text: 'Page 2 (0x2000): Node 1 writes var_A at offset 0, Node 2 writes var_B at offset 4.' },
          { time: nowTime, tag: 'WRITE', text: 'Node 1 writes 0xAA -> Page 2 becomes Modified by Node 1.' },
          { time: nowTime, tag: 'WARN', text: 'Ping-pong invalidations on same 4KB cache page detected!' },
        ].slice(-200),
      }));
      fireLinkPulse([1, 2], 'var(--warn)', 'False Sharing: Ping-pong invalidations on same 4KB page');
      triggerCellFlash(1, 3, 'AA', 'write');
      sequencer.play([
        {
          at: 1200,
          run: () => {
            triggerCellFlash(1, 7, 'BB', 'write');
          },
        },
      ]);
    } else if (key === 'mutex_race') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'INFO', text: '=== [ACADEMIC DEMO 3] Ricart-Agrawala Mutex Contention ===' },
          { time: nowTime, tag: 'SYNC', text: 'Nodes 2 and 4 simultaneously request critical section "shared_counter".' },
          { time: nowTime, tag: 'SYNC', text: 'Node 2 broadcasts REQUEST(T=18). Node 4 broadcasts REQUEST(T=23).' },
          { time: nowTime, tag: 'GRANT', text: 'Node 2 wins arbitration! Node 4 defers reply.' },
        ].slice(-200),
      }));
      fireLinkPulse([2, 4], 'var(--sync)', 'Mutex Race: Node 2 & Node 4 competing with Lamport timestamps');
    } else if (key === 'phi_failure') {
      queryClient.setQueryData(['logs'], (prev: any) => ({
        logs: [
          ...(prev?.logs || []),
          { time: nowTime, tag: 'INFO', text: '=== [ACADEMIC DEMO 4] Phi-Accrual Failure Detector ===' },
          { time: nowTime, tag: 'WARN', text: 'Simulating network partition on Node 4...' },
          { time: nowTime, tag: 'WARN', text: 'Heartbeat missed. Phi suspicion metric rising: phi = 8.7 (threshold = 8.0).' },
        ].slice(-200),
      }));
      fireLinkPulse([4], 'var(--state-m)', 'Phi-Accrual: Heartbeat failure on Node 4 -> Eviction');
    }

    try {
      await runScenarioApi(key);
      refetchAll();
    } catch (e) {}
  }, [setActiveScenario, setScenarioBanner, setStepMode, setStepScenarioType, setCurrentStep, handleAdvanceStep, fireLinkPulse, triggerCellFlash, sequencer, refetchAll, queryClient]);

  // Node Click -> issues write from node
  const handleNodeClick = useCallback((nodeId: number) => {
    handleSendCommand(`write ${targetAddr} 100`);
  }, [handleSendCommand, targetAddr]);

  // Cell Click -> issues write to cell
  const handleCellClick = useCallback((row: number, col: number, addr: string) => {
    handleSendCommand(`write ${addr} 100`);
  }, [handleSendCommand]);

  return (
    <AppShell onRunScenario={handleRunScenario} onSendCommand={handleSendCommand}>
      {activeView === 'overview' && (
        <OverviewView
          onNodeClick={handleNodeClick}
          onCellClick={handleCellClick}
          onSendCommand={handleSendCommand}
          onClearLogs={() => handleSendCommand('clear')}
          onAdvanceStep={handleAdvanceStep}
        />
      )}
      {activeView === 'coherence' && <CoherenceView />}
      {activeView === 'sync' && (
        <SynchronizationView
          onRunPhiDemo={() =>
            handleRunScenario(
              'phi_failure',
              'Phi-Accrual Failure Detector',
              'Simulated heartbeat drop triggers threshold-based eviction'
            )
          }
        />
      )}
    </AppShell>
  );
}
