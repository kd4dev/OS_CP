# Distributed Shared Memory (DSM) System

A complete C++ implementation of a Distributed Shared Memory system with MSI coherence protocol, distributed synchronization, structured logging, and an interactive TUI.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       DSMManager                             │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────────┐ │
│  │ PageTable  │  │NodeRegistry │  │  CoherenceProtocol    │ │
│  │ (mmap/VEH) │  │(Phi-accrual)│  │  (MSI state machine)  │ │
│  └─────┬──────┘  └──────┬──────┘  └──────────┬────────────┘ │
│        │                │                     │              │
│  ┌─────▼────────────────▼─────────────────────▼────────────┐ │
│  │                  NetworkLayer (TCP)                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────────┐ │
│  │  SyncManager │  │    Logger      │  │   DSMConsole(TUI) │ │
│  │  (RA mutex,  │  │(file+ring+sink)│  │ (ANSI dashboard)  │ │
│  │   barrier)   │  └────────────────┘  └───────────────────┘ │
│  └──────────────┘                                            │
└──────────────────────────────────────────────────────────────┘
```

## Features

| Feature | Implementation |
|---|---|
| **Coherence Protocol** | MSI (Modified / Shared / Invalid) via home-node directory |
| **Page Faults** | SIGSEGV handler (Linux) / VEH (Windows), 4 KiB pages |
| **Memory Backing** | `mmap` / `VirtualAlloc` with `mprotect` / `VirtualProtect` |
| **Networking** | Async TCP with framing, checksum, pending-reply map |
| **Failure Detection** | Phi-accrual detector with heartbeat exchange |
| **Distributed Mutex** | Ricart-Agrawala algorithm with Lamport clocks |
| **Distributed Barrier** | Centralized arrive/release broadcast |
| **Logging** | Structured, thread-safe, rotating file + ANSI console |
| **TUI** | Live ANSI dashboard: nodes / pages / stats / logs / shell |
| **Tests** | 45 unit tests across 4 suites (no external deps) |

---

## Building

### Prerequisites
- CMake ≥ 3.16
- C++17 compiler: GCC 9+, Clang 10+, or MSVC 2019+
- POSIX (Linux/macOS) or Windows 10+

### Linux / macOS

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . -j$(nproc)
```

### Windows (MSVC)

```powershell
mkdir build; cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### Debug build (with AddressSanitizer)

```bash
cmake .. -DCMAKE_BUILD_TYPE=Debug
cmake --build . -j$(nproc)
```

---

## Running

### Single node (standalone test)

```bash
./bin/dsm_node --id 0 --port 7000 --demo
```

### Three-node cluster

```bash
# Terminal 1 — Node 0 (first node, becomes directory home)
./bin/dsm_node --id 0 --port 7000

# Terminal 2 — Node 1
./bin/dsm_node --id 1 --port 7001 --peer 0:127.0.0.1:7000

# Terminal 3 — Node 2
./bin/dsm_node --id 2 --port 7002 --peer 0:127.0.0.1:7000 --peer 1:127.0.0.1:7001
```

### All CLI options

```
--id      <N>              Node ID (required)
--addr    <ip>             Local bind address (default: 127.0.0.1)
--port    <port>           Local port        (default: 7000)
--peer    <id>:<ip>:<port> Add a peer (repeatable)
--mem     <MiB>            Shared memory size (default: 64 MiB)
--log     <file>           Log file           (default: dsm.log)
--no-ui                    Disable interactive TUI
--verbose                  Enable DEBUG log level
--demo                     Run built-in read/write demo on startup
```

---

## Running Tests

```bash
cd build
ctest --output-on-failure

# Or run directly:
./bin/dsm_tests

# Run a specific suite:
./bin/dsm_tests --filter=PageCoherence
./bin/dsm_tests --filter=Synchronization
./bin/dsm_tests --filter=Network
./bin/dsm_tests --filter=Integration
```

### Test Suites (45 tests total)

| Suite | Tests | Coverage |
|---|---|---|
| `PageCoherence` | 15 | MSI states, directory entries, address arithmetic, atomic stats |
| `Synchronization` | 15 | Lamport clocks, Ricart-Agrawala logic, mutex, barrier |
| `Network` | 15 | Message framing, checksums, future/promise, sequence counters |
| `Integration` | 15 | Logger file I/O, PhiDetector, home-node assignment, concurrency |

---

## Interactive TUI Commands

Once running, the TUI shows a live dashboard. Type commands at the `DSM>` prompt:

| Command | Description |
|---|---|
| `help` | List all available commands |
| `nodes` | Show cluster node list with status and phi values |
| `pages` | Dump all non-invalid local pages |
| `stats` | Print all counters |
| `loglevel <LEVEL>` | Change log level (TRACE/DEBUG/INFO/WARN/ERROR) |
| `clear` | Clear the screen |
| `quit` | Gracefully stop this node |

---

## File Structure

```
DSM_Project/
├── include/
│   ├── dsm_core.h       — Types, constants, DSMManager declaration
│   ├── dsm_logger.h     — Logger with levels, rotation, sinks
│   ├── dsm_page.h       — PageTable, DirectoryEntry, LocalPageEntry
│   ├── dsm_node.h       — NodeRegistry, PhiDetector
│   ├── dsm_protocol.h   — CoherenceProtocol (MSI)
│   ├── dsm_sync.h       — DistributedMutex, DistributedBarrier, SyncManager
│   ├── dsm_network.h    — NetworkLayer, MsgHeader, MsgType
│   └── dsm_ui.h         — DSMConsole, ANSI helpers, progressBar
├── src/
│   ├── dsm_core.cpp     — DSMManager lifecycle, signal handler
│   ├── dsm_logger.cpp   — Logger implementation
│   ├── dsm_network.cpp  — TCP accept/connect, send/recv, pending replies
│   ├── dsm_node.cpp     — Heartbeat, Phi-accrual, membership
│   ├── dsm_page.cpp     — mmap, page faults, directory protocol
│   ├── dsm_protocol.cpp — MSI read/write/invalidate/downgrade handlers
│   ├── dsm_sync.cpp     — Ricart-Agrawala mutex, centralized barrier
│   ├── dsm_ui.cpp       — Live ANSI TUI, interactive command shell
│   └── main.cpp         — CLI entry point, demo workload
├── tests/
│   ├── test_runner.h/cpp          — Lightweight test framework
│   ├── test_page_coherence.cpp    — 15 page/coherence tests
│   ├── test_sync.cpp              — 15 sync primitive tests
│   ├── test_network.cpp           — 15 network/message tests
│   ├── test_integration.cpp       — 15 integration tests
│   └── main.cpp                   — Test binary entry point
├── CMakeLists.txt
└── README.md
```

---

## Design Decisions

- **Home-node directory**: each page is assigned a home node via `pid % num_nodes`.  The home holds the authoritative directory entry (sharers list + owner).
- **MSI protocol**: simpler than MESI; the Invalid→Shared path always fetches from home. Upgrade (Shared→Modified) sends a WRITE_REQ with current data, avoiding a round-trip for the page content.
- **Phi-accrual failure detector** (Hayashibara et al.): adapts to network jitter by learning the inter-heartbeat interval distribution. Threshold = 8.0 (suspected), 16.0 (declared dead).
- **Ricart-Agrawala mutex**: uses Lamport timestamps + node-ID tiebreak. Nodes defer replies to higher-priority requests, reply immediately otherwise.
- **No external dependencies**: the entire system uses C++17 stdlib + POSIX/WinSock only.
