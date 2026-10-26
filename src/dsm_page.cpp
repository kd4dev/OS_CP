/**
 * dsm_page.cpp — Page Table & Fault Handling
 *
 * Implements the mmap-backed shared region, per-page state tracking,
 * memory protection manipulation, and home-node directory logic.
 */

#include "dsm_page.h"
#include "dsm_core.h"
#include "dsm_logger.h"
#include "dsm_network.h"
#include "dsm_protocol.h"
#include <cstring>
#include <cassert>
#include <stdexcept>
#include <algorithm>
#include <chrono>

#ifdef _WIN32
#  include <windows.h>
#else
#  include <sys/mman.h>
#  include <sys/stat.h>
#  include <signal.h>
#  include <unistd.h>
#endif

namespace dsm {

// ─────────────────────────────── Constructor ─────────────────────────────────

PageTable::PageTable(DSMManager& mgr, size_t regionSize)
    : mgr_(mgr)
    , regionSize_(regionSize)
    , numPages_(regionSize / PAGE_SIZE)
{
    assert(regionSize % PAGE_SIZE == 0 && "Region must be page-aligned");
    mapRegion();

    // Initialize page entries
    pages_.resize(numPages_);
    directory_.resize(numPages_);
    dirMu_.resize(numPages_);

    for (size_t i = 0; i < numPages_; ++i) {
        pages_[i]     = std::make_unique<LocalPageEntry>();
        directory_[i] = std::make_unique<DirectoryEntry>();
        dirMu_[i]     = std::make_unique<Mutex>();

        pages_[i]->pageId = static_cast<PageId>(i);
        pages_[i]->state  = PageState::Invalid;
        pages_[i]->addr   = static_cast<uint8_t*>(base_) + i * PAGE_SIZE;
    }

    DSM_INFO(mgr_.logger(), "PageTable: %zu pages (%zu MiB) at %p",
             numPages_, regionSize_ / (1024*1024), base_);
}

PageTable::~PageTable() {
    unmapRegion();
}

// ─────────────────────────────── mmap helpers ────────────────────────────────

void PageTable::mapRegion() {
#ifdef _WIN32
    base_ = VirtualAlloc(nullptr, regionSize_,
                         MEM_RESERVE | MEM_COMMIT, PAGE_NOACCESS);
    if (!base_) throw std::runtime_error("VirtualAlloc failed");
#else
    base_ = mmap(nullptr, regionSize_,
                 PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base_ == MAP_FAILED)
        throw std::runtime_error("mmap failed");
#endif
}

void PageTable::unmapRegion() {
    if (!base_) return;
#ifdef _WIN32
    VirtualFree(base_, 0, MEM_RELEASE);
#else
    munmap(base_, regionSize_);
#endif
    base_ = nullptr;
}

void PageTable::protectPage(PageId pid, PageState desired) {
    void* pg = static_cast<uint8_t*>(base_) + static_cast<size_t>(pid) * PAGE_SIZE;
#ifdef _WIN32
    DWORD prot = PAGE_NOACCESS;
    if (desired == PageState::Shared)   prot = PAGE_READONLY;
    if (desired == PageState::Modified) prot = PAGE_READWRITE;
    DWORD old;
    VirtualProtect(pg, PAGE_SIZE, prot, &old);
#else
    int prot = PROT_NONE;
    if (desired == PageState::Shared)   prot = PROT_READ;
    if (desired == PageState::Modified) prot = PROT_READ | PROT_WRITE;
    mprotect(pg, PAGE_SIZE, prot);
#endif
}

// ─────────────────────────────── handleFault() ───────────────────────────────

bool PageTable::handleFault(void* addr, AccessType access) {
    if (!ownsAddr(addr)) return false;

    PageId pid = addrToPage(addr);
    if (pid >= numPages_) return false;

    mgr_.stats().pageFaults.fetch_add(1, std::memory_order_relaxed);

    DSM_DEBUG(mgr_.logger(), "Page fault: page=%u access=%s state=%s",
              pid,
              access == AccessType::Read ? "READ" : "WRITE",
              pageStateName(pages_[pid]->state));

    if (access == AccessType::Read) {
        mgr_.stats().readRequests.fetch_add(1, std::memory_order_relaxed);
        if (pages_[pid]->state == PageState::Invalid) {
            return mgr_.protocol().requestRead(pid);
        }
        // Shared: should not fault — mprotect already allows reads
        return true;
    } else {
        mgr_.stats().writeRequests.fetch_add(1, std::memory_order_relaxed);
        if (pages_[pid]->state == PageState::Invalid) {
            return mgr_.protocol().requestWrite(pid);
        }
        if (pages_[pid]->state == PageState::Shared) {
            // Upgrade to Modified
            return mgr_.protocol().requestWrite(pid);
        }
        return true;
    }
}

// ─────────────────────────────── invalidate() ────────────────────────────────

void PageTable::invalidate(PageId pid) {
    if (pid >= numPages_) return;
    auto& pe = *pages_[pid];
    LockGuard<Mutex> lk(pe.pageMu);
    if (pe.state != PageState::Invalid) {
        if (pe.dirty && pe.state == PageState::Modified) {
            // Flush dirty data back to home node before invalidating
            auto data = writebackAndDowngrade(pid);
            // Send writeback to home node
            mgr_.protocol().writeback(pid, data);
        }
        protectPage(pid, PageState::Invalid);
        pe.state = PageState::Invalid;
        pe.dirty = false;
        pe.version++;
        mgr_.stats().invalidations.fetch_add(1, std::memory_order_relaxed);
        DSM_DEBUG(mgr_.logger(), "Page %u invalidated", pid);
    }
}

// ─────────────────────────────── writebackAndDowngrade() ─────────────────────

std::vector<uint8_t> PageTable::writebackAndDowngrade(PageId pid) {
    auto& pe = *pages_[pid];
    std::vector<uint8_t> data(PAGE_SIZE);
    std::memcpy(data.data(), pe.addr, PAGE_SIZE);
    protectPage(pid, PageState::Shared);
    pe.state = PageState::Shared;
    pe.dirty = false;
    DSM_DEBUG(mgr_.logger(), "Page %u downgraded MOD→SHR", pid);
    return data;
}

void PageTable::upgradeToModified(PageId pid) {
    auto& pe = *pages_[pid];
    LockGuard<Mutex> lk(pe.pageMu);
    protectPage(pid, PageState::Modified);
    pe.state = PageState::Modified;
    pe.dirty = true;
    DSM_DEBUG(mgr_.logger(), "Page %u upgraded SHR→MOD", pid);
}

// ─────────────────────────────── Directory ops ───────────────────────────────

std::pair<bool, std::vector<uint8_t>>
PageTable::directoryRead(NodeId requester, PageId pid) {
    if (pid >= numPages_) return {false, {}};
    LockGuard<Mutex> dlk(*dirMu_[pid]);
    auto& de = *directory_[pid];

    if (de.isModified()) {
        // Ask current owner to downgrade
        NodeId owner = de.owner;
        if (owner != requester) {
            if (owner == mgr_.localId()) {
                de.data = writebackAndDowngrade(pid);
                de.version++;  // Track version increment on local downgrade
            } else {
                Message dg(MsgType::DOWNGRADE, owner, owner, pid);
                dg.header.dstNode = owner;
                auto reply = mgr_.network().sendAndWait(owner, dg, 5000);
                if (reply.first && reply.second.payload.size() == PAGE_SIZE) {
                    de.data = std::move(reply.second.payload);
                    de.version++;
                }
            }
            de.sharers.insert(owner);
        }
        de.owner = INVALID_NODE_ID;
        de.state = PageState::Shared;
    }

    de.sharers.insert(requester);
    de.state = PageState::Shared;

    // Return current page data
    return {true, de.data};
}

std::pair<bool, std::vector<uint8_t>>
PageTable::directoryWrite(NodeId requester, PageId pid) {
    if (pid >= numPages_) return {false, {}};
    LockGuard<Mutex> dlk(*dirMu_[pid]);
    auto& de = *directory_[pid];

    if (de.isModified() && de.owner != requester) {
        // Recall from current owner
        NodeId owner = de.owner;
        if (owner == mgr_.localId()) {
            de.data = writebackAndDowngrade(pid);
            invalidate(pid);
        } else {
            Message wb(MsgType::WRITEBACK, owner, owner, pid);
            auto reply = mgr_.network().sendAndWait(owner, wb, 5000);
            if (reply.first && reply.second.payload.size() == PAGE_SIZE) {
                de.data = std::move(reply.second.payload);
            }
        }
        de.sharers.erase(owner);
    }

    // Invalidate all sharers and wait for ACK to ensure coherence
    for (NodeId sharer : de.sharers) {
        if (sharer == requester) continue;
        if (sharer == mgr_.localId()) {
            invalidate(pid);
            mgr_.stats().invalidations.fetch_add(1, std::memory_order_relaxed);
        } else {
            Message inv(MsgType::INVALIDATE, mgr_.localId(), sharer, pid);
            auto ack = mgr_.network().sendAndWait(sharer, inv, 5000);
            if (!ack.first) {
                DSM_WARN(mgr_.logger(),
                    "directoryWrite: INV_ACK timeout from node %u for page %u",
                    sharer, pid);
            }
            mgr_.stats().invalidations.fetch_add(1, std::memory_order_relaxed);
        }
    }
    de.sharers.clear();

    de.owner = requester;
    de.state = PageState::Modified;

    return {true, de.data};
}

void PageTable::directoryWriteback(NodeId sender, PageId pid,
                                   const std::vector<uint8_t>& data) {
    if (pid >= numPages_ || data.size() != PAGE_SIZE) return;
    LockGuard<Mutex> dlk(*dirMu_[pid]);
    auto& de = *directory_[pid];
    de.data = data;
    de.sharers.erase(sender);
    if (de.owner == sender) {
        de.owner = INVALID_NODE_ID;
        de.state = de.sharers.empty() ? PageState::Invalid : PageState::Shared;
    }
    de.version++;
}

void PageTable::nodeLeft(NodeId id) {
    for (size_t pid = 0; pid < numPages_; ++pid) {
        LockGuard<Mutex> dlk(*dirMu_[pid]);
        auto& de = *directory_[pid];
        de.sharers.erase(id);
        if (de.owner == id) {
            de.owner = INVALID_NODE_ID;
            de.state = PageState::Invalid;
        }
    }
}

// ─────────────────────────────── Utilities ───────────────────────────────────

bool PageTable::ownsAddr(const void* addr) const {
    const uint8_t* a = static_cast<const uint8_t*>(addr);
    const uint8_t* b = static_cast<const uint8_t*>(base_);
    return a >= b && a < b + regionSize_;
}

PageId PageTable::addrToPage(const void* addr) const {
    const uint8_t* a = static_cast<const uint8_t*>(addr);
    const uint8_t* b = static_cast<const uint8_t*>(base_);
    return static_cast<PageId>((a - b) / PAGE_SIZE);
}

void* PageTable::pageToAddr(PageId pid) const {
    return static_cast<uint8_t*>(base_) + static_cast<size_t>(pid) * PAGE_SIZE;
}

LocalPageEntry& PageTable::entry(PageId pid) {
    return *pages_.at(pid);
}

size_t PageTable::validPages() const {
    SharedLock lk(tableMu_);
    size_t n = 0;
    for (auto& p : pages_) {
        if (p && p->state != PageState::Invalid) ++n;
    }
    return n;
}

void PageTable::forEachPage(const std::function<void(const LocalPageEntry&)>& fn) const {
    SharedLock lk(tableMu_);
    for (auto& p : pages_) {
        if (p) fn(*p);
    }
}

} // namespace dsm
