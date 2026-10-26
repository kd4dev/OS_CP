import React from 'react';
import { HexRow, MemoryStats } from '../../lib/types';
import { useSimStore } from '../../store/sim';

interface HexGridProps {
  grid: HexRow[];
  memoryStats: MemoryStats;
  onCellClick: (row: number, col: number, addr: string) => void;
}

export function HexGrid({ grid, memoryStats, onCellClick }: HexGridProps) {
  const flashingCell = useSimStore((s) => s.flashingCell);
  const targetAddr = useSimStore((s) => s.targetAddr);

  // Column headers 0..F
  const cols = Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase());

  // Render all rows (all 8 rows)
  const rows = grid && grid.length > 0 ? grid : [];

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text tracking-tight">
            Shared Memory Map (Hex Inspector)
          </h2>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 border border-border text-text-3">
            128 B active view · 4 KiB paging
          </span>
        </div>
        <span className="text-xs text-text-3 hidden sm:inline font-mono">
          Target: <span className="text-info font-semibold">{targetAddr}</span> (Row 1, Col 7)
        </span>
      </div>

      {/* Hex Table */}
      <div className="p-4 overflow-x-auto select-none">
        <table className="w-full text-center font-mono text-xs border-collapse">
          <thead>
            <tr className="text-text-3 border-b border-border">
              <th scope="col" className="px-3 py-2 text-left font-normal text-[11px] tracking-wider">
                OFFSET
              </th>
              {cols.map((col, idx) => (
                <th
                  key={col}
                  scope="col"
                  className={`px-1.5 py-2 font-normal text-[11px] text-text-3 ${
                    (idx + 1) % 4 === 0 && idx !== 15 ? 'border-r border-border/40' : ''
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {rows.map((row, rowIdx) => (
              <tr key={row.addr} className="hover:bg-surface-2/30 transition-colors">
                {/* Row Address */}
                <th
                  scope="row"
                  className="px-3 py-2 text-left text-text-3 font-normal tracking-wider text-[11px]"
                >
                  {row.addr}
                </th>

                {/* 16 Bytes */}
                {row.bytes.map((byte, colIdx) => {
                  const isZero = byte === '00';
                  const isTarget = rowIdx === 1 && colIdx === 7;
                  const isFlashing = flashingCell && flashingCell.row === rowIdx && flashingCell.col === colIdx;

                  let cellClasses = 'relative px-2 py-1.5 rounded transition-all cursor-pointer text-center ';
                  let inlineStyle: React.CSSProperties = {};

                  if (isFlashing) {
                    const flashColor = flashingCell.type === 'write' ? 'var(--warn)' : 'var(--state-s)';
                    cellClasses += 'font-bold text-text ';
                    inlineStyle = {
                      backgroundColor: flashingCell.type === 'write' ? 'rgba(224, 169, 59, 0.35)' : 'rgba(91, 164, 245, 0.35)',
                      outline: `1px solid ${flashColor}`,
                    };
                  } else if (isTarget) {
                    cellClasses += 'bg-info/15 text-text font-medium outline-1 outline-info ';
                  } else if (isZero) {
                    cellClasses += 'text-text-3/50 hover:bg-surface-2 hover:text-text ';
                  } else {
                    cellClasses += 'text-text hover:bg-surface-2 ';
                  }

                  const borderRight = (colIdx + 1) % 4 === 0 && colIdx !== 15 ? 'border-r border-border/40' : '';
                  const cellAddress = `0x${(rowIdx * 16 + colIdx).toString(16).toUpperCase().padStart(4, '0')}`;

                  return (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      className={`p-1 ${borderRight}`}
                      title={`${cellAddress} = 0x${byte} (dec: ${parseInt(byte, 16)}) — Click to write 0x64`}
                      onClick={() => onCellClick(rowIdx, colIdx, cellAddress)}
                    >
                      <div className={cellClasses} style={inlineStyle}>
                        {byte}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: Memory Backing Usage Bar */}
      <div className="px-5 py-3 border-t border-border bg-surface-2/40 flex flex-wrap items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-3">
          <span className="text-text-3 font-mono text-[11px] uppercase tracking-wider">
            Memory Allocation:
          </span>
          <span className="font-mono text-text font-medium tabular-nums">
            {memoryStats.usedMB} / {memoryStats.totalMB} MB ({memoryStats.percentage}%)
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-32 sm:w-44 h-1.5 bg-surface-2 rounded-full overflow-hidden border border-border">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                memoryStats.percentage > 80 ? 'bg-warn' : 'bg-text-2'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, memoryStats.percentage))}%` }}
            />
          </div>
          <span className="text-text-3 font-mono text-[11px]">
            Faults: <span className="text-text font-medium">{memoryStats.pageFaults}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
