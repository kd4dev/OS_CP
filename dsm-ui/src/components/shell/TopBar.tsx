import React from 'react';
import { useSimStore } from '../../store/sim';
import { useClusterData } from '../../hooks/useClusterData';
import { HealthPill } from './HealthPill';
import { Clock } from './Clock';
import { CommandPalette } from './CommandPalette';
import { 
  Play, 
  Pause, 
  Square, 
  Download, 
  Sun, 
  Moon, 
  Footprints,
  X
} from 'lucide-react';
import { setSimulationState } from '../../lib/api';
import { downloadEvaluationReport } from '../../lib/exportReport';

interface TopBarProps {
  onRunScenario: (key: string, title: string, desc: string) => void;
  onSendCommand?: (cmd: string) => void;
}

export function TopBar({ onRunScenario, onSendCommand }: TopBarProps) {
  const activeView = useSimStore((s) => s.activeView);
  const simState = useSimStore((s) => s.simState);
  const setSimState = useSimStore((s) => s.setSimState);
  const stepMode = useSimStore((s) => s.stepMode);
  const toggleStepMode = useSimStore((s) => s.toggleStepMode);
  const theme = useSimStore((s) => s.theme);
  const toggleTheme = useSimStore((s) => s.toggleTheme);
  const scenarioBanner = useSimStore((s) => s.scenarioBanner);
  const setScenarioBanner = useSimStore((s) => s.setScenarioBanner);

  const { nodes, memoryStats, mutexState, isOffline } = useClusterData();

  const handleSimToggle = async (action: 'run' | 'pause' | 'stop') => {
    const targetState = action === 'run' ? 'running' : (action === 'pause' ? 'paused' : 'stopped');
    setSimState(targetState);
    try {
      await setSimulationState(action);
    } catch (e) {
      // Keep optimistic state active locally
    }
  };

  const titles: Record<string, string> = {
    overview: 'System Overview',
    coherence: 'MSI Cache Coherence Directory',
    sync: 'Ricart-Agrawala Mutual Exclusion',
  };

  return (
    <header className="sticky top-0 z-30 bg-surface-1/90 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 gap-3">
        {/* Left: View Title & Health */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold text-text tracking-tight truncate">
            {titles[activeView] || 'DSM Visualizer'}
          </h1>
          <HealthPill nodes={nodes} isOffline={isOffline} />
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Run | Pause | Stop Segmented Control */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface-2 border border-border">
            <button
              onClick={() => handleSimToggle('run')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                simState === 'running'
                  ? 'bg-surface-3 text-ok font-semibold shadow-xs'
                  : 'text-text-3 hover:text-text'
              }`}
              title="Run simulation"
              aria-label="Run cluster simulation"
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden md:inline">Run</span>
            </button>
            <button
              onClick={() => handleSimToggle('pause')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                simState === 'paused'
                  ? 'bg-surface-3 text-warn font-semibold shadow-xs'
                  : 'text-text-3 hover:text-text'
              }`}
              title="Pause simulation"
              aria-label="Pause cluster simulation"
            >
              <Pause className="w-3 h-3 fill-current" />
              <span className="hidden md:inline">Pause</span>
            </button>
            <button
              onClick={() => handleSimToggle('stop')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                simState === 'stopped'
                  ? 'bg-surface-3 text-state-m font-semibold shadow-xs'
                  : 'text-text-3 hover:text-text'
              }`}
              title="Stop simulation"
              aria-label="Stop all nodes"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="hidden md:inline">Stop</span>
            </button>
          </div>

          {/* Step Mode Switch */}
          <button
            onClick={() => toggleStepMode()}
            className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              stepMode
                ? 'bg-info/15 text-info border-info/30 font-semibold'
                : 'bg-surface-2 text-text-3 border-border hover:text-text'
            }`}
            title="Toggle Step-by-Step Packet Tracer mode"
            aria-label="Toggle step-by-step packet tracer mode"
          >
            <Footprints className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Step Mode</span>
          </button>

          {/* Command Palette (⌘K) */}
          <CommandPalette onRunScenario={onRunScenario} onSendCommand={onSendCommand || (() => {})} />

          {/* Export Report */}
          <button
            onClick={() => downloadEvaluationReport(simState, memoryStats, nodes, mutexState)}
            className="p-1.5 text-text-3 hover:text-text bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors cursor-pointer"
            title="Export Evaluation Report (.txt)"
            aria-label="Export evaluation report"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => toggleTheme()}
            className="p-1.5 text-text-3 hover:text-text bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-warn" /> : <Moon className="w-4 h-4 text-info" />}
          </button>

          {/* Isolated Clock */}
          <Clock />
        </div>
      </div>

      {/* Inline Scenario Banner Strip (Calm, dismissible) */}
      {scenarioBanner && (
        <div className="flex items-center justify-between px-6 py-1.5 bg-surface-2 border-t border-border text-xs text-text-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />
            <span className="font-medium text-text truncate">{scenarioBanner}</span>
          </div>
          <button
            onClick={() => setScenarioBanner('')}
            className="p-1 text-text-3 hover:text-text rounded transition-colors ml-4 cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  );
}
