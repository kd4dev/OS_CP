#pragma once
/**
 * dsm_node.h — Node Registry & Failure Detector
 *
 * Maintains the cluster membership list, drives heartbeat exchange,
 * and uses a Phi-accrual failure detector to identify dead nodes.
 */

#include "dsm_core.h"
#include <chrono>
#include <deque>
#include <functional>
#include <cmath>

namespace dsm {

class DSMManager;

// ─────────────────────────────── NodeInfo ────────────────────────────────────

enum class NodeStatus : uint8_t {
    Unknown      = 0,
    Alive        = 1,
    Suspected    = 2,
    Dead         = 3,
};

inline const char* nodeStatusName(NodeStatus s) {
    switch (s) {
        case NodeStatus::Unknown:   return "UNKN";
        case NodeStatus::Alive:     return "LIVE";
        case NodeStatus::Suspected: return "SUSP";
        case NodeStatus::Dead:      return "DEAD";
        default:                    return "????";
    }
}

struct NodeInfo {
    NodeId      id      = INVALID_NODE_ID;
    std::string address;
    uint16_t    port    = 0;
    NodeStatus  status  = NodeStatus::Unknown;

    // Heartbeat tracking (for Phi-accrual)
    std::deque<int64_t> arrivalTimes;  ///< ms timestamps of received HBs
    int64_t    lastHB   = 0;           ///< ms timestamp of last heartbeat
    double     phiSusp  = 0.0;         ///< Current phi value
};

// ─────────────────────────────── PhiAccrualDetector ─────────────────────────

/// Lightweight Phi-accrual failure detector (Hayashibara et al.)
class PhiDetector {
public:
    explicit PhiDetector(size_t windowSize = 10, double suspThreshold = 8.0)
        : windowSize_(windowSize), threshold_(suspThreshold) {}

    void recordHeartbeat(int64_t nowMs);
    double phi(int64_t nowMs) const;
    bool isSuspected(int64_t nowMs) const { return phi(nowMs) >= threshold_; }

private:
    size_t             windowSize_;
    double             threshold_;
    std::deque<int64_t> intervals_;
    int64_t            lastMs_ = 0;
};

// ─────────────────────────────── NodeRegistry ────────────────────────────────

class NodeRegistry {
public:
    explicit NodeRegistry(DSMManager& mgr);
    ~NodeRegistry();

    bool start();
    void stop();

    // Cluster membership
    void addPeer(NodeId id, const std::string& addr, uint16_t port);
    void removePeer(NodeId id);

    // Called by NetworkLayer on incoming heartbeat
    void recordHeartbeat(NodeId id, int64_t ts);

    // Called by NetworkLayer on HELLO
    void onNodeJoined(NodeId id, const std::string& addr, uint16_t port);

    // Called by NetworkLayer on BYE or timeout
    void onNodeLeft(NodeId id);

    // Queries
    bool            isAlive(NodeId id) const;
    NodeStatus      statusOf(NodeId id) const;
    NodeInfo        infoOf(NodeId id) const;
    std::vector<NodeId> aliveNodes() const;
    std::vector<NodeInfo> allNodes() const;
    size_t          nodeCount()  const;

    // Home node for a given page (simple hash partition)
    NodeId homeNodeFor(PageId pid) const;

    /// Register callback for join/leave events
    using NodeEventFn = std::function<void(NodeId, bool joined)>;
    void setEventCallback(NodeEventFn fn) { eventCb_ = std::move(fn); }

private:
    void heartbeatLoop();
    void checkLoop();
    void sendHeartbeats();
    void checkSuspected();
    int64_t nowMs() const;

    DSMManager& mgr_;
    std::atomic<bool> running_{false};
    Thread      hbThread_;
    Thread      checkThread_;
    NodeEventFn eventCb_;

    mutable SharedMutex mu_;
    std::unordered_map<NodeId, NodeInfo> nodes_;
    std::unordered_map<NodeId, std::unique_ptr<PhiDetector>> detectors_;
};

} // namespace dsm
