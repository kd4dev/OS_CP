import React, { useEffect, useCallback } from 'react';
import { useSimStore, ViewType } from './store/sim';
import { useClusterData } from './hooks/useClusterData';
import { useSequencer } from './hooks/useSequencer';
import { AppShell } from './components/shell/AppShell';
import { OverviewView } from './views/Overview';
import { CoherenceView } from './views/Coherence';
import { SynchronizationView } from './views/Synchronization';
import { sendCommand, runScenarioApi } from './lib/api';

export default function App() {
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

    const parts = cleanCmd.split(' ');
    const op = parts[0].toLowerCase();
    const addr = parts[1] || '0x1A3F';
    const val = parts[2] || '100';

    const row = Math.min(7, Math.max(0, parseInt(addr.slice(2, 4) || '1', 16) % 8));
    const col = Math.min(15, Math.max(0, parseInt(addr.slice(4) || '7', 16) % 16));
    const hexVal = (parseInt(val, 10) & 0xFF).toString(16).toUpperCase().padStart(2, '0');

    if (op === 'write') {
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
      fireLinkPulse([1, 2, 3, 4], 'var(--sync)', `Ricart-Agrawala REQUEST broadcast for ${addr}`);
    } else if (op === 'unlock') {
      fireLinkPulse([1, 3], 'var(--ok)', `Lock released on ${addr} -> Sent UNLOCK_ACK`);
    }

    try {
      await sendCommand(cleanCmd);
      refetchAll();
    } catch (e) {}
  }, [fireLinkPulse, sequencer, setNodeMsiStates, triggerCellFlash, refetchAll]);

  // Run Scenarios
  const handleRunScenario = useCallback(async (key: string, title: string, desc: string) => {
    setActiveScenario(key);
    setScenarioBanner(`${title}: ${desc}`);

    if (key === 'msi_walkthrough') {
      setStepMode(true);
      setStepScenarioType('write');
      setCurrentStep(1);
      handleAdvanceStep(1);
    } else if (key === 'false_sharing') {
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
      fireLinkPulse([2, 4], 'var(--sync)', 'Mutex Race: Node 2 & Node 4 competing with Lamport timestamps');
    } else if (key === 'phi_failure') {
      fireLinkPulse([4], 'var(--state-m)', 'Phi-Accrual: Heartbeat failure on Node 4 -> Eviction');
    }

    try {
      await runScenarioApi(key);
      refetchAll();
    } catch (e) {}
  }, [setActiveScenario, setScenarioBanner, setStepMode, setStepScenarioType, setCurrentStep, handleAdvanceStep, fireLinkPulse, triggerCellFlash, sequencer, refetchAll]);

  // Node Click -> issues write from node
  const handleNodeClick = useCallback((nodeId: number) => {
    handleSendCommand(`write ${targetAddr} 100`);
  }, [handleSendCommand, targetAddr]);

  // Cell Click -> issues write to cell
  const handleCellClick = useCallback((row: number, col: number, addr: string) => {
    handleSendCommand(`write ${addr} 100`);
  }, [handleSendCommand]);

  return (
    <AppShell onRunScenario={handleRunScenario}>
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
