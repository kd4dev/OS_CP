import React, { useState } from 'react';
import { MetricsData } from '../../lib/types';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface ThroughputChartProps {
  metrics: MetricsData;
}

export function ThroughputChart({ metrics }: ThroughputChartProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showRead, setShowRead] = useState(true);
  const [showWrite, setShowWrite] = useState(true);
  const [showSync, setShowSync] = useState(true);

  // Format data for recharts
  const chartData = metrics.labels.map((label, idx) => ({
    time: label,
    read: metrics.read[idx] || 0,
    write: metrics.write[idx] || 0,
    sync: metrics.sync[idx] || 0,
  }));

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-text-3" />
          <h2 className="text-sm font-semibold text-text tracking-tight">
            Cluster Memory Bus Throughput
          </h2>
          <span className="font-mono text-xs text-text-3 px-2 py-0.5 rounded bg-surface-2 border border-border">
            Operations / sec (/api/metrics)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Series toggle chips */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setShowRead(!showRead)}
              className={`px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                showRead ? 'bg-ok/15 text-ok border-ok/30 font-semibold' : 'bg-surface-2 text-text-3 border-border opacity-50'
              }`}
            >
              ● Read Ops
            </button>
            <button
              onClick={() => setShowWrite(!showWrite)}
              className={`px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                showWrite ? 'bg-state-m/15 text-state-m border-state-m/30 font-semibold' : 'bg-surface-2 text-text-3 border-border opacity-50'
              }`}
            >
              ● Write Ops
            </button>
            <button
              onClick={() => setShowSync(!showSync)}
              className={`px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                showSync ? 'bg-sync/15 text-sync border-sync/30 font-semibold' : 'bg-surface-2 text-text-3 border-border opacity-50'
              }`}
            >
              ● Sync Ops
            </button>
          </div>

          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-text-3 hover:text-text bg-surface-2 border border-border transition-colors cursor-pointer"
            title={collapsed ? 'Expand chart' : 'Collapse chart'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      {!collapsed && (
        <div className="p-4 h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--ok)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--ok)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="writeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--state-m)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--state-m)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="syncGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--sync)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--sync)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
              <XAxis dataKey="time" stroke="var(--text-3)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} />
              <YAxis stroke="var(--text-3)" fontSize={11} fontFamily="var(--font-mono)" tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface-1)',
                  borderColor: 'var(--border-strong)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                }}
              />

              {showRead && (
                <Area
                  type="monotone"
                  dataKey="read"
                  name="Read Ops"
                  stroke="var(--ok)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#readGrad)"
                />
              )}
              {showWrite && (
                <Area
                  type="monotone"
                  dataKey="write"
                  name="Write Ops"
                  stroke="var(--state-m)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#writeGrad)"
                />
              )}
              {showSync && (
                <Area
                  type="monotone"
                  dataKey="sync"
                  name="Sync Ops"
                  stroke="var(--sync)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#syncGrad)"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
