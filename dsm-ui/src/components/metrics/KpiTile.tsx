import React from 'react';
import { MemoryStats, MetricsData, MutexState } from '../../lib/types';
import { Sparkline } from './Sparkline';

interface KpiStripProps {
  memoryStats: MemoryStats;
  metrics: MetricsData;
  mutexState: MutexState;
}

export function KpiStrip({ memoryStats, metrics, mutexState }: KpiStripProps) {
  const totalLookups = memoryStats.cacheHits + memoryStats.cacheMisses || 1;
  const hitRatio = Math.round((memoryStats.cacheHits / totalLookups) * 100);
  const activeLockCount = mutexState.activeLocks?.length || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
      {/* 1. Hit Ratio */}
      <div className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block">
            Cache Hit Ratio
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl sm:text-[28px] font-medium tracking-tight text-text tabular-nums">
              {hitRatio}%
            </span>
          </div>
          <span className="text-xs text-text-3 block mt-0.5 tabular-nums">
            {memoryStats.cacheHits} hits / {memoryStats.cacheMisses} misses
          </span>
        </div>
        <div className="mt-3">
          <Sparkline data={metrics.read.slice(-6)} color="var(--ok)" />
        </div>
      </div>

      {/* 2. Page Faults */}
      <div className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block">
            Hardware Faults
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl sm:text-[28px] font-medium tracking-tight text-text tabular-nums">
              {memoryStats.pageFaults}
            </span>
          </div>
          <span className="text-xs text-text-3 block mt-0.5">
            Kernel SIGSEGV / VEH traps
          </span>
        </div>
        <div className="mt-3">
          <Sparkline data={[12, 14, 15, 17, 18, memoryStats.pageFaults]} color="var(--warn)" />
        </div>
      </div>

      {/* 3. Invalidation Storms */}
      <div className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block">
            Bus Invalidations
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl sm:text-[28px] font-medium tracking-tight text-text tabular-nums">
              {memoryStats.invalidations}
            </span>
          </div>
          <span className="text-xs text-text-3 block mt-0.5">
            MSI write-invalidate broadcasts
          </span>
        </div>
        <div className="mt-3">
          <Sparkline data={metrics.write.slice(-6)} color="var(--state-m)" />
        </div>
      </div>

      {/* 4. Shared Memory Backing Store */}
      <div className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block">
            Backing Memory
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl sm:text-[28px] font-medium tracking-tight text-text tabular-nums">
              {memoryStats.usedMB} <span className="text-sm font-normal text-text-3">/ {memoryStats.totalMB} MB</span>
            </span>
          </div>
          <span className="text-xs text-text-3 block mt-0.5 tabular-nums">
            {memoryStats.percentage}% physical committed
          </span>
        </div>
        {/* Memory Bar */}
        <div className="mt-3">
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden border border-border">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                memoryStats.percentage > 80 ? 'bg-warn' : 'bg-text-2'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, memoryStats.percentage))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 5. Active Mutex Locks */}
      <div className="p-4 rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between col-span-2 md:col-span-1">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block">
            Distributed Locks
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl sm:text-[28px] font-medium tracking-tight text-text tabular-nums">
              {activeLockCount}
            </span>
          </div>
          <span className="text-xs text-text-3 block mt-0.5">
            Ricart-Agrawala critical section
          </span>
        </div>
        <div className="mt-3">
          <Sparkline data={metrics.sync.slice(-6)} color="var(--sync)" />
        </div>
      </div>
    </div>
  );
}
