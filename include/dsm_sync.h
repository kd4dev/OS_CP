#pragma once
/**
 * dsm_sync.h — Distributed Synchronization Primitives
 *
 * Provides:
 *   - DistributedMutex  : token-passing mutex (Ricart-Agrawala)
 *   - DistributedBarrier: token-ring barrier with release broadcast
 *   - DistributedSemaphore: counting semaphore via home node
 */

#include "dsm_core.h"
#include "dsm_network.h"
#include <map>
#include <set>

namespace dsm {

class DSMManager;

// ─────────────────────────────── Distributed Mutex ───────────────────────────

/**
 * Ricart-Agrawala distributed mutual exclusion algorithm.
 * Uses logical timestamps (Lamport clocks) and request deferral queues.
 * All messages are sent via NetworkLayer.
 */
class DistributedMutex {
public:
    DistributedMutex(DSMManager& mgr, const std::string& name);
    ~DistributedMutex() = default;

    bool lock(uint32_t timeoutMs = 10000);
    void unlock();

    const std::string& name() const { return name_; }

    // Called by SyncManager when a LOCK_REQ / LOCK_RELEASE arrives for this mutex
    void onLockRequest(NodeId src, uint64_t ts);
    void onLockRelease(NodeId src);

private:
    void sendReply(NodeId dst);
    void sendRequest();

    DSMManager&  mgr_;
    std::string  name_;

    mutable Mutex      mu_;
    ConditionVariable  cv_;

    bool     holding_  = false;
    bool     waiting_  = false;
    uint64_t lamport_  = 0;        ///< Local Lamport timestamp
    uint64_t reqTs_    = 0;        ///< Timestamp of our pending request

    std::set<NodeId>  deferred_;   ///< Nodes whose replies we deferred
    uint32_t          replyCount_  = 0;
    uint32_t          expectedReplies_ = 0;
};

// ─────────────────────────────── Distributed Barrier ────────────────────────

/**
 * Centralized barrier: all participants send BARRIER_ARRIVE to coordinator
 * (home node), coordinator broadcasts BARRIER_RELEASE when count is met.
 */
class DistributedBarrier {
public:
    DistributedBarrier(DSMManager& mgr, const std::string& tag, uint32_t participants);
    ~DistributedBarrier() = default;

    /// Block until all participants arrive
    void arrive();

    // Called by SyncManager
    void onArrive(NodeId src);
    void onRelease();

    const std::string& tag() const { return tag_; }

    uint32_t participants() const { return participants_; }
    void setParticipants(uint32_t n) { participants_ = n; }

private:
    DSMManager&  mgr_;
    std::string  tag_;
    uint32_t     participants_;

    mutable Mutex      mu_;
    ConditionVariable  cv_;
    uint32_t     arrivedCount_ = 0;
    bool         released_     = false;
};

// ─────────────────────────────── SyncManager ─────────────────────────────────

/**
 * Owns all distributed sync objects, dispatches incoming LOCK / BARRIER messages
 * to the correct object, and exposes the public API called from DSMManager.
 */
class SyncManager {
public:
    explicit SyncManager(DSMManager& mgr);
    ~SyncManager() = default;

    bool start();
    void stop();

    // Public API (called by DSMManager)
    bool lock  (const std::string& name);
    bool unlock(const std::string& name);
    bool barrier(const std::string& tag, uint32_t participants);

    // Message dispatch (called by CoherenceProtocol / NetworkLayer)
    void onMessage(const Message& msg);

private:
    DistributedMutex*   getMutex  (const std::string& name);
    DistributedBarrier* getBarrier(const std::string& tag, uint32_t participants);

    DSMManager& mgr_;
    std::atomic<bool> running_{false};

    Mutex       mutexMapMu_;
    std::map<std::string, std::unique_ptr<DistributedMutex>>   mutexes_;

    Mutex       barrierMapMu_;
    std::map<std::string, std::unique_ptr<DistributedBarrier>> barriers_;
};

} // namespace dsm
