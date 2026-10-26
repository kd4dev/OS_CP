import React from 'react';
import { MsiPage } from '../../lib/types';
import { useSimStore } from '../../store/sim';
import { ArrowRight, Cpu } from 'lucide-react';

interface PageDirectoryCardProps {
  pages: MsiPage[];
}

export function PageDirectoryCard({ pages }: PageDirectoryCardProps) {
  const setActiveView = useSimStore((s) => s.setActiveView);
  const targetPageId = useSimStore((s) => s.targetPageId);
  const setTargetPage = useSimStore((s) => s.setTargetPage);

  // Take first 6 pages or non-invalid ones
  const previewPages = pages.slice(0, 6);

  const getBadgeStyle = (state: string) => {
    switch (state) {
      case 'Modified':
        return 'bg-state-m/15 text-state-m border-state-m/30';
      case 'Shared':
        return 'bg-state-s/15 text-state-s border-state-s/30';
      default:
        return 'bg-state-i/15 text-state-i border-state-i/30';
    }
  };

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col justify-between overflow-hidden">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-text-3" />
            <h2 className="text-sm font-semibold text-text tracking-tight">
              Page Directory (Directory-Based MSI)
            </h2>
          </div>
          <button
            onClick={() => setActiveView('coherence')}
            className="flex items-center gap-1 text-xs text-text-3 hover:text-text transition-colors cursor-pointer"
          >
            <span>View all 16</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dense Table */}
        <div className="p-3">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-text-3 border-b border-border/60 text-[11px]">
                <th scope="col" className="px-3 py-2 font-normal">PAGE</th>
                <th scope="col" className="px-3 py-2 font-normal">ADDRESS</th>
                <th scope="col" className="px-3 py-2 font-normal">HOME</th>
                <th scope="col" className="px-3 py-2 font-normal">STATE</th>
                <th scope="col" className="px-3 py-2 font-normal">OWNER/SHARERS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {previewPages.map((page) => {
                const isSelected = targetPageId === page.pageId;
                return (
                  <tr
                    key={page.pageId}
                    onClick={() => setTargetPage(page.pageId, page.addrHex)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-surface-3 text-text font-medium border-l-2 border-l-text'
                        : 'hover:bg-surface-2/40 text-text-2'
                    }`}
                  >
                    <td className="px-3 py-2 text-text font-semibold">#{page.pageId}</td>
                    <td className="px-3 py-2 text-info">{page.addrHex}</td>
                    <td className="px-3 py-2 text-text-3">Node {page.homeNode + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getBadgeStyle(page.dirState)}`}>
                        {page.dirState[0]} {page.dirState}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-3">
                      {page.owner !== null
                        ? `Node ${page.owner}`
                        : page.sharers.length > 0
                        ? `Nodes [${page.sharers.join(', ')}]`
                        : 'None'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-border bg-surface-2/30 flex items-center justify-between text-xs text-text-3">
        <span>Click row to inspect on topology</span>
        <span className="font-mono text-[11px]">4096 B / page</span>
      </div>
    </div>
  );
}
