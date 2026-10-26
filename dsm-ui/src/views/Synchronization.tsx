import React from 'react';
import { useClusterData } from '../hooks/useClusterData';
import { SyncView } from '../components/sync/SyncView';

interface SynchronizationViewProps {
  onRunPhiDemo: () => void;
}

export function SynchronizationView({ onRunPhiDemo }: SynchronizationViewProps) {
  const { nodes, mutexState } = useClusterData();

  return (
    <SyncView
      nodes={nodes}
      mutexState={mutexState}
      onRunPhiDemo={onRunPhiDemo}
    />
  );
}
