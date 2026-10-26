import React from 'react';
import { MsiPage } from '../../lib/types';
import { useSimStore } from '../../store/sim';

interface MsiDiagramProps {
  pages: MsiPage[];
}

export function MsiDiagram({ pages }: MsiDiagramProps) {
  const targetPageId = useSimStore((s) => s.targetPageId);
  const selectedPage = pages.find((p) => p.pageId === targetPageId) || pages[0];

  return (
    <div className="space-y-4">
      {/* State Machine Diagram Card */}
      <div className="rounded-xl bg-surface-1 border border-border card-highlight p-5 flex flex-col items-center">
        <h3 className="text-xs font-semibold text-text uppercase tracking-wider font-mono self-start mb-2">
          MSI Coherence State Machine
        </h3>
        <p className="text-xs text-text-3 self-start mb-4">
          Directory-enforced 3-state cache model (Hayashibara / Li-Hudah)
        </p>

        {/* SVG State Diagram */}
        <div className="w-full max-w-[340px] aspect-square flex items-center justify-center select-none">
          <svg viewBox="0 0 320 300" className="w-full h-full">
            {/* Arrows & Transitions */}

            {/* Invalid -> Shared (PrRd / BusRd) */}
            <path
              d="M 90 220 C 60 160, 60 120, 110 85"
              fill="none"
              stroke="var(--state-s)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x="50" y="150" fill="var(--state-s)" fontSize="10" fontFamily="var(--font-mono)">
              PrRd / BusRd
            </text>

            {/* Shared -> Modified (PrWr / BusRdX) */}
            <path
              d="M 170 70 L 230 70"
              fill="none"
              stroke="var(--state-m)"
              strokeWidth="1.5"
            />
            <text x="180" y="60" fill="var(--state-m)" fontSize="10" fontFamily="var(--font-mono)">
              PrWr / BusRdX
            </text>

            {/* Modified -> Shared (BusRd / Flush) */}
            <path
              d="M 230 95 C 200 115, 180 115, 160 95"
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="1.5"
            />
            <text x="175" y="125" fill="var(--text-3)" fontSize="10" fontFamily="var(--font-mono)">
              BusRd (Flush)
            </text>

            {/* Shared -> Invalid (BusRdX / Invalidate) */}
            <path
              d="M 140 105 L 140 205"
              fill="none"
              stroke="var(--state-i)"
              strokeWidth="1.5"
            />
            <text x="145" y="165" fill="var(--state-i)" fontSize="10" fontFamily="var(--font-mono)">
              BusRdX (INV)
            </text>

            {/* Modified -> Invalid (BusRdX / Invalidate) */}
            <path
              d="M 255 105 C 265 170, 240 220, 175 240"
              fill="none"
              stroke="var(--state-i)"
              strokeWidth="1.5"
            />
            <text x="250" y="180" fill="var(--state-i)" fontSize="10" fontFamily="var(--font-mono)">
              BusRdX
            </text>

            {/* State Circles */}

            {/* Shared (S) - Top Left */}
            <g transform="translate(135, 80)">
              <circle
                r="32"
                fill="var(--surface-2)"
                stroke="var(--state-s)"
                strokeWidth={selectedPage?.dirState === 'Shared' ? '3' : '1.5'}
                className="transition-all"
              />
              <text x="0" y="4" textAnchor="middle" fill="var(--state-s)" fontSize="16" fontWeight="bold" fontFamily="var(--font-mono)">
                S
              </text>
              <text x="0" y="18" textAnchor="middle" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-sans)">
                Shared
              </text>
            </g>

            {/* Modified (M) - Top Right */}
            <g transform="translate(260, 80)">
              <circle
                r="32"
                fill="var(--surface-2)"
                stroke="var(--state-m)"
                strokeWidth={selectedPage?.dirState === 'Modified' ? '3' : '1.5'}
                className="transition-all"
              />
              <text x="0" y="4" textAnchor="middle" fill="var(--state-m)" fontSize="16" fontWeight="bold" fontFamily="var(--font-mono)">
                M
              </text>
              <text x="0" y="18" textAnchor="middle" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-sans)">
                Modified
              </text>
            </g>

            {/* Invalid (I) - Bottom Center */}
            <g transform="translate(140, 240)">
              <circle
                r="32"
                fill="var(--surface-2)"
                stroke="var(--state-i)"
                strokeWidth={selectedPage?.dirState === 'Invalid' ? '3' : '1.5'}
                className="transition-all"
              />
              <text x="0" y="4" textAnchor="middle" fill="var(--state-i)" fontSize="16" fontWeight="bold" fontFamily="var(--font-mono)">
                I
              </text>
              <text x="0" y="18" textAnchor="middle" fill="var(--text-3)" fontSize="9" fontFamily="var(--font-sans)">
                Invalid
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Selected Page Inspector Card */}
      {selectedPage && (
        <div className="rounded-xl bg-surface-1 border border-border card-highlight p-5 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <span className="font-semibold text-text">Page #{selectedPage.pageId} Detail</span>
            <span className="text-info">{selectedPage.addrHex}</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-text-3">Directory State:</span>
              <span className={`font-semibold ${
                selectedPage.dirState === 'Modified' ? 'text-state-m' : selectedPage.dirState === 'Shared' ? 'text-state-s' : 'text-state-i'
              }`}>
                {selectedPage.dirState}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-3">Home Directory:</span>
              <span className="text-text">Node {selectedPage.homeNode + 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-3">Exclusive Owner:</span>
              <span className="text-text">{selectedPage.owner !== null ? `Node ${selectedPage.owner}` : 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-3">Sharers Set:</span>
              <span className="text-text">
                {selectedPage.sharers.length > 0 ? `[Node ${selectedPage.sharers.join(', ')}]` : 'Empty'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-3">Page Version:</span>
              <span className="text-text">v{selectedPage.version || 1}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
