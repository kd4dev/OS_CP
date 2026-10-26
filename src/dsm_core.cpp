/**
 * dsm_core.cpp — DSMManager lifecycle, SIGSEGV handler, and allocation
 */

#include "dsm_core.h"
#include "dsm_logger.h"
#include "dsm_network.h"
#include "dsm_node.h"
#include "dsm_page.h"
#include "dsm_protocol.h"
#include "dsm_sync.h"
#include "dsm_ui.h"

#include <stdexcept>
#include <cstring>
#include <cassert>

#ifndef _WIN32
#  include <signal.h>
#  if defined(__linux__)
#    include <ucontext.h>
#  endif
#endif

namespace dsm {

// ─────────────────────────────── Singleton ───────────────────────────────────

DSMManager* DSMManager::instance_ = nullptr;

// ─────────────────────────────── Constructor ─────────────────────────────────

DSMManager::DSMManager(DSMConfig cfg) : cfg_(std::move(cfg)) {
    assert(!instance_ && "Only one DSMManager per process");
    instance_ = this;

    logger_   = std::make_unique<Logger>(cfg_.logFile,
                    cfg_.verboseLog ? LogLevel::DEBUG : LogLevel::INFO,
                    true, 10 * 1024 * 1024);

    DSM_INFO(*logger_, "DSMManager constructing: node=%u addr=%s:%u",
             cfg_.localNodeId, cfg_.localAddress.c_str(), cfg_.localPort);

    network_  = std::make_unique<NetworkLayer>(*this);
    nodeReg_  = std::make_unique<NodeRegistry>(*this);
    pageTable_= std::make_unique<PageTable>(*this, cfg_.memorySize);
    protocol_ = std::make_unique<CoherenceProtocol>(*this);
    syncMgr_  = std::make_unique<SyncManager>(*this);

    if (cfg_.enableUI)
        console_  = std::make_unique<DSMConsole>(*this);

    // Wire logger sink → UI
    if (console_) {
        logger_->addSink([this](LogLevel, const std::string& line) {
            console_->pushLog(line);
        });
    }
}

DSMManager::~DSMManager() {
    stop();
    instance_ = nullptr;
}

// ─────────────────────────────── start() ─────────────────────────────────────

bool DSMManager::start() {
    DSM_INFO(*logger_, "DSMManager::start()");

    if (!network_->start()) {
        DSM_ERROR(*logger_, "Failed to start NetworkLayer");
        return false;
    }

    // Set message handler — routes to protocol & sync
    network_->setHandler([this](const Message& msg) {
        switch (msg.header.type) {
            case MsgType::HEARTBEAT:
                nodeReg_->recordHeartbeat(msg.header.srcNode,
                    static_cast<int64_t>(msg.header.seqNum));
                break;
            case MsgType::HELLO:
                nodeReg_->onNodeJoined(msg.header.srcNode,
                    /* addr */ "", msg.header.dstNode == 0
                        ? DEFAULT_PORT : static_cast<uint16_t>(msg.header.dstNode));
                break;
            case MsgType::BYE:
                nodeReg_->onNodeLeft(msg.header.srcNode);
                break;
            case MsgType::LOCK_REQ:
            case MsgType::LOCK_GRANT:
            case MsgType::LOCK_RELEASE:
            case MsgType::BARRIER_ARRIVE:
            case MsgType::BARRIER_RELEASE:
                syncMgr_->onMessage(msg);
                break;
            default:
                protocol_->onMessage(msg);
                break;
        }
    });

    // Connect to known peers
    for (auto& peer : cfg_.peers) {
        nodeReg_->addPeer(peer.id, peer.address, peer.port);
        network_->connectToPeer(peer.id, peer.address, peer.port);
    }

    // Node event callback
    nodeReg_->setEventCallback([this](NodeId id, bool joined) {
        if (!joined) pageTable_->nodeLeft(id);
        LockGuard<Mutex> lk(eventCbMu_);
        if (nodeEventCb_) nodeEventCb_(id, joined);
    });

    if (!nodeReg_->start()) {
        DSM_ERROR(*logger_, "Failed to start NodeRegistry");
        return false;
    }
    if (!syncMgr_->start()) {
        DSM_ERROR(*logger_, "Failed to start SyncManager");
        return false;
    }

    installSigHandler();

    if (console_) console_->start();

    running_.store(true, std::memory_order_release);
    DSM_INFO(*logger_, "DSMManager running — node %u ready", cfg_.localNodeId);
    return true;
}

// ─────────────────────────────── stop() ──────────────────────────────────────

void DSMManager::stop() {
    if (!running_.exchange(false, std::memory_order_acq_rel)) return;
    DSM_INFO(*logger_, "DSMManager::stop()");

    if (console_)  console_->stop();
    syncMgr_->stop();
    nodeReg_->stop();
    network_->stop();

    logger_->flush();
}

// ─────────────────────────────── allocate() ──────────────────────────────────

void* DSMManager::allocate(size_t bytes) {
    if (bytes == 0) {
        DSM_WARN(*logger_, "allocate(0): zero-size request");
        return nullptr;
    }
    // Align to page boundary
    size_t aligned = (bytes + PAGE_SIZE - 1) & ~(PAGE_SIZE - 1);
    size_t offset = allocOffset_.fetch_add(aligned, std::memory_order_relaxed);
    if (offset + aligned > cfg_.memorySize) {
        allocOffset_.fetch_sub(aligned, std::memory_order_relaxed);
        DSM_WARN(*logger_, "allocate(%zu): out of shared memory (used=%zu total=%zu)",
                 bytes, offset, cfg_.memorySize);
        return nullptr;
    }
    void* ptr = static_cast<uint8_t*>(pageTable_->baseAddr()) + offset;
    DSM_DEBUG(*logger_, "allocate(%zu) -> offset=%zu ptr=%p", bytes, offset, ptr);
    return ptr;
}

void DSMManager::deallocate(void* ptr, size_t bytes) {
    // Bump allocator: deallocation is a no-op (region freed at shutdown)
    // For a production system, implement a free-list here.
    (void)ptr; (void)bytes;
}

// ─────────────────────────────── handlePageFault() ───────────────────────────

bool DSMManager::handlePageFault(void* addr, AccessType access) {
    return pageTable_->handleFault(addr, access);
}

// ─────────────────────────────── Synchronization API ─────────────────────────

bool DSMManager::distributedLock(const std::string& name) {
    return syncMgr_->lock(name);
}

bool DSMManager::distributedUnlock(const std::string& name) {
    return syncMgr_->unlock(name);
}

bool DSMManager::barrier(const std::string& tag, uint32_t participants) {
    return syncMgr_->barrier(tag, participants);
}

// ─────────────────────────────── setNodeEventCallback() ──────────────────────

void DSMManager::setNodeEventCallback(NodeEventCb cb) {
    LockGuard<Mutex> lk(eventCbMu_);
    nodeEventCb_ = std::move(cb);
}

// ─────────────────────────────── SIGSEGV Handler ─────────────────────────────

#ifndef _WIN32
void DSMManager::sigsegvHandler(int sig, siginfo_t* si, void* /*ctx*/) {
    if (!instance_) return;
    void* addr = si->si_addr;

    if (!instance_->pageTable_->ownsAddr(addr)) {
        // Not a DSM page — re-raise as real signal
        struct sigaction sa{};
        sa.sa_handler = SIG_DFL;
        sigaction(sig, &sa, nullptr);
        raise(sig);
        return;
    }

    // Determine access type from context (write fault sets bit 1 in err code)
    // For simplicity, try write access (more permissive; page table will use SHR state)
    AccessType access = AccessType::Write;

#if defined(__linux__) && defined(REG_ERR)
    ucontext_t* uc = static_cast<ucontext_t*>(static_cast<void*>(
        reinterpret_cast<uint8_t*>(/*ctx*/nullptr)));
    // err bit 1 = write
    // We don't have ctx here in the simplified handler; default to Write
    (void)uc;
#endif

    bool ok = instance_->handlePageFault(addr, access);
    if (!ok) {
        // Could not handle — real crash
        struct sigaction sa{};
        sa.sa_handler = SIG_DFL;
        sigaction(sig, &sa, nullptr);
        raise(sig);
    }
}

void DSMManager::installSigHandler() {
    struct sigaction sa{};
    sa.sa_flags     = SA_SIGINFO;
    sa.sa_sigaction = &DSMManager::sigsegvHandler;
    sigemptyset(&sa.sa_mask);
    sigaction(SIGSEGV, &sa, nullptr);
#ifdef SIGBUS
    sigaction(SIGBUS, &sa, nullptr);
#endif
    DSM_DEBUG(*logger_, "SIGSEGV/SIGBUS handler installed");
}
#else
// Windows structured exception handler (VEH)
#include <windows.h>

static LONG WINAPI vehHandler(EXCEPTION_POINTERS* ep) {
    if (ep->ExceptionRecord->ExceptionCode != EXCEPTION_ACCESS_VIOLATION)
        return EXCEPTION_CONTINUE_SEARCH;
    auto* mgr = DSMManager::instance();
    if (!mgr) return EXCEPTION_CONTINUE_SEARCH;

    void* addr = reinterpret_cast<void*>(
        ep->ExceptionRecord->ExceptionInformation[1]);
    bool isWrite = (ep->ExceptionRecord->ExceptionInformation[0] == 1);

    if (!mgr->pageTable().ownsAddr(addr))
        return EXCEPTION_CONTINUE_SEARCH;

    bool ok = mgr->handlePageFault(
        addr, isWrite ? AccessType::Write : AccessType::Read);
    return ok ? EXCEPTION_CONTINUE_EXECUTION : EXCEPTION_CONTINUE_SEARCH;
}

void DSMManager::installSigHandler() {
    AddVectoredExceptionHandler(1, vehHandler);
    DSM_DEBUG(*logger_, "Windows VEH handler installed");
}
#endif

} // namespace dsm
