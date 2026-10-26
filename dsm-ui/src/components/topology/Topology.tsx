import React, { useState } from 'react';
import { ClusterNode, MsiState } from '../../lib/types';
import { useSimStore } from '../../store/sim';
import { motion, AnimatePresence } from 'motion/react';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

interface TopologyProps {
  nodes: ClusterNode[];
  onNodeClick: (nodeId: number) => void;
}

export function Topology({ nodes, onNodeClick }: TopologyProps) {
  const targetPageId = useSimStore((s) => s.targetPageId);
  const targetAddr = useSimStore((s) => s.targetAddr);
  const nodeMsiStates = useSimStore((s) => s.nodeMsiStates);
  const activeLinkPulse = useSimStore((s) => s.activeLinkPulse);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Hover state for interactive tooltips
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Geometry: SVG 800 x 500
  const center = { x: 400, y: 250 };
  const nodeCoords: Record<number, { x: number; y: number }> = {
    1: { x: 150, y: 110 },
    2: { x: 650, y: 110 },
    3: { x: 150, y: 390 },
    4: { x: 650, y: 390 },
  };

  const getStateMeta = (state: MsiState) => {
    switch (state) {
      case 'Modified':
        return { letter: 'M', label: 'Modified', color: 'var(--state-m)', bg: 'bg-state-m/15', text: 'text-state-m', border: 'border-state-m/40' };
      case 'Shared':
        return { letter: 'S', label: 'Shared', color: 'var(--state-s)', bg: 'bg-state-s/15', text: 'text-state-s', border: 'border-state-s/40' };
      default:
        return { letter: 'I', label: 'Invalid', color: 'var(--state-i)', bg: 'bg-state-i/15', text: 'text-state-i', border: 'border-state-i/40' };
    }
  };

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text tracking-tight">
            Cluster Topology
          </h2>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 border border-border text-text-3">
            Target: Page #{targetPageId} · {targetAddr}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-2 border border-border">
            <span className="w-2 h-2 rounded-full bg-state-m" />
            <span className="font-mono text-[11px] text-text-2 font-medium">M Modified</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-2 border border-border">
            <span className="w-2 h-2 rounded-full bg-state-s" />
            <span className="font-mono text-[11px] text-text-2 font-medium">S Shared</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-2 border border-border">
            <span className="w-2 h-2 rounded-full bg-state-i" />
            <span className="font-mono text-[11px] text-text-2 font-medium">I Invalid</span>
          </div>
        </div>
      </div>

      {/* In-Flight Message Alert Strip */}
      <div className="h-7 px-5 flex items-center justify-between bg-surface-2/60 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2">
          {activeLinkPulse.label ? (
            <>
              <span
                className="w-2 h-2 rounded-full animate-ping shrink-0"
                style={{ backgroundColor: activeLinkPulse.color }}
              />
              <span className="font-mono text-[11px] font-medium text-text truncate">
                {activeLinkPulse.label}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-text-3 font-mono">
              Bus Idle · 4 nodes coherent over TCP
            </span>
          )}
        </div>
        <span className="text-[11px] text-text-3 hidden sm:inline">
          Click any node to issue write to {targetAddr}
        </span>
      </div>

      {/* Topology Canvas */}
      <div className="relative w-full h-[380px] sm:h-[430px] topology-dot-grid overflow-hidden flex items-center justify-center p-2">
        <svg
          viewBox="0 0 800 500"
          className="w-full h-full max-h-[440px] select-none"
          role="img"
          aria-label="Cluster topology diagram with 4 nodes and central directory hub"
        >
          <defs>
            {/* Packet trail gradient */}
            <linearGradient id="packetTrail" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--info)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--info)" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Links to Hub */}
          {[1, 2, 3, 4].map((id) => {
            const node = nodeCoords[id];
            const isPulsing = activeLinkPulse[`n${id}` as 'n1' | 'n2' | 'n3' | 'n4'];
            const linkColor = isPulsing ? activeLinkPulse.color : 'var(--border-strong)';

            return (
              <g key={`link-${id}`}>
                {/* Background Link Line */}
                <line
                  x1={node.x}
                  y1={node.y}
                  x2={center.x}
                  y2={center.y}
                  stroke={linkColor}
                  strokeWidth={isPulsing ? 2 : 1.5}
                  strokeDasharray={isPulsing ? '6 6' : undefined}
                  className="transition-colors duration-300"
                >
                  {isPulsing && !prefersReducedMotion && (
                    <animate
                      attributeName="stroke-dashoffset"
                      values="24;0"
                      dur="600ms"
                      repeatCount="indefinite"
                    />
                  )}
                </line>

                {/* Animated Packet on Link */}
                {isPulsing && !prefersReducedMotion && (
                  <g>
                    {/* Main Packet Circle */}
                    <circle r="5" fill={activeLinkPulse.color}>
                      <animateMotion
                        path={`M ${node.x} ${node.y} L ${center.x} ${center.y}`}
                        dur="750ms"
                        repeatCount="indefinite"
                      />
                    </circle>
                    {/* Ghost Trailing Circle */}
                    <circle r="3.5" fill={activeLinkPulse.color} opacity="0.5">
                      <animateMotion
                        path={`M ${node.x} ${node.y} L ${center.x} ${center.y}`}
                        dur="750ms"
                        begin="80ms"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                )}
              </g>
            );
          })}

          {/* Cross peer lines (faint) */}
          <line x1={nodeCoords[1].x} y1={nodeCoords[1].y} x2={nodeCoords[2].x} y2={nodeCoords[2].y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          <line x1={nodeCoords[3].x} y1={nodeCoords[3].y} x2={nodeCoords[4].x} y2={nodeCoords[4].y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          <line x1={nodeCoords[1].x} y1={nodeCoords[1].y} x2={nodeCoords[3].x} y2={nodeCoords[3].y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          <line x1={nodeCoords[2].x} y1={nodeCoords[2].y} x2={nodeCoords[4].x} y2={nodeCoords[4].y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

          {/* Center Hub: Directory */}
          <g transform={`translate(${center.x - 70}, ${center.y - 40})`}>
            <rect
              width="140"
              height="80"
              rx="12"
              fill="var(--surface-3)"
              stroke="var(--border-strong)"
              strokeWidth="1.5"
              className="card-highlight"
            />
            <text
              x="70"
              y="32"
              textAnchor="middle"
              fill="var(--text)"
              fontSize="13"
              fontWeight="600"
              fontFamily="var(--font-sans)"
            >
              Directory Hub
            </text>
            <text
              x="70"
              y="50"
              textAnchor="middle"
              fill="var(--text-3)"
              fontSize="11"
              fontFamily="var(--font-mono)"
            >
              Home Node: #1
            </text>
            <text
              x="70"
              y="66"
              textAnchor="middle"
              fill="var(--ok)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              ● Port 7100 Live
            </text>
          </g>

          {/* Node Cards */}
          {nodes.map((node) => {
            const coord = nodeCoords[node.id];
            if (!coord) return null;
            const state = nodeMsiStates[node.id] || 'Invalid';
            const stateMeta = getStateMeta(state);
            const isHovered = hoveredNode === node.id;
            const isPulsing = activeLinkPulse[`n${node.id}` as 'n1' | 'n2' | 'n3' | 'n4'];

            const cpuNum = parseInt(node.cpu, 10) || 30;
            const memNum = parseInt(node.mem, 10) || 50;

            const cardW = 190;
            const cardH = 96;

            return (
              <g
                key={`node-${node.id}`}
                transform={`translate(${coord.x - cardW / 2}, ${coord.y - cardH / 2})`}
                className="cursor-pointer group"
                onClick={() => onNodeClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* One-shot State Pulse Ring */}
                {isPulsing && (
                  <rect
                    width={cardW + 8}
                    height={cardH + 8}
                    x="-4"
                    y="-4"
                    rx="12"
                    fill="none"
                    stroke={stateMeta.color}
                    strokeWidth="1.5"
                    opacity="0.4"
                  />
                )}

                {/* Node Card Container */}
                <rect
                  width={cardW}
                  height={cardH}
                  rx="10"
                  fill="var(--surface-2)"
                  stroke={isHovered ? 'var(--border-strong)' : 'var(--border)'}
                  strokeWidth="1.2"
                  className="transition-all duration-200 card-highlight"
                />

                {/* 3px Left Accent Bar */}
                <rect
                  width="4"
                  height={cardH - 8}
                  x="4"
                  y="4"
                  rx="2"
                  fill={stateMeta.color}
                  className="transition-colors duration-300"
                />

                {/* Header: Node Name + IP */}
                <text
                  x="18"
                  y="26"
                  fill="var(--text)"
                  fontSize="13"
                  fontWeight="600"
                  fontFamily="var(--font-sans)"
                >
                  {node.name}
                </text>
                <text
                  x="18"
                  y="42"
                  fill="var(--text-3)"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {node.ip}
                </text>

                {/* MSI State Chip (Letter + Label) */}
                <g transform={`translate(${cardW - 84}, 12)`}>
                  <rect
                    width="74"
                    height="22"
                    rx="5"
                    fill={stateMeta.color}
                    fillOpacity="0.12"
                    stroke={stateMeta.color}
                    strokeWidth="1"
                    strokeOpacity="0.35"
                  />
                  <text
                    x="37"
                    y="15"
                    textAnchor="middle"
                    fill={stateMeta.color}
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                  >
                    {stateMeta.letter} {stateMeta.label}
                  </text>
                </g>

                {/* Clocks & Resource Bars */}
                <g transform="translate(18, 54)">
                  {/* Lamport Clock */}
                  <text
                    x="0"
                    y="12"
                    fill="var(--text-2)"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                  >
                    Clock: <tspan fill="var(--sync)" fontWeight="600">#{node.lamport}</tspan>
                  </text>
                  <text
                    x="88"
                    y="12"
                    fill="var(--text-3)"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                  >
                    φ={node.phi.toFixed(2)}
                  </text>

                  {/* CPU / Mem mini bars */}
                  <g transform="translate(0, 20)">
                    {/* CPU bar */}
                    <rect width="68" height="4" rx="2" fill="var(--surface-3)" />
                    <rect width={Math.min(68, (cpuNum / 100) * 68)} height="4" rx="2" fill="var(--text-3)" />

                    {/* Mem bar */}
                    <rect x="80" width="68" height="4" rx="2" fill="var(--surface-3)" />
                    <rect x="80" width={Math.min(68, (memNum / 100) * 68)} height="4" rx="2" fill="var(--text-3)" />
                  </g>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
