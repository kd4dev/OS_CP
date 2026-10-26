/**
 * test_integration.cpp — Integration tests for DSM subsystems
 *
 * Tests end-to-end behaviour: Logger, PhiDetector, config wiring,
 * and multi-thread safety patterns used throughout the system.
 */

#include "test_runner.h"
#include "../include/dsm_core.h"
#include "../include/dsm_logger.h"
#include "../include/dsm_node.h"
#include "../include/dsm_network.h"
#include <cstring>
#include <sstream>
#include <chrono>
#include <vector>
#include <atomic>
#include <algorithm>
#include <fstream>
#include <cstdio>   // remove(), fopen()
#include <sys/stat.h>

using namespace dsm;
using namespace dsm_test;

// ─────────────────────────────── Helper: temp file ────────────────────────────

static std::string tempLogFile(int n) {
    return "dsm_test_" + std::to_string(n) + ".log";
}

static void removeTempLog(const std::string& f) {
    std::remove(f.c_str());
}

static bool fileExists(const std::string& f) {
    struct stat st{};
    return stat(f.c_str(), &st) == 0;
}

// ─────────────────────────────── Integration Suite ───────────────────────────

static TestSuite makeIntegrationSuite() {
    TestSuite suite{"Integration"};

    // ─── Logger tests ─────────────────────────────────────────────────────────

    // Test 1: Logger creates file and writes
    suite.add("logger_creates_file", [](TestResult& r) {
        std::string fname = tempLogFile(1);
        removeTempLog(fname);
        {
            Logger log(fname, LogLevel::INFO, false);
            DSM_INFO(log, "Hello from test");
            log.flush();
        }
        DSM_ASSERT_TRUE(r, fileExists(fname));
        removeTempLog(fname);
    });

    // Test 2: Logger respects minimum level
    suite.add("logger_level_filter", [](TestResult& r) {
        std::string fname = tempLogFile(2);
        removeTempLog(fname);
        int sinkCalls = 0;
        {
            Logger log(fname, LogLevel::WARN, false);
            log.addSink([&sinkCalls](LogLevel, const std::string&) {
                ++sinkCalls;
            });
            DSM_DEBUG(log, "This should be filtered");
            DSM_INFO(log,  "This too");
            DSM_WARN(log,  "This passes");
            DSM_ERROR(log, "This also passes");
            log.flush();
        }
        DSM_ASSERT_EQ(r, sinkCalls, 2);
        removeTempLog(fname);
    });

    // Test 3: Logger level can be changed at runtime
    suite.add("logger_dynamic_level", [](TestResult& r) {
        std::string fname = tempLogFile(3);
        removeTempLog(fname);
        int sinkCalls = 0;
        {
            Logger log(fname, LogLevel::ERROR, false);
            log.addSink([&sinkCalls](LogLevel, const std::string&) { ++sinkCalls; });
            DSM_INFO(log, "filtered");
            DSM_ASSERT_EQ(r, sinkCalls, 0);
            log.setLevel(LogLevel::INFO);
            DSM_INFO(log, "now passes");
            DSM_ASSERT_EQ(r, sinkCalls, 1);
        }
        removeTempLog(fname);
    });

    // Test 4: recentLines returns correct ring content
    suite.add("logger_ring_buffer", [](TestResult& r) {
        std::string fname = tempLogFile(4);
        removeTempLog(fname);
        {
            Logger log(fname, LogLevel::INFO, false);
            for (int i = 0; i < 10; ++i) {
                DSM_INFO(log, "Line %d", i);
            }
            log.flush();
            auto recent = log.recentLines(5);
            DSM_ASSERT_EQ(r, recent.size(), static_cast<size_t>(5));
            // The last line should contain "Line 9"
            bool foundLast = false;
            for (auto& l : recent) {
                if (l.find("Line 9") != std::string::npos) { foundLast = true; break; }
            }
            DSM_ASSERT_TRUE(r, foundLast);
        }
        removeTempLog(fname);
    });

    // Test 5: Logger thread safety
    suite.add("logger_thread_safe", [](TestResult& r) {
        std::string fname = tempLogFile(5);
        removeTempLog(fname);
        {
            Logger log(fname, LogLevel::INFO, false);
            const int N = 8, ITERS = 200;
            std::vector<Thread> threads;
            for (int i = 0; i < N; ++i) {
                threads.emplace_back([&log, i, ITERS] {
                    for (int j = 0; j < ITERS; ++j) {
                        DSM_INFO(log, "thread %d iter %d", i, j);
                    }
                });
            }
            for (auto& t : threads) t.join();
            log.flush();
            auto lines = log.recentLines(500);
            // Should have at least N*ITERS lines (ring may have fewer if more than RING_SIZE)
            DSM_ASSERT_TRUE(r, lines.size() > 0);
        }
        removeTempLog(fname);
    });

    // ─── PhiDetector tests ────────────────────────────────────────────────────

    // Test 6: PhiDetector phi=0 with no data
    suite.add("phi_detector_zero_no_data", [](TestResult& r) {
        PhiDetector pd;
        double p = pd.phi(1000);
        DSM_ASSERT_EQ(r, p, 0.0);
    });

    // Test 7: PhiDetector records intervals
    suite.add("phi_detector_records_intervals", [](TestResult& r) {
        PhiDetector pd;
        pd.recordHeartbeat(100);
        pd.recordHeartbeat(600);   // 500ms interval
        pd.recordHeartbeat(1100);  // 500ms interval

        // Just after last beat → phi should be low
        double p = pd.phi(1150);
        DSM_ASSERT_TRUE(r, p < 8.0);  // not suspected
    });

    // Test 8: PhiDetector rises for stale nodes
    suite.add("phi_detector_rises_stale", [](TestResult& r) {
        PhiDetector pd;
        pd.recordHeartbeat(0);
        pd.recordHeartbeat(500);
        pd.recordHeartbeat(1000);

        // Check phi at 1500ms (500ms past last beat = 1 interval)
        double p1 = pd.phi(1500);
        // Check phi at 5000ms (4 intervals past last beat)
        double p2 = pd.phi(5000);

        DSM_ASSERT_TRUE(r, p2 > p1);  // phi grows with time
    });

    // Test 9: PhiDetector isSuspected when phi >= 8
    suite.add("phi_detector_suspected", [](TestResult& r) {
        PhiDetector pd(10, 8.0);
        pd.recordHeartbeat(0);
        pd.recordHeartbeat(500);
        pd.recordHeartbeat(1000);

        // At 1100ms (100ms after last) — alive
        DSM_ASSERT_FALSE(r, pd.isSuspected(1100));

        // At very large elapsed time — suspected
        DSM_ASSERT_TRUE(r, pd.isSuspected(100000));
    });

    // ─── DSMConfig tests ──────────────────────────────────────────────────────

    // Test 10: DSMConfig defaults
    suite.add("config_defaults", [](TestResult& r) {
        DSMConfig cfg;
        DSM_ASSERT_EQ(r, cfg.localNodeId, NodeId{0});
        DSM_ASSERT_EQ(r, cfg.localAddress, std::string("127.0.0.1"));
        DSM_ASSERT_EQ(r, cfg.localPort, DEFAULT_PORT);
        DSM_ASSERT_EQ(r, cfg.memorySize, static_cast<size_t>(64 * 1024 * 1024));
        DSM_ASSERT_FALSE(r, cfg.isHomeNode);
        DSM_ASSERT_TRUE(r, cfg.enableUI);
        DSM_ASSERT_FALSE(r, cfg.verboseLog);
        DSM_ASSERT_TRUE(r, cfg.peers.empty());
    });

    // Test 11: DSMConfig memory size validation
    suite.add("config_memory_alignment", [](TestResult& r) {
        DSMConfig cfg;
        cfg.memorySize = 64 * 1024 * 1024;
        DSM_ASSERT_EQ(r, cfg.memorySize % PAGE_SIZE, static_cast<size_t>(0));

        cfg.memorySize = 16 * 1024 * 1024;
        DSM_ASSERT_EQ(r, cfg.memorySize % PAGE_SIZE, static_cast<size_t>(0));
    });

    // ─── Concurrency patterns ─────────────────────────────────────────────────

    // Test 12: shared_mutex read concurrency
    suite.add("shared_mutex_reads", [](TestResult& r) {
        SharedMutex mu;
        std::atomic<int> concurrentReaders{0};
        std::atomic<int> maxConcurrent{0};
        const int N = 8;

        std::vector<Thread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&] {
                SharedLock lk(mu);
                int cur = concurrentReaders.fetch_add(1) + 1;
                int prev = maxConcurrent.load();
                while (cur > prev) {
                    maxConcurrent.compare_exchange_weak(prev, cur);
                    prev = maxConcurrent.load();
                }
                sleep_ms(10);
                concurrentReaders.fetch_sub(1);
            });
        }
        for (auto& t : threads) t.join();
        // Multiple readers should have proceeded concurrently
        DSM_ASSERT_TRUE(r, maxConcurrent.load() > 1);
    });

    // Test 13: Home node assignment is deterministic
    suite.add("home_node_deterministic", [](TestResult& r) {
        // Simulate homeNodeFor: sorted alive + local, pid % size
        auto homeOf = [](const std::vector<NodeId>& alive, NodeId local, PageId pid) -> NodeId {
            std::vector<NodeId> nodes = alive;
            nodes.push_back(local);
            std::sort(nodes.begin(), nodes.end());
            if (nodes.empty()) return local;
            return nodes[pid % nodes.size()];
        };

        std::vector<NodeId> alive = {1, 2, 3};
        NodeId local = 0;

        NodeId h1 = homeOf(alive, local, 0);
        NodeId h2 = homeOf(alive, local, 0);
        DSM_ASSERT_EQ(r, h1, h2);  // deterministic

        // With 4 nodes {0,1,2,3}, page 4 → 4%4=0 → node 0
        NodeId h3 = homeOf(alive, local, 4);
        DSM_ASSERT_EQ(r, h3, NodeId{0});

        // Page 5 → 5%4=1 → node 1
        NodeId h4 = homeOf(alive, local, 5);
        DSM_ASSERT_EQ(r, h4, NodeId{1});
    });

    // Test 14: Logger sink integration with UI pushLog pattern
    suite.add("logger_sink_to_ui_buffer", [](TestResult& r) {
        std::string fname = tempLogFile(14);
        removeTempLog(fname);

        std::vector<std::string> uiBuffer;
        Mutex uiMu;

        {
            Logger log(fname, LogLevel::INFO, false);
            log.addSink([&](LogLevel, const std::string& line) {
                LockGuard<Mutex> lk(uiMu);
                uiBuffer.push_back(line);
            });

            DSM_INFO(log,  "message A");
            DSM_WARN(log,  "message B");
            DSM_ERROR(log, "message C");
            log.flush();
        }

        DSM_ASSERT_EQ(r, uiBuffer.size(), static_cast<size_t>(3));
        bool hasA = false, hasB = false, hasC = false;
        for (auto& l : uiBuffer) {
            if (l.find("message A") != std::string::npos) hasA = true;
            if (l.find("message B") != std::string::npos) hasB = true;
            if (l.find("message C") != std::string::npos) hasC = true;
        }
        DSM_ASSERT_TRUE(r, hasA && hasB && hasC);
        removeTempLog(fname);
    });

    // Test 15: INVALID_NODE_ID sentinel
    suite.add("invalid_node_id_sentinel", [](TestResult& r) {
        DSM_ASSERT_EQ(r, INVALID_NODE_ID, static_cast<NodeId>(UINT32_MAX));
        NodeId x = INVALID_NODE_ID;
        DSM_ASSERT_NE(r, x, NodeId{0});
        DSM_ASSERT_NE(r, x, NodeId{1});
        // Overflow wrap: INVALID_NODE_ID + 1 should wrap to 0
        NodeId y = static_cast<NodeId>(x + 1u);
        DSM_ASSERT_EQ(r, y, NodeId{0});
    });

    return suite;
}

DSM_REGISTER_SUITE(makeIntegrationSuite());
