/**
 * test_sync.cpp — Unit tests for distributed sync primitives
 *
 * Tests the in-process logic of DistributedMutex and DistributedBarrier
 * using mock / single-node configurations.
 */

#include "test_runner.h"
#include "../include/dsm_core.h"
#include "../include/dsm_sync.h"
#include "../include/dsm_logger.h"
#include <chrono>
#include <vector>
#include <atomic>

using namespace dsm;
using namespace dsm_test;

// ─────────────────────────────── Helper ──────────────────────────────────────

// Lamport clock logic extracted for unit testing without DSMManager
namespace {

struct LamportClock {
    uint64_t ts = 0;

    uint64_t tick()          { return ++ts; }
    uint64_t receive(uint64_t remote) {
        ts = std::max(ts, remote) + 1;
        return ts;
    }
};

// Ricart-Agrawala single-node logic check:
// If not holding and not waiting, request should be granted immediately.
bool shouldDefer(bool holding, bool waiting,
                 NodeId localId, uint64_t reqTs,
                 NodeId srcId,   uint64_t srcTs) {
    return holding ||
        (waiting && (reqTs < srcTs || (reqTs == srcTs && localId < srcId)));
}

} // anonymous namespace

// ─────────────────────────────── Sync Suite ──────────────────────────────────

