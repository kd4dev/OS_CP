/**
 * dsm_sync.cpp — Distributed Synchronization Primitives
 *
 * Implements Ricart-Agrawala mutex and centralized barrier over TCP.
 */

#include "dsm_sync.h"
#include "dsm_core.h"
#include "dsm_logger.h"
#include "dsm_node.h"
#include <chrono>
#include <cassert>
#include <sstream>

namespace dsm {

// ═══════════════════════════════════════════════════════════════════════════
//  DistributedMutex
// ═══════════════════════════════════════════════════════════════════════════

DistributedMutex::DistributedMutex(DSMManager& mgr, const std::string& name)
    : mgr_(mgr), name_(name) {}

// ─────────────────────────────── lock() ──────────────────────────────────────

bool DistributedMutex::lock(uint32_t timeoutMs) {
    UniqueLock<Mutex> lk(mu_);
    assert(!holding_ && "Recursive lock not supported");

    // Increment Lamport clock & record request timestamp
    ++lamport_;
    reqTs_   = lamport_;
    waiting_ = true;

    auto peers = mgr_.nodeRegistry().aliveNodes();
    expectedReplies_ = static_cast<uint32_t>(peers.size());
    replyCount_      = 0;
    deferred_.clear();

    // Broadcast LOCK_REQ
    lk.unlock();
    sendRequest();
    lk.lock();

    // Wait until we have all N-1 replies
    bool ok = cv_.wait_for(lk, timeoutMs,
        [this]{ return replyCount_ >= expectedReplies_; });

    if (!ok) {
        DSM_WARN(mgr_.logger(), "DistributedMutex '%s': lock timeout", name_.c_str());
        waiting_ = false;
        return false;
    }
    holding_ = true;
    waiting_ = false;
    mgr_.stats().lockAcquires.fetch_add(1, std::memory_order_relaxed);
    DSM_DEBUG(mgr_.logger(), "DistributedMutex '%s': acquired", name_.c_str());
    return true;
}

// ─────────────────────────────── unlock() ────────────────────────────────────

void DistributedMutex::unlock() {
    LockGuard<Mutex> lk(mu_);
    assert(holding_ && "unlock() called without holding lock");
    holding_ = false;
    DSM_DEBUG(mgr_.logger(), "DistributedMutex '%s': released, deferred=%zu",
              name_.c_str(), deferred_.size());

    // Send replies to all deferred requests
    for (NodeId nd : deferred_) sendReply(nd);
    deferred_.clear();
}

// ─────────────────────────────── sendRequest() ───────────────────────────────

void DistributedMutex::sendRequest() {
    auto peers = mgr_.nodeRegistry().aliveNodes();
    if (peers.empty()) {
        // Single node — grant self immediately
        LockGuard<Mutex> lk(mu_);
        replyCount_ = 0;
        expectedReplies_ = 0;
        cv_.notify_all();
        return;
    }
    for (NodeId peer : peers) {
        Message req(MsgType::LOCK_REQ, mgr_.localId(), peer);
        // Encode mutex name in payload
        req.payload.insert(req.payload.end(), name_.begin(), name_.end());
        // Encode timestamp in seqNum
        req.header.seqNum = reqTs_;
        mgr_.network().send(peer, req);
    }
}

// ─────────────────────────────── sendReply() ─────────────────────────────────

void DistributedMutex::sendReply(NodeId dst) {
    Message rep(MsgType::LOCK_GRANT, mgr_.localId(), dst);
    rep.payload.insert(rep.payload.end(), name_.begin(), name_.end());
    mgr_.network().send(dst, rep);
}

// ─────────────────────────────── onLockRequest() ─────────────────────────────

void DistributedMutex::onLockRequest(NodeId src, uint64_t ts) {
    UniqueLock<Mutex> lk(mu_);
    // Update Lamport clock
    lamport_ = std::max(lamport_, ts) + 1;

    bool shouldDefer = holding_ ||
        (waiting_ && (reqTs_ < ts || (reqTs_ == ts && mgr_.localId() < src)));

    if (shouldDefer) {
        DSM_TRACE(mgr_.logger(), "DistributedMutex '%s': defer reply to %u",
                  name_.c_str(), src);
        deferred_.insert(src);
    } else {
        // Reply immediately
        lk.unlock();
        sendReply(src);
    }
}

// ─────────────────────────────── onLockRelease() ─────────────────────────────

void DistributedMutex::onLockRelease(NodeId src) {
    LockGuard<Mutex> lk(mu_);
    ++replyCount_;
    DSM_TRACE(mgr_.logger(), "DistributedMutex '%s': reply from %u (%u/%u)",
              name_.c_str(), src, replyCount_, expectedReplies_);
    if (replyCount_ >= expectedReplies_) cv_.notify_all();
}

// ═══════════════════════════════════════════════════════════════════════════
//  DistributedBarrier
// ═══════════════════════════════════════════════════════════════════════════

DistributedBarrier::DistributedBarrier(DSMManager& mgr,
                                       const std::string& tag,
                                       uint32_t participants)
    : mgr_(mgr), tag_(tag), participants_(participants) {}

// ─────────────────────────────── arrive() ────────────────────────────────────

void DistributedBarrier::arrive() {
    // Determine if we are the coordinator (smallest node ID)
    auto alive = mgr_.nodeRegistry().aliveNodes();
    NodeId coord = mgr_.localId();
    for (NodeId id : alive) if (id < coord) coord = id;
    bool isCoord = (coord == mgr_.localId());

    if (isCoord) {
        // Receive arrivals from all others + self
        UniqueLock<Mutex> lk(mu_);
        ++arrivedCount_;  // count self
        cv_.wait(lk, [this]{ return arrivedCount_ >= participants_ || released_; });
        released_ = true;

        // Broadcast release
        Message rel(MsgType::BARRIER_RELEASE, mgr_.localId(), 0);
        rel.payload.insert(rel.payload.end(), tag_.begin(), tag_.end());
        mgr_.network().broadcast(rel);

        mgr_.stats().barrierCount.fetch_add(1, std::memory_order_relaxed);
        DSM_INFO(mgr_.logger(), "Barrier '%s' released (%u participants)",
                 tag_.c_str(), participants_);
    } else {
        // Send arrive to coordinator
        Message arr(MsgType::BARRIER_ARRIVE, mgr_.localId(), coord);
        arr.payload.insert(arr.payload.end(), tag_.begin(), tag_.end());
        mgr_.network().send(coord, arr);

        // Wait for release broadcast
        UniqueLock<Mutex> lk(mu_);
        cv_.wait(lk, [this]{ return released_; });
        DSM_DEBUG(mgr_.logger(), "Barrier '%s': released", tag_.c_str());
    }
}

void DistributedBarrier::onArrive(NodeId src) {
    LockGuard<Mutex> lk(mu_);
    ++arrivedCount_;
    DSM_DEBUG(mgr_.logger(), "Barrier '%s': node %u arrived (%u/%u)",
              tag_.c_str(), src, arrivedCount_, participants_);
    if (arrivedCount_ >= participants_) cv_.notify_all();
}

void DistributedBarrier::onRelease() {
    LockGuard<Mutex> lk(mu_);
    released_ = true;
    cv_.notify_all();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SyncManager
// ═══════════════════════════════════════════════════════════════════════════

SyncManager::SyncManager(DSMManager& mgr) : mgr_(mgr) {}

bool SyncManager::start() {
    running_.store(true);
    DSM_INFO(mgr_.logger(), "SyncManager started");
    return true;
}

void SyncManager::stop() {
    running_.store(false);
    DSM_INFO(mgr_.logger(), "SyncManager stopped");
}

// ─────────────────────────────── Public API ───────────────────────────────────

bool SyncManager::lock(const std::string& name) {
    return getMutex(name)->lock();
}

bool SyncManager::unlock(const std::string& name) {
    getMutex(name)->unlock();
    return true;
}

bool SyncManager::barrier(const std::string& tag, uint32_t participants) {
    getBarrier(tag, participants)->arrive();
    return true;
}

// ─────────────────────────────── onMessage() ─────────────────────────────────

void SyncManager::onMessage(const Message& msg) {
    // Extract name/tag from payload
    std::string key(reinterpret_cast<const char*>(msg.payload.data()),
                    msg.payload.size());

    switch (msg.header.type) {
        case MsgType::LOCK_REQ: {
            auto* m = getMutex(key);
            m->onLockRequest(msg.header.srcNode, msg.header.seqNum);
            break;
        }
        case MsgType::LOCK_GRANT: {
            auto* m = getMutex(key);
            m->onLockRelease(msg.header.srcNode);
            break;
        }
        case MsgType::LOCK_RELEASE: {
            // LOCK_RELEASE is treated identically to LOCK_GRANT for reply counting
            auto* m = getMutex(key);
            m->onLockRelease(msg.header.srcNode);
            break;
        }
        case MsgType::BARRIER_ARRIVE: {
            auto* b = getBarrier(key, 0);
            b->onArrive(msg.header.srcNode);
            break;
        }
        case MsgType::BARRIER_RELEASE: {
            auto* b = getBarrier(key, 0);
            b->onRelease();
            break;
        }
        default:
            break;
    }
}

// ─────────────────────────────── Factory helpers ──────────────────────────────

DistributedMutex* SyncManager::getMutex(const std::string& name) {
    LockGuard<Mutex> lk(mutexMapMu_);
    auto& ptr = mutexes_[name];
    if (!ptr) ptr = std::make_unique<DistributedMutex>(mgr_, name);
    return ptr.get();
}

DistributedBarrier* SyncManager::getBarrier(const std::string& tag,
                                             uint32_t participants) {
    LockGuard<Mutex> lk(barrierMapMu_);
    auto& ptr = barriers_[tag];
    if (!ptr) {
        ptr = std::make_unique<DistributedBarrier>(mgr_, tag, participants);
    } else if (participants > 0 && ptr->participants() == 0) {
        // Late-arriving participant count — update before any arrive is processed
        ptr->setParticipants(participants);
    }
    return ptr.get();
}

} // namespace dsm
