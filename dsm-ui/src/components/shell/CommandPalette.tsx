import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useSimStore } from '../../store/sim';
import { 
  Play, 
  Pause, 
  Square, 
  Layers, 
  Cpu, 
  Key, 
  Sun, 
  Moon, 
  Download, 
  Footprints, 
  Terminal, 
  Search,
  Sparkles,
  Zap
} from 'lucide-react';
import { setSimulationState, sendCommand } from '../../lib/api';
import { downloadEvaluationReport } from '../../lib/exportReport';
import { useClusterData } from '../../hooks/useClusterData';

interface CommandPaletteProps {
  onRunScenario: (key: string, title: string, desc: string) => void;
  onSendCommand: (cmd: string) => void;
}

export function CommandPalette({ onRunScenario, onSendCommand }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const activeView = useSimStore((s) => s.activeView);
  const setActiveView = useSimStore((s) => s.setActiveView);
  const simState = useSimStore((s) => s.simState);
  const setSimState = useSimStore((s) => s.setSimState);
  const stepMode = useSimStore((s) => s.stepMode);
  const toggleStepMode = useSimStore((s) => s.toggleStepMode);
  const theme = useSimStore((s) => s.theme);
  const toggleTheme = useSimStore((s) => s.toggleTheme);
  const { nodes, memoryStats, mutexState } = useClusterData();

  // Toggle on ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName))) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-text-3 bg-surface-2 hover:bg-surface-3 hover:text-text border border-border rounded-md transition-colors cursor-pointer group"
        title="Open Command Palette (⌘K)"
      >
        <Search className="w-3.5 h-3.5 text-text-3 group-hover:text-text" />
        <span className="hidden sm:inline">Search & Actions</span>
        <kbd className="font-mono text-[11px] bg-surface-1 border border-border px-1.5 py-0.5 rounded text-text-3">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="fixed inset-0" 
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-xl bg-surface-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden z-10 card-highlight">
            <Command className="w-full">
              <div className="flex items-center px-3 border-b border-border">
                <Search className="w-4 h-4 text-text-3 mr-2" />
                <Command.Input
                  placeholder="Type a command or search..."
                  className="w-full py-3 text-sm bg-transparent border-0 outline-none text-text placeholder:text-text-3 font-sans"
                  autoFocus
                />
                <kbd className="text-[11px] font-mono text-text-3 bg-surface-2 border border-border px-1.5 py-0.5 rounded">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
                <Command.Empty className="py-6 text-center text-xs text-text-3">
                  No matching commands found.
                </Command.Empty>

                {/* Scenarios */}
                <Command.Group heading={<span className="text-[11px] font-mono uppercase tracking-wider text-text-3 px-2 py-1 block">Course Scenarios</span>}>
                  <Command.Item
                    onSelect={() => handleSelect(() => onRunScenario('msi_walkthrough', 'MSI Coherence Flow', 'Node 1 read miss -> Node 2 read miss -> Node 3 write invalidation storm'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-state-s" />
                    <span className="flex-1 font-medium">MSI Cache Coherence Walkthrough</span>
                    <span className="text-[11px] font-mono text-text-3">Read Miss & Invalidate</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onRunScenario('false_sharing', 'False Sharing Thrashing', 'Node 1 and Node 2 ping-ponging writes on adjacent offsets of same 4KB page'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-warn" />
                    <span className="flex-1 font-medium">False Sharing Demonstration</span>
                    <span className="text-[11px] font-mono text-text-3">Page 2 Thrashing</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onRunScenario('mutex_race', 'Ricart-Agrawala Mutex Race', 'Nodes 2 and 4 simultaneously requesting critical section with Lamport clocks'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Key className="w-3.5 h-3.5 text-sync" />
                    <span className="flex-1 font-medium">Ricart-Agrawala Mutex Contention</span>
                    <span className="text-[11px] font-mono text-text-3">Logical Clocks</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onRunScenario('phi_failure', 'Phi-Accrual Failure Detector', 'Simulated network partition on Node 4 causing suspicion accrual and eviction'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Cpu className="w-3.5 h-3.5 text-state-m" />
                    <span className="flex-1 font-medium">Phi-Accrual Failure Detection</span>
                    <span className="text-[11px] font-mono text-text-3">Heartbeat Timeout</span>
                  </Command.Item>
                </Command.Group>

                {/* Navigation Views */}
                <Command.Group heading={<span className="text-[11px] font-mono uppercase tracking-wider text-text-3 px-2 py-1 block">Views</span>}>
                  <Command.Item
                    onSelect={() => handleSelect(() => setActiveView('overview'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-text-2" />
                    <span className="flex-1">Overview Dashboard</span>
                    {activeView === 'overview' && <span className="text-[11px] text-ok font-mono">Active</span>}
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => setActiveView('coherence'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Cpu className="w-3.5 h-3.5 text-text-2" />
                    <span className="flex-1">MSI Coherence Directory (16 Pages)</span>
                    {activeView === 'coherence' && <span className="text-[11px] text-ok font-mono">Active</span>}
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => setActiveView('sync'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Key className="w-3.5 h-3.5 text-text-2" />
                    <span className="flex-1">Synchronization & Mutual Exclusion</span>
                    {activeView === 'sync' && <span className="text-[11px] text-ok font-mono">Active</span>}
                  </Command.Item>
                </Command.Group>

                {/* Simulation Control */}
                <Command.Group heading={<span className="text-[11px] font-mono uppercase tracking-wider text-text-3 px-2 py-1 block">Simulation Controls</span>}>
                  <Command.Item
                    onSelect={() => handleSelect(() => {
                      setSimulationState('run');
                      setSimState('running');
                    })}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 text-ok" />
                    <span className="flex-1">Resume Cluster Simulation</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => {
                      setSimulationState('pause');
                      setSimState('paused');
                    })}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5 text-warn" />
                    <span className="flex-1">Pause Cluster Simulation</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => {
                      setSimulationState('stop');
                      setSimState('stopped');
                    })}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 text-state-m" />
                    <span className="flex-1">Stop All Nodes</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => toggleStepMode())}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Footprints className="w-3.5 h-3.5 text-info" />
                    <span className="flex-1">{stepMode ? 'Disable' : 'Enable'} Step-by-Step Packet Mode</span>
                  </Command.Item>
                </Command.Group>

                {/* Quick Commands */}
                <Command.Group heading={<span className="text-[11px] font-mono uppercase tracking-wider text-text-3 px-2 py-1 block">Quick Commands</span>}>
                  <Command.Item
                    onSelect={() => handleSelect(() => onSendCommand('write 0x1A3F 100'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-text-3" />
                    <span className="flex-1 font-mono">write 0x1A3F 100</span>
                    <span className="text-[11px] text-text-3">Write to Target Page</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onSendCommand('read 0x1A3F'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-text-3" />
                    <span className="flex-1 font-mono">read 0x1A3F</span>
                    <span className="text-[11px] text-text-3">Issue Read Request</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onSendCommand('lock 0x1A3F'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-text-3" />
                    <span className="flex-1 font-mono">lock 0x1A3F</span>
                    <span className="text-[11px] text-text-3">Acquire RA Mutex</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onSendCommand('unlock 0x1A3F'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-text-3" />
                    <span className="flex-1 font-mono">unlock 0x1A3F</span>
                    <span className="text-[11px] text-text-3">Release RA Mutex</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => onSendCommand('clear'))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-text-3" />
                    <span className="flex-1 font-mono">clear</span>
                    <span className="text-[11px] text-text-3">Clear Console Logs</span>
                  </Command.Item>
                </Command.Group>

                {/* System & Tools */}
                <Command.Group heading={<span className="text-[11px] font-mono uppercase tracking-wider text-text-3 px-2 py-1 block">Tools</span>}>
                  <Command.Item
                    onSelect={() => handleSelect(() => downloadEvaluationReport(simState, memoryStats, nodes, mutexState))}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-text-2" />
                    <span className="flex-1">Export Evaluation Report (.txt)</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => handleSelect(() => toggleTheme())}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md text-text hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-warn" /> : <Moon className="w-3.5 h-3.5 text-info" />}
                    <span className="flex-1">Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
