#pragma once
/**
 * dsm_protocol.h — MSI Coherence Protocol State Machine
 *
 * Implements the directory-based MSI (Modified/Shared/Invalid) cache
 * coherence protocol. The home node for each page runs the directory
 * state machine; remote nodes drive transitions through it.
 */

#include "dsm_core.h"
#include "dsm_network.h"
#include <functional>

namespace dsm {

class DSMManager;

// ─────────────────────────────── Protocol Events ─────────────────────────────

enum class ProtocolEvent : uint8_t {
    // Processor-side events (local node issues)
    LOCAL_READ_MISS,    ///< Read on invalid page
    LOCAL_WRITE_MISS,   ///< Write on invalid page
    LOCAL_UPGRADE,      ///< Write on shared page (upgrade S→M)
    LOCAL_EVICT,        ///< Evict page (M→I with writeback)

    // Network events (home receives from remote)
    REMOTE_READ_REQ,
    REMOTE_WRITE_REQ,
    REMOTE_WRITEBACK,
    REMOTE_INV_ACK,
    REMOTE_DOWNGRADE_ACK,
};

// ─────────────────────────────── CoherenceProtocol ───────────────────────────

class CoherenceProtocol {
public:
    explicit CoherenceProtocol(DSMManager& mgr);
    ~CoherenceProtocol() = default;

    // ---- Called by PageTable when a local page fault occurs ----

    /// Request read access for localNodeId on pageId.
    /// Blocks until data is available or timeout.
    bool requestRead(PageId pid);

    /// Request write access for localNodeId on pageId.
    /// Blocks until exclusive access is granted.
    bool requestWrite(PageId pid);

    /// Writeback a dirty page back to home node (on eviction or downgrade)
    bool writeback(PageId pid, const std::vector<uint8_t>& data);

    // ---- Called by NetworkLayer dispatch on incoming messages ----

    void onMessage(const Message& msg);

private:
    // Home-node handlers
    void handleReadReq (const Message& msg);
    void handleWriteReq(const Message& msg);
    void handleWriteback(const Message& msg);
    void handleInvAck  (const Message& msg);

    // Remote-node handlers
    void handleReadAck (const Message& msg);
    void handleWriteAck(const Message& msg);
    void handleInvalidate(const Message& msg);
    void handleDowngrade(const Message& msg);

    // Helpers
    Message makeMsg(MsgType t, NodeId dst, PageId pid) const;
    NodeId  homeOf(PageId pid) const;
    bool    isHome(PageId pid) const;

    DSMManager& mgr_;
};

} // namespace dsm
