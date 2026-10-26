import React, { useState } from 'react';
import { MsiPage, MsiState } from '../../lib/types';
import { useSimStore } from '../../store/sim';
import { Filter } from 'lucide-react';

interface PageTableProps {
  pages: MsiPage[];
}

export function PageTable({ pages }: PageTableProps) {
  const targetPageId = useSimStore((s) => s.targetPageId);
  const setTargetPage = useSimStore((s) => s.setTargetPage);

  const [filterState, setFilterState] = useState<'ALL' | MsiState>('ALL');

  const filteredPages = pages.filter((p) => {
    if (filterState === 'ALL') return true;
    return p.dirState === filterState;
  });

  const getStateChip = (state: MsiState) => {
    switch (state) {
      case 'Modified':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-state-m/15 text-state-m border border-state-m/30">M Modified</span>;
      case 'Shared':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-state-s/15 text-state-s border border-state-s/30">S Shared</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-state-i/15 text-state-i border border-state-i/30">I Invalid</span>;
    }
  };

  const getNodeBox = (nodeId: number, state: MsiState) => {
    let color = 'bg-state-i/15 text-state-i border-state-i/30';
    if (state === 'Modified') color = 'bg-state-m/15 text-state-m border-state-m/40 font-bold';
    if (state === 'Shared') color = 'bg-state-s/15 text-state-s border-state-s/40 font-bold';

    return (
      <div
        key={nodeId}
        className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-mono border ${color}`}
        title={`Node ${nodeId}: ${state}`}
      >
        {state[0]}
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-border gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text tracking-tight">
            Virtual Memory Directory (16 Pages × 4096 B)
          </h2>
          <span className="text-xs text-text-3 font-mono">
            Click any row to bind as target page across topology and inspector
          </span>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {(['ALL', 'Modified', 'Shared', 'Invalid'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterState(filter)}
              className={`px-2.5 py-0.5 rounded transition-colors cursor-pointer ${
                filterState === filter
                  ? 'bg-text text-bg font-semibold'
                  : 'bg-surface-2 text-text-3 hover:text-text border border-border'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead className="bg-surface-2/60 text-text-3 border-b border-border sticky top-0">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">PAGE</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">VIRTUAL ADDR</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">HOME</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">DIRECTORY STATE</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">OWNER</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">SHARERS</th>
              <th scope="col" className="px-4 py-2.5 font-normal text-[11px]">PER-NODE STATE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filteredPages.map((page) => {
              const isSelected = targetPageId === page.pageId;

              return (
                <tr
                  key={page.pageId}
                  onClick={() => setTargetPage(page.pageId, page.addrHex)}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-surface-3 text-text border-l-2 border-l-text'
                      : 'hover:bg-surface-2/40 text-text-2'
                  }`}
                >
                  <td className="px-4 py-2.5 font-semibold text-text">#{page.pageId}</td>
                  <td className="px-4 py-2.5 text-info font-medium">{page.addrHex}</td>
                  <td className="px-4 py-2.5 text-text-3">Node {page.homeNode + 1}</td>
                  <td className="px-4 py-2.5">{getStateChip(page.dirState)}</td>
                  <td className="px-4 py-2.5 text-text">
                    {page.owner !== null ? `Node ${page.owner}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-text-3">
                    {page.sharers.length > 0 ? `[Node ${page.sharers.join(', ')}]` : 'None'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((nodeId) => (
                        <React.Fragment key={nodeId}>
                          {getNodeBox(nodeId, page.nodeStates[nodeId] || 'Invalid')}
                        </React.Fragment>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
