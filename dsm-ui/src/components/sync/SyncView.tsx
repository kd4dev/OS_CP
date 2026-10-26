import React from 'react';
import { ClusterNode, MutexState } from '../../lib/types';
import { Key, Clock, ShieldCheck, AlertTriangle, UserCheck, ArrowRight } from 'lucide-react';

interface SyncViewProps {
  nodes: ClusterNode[];
  mutexState: MutexState;
  onRunPhiDemo: () => void;
}

export function SyncView({ nodes, mutexState, onRunPhiDemo }: SyncViewProps) {
  return (
    <div className="space-y-6">
      {/* 1. Lamport Logical Clocks */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-text-3" />
          <h2 className="text-sm font-semibold text-text tracking-tight">
            Lamport Logical Clocks (C_i := max(C_i, C_msg) + 1)
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text">{node.name}</span>
                <span className="font-mono text-[11px] text-text-3">{node.ip}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[11px] font-mono text-text-3">Clock:</span>
                <span className="font-mono text-3xl font-semibold text-sync tabular-nums">
                  #{node.lamport}
                </span>
              </div>
              <span className="text-[11px] text-text-3 font-mono mt-2 block">
                Total Order Tiebreak: ID {node.id}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Ricart-Agrawala Distributed Mutex Snapshot & Swimlanes */}
      <div className="rounded-xl bg-surface-1 border border-border card-highlight p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-semibold text-text tracking-tight">
              Ricart-Agrawala Distributed Mutual Exclusion
            </h2>
            <p className="text-xs text-text-3 mt-0.5">
              Requires 2(N - 1) message complexity. Nodes grant immediate REPLY unless currently holding or waiting with lower timestamp.
            </p>
          </div>

          <span className="font-mono text-xs px-2.5 py-1 rounded bg-surface-2 border border-border text-sync font-medium">
            Active CS: {mutexState.activeLocks?.length || 0}
          </span>
        </div>

        {/* Mutex Swimlane Snapshot */}
        <div className="space-y-3 font-mono text-xs">
          <span className="text-[11px] uppercase tracking-wider text-text-3 block">
            Node Arbitration Lanes
          </span>

          <div className="space-y-2">
            {nodes.map((node) => {
              const holdingLock = mutexState.activeLocks?.find((l) => l.owner.includes(node.name) || l.owner === `Node ${node.id}`);
              const waitingInQueue = mutexState.queue?.find((q) => q.node.includes(node.name) || q.node === `Node ${node.id}`);
              const deferredTo = mutexState.deferred?.[node.name] || mutexState.deferred?.[`Node ${node.id}`] || [];

              return (
                <div
                  key={node.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-surface-2/40 border border-border gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-16 font-semibold text-text">{node.name}</span>
                    <span className="text-text-3 text-[11px]">#{node.lamport}</span>
                  </div>

                  {/* Status chip */}
                  <div className="flex items-center gap-2">
                    {holdingLock ? (
                      <span className="px-2.5 py-1 rounded bg-sync/15 text-sync border border-sync/30 font-semibold flex items-center gap-1.5">
                        <Key className="w-3 h-3" />
                        Holding Critical Section ("{holdingLock.name}")
                      </span>
                    ) : waitingInQueue ? (
                      <span className="px-2.5 py-1 rounded bg-warn/15 text-warn border border-warn/30 font-medium">
                        Waiting in Request Queue (ts={waitingInQueue.timestamp})
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-surface-3 text-text-3 border border-border">
                        Idle (Auto-Replies to Cluster)
                      </span>
                    )}

                    {/* Deferred Replies Indicator */}
                    {deferredTo.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-state-m/15 text-state-m border border-state-m/30">
                        Deferred to: {deferredTo.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lock Table & Deferred Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          {/* Active Locks Table */}
          <div className="border border-border rounded-lg overflow-hidden bg-surface-2/20">
            <div className="px-4 py-2 border-b border-border bg-surface-2/60 text-xs font-semibold text-text">
              Active Resource Leases
            </div>
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-text-3 border-b border-border text-[11px]">
                <tr>
                  <th scope="col" className="px-3 py-1.5 font-normal">RESOURCE</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">HOLDER</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {mutexState.activeLocks?.length > 0 ? (
                  mutexState.activeLocks.map((l, i) => (
                    <tr key={i} className="hover:bg-surface-2/40">
                      <td className="px-3 py-2 text-info font-medium">{l.name}</td>
                      <td className="px-3 py-2 text-sync font-semibold">{l.owner}</td>
                      <td className="px-3 py-2 text-text-3">#{l.timestamp}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-center text-text-3 italic">
                      No active critical sections.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Request Queue Table */}
          <div className="border border-border rounded-lg overflow-hidden bg-surface-2/20">
            <div className="px-4 py-2 border-b border-border bg-surface-2/60 text-xs font-semibold text-text">
              Pending Wait Queue (Ordered by Lamport TS)
            </div>
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-text-3 border-b border-border text-[11px]">
                <tr>
                  <th scope="col" className="px-3 py-1.5 font-normal">WAITING NODE</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">TIMESTAMP</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">TARGET RESOURCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {mutexState.queue?.length > 0 ? (
                  mutexState.queue.map((q, i) => (
                    <tr key={i} className="hover:bg-surface-2/40">
                      <td className="px-3 py-2 text-text font-medium">{q.node}</td>
                      <td className="px-3 py-2 text-warn font-semibold">#{q.timestamp}</td>
                      <td className="px-3 py-2 text-text-3">{q.lockName}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-center text-text-3 italic">
                      Wait queue is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Phi-Accrual Failure Detector */}
      <div className="rounded-xl bg-surface-1 border border-border card-highlight p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-semibold text-text tracking-tight">
              Phi-Accrual Failure Detector (Hayashibara et al.)
            </h2>
            <p className="text-xs text-text-3 mt-0.5">
              Continuously outputs suspicion metric φ = -log10(P_later(t - t_last)). Thresholds: <strong className="text-warn">φ &ge; 8.0 (Suspected)</strong>, <strong className="text-state-m">φ &ge; 16.0 (Declared Dead & Evicted)</strong>.
            </p>
          </div>

          <button
            onClick={onRunPhiDemo}
            className="px-3 py-1 text-xs rounded-md bg-surface-2 hover:bg-surface-3 border border-border text-warn font-medium transition-colors cursor-pointer"
          >
            Simulate Node 4 Partition
          </button>
        </div>

        {/* Gauges per node */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const phi = node.phi || 0.1;
            const isSuspected = phi >= 8.0 && phi < 16.0;
            const isDead = phi >= 16.0 || node.status === 'Offline';

            let gaugeColor = 'bg-ok';
            let statusText = 'Healthy';
            let badgeStyle = 'bg-ok/15 text-ok border-ok/30';

            if (isDead) {
              gaugeColor = 'bg-state-m';
              statusText = 'Dead / Evicted';
              badgeStyle = 'bg-state-m/15 text-state-m border-state-m/30';
            } else if (isSuspected) {
              gaugeColor = 'bg-warn';
              statusText = 'Suspected';
              badgeStyle = 'bg-warn/15 text-warn border-warn/30';
            }

            const gaugePercent = Math.min(100, (phi / 20.0) * 100);

            return (
              <div
                key={node.id}
                className="p-4 rounded-lg bg-surface-2/40 border border-border space-y-3 font-mono text-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-text">{node.name}</span>
                    <span className="text-text-3 text-[11px] block">{node.ip}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeStyle}`}>
                    {statusText}
                  </span>
                </div>

                {/* Meter with threshold ticks at 8 and 16 */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-text-3">
                    <span>φ = {phi.toFixed(2)}</span>
                    <span>Max: 20.0</span>
                  </div>
                  <div className="relative w-full h-3 bg-surface-2 rounded-full overflow-hidden border border-border">
                    {/* Tick at 8 (40%) */}
                    <div className="absolute left-[40%] top-0 bottom-0 w-0.5 bg-warn/80 z-10" title="Threshold 8.0: Suspected" />
                    {/* Tick at 16 (80%) */}
                    <div className="absolute left-[80%] top-0 bottom-0 w-0.5 bg-state-m/80 z-10" title="Threshold 16.0: Dead" />

                    <div
                      className={`h-full rounded-full transition-all duration-300 ${gaugeColor}`}
                      style={{ width: `${gaugePercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[10px] text-text-3 pt-0.5">
                  <span>0.0 (Normal)</span>
                  <span className="text-warn">8.0 (Suspect)</span>
                  <span className="text-state-m">16.0 (Dead)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
