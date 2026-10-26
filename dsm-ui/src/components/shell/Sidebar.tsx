import React, { useState } from 'react';
import { useSimStore, ViewType } from '../../store/sim';
import { 
  Layers, 
  Cpu, 
  Key, 
  Sparkles, 
  ChevronDown, 
  ChevronRight,
  Zap,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { useClusterData } from '../../hooks/useClusterData';

interface SidebarProps {
  onRunScenario: (key: string, title: string, desc: string) => void;
}

export function Sidebar({ onRunScenario }: SidebarProps) {
  const activeView = useSimStore((s) => s.activeView);
  const setActiveView = useSimStore((s) => s.setActiveView);
  const { isOffline } = useClusterData();

  const [scenariosOpen, setScenariosOpen] = useState(true);

  const navItems: { id: ViewType; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'coherence', label: 'Coherence (MSI)', icon: Cpu },
    { id: 'sync', label: 'Synchronization', icon: Key },
  ];

  const scenarioItems = [
    {
      key: 'msi_walkthrough',
      label: 'MSI Protocol Flow',
      desc: 'Read miss -> directory fetch -> write invalidation storm',
      color: 'text-state-s',
    },
    {
      key: 'false_sharing',
      label: 'False Sharing',
      desc: 'Independent writes on same 4KB page cause ping-pong invalidations',
      color: 'text-warn',
    },
    {
      key: 'mutex_race',
      label: 'RA Mutex Race',
      desc: 'Concurrent critical section requests arbitrated by Lamport clocks',
      color: 'text-sync',
    },
    {
      key: 'phi_failure',
      label: 'Phi Failure Detection',
      desc: 'Simulated heartbeat drop triggers threshold-based eviction',
      color: 'text-state-m',
    },
  ];

  return (
    <aside className="w-16 lg:w-56 shrink-0 bg-surface-1 border-r border-border flex flex-col justify-between h-screen sticky top-0 select-none z-40 transition-all duration-200">
      {/* Top: Brand & Navigation */}
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-14 flex items-center px-4 border-b border-border gap-3">
          {/* Geometric Logo */}
          <div className="w-7 h-7 shrink-0 grid grid-cols-2 gap-1 p-1 bg-surface-2 border border-border rounded-lg">
            <div className="rounded-[2px] bg-text" />
            <div className="rounded-[2px] border border-state-s" />
            <div className="rounded-[2px] border border-state-m" />
            <div className="rounded-[2px] border border-ok" />
          </div>

          <div className="hidden lg:flex flex-col min-w-0">
            <span className="text-sm font-semibold tracking-tight text-text leading-none">
              DSM
            </span>
            <span className="text-[11px] text-text-3 font-mono tracking-tight leading-tight mt-1 truncate">
              Shared Memory
            </span>
          </div>
        </div>

        {/* Primary Views Nav */}
        <nav className="p-2 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer relative ${
                  isActive
                    ? 'bg-surface-3 text-text font-semibold'
                    : 'text-text-3 hover:bg-surface-2 hover:text-text'
                }`}
                title={item.label}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-text" />
                )}
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-text' : 'text-text-3'}`} />
                <span className="hidden lg:inline truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Scenarios Section */}
        <div className="p-2 border-t border-border mt-1">
          <button
            onClick={() => setScenariosOpen(!scenariosOpen)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-text-3 hover:text-text transition-colors cursor-pointer"
            title="Toggle scenarios"
          >
            <span className="hidden lg:inline">Scenarios</span>
            <Sparkles className="w-3.5 h-3.5 lg:hidden mx-auto text-text-3" />
            <span className="hidden lg:inline">
              {scenariosOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          </button>

          {scenariosOpen && (
            <div className="hidden lg:flex flex-col space-y-0.5 mt-1">
              {scenarioItems.map((sc) => (
                <button
                  key={sc.key}
                  onClick={() => onRunScenario(sc.key, sc.label, sc.desc)}
                  className="w-full text-left px-3 py-1.5 rounded-md text-xs text-text-2 hover:bg-surface-2 hover:text-text transition-colors cursor-pointer group"
                  title={sc.desc}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.color.replace('text-', 'bg-')}`} />
                    <span className="truncate">{sc.label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer: System Status */}
      <div className="p-3 border-t border-border bg-surface-1/50">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isOffline ? 'bg-warn' : 'bg-ok'}`} />
          <div className="hidden lg:flex flex-col min-w-0">
            <span className="text-[11px] font-medium text-text truncate">
              {isOffline ? 'Backend Offline' : 'Kernel Live'}
            </span>
            <span className="text-[11px] text-text-3 truncate">
              OS Course Project
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
