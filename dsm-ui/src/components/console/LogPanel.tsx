import React, { useState, useRef, useEffect } from 'react';
import { LogEntry } from '../../lib/types';
import { 
  Terminal, 
  Search, 
  ArrowDown, 
  Trash2, 
  CornerDownLeft,
  Filter
} from 'lucide-react';

interface LogPanelProps {
  logs: LogEntry[];
  onSendCommand: (cmd: string) => void;
  onClearLogs: () => void;
  isOffline: boolean;
}

export function LogPanel({ logs, onSendCommand, onClearLogs, isOffline }: LogPanelProps) {
  const [activeTab, setActiveTab] = useState<'logs' | 'command'>('logs');
  const [filterTag, setFilterTag] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [commandText, setCommandText] = useState<string>('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([
    'write 0x1A3F 100',
    'read 0x1A3F',
    'lock 0x1A3F',
    'unlock 0x1A3F',
  ]);

  const [userHasScrolledUp, setUserHasScrolledUp] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (!userHasScrolledUp && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, userHasScrolledUp]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setUserHasScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      setUserHasScrolledUp(false);
    }
  };

  const getTagStyle = (tag: string) => {
    const t = tag.toUpperCase();
    if (t.includes('WRITE') || t.includes('MSI_INV') || t.includes('ERROR') || t.includes('FAIL')) {
      return 'bg-state-m/15 text-state-m border-state-m/30';
    }
    if (t.includes('REQ')) {
      return 'bg-info/15 text-info border-info/30';
    }
    if (t.includes('SYNC') || t.includes('MUTEX') || t.includes('LOCK')) {
      return 'bg-sync/15 text-sync border-sync/30';
    }
    if (t.includes('GRANT') || t.includes('COHERENCE') || t.includes('OK')) {
      return 'bg-ok/15 text-ok border-ok/30';
    }
    if (t.includes('MEM') || t.includes('PAGE_FAULT') || t.includes('WARN')) {
      return 'bg-warn/15 text-warn border-warn/30';
    }
    return 'bg-surface-3 text-text-3 border-border';
  };

  const filteredLogs = logs.filter((log) => {
    const matchesTag = filterTag === 'ALL' || log.tag.toUpperCase() === filterTag;
    const matchesSearch = !searchQuery || log.text.toLowerCase().includes(searchQuery.toLowerCase()) || log.tag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = commandText.trim();
      if (!trimmed) return;
      onSendCommand(trimmed);
      setCommandHistory((prev) => [trimmed, ...prev.slice(0, 30)]);
      setCommandText('');
      setHistoryIndex(-1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCommandText(commandHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommandText(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandText('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const autocompletes = ['write', 'read', 'lock', 'unlock', 'clear'];
      const current = commandText.trim().toLowerCase();
      const found = autocompletes.find((cmd) => cmd.startsWith(current));
      if (found) {
        setCommandText(found === 'write' ? 'write 0x1A3F 100' : found === 'read' ? 'read 0x1A3F' : found === 'lock' ? 'lock 0x1A3F' : found === 'unlock' ? 'unlock 0x1A3F' : 'clear');
      }
    }
  };

  const uniqueTags = ['ALL', 'INFO', 'REQ', 'GRANT', 'WRITE', 'SYNC', 'MEM'];

  return (
    <div className="rounded-xl bg-surface-1 border border-border card-highlight flex flex-col h-[460px] overflow-hidden relative">
      {/* Header with Tabs and Actions */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-1">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-text-3" />
          <div className="flex items-center p-0.5 rounded-lg bg-surface-2 border border-border text-xs">
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                activeTab === 'logs' ? 'bg-surface-3 text-text font-semibold shadow-xs' : 'text-text-3 hover:text-text'
              }`}
            >
              Event Log ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('command')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                activeTab === 'command' ? 'bg-surface-3 text-text font-semibold shadow-xs' : 'text-text-3 hover:text-text'
              }`}
            >
              Shell CLI
            </button>
          </div>
        </div>

        {/* Clear Button */}
        <button
          onClick={onClearLogs}
          className="p-1.5 text-text-3 hover:text-text bg-surface-2 hover:bg-surface-3 border border-border rounded-md transition-colors cursor-pointer"
          title="Clear console buffer"
          aria-label="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter and Search Bar (Active in Logs tab) */}
      {activeTab === 'logs' && (
        <div className="px-4 py-2 border-b border-border bg-surface-2/30 flex items-center justify-between gap-2 text-xs">
          {/* Tag Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {uniqueTags.map((t) => (
              <button
                key={t}
                onClick={() => setFilterTag(t)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  filterTag === t
                    ? 'bg-text text-bg font-semibold'
                    : 'bg-surface-2 text-text-3 hover:text-text border border-border'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          <div className="relative w-36 sm:w-44 shrink-0">
            <Search className="w-3.5 h-3.5 text-text-3 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-surface-2 border border-border rounded text-text placeholder:text-text-3 outline-none focus:border-info"
            />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-1.5"
        aria-live="polite"
      >
        {activeTab === 'logs' ? (
          filteredLogs.length > 0 ? (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 py-1 px-1.5 rounded hover:bg-surface-2/40 transition-colors"
              >
                <span className="text-text-3 shrink-0 tabular-nums text-[11px] select-none pt-0.5">
                  {log.time}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider shrink-0 border ${getTagStyle(
                    log.tag
                  )}`}
                >
                  {log.tag}
                </span>
                <span className="text-text-2 break-all leading-relaxed">
                  {log.text}
                </span>
              </div>
            ))
          ) : (
            <div className="h-full flex items-center justify-center text-text-3 text-xs italic">
              No matching log events.
            </div>
          )
        ) : (
          /* Command Reference / Guide when in Command tab */
          <div className="space-y-4 p-2 text-xs">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-text">DSM Kernel Command Interface</span>
              <p className="text-text-3 text-xs leading-relaxed">
                Execute distributed shared memory primitives directly on the cluster. Commands trigger real kernel page faults, MSI coherence invalidations, or Ricart-Agrawala mutual exclusion.
              </p>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-3">Supported Syntax:</span>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center">
                  <span className="text-text font-medium">write &lt;addr&gt; &lt;val&gt;</span>
                  <span className="text-text-3">e.g. write 0x1A3F 100</span>
                </div>
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center">
                  <span className="text-text font-medium">read &lt;addr&gt;</span>
                  <span className="text-text-3">e.g. read 0x1A3F</span>
                </div>
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center">
                  <span className="text-text font-medium">lock &lt;addr&gt;</span>
                  <span className="text-text-3">e.g. lock 0x1A3F</span>
                </div>
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center">
                  <span className="text-text font-medium">unlock &lt;addr&gt;</span>
                  <span className="text-text-3">e.g. unlock 0x1A3F</span>
                </div>
                <div className="p-2 rounded bg-surface-2 border border-border flex justify-between items-center">
                  <span className="text-text font-medium">clear</span>
                  <span className="text-text-3">Clear log ring buffer</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Jump to Latest Floating Button */}
      {userHasScrolledUp && activeTab === 'logs' && (
        <button
          onClick={scrollToBottom}
          className="absolute right-5 bottom-14 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-3 hover:bg-surface-2 border border-border-strong text-xs font-medium text-text shadow-lg cursor-pointer transition-all"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Pinned Command Input */}
      <div className="p-2.5 border-t border-border bg-surface-2/50">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1 border border-border focus-within:border-info transition-colors">
          <span className="font-mono text-xs text-text-3 font-semibold select-none">
            dsm ›
          </span>
          <input
            type="text"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="write 0x1A3F 100, read 0x1A3F, lock 0x1A3F, or clear..."
            className="flex-1 bg-transparent border-0 outline-none font-mono text-xs text-text placeholder:text-text-3"
          />
          <button
            onClick={() => {
              const trimmed = commandText.trim();
              if (!trimmed) return;
              onSendCommand(trimmed);
              setCommandHistory((prev) => [trimmed, ...prev.slice(0, 30)]);
              setCommandText('');
            }}
            className="p-1 rounded text-text-3 hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
            title="Execute command (Enter)"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
