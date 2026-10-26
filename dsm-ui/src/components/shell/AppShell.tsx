import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: ReactNode;
  onRunScenario: (key: string, title: string, desc: string) => void;
}

export function AppShell({ children, onRunScenario }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Fixed Sidebar */}
      <Sidebar onRunScenario={onRunScenario} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onRunScenario={onRunScenario} />
        <main className="flex-1 p-4 sm:p-6 max-w-[1680px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
