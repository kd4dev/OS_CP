import React from 'react';
import { useClusterData } from '../hooks/useClusterData';
import { KpiStrip } from '../components/metrics/KpiTile';
import { Topology } from '../components/topology/Topology';
import { LogPanel } from '../components/console/LogPanel';
import { HexGrid } from '../components/memory/HexGrid';
import { PageDirectoryCard } from '../components/coherence/PageDirectoryCard';
import { ThroughputChart } from '../components/metrics/ThroughputChart';
import { StepPanel } from '../components/stepper/StepPanel';

interface OverviewViewProps {
  onNodeClick: (nodeId: number) => void;
  onCellClick: (row: number, col: number, addr: string) => void;
  onSendCommand: (cmd: string) => void;
  onClearLogs: () => void;
  onAdvanceStep: (step: number) => void;
}

export function OverviewView({
  onNodeClick,
  onCellClick,
  onSendCommand,
  onClearLogs,
  onAdvanceStep,
}: OverviewViewProps) {
  const { nodes, memoryStats, hexGrid, logs, metrics, msiPages, mutexState, isOffline } = useClusterData();

  return (
    <div className="space-y-6">
      {/* 1. KPI Strip */}
      <KpiStrip memoryStats={memoryStats} metrics={metrics} mutexState={mutexState} />

      {/* 2. Step Mode Docked Stepper (if enabled) */}
      <StepPanel onAdvanceStep={onAdvanceStep} />

      {/* 3. Topology + Inspector Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <Topology nodes={nodes} onNodeClick={onNodeClick} />
        </div>
        <div className="lg:col-span-4">
          <LogPanel
            logs={logs}
            onSendCommand={onSendCommand}
            onClearLogs={onClearLogs}
            isOffline={isOffline}
          />
        </div>
      </div>

      {/* 4. Hex Memory Grid + Page Directory Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <HexGrid
            grid={hexGrid}
            memoryStats={memoryStats}
            onCellClick={onCellClick}
          />
        </div>
        <div className="lg:col-span-5">
          <PageDirectoryCard pages={msiPages} />
        </div>
      </div>

      {/* 5. Throughput Chart */}
      <ThroughputChart metrics={metrics} />
    </div>
  );
}
