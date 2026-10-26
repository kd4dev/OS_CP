import { ClusterNode, MemoryStats, MutexState } from './types';

export function downloadEvaluationReport(
  simState: string,
  memoryStats: MemoryStats,
  nodes: ClusterNode[],
  mutexState: MutexState
) {
  const text = `
================================================================================
       DISTRIBUTED SHARED MEMORY (DSM) SYSTEM — OS EVALUATION REPORT
================================================================================
Course Subject: Operating Systems
Date: ${new Date().toLocaleString()}
Kernel Status: ${simState.toUpperCase()}

1. CORE OS OBJECTIVES:
   - OS Virtual Memory: Intercepting page faults via VEH / mmap / mprotect (4 KiB pages)
   - Coherence Protocol: Directory-Based MSI with Write-Invalidate
   - Mutual Exclusion: Ricart-Agrawala Distributed Mutex with Lamport Logical Clocks
   - Failure Detection: Phi-Accrual failure detector (Hayashibara et al.)

2. CLUSTER METRICS:
   - Shared Memory Allocated: ${memoryStats.usedMB} MB / ${memoryStats.totalMB} MB (${memoryStats.percentage}%)
   - Total Hardware Page Faults: ${memoryStats.pageFaults}
   - Cache Hits / Misses: ${memoryStats.cacheHits} / ${memoryStats.cacheMisses}
   - Hit Ratio: ${Math.round((memoryStats.cacheHits / (memoryStats.cacheHits + memoryStats.cacheMisses || 1)) * 100)}%
   - Bus Invalidation Storms (INV): ${memoryStats.invalidations}

3. CLUSTER NODES:
${nodes.map((n) => `   * ${n.name} (${n.ip}): ${n.status} | Lamport Clock: #${n.lamport} | CPU: ${n.cpu} | Mem: ${n.mem}`).join('\n')}

4. ACTIVE DISTRIBUTED LOCKS:
${mutexState.activeLocks?.map((l) => `   * Resource "${l.name}" held by ${l.owner} (Timestamp: #${l.timestamp})`).join('\n') || '   * None'}
================================================================================
`;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DSM_OS_Project_Report_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
