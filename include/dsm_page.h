#pragma once
/**
 * dsm_page.h — DSM Page Table & Fault Handler
 */
#include "dsm_core.h"
#include <unordered_set>
#include <functional>
#include <utility>
#include <vector>

#ifdef _WIN32
#  include <windows.h>
#else
#  include <sys/mman.h>
#  include <signal.h>
#endif

namespace dsm {

class DSMManager;

// ─────────────────────────────── Directory Entry ────────────────────────────

/// Home-node directory entry: who holds this page and in what state
struct DirectoryEntry {
    PageState           state   = PageState::Invalid;
    NodeId              owner   = INVALID_NODE_ID;     ///< Modified owner (if MOD)
    std::unordered_set<NodeId> sharers;               ///< Shared readers
    SeqNum              version = 0;
    std::vector<uint8_t> data;

    DirectoryEntry() : data(PAGE_SIZE, 0) {}

    bool isShared()   const { return state == PageState::Shared;   }
    bool isModified() const { return state == PageState::Modified; }
    bool isInvalid()  const { return state == PageState::Invalid;  }
};

// ─────────────────────────────── LocalPageEntry ──────────────────────────────

/// Per-page tracking on THIS node
struct LocalPageEntry {
    PageId      pageId    = 0;
    PageState   state     = PageState::Invalid;
    void*       addr      = nullptr;      ///< mmap base + pageId*PAGE_SIZE
    SeqNum      version   = 0;
    bool        dirty     = false;
    uint64_t    lastAccess= 0;            ///< Unix ms timestamp
    Mutex       pageMu;                   ///< Per-page lock

    LocalPageEntry() = default;
    LocalPageEntry(const LocalPageEntry&) = delete;
    LocalPageEntry& operator=(const LocalPageEntry&) = delete;
};

// ─────────────────────────────── PageTable ───────────────────────────────────

class PageTable {
public:
    PageTable(DSMManager& mgr, size_t regionSize);
    ~PageTable();

    // Called by DSMManager::handlePageFault
    bool handleFault(void* addr, AccessType access);

    // --- Directory operations (home node only) ---
    /// Process a read request from a remote node; returns {ok, page data}
    std::pair<bool, std::vector<uint8_t>>
    directoryRead(NodeId requester, PageId pid);

    /// Process a write request from a remote node; returns {ok, page data}
    std::pair<bool, std::vector<uint8_t>>
    directoryWrite(NodeId requester, PageId pid);

    /// Mark that a node has written back a dirty page
    void directoryWriteback(NodeId sender, PageId pid,
                            const std::vector<uint8_t>& data);

    /// Called when a node leaves the cluster
    void nodeLeft(NodeId id);

    // --- Local state queries ---
    void*  baseAddr()   const { return base_; }
    size_t regionSize() const { return regionSize_; }
    bool   ownsAddr(const void* addr) const;
    PageId addrToPage(const void* addr) const;
    void*  pageToAddr(PageId pid) const;

    LocalPageEntry& entry(PageId pid);

    /// Iterate all local pages (for diagnostics)
    void forEachPage(const std::function<void(const LocalPageEntry&)>& fn) const;

    // Stats
    size_t totalPages()   const { return numPages_; }
    size_t validPages()   const;

    // Invalidate a local page (called by coherence protocol)
    void invalidate(PageId pid);

    // Downgrade MOD→SHR (called when another node wants read)
    std::vector<uint8_t> writebackAndDowngrade(PageId pid);

    // Upgrade SHR→MOD protection
    void upgradeToModified(PageId pid);

    // Memory protection control
    void protectPage(PageId pid, PageState desired);

private:
    void  mapRegion();
    void  unmapRegion();

    DSMManager&  mgr_;
    void*        base_      = nullptr;
    size_t       regionSize_= 0;
    size_t       numPages_  = 0;

    // Local page table: indexed by PageId
    std::vector<std::unique_ptr<LocalPageEntry>> pages_;
    mutable SharedMutex tableMu_;

    // Home-node directory: indexed by PageId
    std::vector<std::unique_ptr<DirectoryEntry>> directory_;
    std::vector<std::unique_ptr<Mutex>>          dirMu_;
};

} // namespace dsm
