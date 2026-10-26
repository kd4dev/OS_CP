import React, { useState, useEffect } from 'react';
import { 
  Terminal, Activity, Cpu, Database, Shield, Radio, Server, 
  Settings, Play, Pause, Square, ChevronRight, Lock, Unlock, 
  RefreshCw, Layers, Zap, Wifi, Eye, HardDrive, AlertCircle 
} from 'lucide-react';

export default function DSMDashboard() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [isRunning, setIsRunning] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  const [logs, setLogs] = useState([
    '[22:14:01] [INFO] Node 1 connected (127.0.0.1:7000)',
    '[22:14:02] [INFO] Node 2 connected (127.0.0.1:7001)',
    '[22:14:03] [INFO] Node 3 connected (127.0.0.1:7002)',
    '[22:14:05] [SYNC] Initializing directory service (home-node scheme)',
    '[22:14:06] [MEM] Shared region created (Size: 64 MiB at 01160000)',
    '[22:14:07] [INFO] Consistency protocol: MSI Directory-based',
    '[22:14:10] [REQ] Node 2 requesting address 0x1A3F (Write)',
    '[22:14:10] [GRANT] Access granted (Exclusive Modified)',
    '[22:14:12] [WRITE] Node 2 writing 1024 integers to shared memory',
    '[22:14:13] [UPDATE] Memory updated successfully, version 1',
    '[22:14:15] [INFO] All nodes synchronized via centralized barrier'
  ]);

  const [stats, setStats] = useState({
    pageFaults: 1,
    readReqs: 0,
    writeReqs: 1,
    invalidations: 0,
    msgsSent: 42,
    msgsRecv: 38,
    bytesSent: '16.4 KB',
    bytesRecv: '14.8 KB',
    barrierEvents: 2,
    lockAcquires: 1
  });

  const [memoryCells, setMemoryCells] = useState(() => {
    const grid = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 16; c++) {
        const byte = Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
        row.push(byte);
      }
      grid.push(row);
    }
    return grid;
  });

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        msgsSent: prev.msgsSent + Math.floor(Math.random() * 3),
        msgsRecv: prev.msgsRecv + Math.floor(Math.random() * 3)
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    const timeStr = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [...prev, `[${timeStr}] [CMD] > ${commandInput}`, `[${timeStr}] [INFO] Executed successfully.`]);
    setCommandInput('');
  };

  const runPresetCommand = (cmd) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    setLogs(prev => [...prev, `[${timeStr}] [CMD] > ${cmd}`, `[${timeStr}] [INFO] Command processed by DSM kernel.`]);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff66] font-mono select-none flex flex-col justify-between overflow-x-hidden">
      
      {/* TOP HEADER */}
      <header className="border-b border-[#00ff66]/20 bg-[#080d09] px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 border border-[#00ff66]/40 p-2 bg-[#00ff66]/5 rounded">
            <Layers className="w-5 h-5 text-[#00ff66]" />
            <span className="font-bold tracking-wider text-white text-lg">DSMS</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-widest">Distributed Shared Memory System</h1>
            <p className="text-[10px] text-[#00ff66]/60">MSI Protocol • Ricart-Agrawala Mutex • Phi-Accrual Detector</p>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <nav className="hidden md:flex space-x-1 bg-[#030704] p-1 border border-[#00ff66]/20 rounded text-xs">
          {['Simulation', 'Memory View', 'Processes', 'Logs', 'Settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded transition-all ${
                activeTab === tab 
                  ? 'bg-[#00ff66] text-black font-bold shadow-[0_0_10px_rgba(0,255,102,0.4)]' 
                  : 'text-[#00ff66]/70 hover:text-[#00ff66] hover:bg-[#00ff66]/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* SYSTEM STATUS BADGE */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-[#00ff66]/10 border border-[#00ff66]/30 px-3 py-1 rounded text-xs">
            <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse"></span>
            <span className="text-white font-semibold">System Online</span>
          </div>
          <div className="text-xs text-[#00ff66]/70 border-l border-[#00ff66]/20 pl-4">
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT GRID */}
      <div className="flex flex-1 p-6 gap-6">

        {/* LEFT SIDEBAR MENU */}
        <aside className="w-64 bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4 flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.8)]">
          <div className="space-y-6">
            <div>
              <p className="text-[10px] text-[#00ff66]/50 uppercase tracking-widest px-3 mb-2">Navigation</p>
              <div className="space-y-1">
                {[
                  { name: 'Overview', icon: Activity },
                  { name: 'Nodes', icon: Server },
                  { name: 'Processes', icon: Cpu },
                  { name: 'Memory', icon: Database },
                  { name: 'Synchronization', icon: Lock },
                  { name: 'Logs', icon: Terminal },
                  { name: 'Configuration', icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.name || (activeTab === 'Simulation' && item.name === 'Overview');
                  return (
                    <button
                      key={item.name}
                      onClick={() => setActiveTab(item.name === 'Overview' ? 'Simulation' : item.name)}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded text-xs transition-all ${
                        isActive
                          ? 'bg-[#00ff66]/15 text-white border-l-2 border-[#00ff66] font-semibold'
                          : 'text-[#00ff66]/70 hover:bg-[#00ff66]/5 hover:text-[#00ff66]'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#00ff66]" />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SIMULATION CONTROL WIDGET */}
            <div className="border border-[#00ff66]/20 bg-[#030704] p-3 rounded">
              <p className="text-[10px] text-[#00ff66]/70 mb-2 uppercase tracking-wider">Simulation Control</p>
              <div className="w-full bg-[#00ff66]/10 h-1.5 rounded-full mb-3 overflow-hidden">
                <div className="bg-[#00ff66] h-full w-3/4 animate-pulse"></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setIsRunning(!isRunning)}
                  className={`flex items-center justify-center p-2 rounded text-black font-bold text-xs transition-all ${
                    isRunning ? 'bg-[#ffaa00] hover:bg-[#ffaa00]/80' : 'bg-[#00ff66] hover:bg-[#00ff66]/80'
                  }`}
                  title={isRunning ? "Pause" : "Run"}
                >
                  {isRunning ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black" />}
                </button>
                <button 
                  onClick={() => { setIsRunning(false); }}
                  className="flex items-center justify-center p-2 rounded bg-[#ff3333]/20 border border-[#ff3333]/50 text-[#ff3333] hover:bg-[#ff3333]/30 text-xs"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
                <button 
                  onClick={() => setStats(prev => ({ ...prev, pageFaults: 0 }))}
                  className="flex items-center justify-center p-2 rounded bg-[#00ff66]/10 border border-[#00ff66]/30 text-[#00ff66] hover:bg-[#00ff66]/20 text-xs"
                  title="Reset Counters"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-[#00ff66]/40 text-center border-t border-[#00ff66]/10 pt-3">
            C++17 Kernel • WinSock / POSIX
          </div>
        </aside>

        {/* CENTER / RIGHT DASHBOARD AREA */}
        <div className="flex-1 flex flex-col gap-6">

          {/* TOP SECTION: NETWORK TOPOLOGY & LOGS/COMMANDS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* NETWORK TOPOLOGY VISUALIZER */}
            <div className="lg:col-span-2 bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-5 relative overflow-hidden flex flex-col justify-between shadow-[inset_0_0_30px_rgba(0,255,102,0.03)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">Network Topology</h2>
                  <p className="text-[11px] text-[#00ff66]/60">Distributed Nodes & Shared Memory Access Bus</p>
                </div>
                <div className="flex items-center space-x-4 text-[10px]">
                  <span className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#00ff66]"></span><span className="text-[#00ff66]/80">Memory Access</span></span>
                  <span className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#00ffff]"></span><span className="text-[#00ff66]/80">Sync</span></span>
                  <span className="flex items-center space-x-1.5"><span className="w-2 h-2 rounded-full bg-[#ffaa00]"></span><span className="text-[#00ff66]/80">Transfer</span></span>
                </div>
              </div>

              {/* SVG Topologic Map */}
              <div className="relative h-64 flex items-center justify-center my-2">
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <line x1="50%" y1="50%" x2="50%" y2="20%" stroke="#00ff66" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                  <line x1="50%" y1="50%" x2="25%" y2="50%" stroke="#00ff66" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                  <line x1="50%" y1="50%" x2="75%" y2="50%" stroke="#00ff66" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                  <line x1="50%" y1="50%" x2="50%" y2="80%" stroke="#00ff66" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                </svg>

                {/* Central Directory Node */}
                <div className="absolute z-10 bg-[#030704] border border-[#00ff66] p-3 rounded-lg shadow-[0_0_20px_rgba(0,255,102,0.3)] text-center">
                  <Database className="w-6 h-6 text-[#00ff66] mx-auto mb-1 animate-pulse" />
                  <p className="text-xs font-bold text-white">Distributed Shared Memory</p>
                  <p className="text-[10px] text-[#00ff66]/60">Coherent • Synchronized • Accessible</p>
                </div>

                {/* Node 1 (Top) */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#050b06] border border-[#00ff66]/40 p-2.5 rounded w-44 text-xs shadow-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white flex items-center space-x-1">
                      <Server className="w-3.5 h-3.5 text-[#00ff66]" />
                      <span>Node 1</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  </div>
                  <p className="text-[10px] text-[#00ff66]/60">127.0.0.1:7000</p>
                  <div className="flex justify-between text-[10px] mt-2 text-white/80">
                    <span>CPU: 42%</span>
                    <span>Mem: 68%</span>
                  </div>
                </div>

                {/* Node 2 (Left) */}
                <div className="absolute left-2 top-1/2 -translate-y-1/2 bg-[#050b06] border border-[#00ff66]/40 p-2.5 rounded w-44 text-xs shadow-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white flex items-center space-x-1">
                      <Server className="w-3.5 h-3.5 text-[#00ff66]" />
                      <span>Node 2</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  </div>
                  <p className="text-[10px] text-[#00ff66]/60">127.0.0.1:7001</p>
                  <div className="flex justify-between text-[10px] mt-2 text-white/80">
                    <span>CPU: 35%</span>
                    <span>Mem: 61%</span>
                  </div>
                </div>

                {/* Node 3 (Right) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#050b06] border border-[#00ff66]/40 p-2.5 rounded w-44 text-xs shadow-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white flex items-center space-x-1">
                      <Server className="w-3.5 h-3.5 text-[#00ff66]" />
                      <span>Node 3</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  </div>
                  <p className="text-[10px] text-[#00ff66]/60">127.0.0.1:7002</p>
                  <div className="flex justify-between text-[10px] mt-2 text-white/80">
                    <span>CPU: 27%</span>
                    <span>Mem: 45%</span>
                  </div>
                </div>

                {/* Node 4 (Bottom) */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-[#050b06] border border-[#00ff66]/40 p-2.5 rounded w-44 text-xs shadow-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white flex items-center space-x-1">
                      <Server className="w-3.5 h-3.5 text-[#00ff66]" />
                      <span>Node 4</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  </div>
                  <p className="text-[10px] text-[#00ff66]/60">127.0.0.1:7003</p>
                  <div className="flex justify-between text-[10px] mt-2 text-white/80">
                    <span>CPU: 51%</span>
                    <span>Mem: 73%</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#00ff66]/70 flex justify-between items-center border-t border-[#00ff66]/10 pt-3">
                <span>Directory Home Node: Node 0 (Local)</span>
                <span>Active Ping Latency: 1.2ms avg</span>
              </div>
            </div>

            {/* CONSOLE / SYSTEM LOGS & COMMAND PANEL */}
            <div className="flex flex-col gap-6">
              
              {/* Console Logs */}
              <div className="flex-1 bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white tracking-wider">Console / System Logs</h3>
                  <span className="flex items-center space-x-1 text-[10px] bg-[#00ff66]/10 px-2 py-0.5 rounded text-[#00ff66]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ff66] animate-ping"></span>
                    <span>Live</span>
                  </span>
                </div>

                <div className="bg-[#030704] border border-[#00ff66]/10 rounded p-2.5 h-44 overflow-y-auto text-[11px] space-y-1 font-mono">
                  {logs.map((log, i) => (
                    <div key={i} className="text-[#00ff66]/80 leading-tight">
                      {log.includes('[INFO]') ? <span className="text-[#00ff66]">{log}</span> :
                       log.includes('[SYNC]') ? <span className="text-[#00ffff]">{log}</span> :
                       log.includes('[MEM]') ? <span className="text-[#ffaa00]">{log}</span> :
                       log.includes('[REQ]') ? <span className="text-[#ff3399]">{log}</span> :
                       <span className="text-white">{log}</span>}
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCommandSubmit} className="mt-2 flex items-center bg-[#030704] border border-[#00ff66]/30 rounded px-2 py-1">
                  <span className="text-[#00ff66] mr-2">&gt;</span>
                  <input 
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="Type command..."
                    className="bg-transparent border-none outline-none text-xs text-white w-full font-mono"
                  />
                  <button type="submit" className="text-[#00ff66] hover:text-white"><ChevronRight className="w-4 h-4" /></button>
                </form>
              </div>

              {/* Command Quick Panel */}
              <div className="bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-white">Command Panel</h3>
                  <span className="text-[10px] text-[#00ff66]/60 cursor-pointer hover:underline">Preset Commands</span>
                </div>
                <div className="text-[11px] bg-[#030704] border border-[#00ff66]/10 rounded p-2 space-y-1 text-[#00ff66]/80">
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <button onClick={() => runPresetCommand('allocate 64')} className="text-left hover:text-white hover:bg-[#00ff66]/10 p-1 rounded">allocate &lt;size&gt;</button>
                    <button onClick={() => runPresetCommand('read 0x1A3F')} className="text-left hover:text-white hover:bg-[#00ff66]/10 p-1 rounded">read &lt;address&gt;</button>
                    <button onClick={() => runPresetCommand('write 0x1A3F 100')} className="text-left hover:text-white hover:bg-[#00ff66]/10 p-1 rounded">write &lt;addr&gt; &lt;val&gt;</button>
                    <button onClick={() => runPresetCommand('lock demo_lock')} className="text-left hover:text-white hover:bg-[#00ff66]/10 p-1 rounded">lock &lt;address&gt;</button>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* BOTTOM SECTION: MEMORY VIEW, NODE STATUS, METRICS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* MEMORY VIEW (HEX DUMP) */}
            <div className="bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Memory View</h3>
                  <p className="text-[10px] text-[#00ff66]/60">Distributed Shared Memory Map (64 MiB)</p>
                </div>
                <select className="bg-[#030704] border border-[#00ff66]/30 text-[11px] text-[#00ff66] rounded px-2 py-1 outline-none">
                  <option>Node 1 View</option>
                  <option>Node 2 View</option>
                  <option>Node 3 View</option>
                </select>
              </div>

              {/* Hex Dump Grid */}
              <div className="bg-[#030704] border border-[#00ff66]/10 rounded p-2 overflow-x-auto text-[10px] font-mono">
                <div className="grid grid-cols-17 gap-1 text-center text-[#00ff66]/50 mb-1 border-b border-[#00ff66]/10 pb-1">
                  <span></span>
                  {Array.from({length: 16}).map((_, i) => (
                    <span key={i}>{i.toString(16).toUpperCase().padStart(2, '0')}</span>
                  ))}
                </div>
                {memoryCells.map((row, r) => (
                  <div key={r} className="grid grid-cols-17 gap-1 items-center mb-0.5">
                    <span className="text-[#00ff66]/50">0x00{(r*10).toString(16).toUpperCase().padStart(2, '0')}</span>
                    {row.map((cell, c) => {
                      const isHighlighted = (r === 0 && c === 3) || (r === 5 && c === 9);
                      return (
                        <span 
                          key={c} 
                          className={`text-center py-0.5 rounded ${
                            isHighlighted ? 'bg-[#00ff66] text-black font-bold shadow-[0_0_8px_rgba(0,255,102,0.8)]' : 'text-[#00ff66]/80 hover:bg-[#00ff66]/10'
                          }`}
                        >
                          {cell}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* NODE STATUS */}
            <div className="bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-white">Node Status</h3>
                <span className="text-[10px] bg-[#00ff66]/10 border border-[#00ff66]/30 px-2 py-0.5 rounded text-[#00ff66]">All Nodes</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#00ff66]/20 text-[#00ff66]/60">
                      <th className="pb-2">Node</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">CPU</th>
                      <th className="pb-2">Memory</th>
                      <th className="pb-2">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#00ff66]/10">
                    {[
                      { name: 'Node 1', status: 'Online', cpu: '42%', mem: '68%', latency: '12 ms' },
                      { name: 'Node 2', status: 'Online', cpu: '35%', mem: '61%', latency: '15 ms' },
                      { name: 'Node 3', status: 'Online', cpu: '27%', mem: '45%', latency: '18 ms' },
                      { name: 'Node 4', status: 'Online', cpu: '51%', mem: '73%', latency: '14 ms' },
                    ].map((node, i) => (
                      <tr key={i} className="hover:bg-[#00ff66]/5">
                        <td className="py-2 font-bold text-white">{node.name}</td>
                        <td className="py-2 flex items-center space-x-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#00ff66]"></span><span>{node.status}</span></td>
                        <td className="py-2">{node.cpu}</td>
                        <td className="py-2 text-[#00ffff]">{node.mem}</td>
                        <td className="py-2 text-[#00ff66]/80">{node.latency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 pt-3 border-t border-[#00ff66]/10">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#00ff66]/70">Memory Usage</span>
                  <span className="text-white font-bold">42% used</span>
                </div>
                <div className="w-full bg-[#030704] border border-[#00ff66]/30 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00ff66] h-full w-[42%] shadow-[0_0_10px_rgba(0,255,102,0.8)]"></div>
                </div>
                <div className="flex justify-between text-[10px] text-[#00ff66]/50 mt-1">
                  <span>27.1 MB / 64 MB</span>
                  <span>Free: 36.9 MB</span>
                </div>
              </div>
            </div>

            {/* PERFORMANCE METRICS */}
            <div className="bg-[#080d09] border border-[#00ff66]/20 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-white">Performance Metrics</h3>
                <span className="text-[10px] text-[#00ff66]/60 bg-[#030704] border border-[#00ff66]/20 px-2 py-0.5 rounded">1 Min</span>
              </div>

              {/* Sparkline Canvas Simulation */}
              <div className="bg-[#030704] border border-[#00ff66]/10 rounded p-3 h-36 flex flex-col justify-between relative">
                <svg className="absolute inset-0 w-full h-full p-3 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 50">
                  <path d="M 0 35 Q 12 20, 25 30 T 50 15 T 75 25 T 100 10" fill="none" stroke="#00ff66" strokeWidth="1.5" />
                  <path d="M 0 42 Q 15 35, 30 38 T 60 30 T 80 35 T 100 28" fill="none" stroke="#00ffff" strokeWidth="1.2" />
                  <path d="M 0 45 Q 20 42, 40 44 T 70 40 T 90 42 T 100 39" fill="none" stroke="#ffaa00" strokeWidth="1" />
                </svg>
                <div className="flex justify-between text-[9px] text-[#00ff66]/40 z-10">
                  <span>100</span>
                  <span>50</span>
                  <span>0</span>
                </div>
                <div className="flex justify-between text-[9px] text-[#00ff66]/50 z-10 pt-2 border-t border-[#00ff66]/10">
                  <span>22:13</span>
                  <span>22:14</span>
                  <span>22:15</span>
                  <span>22:16</span>
                  <span>22:17</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] mt-2 pt-2 border-t border-[#00ff66]/10">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00ff66]"></span>
                  <span className="text-[#00ff66]/80">Read Reqs</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00ffff]"></span>
                  <span className="text-[#00ff66]/80">Write Reqs</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ffaa00]"></span>
                  <span className="text-[#00ff66]/80">Sync</span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}