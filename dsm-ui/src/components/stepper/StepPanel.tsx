import React, { useEffect, useRef } from 'react';
import { useSimStore } from '../../store/sim';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  X,
  List
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StepPanelProps {
  onAdvanceStep: (step: number) => void;
}

export function StepPanel({ onAdvanceStep }: StepPanelProps) {
  const stepMode = useSimStore((s) => s.stepMode);
  const setStepMode = useSimStore((s) => s.setStepMode);
  const currentStep = useSimStore((s) => s.currentStep);
  const setCurrentStep = useSimStore((s) => s.setCurrentStep);
  const stepScenarioType = useSimStore((s) => s.stepScenarioType);
  const setStepScenarioType = useSimStore((s) => s.setStepScenarioType);
  const isAutoPlaying = useSimStore((s) => s.isAutoPlaying);
  const setIsAutoPlaying = useSimStore((s) => s.setIsAutoPlaying);
  const stepEvents = useSimStore((s) => s.stepEvents);
  const clearStepEvents = useSimStore((s) => s.clearStepEvents);

  const autoPlayTimerRef = useRef<any>(null);

  const stepMeta = {
    write: [
      { num: 1, title: 'Write Miss', from: 'Node 3', to: 'Directory', msg: 'WRITE_REQ(0x1A3F)', desc: 'Node 3 executes write on address 0x1A3F. Page is non-exclusive; page fault traps to kernel, sending WRITE_REQ to Directory.' },
      { num: 2, title: 'Invalidate', from: 'Directory', to: 'Sharers (N1, N2)', msg: 'INV(Page 1)', desc: 'Directory checks sharer list: Node 1 and Node 2 hold Shared copies. Directory broadcasts Invalidation (INV) requests.' },
      { num: 3, title: 'Downgrade', from: 'Sharers', to: 'Directory', msg: 'INV_ACK', desc: 'Node 1 and Node 2 downgrade Page 1 to Invalid, flush cache lines, and return Invalidation Acknowledgements (INV_ACK).' },
      { num: 4, title: 'Grant Owner', from: 'Directory', to: 'Node 3', msg: 'WRITE_GRANT (Modified)', desc: 'All sharers invalidated. Directory promotes Node 3 to exclusive Modified owner. Memory cell 0x1A3F committed.' },
    ],
    read: [
      { num: 1, title: 'Read Miss', from: 'Node 2', to: 'Directory', msg: 'READ_REQ(0x1A3F)', desc: 'Node 2 attempts to read 0x1A3F in Invalid state. Kernel traps via SIGSEGV, sending READ_REQ to Home Directory.' },
      { num: 2, title: 'Home Lookup', from: 'Directory', to: 'Directory', msg: 'DIR_LOOKUP', desc: 'Directory inspects Page 1 entry: Owner is currently Node 3 (Modified). Page must be flushed or forwarded.' },
      { num: 3, title: 'Forward / Downgrade', from: 'Directory', to: 'Node 3', msg: 'DOWNGRADE_REQ', desc: 'Directory requests Node 3 write back dirty data and downgrade state from Modified to Shared.' },
      { num: 4, title: 'Data Reply', from: 'Node 3 / Dir', to: 'Node 2', msg: 'DATA_REPLY (Shared)', desc: 'Data returned to Node 2 with read permissions. Sharer list updated: [Node 2, Node 3] both in Shared state.' },
    ],
  };

  const steps = stepMeta[stepScenarioType];

  // Auto-play timer
  useEffect(() => {
    if (isAutoPlaying) {
      autoPlayTimerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= 4) {
            setIsAutoPlaying(false);
            return 4;
          }
          const next = prev + 1;
          onAdvanceStep(next);
          return next;
        });
      }, 2200);
    } else {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    }
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [isAutoPlaying, setCurrentStep, onAdvanceStep, setIsAutoPlaying]);

  // Keyboard navigation
  useEffect(() => {
    if (!stepMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentStep < 4) {
          const next = currentStep + 1;
          setCurrentStep(next);
          onAdvanceStep(next);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 1) {
          const next = currentStep - 1;
          setCurrentStep(next);
          onAdvanceStep(next);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsAutoPlaying(!isAutoPlaying);
      } else if (e.key === 'Escape') {
        setStepMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepMode, currentStep, isAutoPlaying, onAdvanceStep, setCurrentStep, setIsAutoPlaying, setStepMode]);

  if (!stepMode) return null;

  const currentInfo = steps[Math.max(0, currentStep - 1)] || steps[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl bg-surface-1 border border-border card-highlight overflow-hidden flex flex-col"
    >
      {/* Top Bar: Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-border gap-3 bg-surface-2/40">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
            Packet Tracer Simulation
          </span>
          {/* Walkthrough selector */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface-2 border border-border text-xs">
            <button
              onClick={() => {
                setStepScenarioType('write');
                setCurrentStep(1);
                clearStepEvents();
                onAdvanceStep(1);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                stepScenarioType === 'write' ? 'bg-surface-3 text-text font-semibold shadow-xs' : 'text-text-3 hover:text-text'
              }`}
            >
              Write Invalidation
            </button>
            <button
              onClick={() => {
                setStepScenarioType('read');
                setCurrentStep(1);
                clearStepEvents();
                onAdvanceStep(1);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                stepScenarioType === 'read' ? 'bg-surface-3 text-text font-semibold shadow-xs' : 'text-text-3 hover:text-text'
              }`}
            >
              Read Miss Fetch
            </button>
          </div>
        </div>

        {/* Stepper controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (currentStep > 1) {
                const next = currentStep - 1;
                setCurrentStep(next);
                onAdvanceStep(next);
              }
            }}
            disabled={currentStep <= 1}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-surface-2 hover:bg-surface-3 border border-border text-text disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Previous step (←)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md border font-medium cursor-pointer transition-colors ${
              isAutoPlaying
                ? 'bg-warn/15 text-warn border-warn/30'
                : 'bg-surface-2 hover:bg-surface-3 border-border text-text'
            }`}
            title="Auto-play all steps (Space)"
          >
            {isAutoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isAutoPlaying ? 'Pause' : 'Auto-Play (2.2s)'}</span>
          </button>

          <button
            onClick={() => {
              if (currentStep < 4) {
                const next = currentStep + 1;
                setCurrentStep(next);
                onAdvanceStep(next);
              }
            }}
            disabled={currentStep >= 4}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-surface-2 hover:bg-surface-3 border border-border text-text disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Next step (→)"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              setIsAutoPlaying(false);
              setCurrentStep(1);
              clearStepEvents();
              onAdvanceStep(1);
            }}
            className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 border border-border text-text-3 hover:text-text cursor-pointer transition-colors"
            title="Reset walkthrough"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setStepMode(false)}
            className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 border border-border text-text-3 hover:text-text cursor-pointer transition-colors ml-2"
            title="Close step mode (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="px-6 py-4 border-b border-border bg-surface-1">
        <div className="flex items-center justify-between max-w-2xl mx-auto relative">
          {/* Background Line */}
          <div className="absolute left-6 right-6 top-4 h-0.5 bg-surface-3 -z-0" />

          {steps.map((st) => {
            const isCompleted = currentStep > st.num;
            const isCurrent = currentStep === st.num;

            return (
              <button
                key={st.num}
                onClick={() => {
                  setCurrentStep(st.num);
                  onAdvanceStep(st.num);
                }}
                className="flex flex-col items-center group cursor-pointer z-10"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-semibold transition-all ${
                    isCurrent
                      ? 'bg-surface-1 text-text border-2 border-info shadow-xs ring-4 ring-info/15'
                      : isCompleted
                      ? 'bg-text text-bg font-bold'
                      : 'bg-surface-2 text-text-3 border border-border'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : st.num}
                </div>
                <span
                  className={`mt-1.5 text-xs font-medium transition-colors ${
                    isCurrent ? 'text-text font-semibold' : isCompleted ? 'text-text-2' : 'text-text-3'
                  }`}
                >
                  {st.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Narration & State Transitions */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 bg-surface-1">
        {/* Step Narration */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-info px-2 py-0.5 rounded bg-info/10 border border-info/25">
              Step {currentStep} of 4
            </span>
            <span className="text-xs font-semibold text-text">
              {currentInfo.title}
            </span>
          </div>
          <p className="text-xs text-text-2 leading-relaxed">
            {currentInfo.desc}
          </p>

          {/* Keyboard hints */}
          <div className="flex items-center gap-3 pt-2 text-[11px] text-text-3 font-mono">
            <span>Keys:</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">←</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">→</kbd> Step</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">Space</kbd> Auto-play</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">Esc</kbd> Exit</span>
          </div>
        </div>

        {/* State Transition Summary */}
        <div className="p-3.5 rounded-lg bg-surface-2/60 border border-border flex flex-col justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-3 block mb-2">
            Protocol State Delta
          </span>
          {stepScenarioType === 'write' ? (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-2">Node 1 (Sharer):</span>
                <span className="text-text-3">Shared → <span className="text-state-i font-semibold">Invalid</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Node 2 (Sharer):</span>
                <span className="text-text-3">Shared → <span className="text-state-i font-semibold">Invalid</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Node 3 (Requester):</span>
                <span className="text-text-3">Invalid → <span className="text-state-m font-semibold">Modified</span></span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-2">Node 2 (Requester):</span>
                <span className="text-text-3">Invalid → <span className="text-state-s font-semibold">Shared</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-2">Node 3 (Prev Owner):</span>
                <span className="text-text-3">Modified → <span className="text-state-s font-semibold">Shared</span></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Packet Tracer Event List */}
      {stepEvents.length > 0 && (
        <div className="border-t border-border p-4 bg-surface-2/30">
          <div className="flex items-center gap-2 mb-2.5">
            <List className="w-3.5 h-3.5 text-text-3" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-3">
              Packet Tracer Event Log ({stepEvents.length} hops)
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-surface-1">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-2 text-text-3 border-b border-border sticky top-0">
                <tr>
                  <th scope="col" className="px-3 py-1.5 font-normal">#</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">Time</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">From</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">To</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">Message</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stepEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-1 text-text-3">{ev.id}</td>
                    <td className="px-3 py-1 text-text-3">{ev.time}</td>
                    <td className="px-3 py-1 text-text-2">{ev.from}</td>
                    <td className="px-3 py-1 text-text-2">{ev.to}</td>
                    <td className="px-3 py-1 text-info font-medium">{ev.message}</td>
                    <td className="px-3 py-1 text-ok">{ev.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
