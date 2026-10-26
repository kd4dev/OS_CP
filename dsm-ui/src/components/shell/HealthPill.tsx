import React from 'react';
import { ClusterNode } from '../../lib/types';
import { useSimStore } from '../../store/sim';

interface HealthPillProps {
  nodes: ClusterNode[];
  isOffline: boolean;
}

export function HealthPill({ nodes, isOffline }: HealthPillProps) {
  const setActiveView = useSimStore((s) => s.setActiveView);
  const onlineCount = nodes.filter((n) => n.status === 'Online').length;
  const suspected = nodes.find((n) => n.phi > 8 && n.status !== 'Offline');
  const failed = nodes.find((n) => n.status === 'Offline');

  let statusColor = 'bg-ok text-ok';
  let dotColor = 'bg-ok';
  let label = `${onlineCount}/${nodes.length} online`;

  if (isOffline) {
    statusColor = 'bg-warn/15 text-warn border-warn/30';
    dotColor = 'bg-warn';
    label = 'Demo data (Offline)';
  } else if (failed) {
    statusColor = 'bg-state-m/15 text-state-m border-state-m/30';
    dotColor = 'bg-state-m';
    label = `${failed.name} failed`;
  } else if (suspected) {
    statusColor = 'bg-warn/15 text-warn border-warn/30';
    dotColor = 'bg-warn animate-pulse';
    label = `${suspected.name} suspected (φ=${suspected.phi.toFixed(1)})`;
  } else {
    statusColor = 'bg-ok/10 text-ok border-ok/25';
  }

  return (
    <button
      onClick={() => setActiveView('sync')}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:brightness-110 cursor-pointer ${statusColor}`}
      title="Cluster health — Click to view failure detector & synchronization"
      aria-label={`Cluster status: ${label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="font-mono tabular-nums">{label}</span>
    </button>
  );
}