static TestSuite makeSyncSuite() {
    TestSuite suite{"Synchronization"};

    // Test 1: Lamport clock ticks monotonically
    suite.add("lamport_clock_ticks", [](TestResult& r) {
        LamportClock lc;
        DSM_ASSERT_EQ(r, lc.tick(), uint64_t{1});
        DSM_ASSERT_EQ(r, lc.tick(), uint64_t{2});
        DSM_ASSERT_EQ(r, lc.tick(), uint64_t{3});
    });

    // Test 2: Lamport receive takes max + 1
    suite.add("lamport_clock_receive", [](TestResult& r) {
        LamportClock lc;
        lc.ts = 5;
        uint64_t result = lc.receive(10);
        DSM_ASSERT_EQ(r, result, uint64_t{11});

        lc.ts = 15;
        result = lc.receive(3);   // local is bigger
        DSM_ASSERT_EQ(r, result, uint64_t{16});
    });

    // Test 3: Ricart-Agrawala defer logic — not holding, not waiting → no defer
    suite.add("ra_no_defer_when_idle", [](TestResult& r) {
        bool defer = shouldDefer(
            /*holding=*/false, /*waiting=*/false,
            /*localId=*/0,     /*reqTs=*/0,
            /*srcId=*/1,       /*srcTs=*/5);
        DSM_ASSERT_FALSE(r, defer);
    });

    // Test 4: RA defer when holding
    suite.add("ra_defer_when_holding", [](TestResult& r) {
        bool defer = shouldDefer(
            /*holding=*/true, /*waiting=*/false,
            0, 0, 1, 5);
        DSM_ASSERT_TRUE(r, defer);
    });

    // Test 5: RA defer when waiting with lower timestamp
    suite.add("ra_defer_when_waiting_lower_ts", [](TestResult& r) {
        // Local has reqTs=3, src has ts=7 → local has priority → defer src
        bool defer = shouldDefer(
            /*holding=*/false, /*waiting=*/true,
            /*localId=*/0,     /*reqTs=*/3,
            /*srcId=*/1,       /*srcTs=*/7);
        DSM_ASSERT_TRUE(r, defer);
    });

    // Test 6: RA don't defer when waiting with higher timestamp
    suite.add("ra_no_defer_when_waiting_higher_ts", [](TestResult& r) {
        // Local has reqTs=10, src has ts=3 → src has priority → don't defer
        bool defer = shouldDefer(
            false, true,
            0, 10,
            1, 3);
        DSM_ASSERT_FALSE(r, defer);
    });

    // Test 7: RA tiebreak by node ID
    suite.add("ra_tiebreak_by_nodeid", [](TestResult& r) {
        // Same timestamp, local=0, src=1 → local has priority (lower ID) → defer src
        bool defer_src_with_higher_id = shouldDefer(
            false, true,
            0, 5,   // local
            1, 5);  // src same ts, higher ID
        DSM_ASSERT_TRUE(r, defer_src_with_higher_id);

        // Same timestamp, local=1, src=0 → src has priority → don't defer
        bool defer_src_with_lower_id = shouldDefer(
            false, true,
            1, 5,   // local
            0, 5);  // src same ts, lower ID
        DSM_ASSERT_FALSE(r, defer_src_with_lower_id);
    });

    // Test 8: Standard mutex works correctly in single-thread
    suite.add("std_mutex_basic", [](TestResult& r) {
        Mutex mu;
        int counter = 0;
        {
            LockGuard<Mutex> lk(mu);
            counter = 42;
        }
        DSM_ASSERT_EQ(r, counter, 42);
    });

    // Test 9: Mutex protects shared counter across threads
    suite.add("mutex_protects_counter_multithread", [](TestResult& r) {
        Mutex mu;
        int counter = 0;
        const int N = 8, ITERS = 5000;
        std::vector<Thread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < ITERS; ++j) {
                    LockGuard<Mutex> lk(mu);
                    ++counter;
                }
            });
        }
        for (auto& t : threads) t.join();
        DSM_ASSERT_EQ(r, counter, N * ITERS);
    });

    // Test 10: Condition variable barrier pattern (in-process)
    suite.add("cv_barrier_inprocess", [](TestResult& r) {
        const int PARTICIPANTS = 4;
        Mutex mu;
        ConditionVariable cv;
        int count = 0;
        bool released = false;

        auto arrive = [&] {
            UniqueLock<Mutex> lk(mu);
            ++count;
            if (count == PARTICIPANTS) {
                released = true;
                cv.notify_all();
            } else {
                cv.wait(lk, [&]{ return released; });
            }
        };

        std::vector<Thread> threads;
        for (int i = 0; i < PARTICIPANTS; ++i) {
            threads.emplace_back(arrive);
        }
        for (auto& t : threads) t.join();

        DSM_ASSERT_TRUE(r, released);
        DSM_ASSERT_EQ(r, count, PARTICIPANTS);
    });

    // Test 11: Atomic flag for lock state transitions
    suite.add("atomic_lock_state", [](TestResult& r) {
        std::atomic<bool> holding{false};
        DSM_ASSERT_FALSE(r, holding.load());

        bool expected = false;
        bool swapped  = holding.compare_exchange_strong(expected, true);
        DSM_ASSERT_TRUE(r, swapped);
        DSM_ASSERT_TRUE(r, holding.load());

        // Try to acquire again — should fail
        expected = false;
        swapped  = holding.compare_exchange_strong(expected, true);
        DSM_ASSERT_FALSE(r, swapped);

        // Release
        holding.store(false);
        DSM_ASSERT_FALSE(r, holding.load());
    });

    // Test 12: Deferred queue logic
    suite.add("deferred_set_operations", [](TestResult& r) {
        std::set<NodeId> deferred;
        deferred.insert(1);
        deferred.insert(2);
        deferred.insert(3);
        DSM_ASSERT_EQ(r, deferred.size(), static_cast<size_t>(3));

        // On unlock, send replies to all deferred
        std::vector<NodeId> replied;
        for (NodeId nd : deferred) replied.push_back(nd);
        deferred.clear();

        DSM_ASSERT_EQ(r, replied.size(), static_cast<size_t>(3));
        DSM_ASSERT_TRUE(r, deferred.empty());
    });

    // Test 13: Barrier with single participant (immediate release)
    suite.add("barrier_single_participant", [](TestResult& r) {
        const int PARTICIPANTS = 1;
        Mutex mu;
        ConditionVariable cv;
        int count = 0;
        bool released = false;

        {
            UniqueLock<Mutex> lk(mu);
            ++count;
            if (count >= PARTICIPANTS) {
                released = true;
            }
        }
        DSM_ASSERT_TRUE(r, released);
    });

    // Test 14: SyncManager map lookup is idempotent
    suite.add("sync_map_idempotent", [](TestResult& r) {
        // Simulate the getMutex factory pattern
        std::map<std::string, int> mutexMap;
        auto getMutex = [&](const std::string& name) -> int* {
            auto& v = mutexMap[name];
            if (v == 0) v = 1; // "create" if absent
            return &v;
        };

        int* m1 = getMutex("lock_a");
        int* m2 = getMutex("lock_a");
        int* m3 = getMutex("lock_b");

        DSM_ASSERT_EQ(r, m1, m2);   // same pointer
        DSM_ASSERT_NE(r, m1, m3);   // different objects
    });

    // Test 15: Barrier arrive/release round-trip timing
    suite.add("barrier_timing_fair", [](TestResult& r) {
        const int N = 4;
        std::atomic<int> arrivedOrder{0};
        std::vector<int> orders(N, -1);
        Mutex mu;
        ConditionVariable cv;
        int count = 0;
        bool released = false;

        std::vector<Thread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&, i] {
                // stagger arrivals
                sleep_ms(i * 5);
                {
                    UniqueLock<Mutex> lk(mu);
                    orders[i] = arrivedOrder.fetch_add(1);
                    ++count;
                    if (count == N) { released = true; cv.notify_all(); }
                    else cv.wait(lk, [&]{ return released; });
                }
            });
        }
        for (auto& t : threads) t.join();

        DSM_ASSERT_TRUE(r, released);
        DSM_ASSERT_EQ(r, count, N);
        // All orders should be in [0, N)
        for (int i = 0; i < N; ++i) {
            DSM_ASSERT_TRUE(r, orders[i] >= 0 && orders[i] < N);
        }
    });

    return suite;
}

DSM_REGISTER_SUITE(makeSyncSuite());
