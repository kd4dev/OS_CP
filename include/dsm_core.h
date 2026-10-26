#pragma once
/**
 * dsm_core.h — Distributed Shared Memory: Core Types & Manager
 *
 * Defines fundamental types, constants, and the top-level DSMManager
 * class that coordinates all DSM subsystems.
 */

#include "dsm_os.h"
#include <cstdint>
#include <cstddef>
#include <string>
#include <memory>
#include <functional>
#include <atomic>
#include <vector>
#include <unordered_map>
#include <chrono>
#include <array>

namespace dsm {

// ─────────────────────────────── Constants ───────────────────────────────────

static constexpr size_t   PAGE_SIZE        = 4096;        ///< 4 KiB pages
static constexpr uint16_t DEFAULT_PORT     = 7000;        ///< Default TCP port
static constexpr uint32_t MAX_NODES        = 64;          ///< Max cluster nodes
static constexpr uint32_t MAX_PAGES        = 65536;       ///< Max shared pages (256 MiB)
static constexpr uint32_t INVALID_NODE_ID  = UINT32_MAX;
static constexpr uint32_t HEARTBEAT_MS     = 500;         ///< Heartbeat interval
static constexpr uint32_t NODE_TIMEOUT_MS  = 3000;        ///< Node failure threshold
static constexpr uint32_t MSG_VERSION      = 1;

// ─────────────────────────────── Basic Types ─────────────────────────────────

using NodeId   = uint32_t;
using PageId   = uint32_t;
using SeqNum   = uint64_t;
using VClock   = std::array<uint64_t, MAX_NODES>;

// ─────────────────────────────── Page States ─────────────────────────────────

/// MSI coherence states for a page on a given node
enum class PageState : uint8_t {
    Invalid  = 0,  ///< Page not present / stale
    Shared   = 1,  ///< Read-only copy
    Modified = 2,  ///< Exclusive read-write copy
};

inline const char* pageStateName(PageState s) {
    switch (s) {
        case PageState::Invalid:  return "INV";
        case PageState::Shared:   return "SHR";
        case PageState::Modified: return "MOD";
        default:                  return "???";
    }
}

// ─────────────────────────────── Access Types ────────────────────────────────

enum class AccessType : uint8_t {
    Read  = 0,
    Write = 1,
};

// ─────────────────────────────── Statistics ──────────────────────────────────

struct NodeStats {
    std::atomic<uint64_t> pageFaults     {0};
    std::atomic<uint64_t> readRequests   {0};
    std::atomic<uint64_t> writeRequests  {0};
    std::atomic<uint64_t> invalidations  {0};
    std::atomic<uint64_t> messagesSent   {0};
    std::atomic<uint64_t> messagesRecv   {0};
    std::atomic<uint64_t> bytesSent      {0};
    std::atomic<uint64_t> bytesRecv      {0};
    std::atomic<uint64_t> barrierCount   {0};
    std::atomic<uint64_t> lockAcquires   {0};

    NodeStats() = default;
    NodeStats(const NodeStats&) = delete;
    NodeStats& operator=(const NodeStats&) = delete;
};

// ─────────────────────────────── Config ──────────────────────────────────────

struct DSMConfig {
    NodeId      localNodeId   = 0;
    std::string localAddress  = "127.0.0.1";
    uint16_t    localPort     = DEFAULT_PORT;
    size_t      memorySize    = 64 * 1024 * 1024;  ///< 64 MiB shared region
    bool        isHomeNode    = false;              ///< First node = directory home
    std::string logFile       = "dsm.log";
    bool        enableUI      = true;
    bool        verboseLog    = false;

    struct PeerInfo {
        NodeId      id;
        std::string address;
        uint16_t    port;
    };
    std::vector<PeerInfo> peers;
};

// ─────────────────────────────── Forward Declarations ────────────────────────

class PageTable;
class NodeRegistry;
class CoherenceProtocol;
class NetworkLayer;
class SyncManager;
class Logger;
class DSMConsole;

// ─────────────────────────────── DSMManager ──────────────────────────────────

/**
 * @brief Central controller for the Distributed Shared Memory system.
 *
 * Owns all subsystems and mediates interaction between them:
 *   - PageTable   : tracks local page states and backing mmap
 *   - NodeRegistry: cluster membership and heartbeats
 *   - CoherenceProtocol: MSI state machine
 *   - NetworkLayer: async TCP messaging
 *   - SyncManager : distributed locks / barriers
 *   - Logger      : structured logging
 *   - DSMConsole  : interactive TUI
 */
class DSMManager {
public:
    explicit DSMManager(DSMConfig cfg);
    ~DSMManager();

    // Lifecycle
    bool start();
    void stop();
    bool isRunning() const { return running_.load(std::memory_order_acquire); }

    // Memory API — used by application threads
    void* allocate(size_t bytes);
    void  deallocate(void* ptr, size_t bytes);

    /// Called by SIGSEGV handler on page fault
    bool handlePageFault(void* addr, AccessType access);

    // Synchronization API
    bool distributedLock(const std::string& name);
    bool distributedUnlock(const std::string& name);
    bool barrier(const std::string& tag, uint32_t participants);

    // Accessors used by subsystems
    const DSMConfig&    config()    const { return cfg_; }
    PageTable&          pageTable()       { return *pageTable_; }
    NodeRegistry&       nodeRegistry()    { return *nodeReg_; }
    CoherenceProtocol&  protocol()        { return *protocol_; }
    NetworkLayer&       network()         { return *network_; }
    SyncManager&        syncManager()     { return *syncMgr_; }
    Logger&             logger()          { return *logger_; }
    NodeStats&          stats()           { return stats_; }
    NodeId              localId()   const { return cfg_.localNodeId; }
    static DSMManager*  instance()        { return instance_; }

    /// Register callback invoked on node join/leave events
    using NodeEventCb = std::function<void(NodeId, bool /*joined*/)>;
    void setNodeEventCallback(NodeEventCb cb);

private:
    void installSigHandler();
#ifndef _WIN32
    static void sigsegvHandler(int sig, siginfo_t* si, void* ctx);
#endif
    static DSMManager* instance_;   ///< Singleton for signal handler

    DSMConfig cfg_;
    std::atomic<bool> running_{false};
    std::atomic<size_t> allocOffset_{0};
    NodeStats stats_;

    std::unique_ptr<Logger>            logger_;
    std::unique_ptr<NetworkLayer>      network_;
    std::unique_ptr<NodeRegistry>      nodeReg_;
    std::unique_ptr<PageTable>         pageTable_;
    std::unique_ptr<CoherenceProtocol> protocol_;
    std::unique_ptr<SyncManager>       syncMgr_;
    std::unique_ptr<DSMConsole>        console_;

    NodeEventCb nodeEventCb_;
    mutable Mutex eventCbMu_;
};

} // namespace dsm
