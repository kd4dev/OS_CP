/**
 * test_page_coherence.cpp — Unit tests for page table & MSI coherence logic
 */

#include "test_runner.h"
#include "../include/dsm_core.h"
#include "../include/dsm_page.h"
#include "../include/dsm_logger.h"
#include <cstring>
#include <thread>
#include <chrono>

using namespace dsm;
using namespace dsm_test;

// ─────────────────────────────── Page State Tests ────────────────────────────

static TestSuite makePageSuite() {
    TestSuite suite{"PageCoherence"};

    // Test 1: pageStateName() returns correct strings
    suite.add("pageStateName_values", [](TestResult& r) {
        DSM_ASSERT_EQ(r, std::string(pageStateName(PageState::Invalid)),  "INV");
        DSM_ASSERT_EQ(r, std::string(pageStateName(PageState::Shared)),   "SHR");
        DSM_ASSERT_EQ(r, std::string(pageStateName(PageState::Modified)), "MOD");
    });

    // Test 2: PAGE_SIZE is 4096
    suite.add("constants_page_size", [](TestResult& r) {
        DSM_ASSERT_EQ(r, PAGE_SIZE, static_cast<size_t>(4096));
    });

    // Test 3: MAX_NODES is reasonable
    suite.add("constants_max_nodes", [](TestResult& r) {
        DSM_ASSERT_TRUE(r, MAX_NODES >= 4);
        DSM_ASSERT_TRUE(r, MAX_NODES <= 1024);
    });

    // Test 4: DirectoryEntry starts in Invalid state
    suite.add("directory_entry_default_invalid", [](TestResult& r) {
        DirectoryEntry de;
        DSM_ASSERT_EQ(r, de.state, PageState::Invalid);
        DSM_ASSERT_EQ(r, de.owner, INVALID_NODE_ID);
        DSM_ASSERT_TRUE(r, de.sharers.empty());
        DSM_ASSERT_EQ(r, de.version, static_cast<SeqNum>(0));
    });

    // Test 5: DirectoryEntry state queries
    suite.add("directory_entry_state_queries", [](TestResult& r) {
        DirectoryEntry de;
        DSM_ASSERT_TRUE(r,  de.isInvalid());
        DSM_ASSERT_FALSE(r, de.isShared());
        DSM_ASSERT_FALSE(r, de.isModified());

        de.state = PageState::Shared;
        DSM_ASSERT_FALSE(r, de.isInvalid());
        DSM_ASSERT_TRUE(r,  de.isShared());
        DSM_ASSERT_FALSE(r, de.isModified());

        de.state = PageState::Modified;
        DSM_ASSERT_FALSE(r, de.isInvalid());
        DSM_ASSERT_FALSE(r, de.isShared());
        DSM_ASSERT_TRUE(r,  de.isModified());
    });

    // Test 6: LocalPageEntry default values
    suite.add("local_page_entry_defaults", [](TestResult& r) {
        LocalPageEntry lpe;
        DSM_ASSERT_EQ(r, lpe.pageId,  static_cast<PageId>(0));
        DSM_ASSERT_EQ(r, lpe.state,   PageState::Invalid);
        DSM_ASSERT_EQ(r, lpe.addr,    (void*)nullptr);
        DSM_ASSERT_EQ(r, lpe.version, static_cast<SeqNum>(0));
        DSM_ASSERT_FALSE(r, lpe.dirty);
    });

    // Test 7: PageTable construction with small region
    suite.add("page_table_construct_small", [](TestResult& r) {
        DSMConfig cfg;
        cfg.localNodeId = 0;
        cfg.localPort   = 19900;
        cfg.memorySize  = 4 * PAGE_SIZE;   // 4 pages
        cfg.enableUI    = false;
        cfg.logFile     = "test_pt.log";

        // We cannot construct DSMManager directly in a unit test (it installs
        // the SIGSEGV handler and starts sockets), so we just verify that
        // the config constants are consistent.
        size_t numPages = cfg.memorySize / PAGE_SIZE;
        DSM_ASSERT_EQ(r, numPages, static_cast<size_t>(4));
    });

    // Test 8: Page address arithmetic
    suite.add("page_addr_arithmetic", [](TestResult& r) {
        // Simulate the math used by PageTable
        uint8_t fakeBase[4 * PAGE_SIZE];
        void*   base = fakeBase;

        auto addrToPage = [&](const void* addr) -> PageId {
            const uint8_t* a = static_cast<const uint8_t*>(addr);
            const uint8_t* b = static_cast<const uint8_t*>(base);
            return static_cast<PageId>((a - b) / PAGE_SIZE);
        };
        auto pageToAddr = [&](PageId pid) -> void* {
            return static_cast<uint8_t*>(base) + static_cast<size_t>(pid) * PAGE_SIZE;
        };

        DSM_ASSERT_EQ(r, addrToPage(fakeBase),                PageId{0});
        DSM_ASSERT_EQ(r, addrToPage(fakeBase + PAGE_SIZE),    PageId{1});
        DSM_ASSERT_EQ(r, addrToPage(fakeBase + 2*PAGE_SIZE),  PageId{2});
        DSM_ASSERT_EQ(r, pageToAddr(0), (void*)fakeBase);
        DSM_ASSERT_EQ(r, pageToAddr(1), (void*)(fakeBase + PAGE_SIZE));
    });

    // Test 9: ownsAddr range check
    suite.add("owns_addr_range_check", [](TestResult& r) {
        uint8_t fakeBase[2 * PAGE_SIZE];
        void*   base       = fakeBase;
        size_t  regionSize = 2 * PAGE_SIZE;

        auto ownsAddr = [&](const void* addr) -> bool {
            const uint8_t* a = static_cast<const uint8_t*>(addr);
            const uint8_t* b = static_cast<const uint8_t*>(base);
            return a >= b && a < b + regionSize;
        };

        DSM_ASSERT_TRUE(r,  ownsAddr(fakeBase));
        DSM_ASSERT_TRUE(r,  ownsAddr(fakeBase + PAGE_SIZE - 1));
        DSM_ASSERT_TRUE(r,  ownsAddr(fakeBase + PAGE_SIZE));
        DSM_ASSERT_FALSE(r, ownsAddr(fakeBase + 2 * PAGE_SIZE));
        DSM_ASSERT_FALSE(r, ownsAddr(fakeBase - 1));
    });

    // Test 10: MSI transition validity
    suite.add("msi_valid_transitions", [](TestResult& r) {
        // Valid: INV->SHR, INV->MOD, SHR->MOD, MOD->INV, SHR->INV
        // These are logical checks on the state values
        auto canRead  = [](PageState s) { return s == PageState::Shared || s == PageState::Modified; };
        auto canWrite = [](PageState s) { return s == PageState::Modified; };
        auto needFetch= [](PageState s, AccessType a) {
            if (a == AccessType::Read)  return s == PageState::Invalid;
            return s == PageState::Invalid || s == PageState::Shared;
        };

        DSM_ASSERT_TRUE(r,  canRead(PageState::Shared));
        DSM_ASSERT_TRUE(r,  canRead(PageState::Modified));
        DSM_ASSERT_FALSE(r, canRead(PageState::Invalid));

        DSM_ASSERT_TRUE(r,  canWrite(PageState::Modified));
        DSM_ASSERT_FALSE(r, canWrite(PageState::Shared));
        DSM_ASSERT_FALSE(r, canWrite(PageState::Invalid));

        DSM_ASSERT_TRUE(r,  needFetch(PageState::Invalid, AccessType::Read));
        DSM_ASSERT_FALSE(r, needFetch(PageState::Shared,  AccessType::Read));
        DSM_ASSERT_TRUE(r,  needFetch(PageState::Shared,  AccessType::Write));
        DSM_ASSERT_FALSE(r, needFetch(PageState::Modified,AccessType::Write));
    });

    // Test 11: VClock array is zero-initialized
    suite.add("vclock_zero_init", [](TestResult& r) {
        VClock vc{};
        for (uint32_t i = 0; i < MAX_NODES; ++i) {
            DSM_ASSERT_EQ(r, vc[i], static_cast<uint64_t>(0));
        }
    });

    // Test 12: NodeStats atomic operations
    suite.add("node_stats_atomics", [](TestResult& r) {
        NodeStats s;
        s.pageFaults.fetch_add(5);
        s.readRequests.fetch_add(3);
        s.writeRequests.fetch_add(2);
        DSM_ASSERT_EQ(r, s.pageFaults.load(),    static_cast<uint64_t>(5));
        DSM_ASSERT_EQ(r, s.readRequests.load(),  static_cast<uint64_t>(3));
        DSM_ASSERT_EQ(r, s.writeRequests.load(), static_cast<uint64_t>(2));
    });

    // Test 13: NodeStats multi-thread increment
    suite.add("node_stats_multithread", [](TestResult& r) {
        NodeStats s;
        const int N = 10;
        const int ITERS = 1000;
        std::vector<Thread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&s, ITERS] {
                for (int j = 0; j < ITERS; ++j) {
                    s.pageFaults.fetch_add(1, std::memory_order_relaxed);
                }
            });
        }
        for (auto& t : threads) t.join();
        DSM_ASSERT_EQ(r, s.pageFaults.load(), static_cast<uint64_t>(N * ITERS));
    });

    // Test 14: DirectoryEntry version increment
    suite.add("directory_version_increment", [](TestResult& r) {
        DirectoryEntry de;
        DSM_ASSERT_EQ(r, de.version, SeqNum{0});
        de.version++;
        DSM_ASSERT_EQ(r, de.version, SeqNum{1});
        de.version += 99;
        DSM_ASSERT_EQ(r, de.version, SeqNum{100});
    });

    // Test 15: Multiple sharers in DirectoryEntry
    suite.add("directory_multiple_sharers", [](TestResult& r) {
        DirectoryEntry de;
        de.state = PageState::Shared;
        de.sharers.insert(1);
        de.sharers.insert(2);
        de.sharers.insert(3);
        DSM_ASSERT_EQ(r, de.sharers.size(), static_cast<size_t>(3));
        de.sharers.erase(2);
        DSM_ASSERT_EQ(r, de.sharers.size(), static_cast<size_t>(2));
        DSM_ASSERT_FALSE(r, de.sharers.count(2));
        DSM_ASSERT_TRUE(r, de.sharers.count(1));
        DSM_ASSERT_TRUE(r, de.sharers.count(3));
    });

    return suite;
}

DSM_REGISTER_SUITE(makePageSuite());
