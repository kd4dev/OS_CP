/**
 * dsm_node.cpp — Node Registry & Phi-Accrual Failure Detector
 */

#include "dsm_node.h"
#include "dsm_core.h"
#include "dsm_logger.h"
#include "dsm_network.h"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <chrono>

namespace dsm {

// ─────────────────────────────── PhiDetector ─────────────────────────────────

void PhiDetector::recordHeartbeat(int64_t nowMs) {
    if (lastMs_ != 0) {
        int64_t interval = nowMs - lastMs_;
        if (interval > 0) {
            intervals_.push_back(interval);
            if (intervals_.size() > windowSize_) intervals_.pop_front();
        }
    }
    lastMs_ = nowMs;
}

double PhiDetector::phi(int64_t nowMs) const {
    if (intervals_.empty() || lastMs_ == 0) return 0.0;

    double elapsed = static_cast<double>(nowMs - lastMs_);
    if (elapsed <= 0) return 0.0;

    // Compute mean and std dev of intervals
    double sum = 0.0;
    for (auto v : intervals_) sum += static_cast<double>(v);
    double mean = sum / static_cast<double>(intervals_.size());

    double var = 0.0;
    for (auto v : intervals_) {
        double diff = static_cast<double>(v) - mean;
        var += diff * diff;
    }
    double stdDev = (intervals_.size() > 1)
        ? std::sqrt(var / static_cast<double>(intervals_.size() - 1))
        : mean * 0.1;

    if (stdDev < 1.0) stdDev = 1.0;

    // Phi = -log10(P_later(t))  where P_later is complementary CDF of normal
    // Approximation: phi = elapsed / mean (simplified for reliability)
    double sigma = stdDev;
    double y     = (elapsed - mean) / sigma;
    // P_later ≈ exp(-y) for y > 0 (exponential approximation)
    double p_later = (y < 0) ? 1.0 : std::exp(-y);
    double phiVal  = (p_later > 1e-300) ? -std::log10(p_later) : 300.0;
    return phiVal;
}

// ─────────────────────────────── NodeRegistry Constructor ────────────────────

NodeRegistry::NodeRegistry(DSMManager& mgr) : mgr_(mgr) {}

NodeRegistry::~NodeRegistry() { stop(); }

// ─────────────────────────────── start() / stop() ────────────────────────────

bool NodeRegistry::start() {
    running_.store(true);
    hbThread_    = Thread(&NodeRegistry::heartbeatLoop, this);
    checkThread_ = Thread(&NodeRegistry::checkLoop, this);
    DSM_INFO(mgr_.logger(), "NodeRegistry started (localId=%u)", mgr_.localId());
    return true;
}

void NodeRegistry::stop() {
    if (!running_.exchange(false)) return;
    if (hbThread_.joinable())    hbThread_.join();
    if (checkThread_.joinable()) checkThread_.join();
    DSM_INFO(mgr_.logger(), "NodeRegistry stopped");
}

// ─────────────────────────────── addPeer() ───────────────────────────────────

void NodeRegistry::addPeer(NodeId id, const std::string& addr, uint16_t port) {
    LockGuard<SharedMutex> lk(mu_);
    auto& ni      = nodes_[id];
    ni.id         = id;
    ni.address    = addr;
    ni.port       = port;
    ni.status     = NodeStatus::Unknown;
    detectors_[id] = std::make_unique<PhiDetector>();
    DSM_INFO(mgr_.logger(), "Peer registered: node %u at %s:%u", id, addr.c_str(), port);
}

void NodeRegistry::removePeer(NodeId id) {
    LockGuard<SharedMutex> lk(mu_);
    nodes_.erase(id);
    detectors_.erase(id);
}

// ─────────────────────────────── recordHeartbeat() ───────────────────────────

void NodeRegistry::recordHeartbeat(NodeId id, int64_t ts) {
    LockGuard<SharedMutex> lk(mu_);
    auto it = nodes_.find(id);
    if (it == nodes_.end()) return;
    it->second.lastHB  = ts;
    it->second.status  = NodeStatus::Alive;
    auto dit = detectors_.find(id);
    if (dit != detectors_.end()) {
        dit->second->recordHeartbeat(ts);
    }
}

// ─────────────────────────────── onNodeJoined/Left ───────────────────────────

void NodeRegistry::onNodeJoined(NodeId id, const std::string& addr, uint16_t port) {
    addPeer(id, addr, port);
    {
        LockGuard<SharedMutex> lk(mu_);
        nodes_[id].status = NodeStatus::Alive;
    }
    if (eventCb_) eventCb_(id, true);
    DSM_INFO(mgr_.logger(), "Node %u joined", id);
}

void NodeRegistry::onNodeLeft(NodeId id) {
    {
        LockGuard<SharedMutex> lk(mu_);
        auto it = nodes_.find(id);
        if (it != nodes_.end()) it->second.status = NodeStatus::Dead;
    }
    if (eventCb_) eventCb_(id, false);
    DSM_INFO(mgr_.logger(), "Node %u left / declared dead", id);
}

// ─────────────────────────────── heartbeatLoop() ─────────────────────────────

void NodeRegistry::heartbeatLoop() {
    while (running_.load()) {
        sleep_ms(HEARTBEAT_MS);
        if (!running_.load()) break;
        sendHeartbeats();
    }
}

void NodeRegistry::sendHeartbeats() {
    Message hb(MsgType::HEARTBEAT, mgr_.localId(), 0);
    hb.header.seqNum = static_cast<SeqNum>(nowMs());
    mgr_.network().broadcast(hb);
}

// ─────────────────────────────── checkLoop() ─────────────────────────────────

void NodeRegistry::checkLoop() {
    while (running_.load()) {
        sleep_ms(HEARTBEAT_MS * 2);
        if (!running_.load()) break;
        checkSuspected();
    }
}

void NodeRegistry::checkSuspected() {
    int64_t now = nowMs();
    std::vector<NodeId> toKill;

    {
        SharedLock lk(mu_);
        for (auto& p : nodes_) {
            NodeId id = p.first;
            auto& ni = p.second;
            if (ni.status == NodeStatus::Dead) continue;
            auto dit = detectors_.find(id);
            if (dit == detectors_.end()) continue;

            double pval = dit->second->phi(now);
            ni.phiSusp = pval;

            if (pval >= 8.0) {
                ni.status = NodeStatus::Suspected;
                if (pval >= 16.0 || (now - ni.lastHB > static_cast<int64_t>(NODE_TIMEOUT_MS))) {
                    toKill.push_back(id);
                }
            } else if (ni.status == NodeStatus::Suspected) {
                ni.status = NodeStatus::Alive;
            }
        }
    }

    for (NodeId id : toKill) {
        DSM_WARN(mgr_.logger(), "Node %u declared DEAD (phi/timeout)", id);
        onNodeLeft(id);
    }
}

// ─────────────────────────────── Queries ─────────────────────────────────────

bool NodeRegistry::isAlive(NodeId id) const {
    SharedLock lk(mu_);
    auto it = nodes_.find(id);
    return it != nodes_.end() && it->second.status == NodeStatus::Alive;
}

NodeStatus NodeRegistry::statusOf(NodeId id) const {
    SharedLock lk(mu_);
    auto it = nodes_.find(id);
    return (it != nodes_.end()) ? it->second.status : NodeStatus::Unknown;
}

NodeInfo NodeRegistry::infoOf(NodeId id) const {
    SharedLock lk(mu_);
    auto it = nodes_.find(id);
    if (it != nodes_.end()) return it->second;
    return NodeInfo{};
}

std::vector<NodeId> NodeRegistry::aliveNodes() const {
    SharedLock lk(mu_);
    std::vector<NodeId> result;
    for (auto& p : nodes_) {
        if (p.second.status == NodeStatus::Alive) result.push_back(p.first);
    }
    return result;
}

std::vector<NodeInfo> NodeRegistry::allNodes() const {
    SharedLock lk(mu_);
    std::vector<NodeInfo> result;
    result.reserve(nodes_.size());
    for (auto& p : nodes_) result.push_back(p.second);
    return result;
}

size_t NodeRegistry::nodeCount() const {
    SharedLock lk(mu_);
    return nodes_.size();
}

NodeId NodeRegistry::homeNodeFor(PageId pid) const {
    SharedLock lk(mu_);
    if (nodes_.empty()) return mgr_.localId();
    // Collect alive nodes sorted by id for deterministic assignment
    std::vector<NodeId> alive;
    for (auto& p : nodes_) {
        if (p.second.status == NodeStatus::Alive) alive.push_back(p.first);
    }
    alive.push_back(mgr_.localId());
    std::sort(alive.begin(), alive.end());
    if (alive.empty()) return mgr_.localId();
    return alive[pid % alive.size()];
}

// ─────────────────────────────── nowMs() ─────────────────────────────────────

int64_t NodeRegistry::nowMs() const {
    using namespace std::chrono;
    return duration_cast<milliseconds>(
               steady_clock::now().time_since_epoch()).count();
}

} // namespace dsm
