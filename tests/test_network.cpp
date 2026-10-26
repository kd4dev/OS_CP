/**
 * test_network.cpp — Unit tests for networking layer & message serialization
 */

#include "test_runner.h"
#include "../include/dsm_core.h"
#include "../include/dsm_network.h"
#include "../include/dsm_logger.h"
#include <cstring>
#include <chrono>
#include <vector>
#include <numeric>

using namespace dsm;
using namespace dsm_test;

// ─────────────────────────────── Helpers ─────────────────────────────────────

namespace {

// Simple in-memory checksum matching what NetworkLayer would use
uint32_t simpleChecksum(const uint8_t* data, size_t len) {
    uint32_t csum = 2166136261u;
    for (size_t i = 0; i < len; ++i)
        csum = (csum ^ data[i]) * 16777619u;
    return csum;
}

Message makeTestMsg(MsgType type, NodeId src, NodeId dst, PageId pid = 0) {
    Message m(type, src, dst, pid);
    m.header.magic      = 0xD5CAFE01U;
    m.header.version    = MSG_VERSION;
    m.header.seqNum     = 42;
    m.header.payloadLen = 0;
    return m;
}

} // namespace

// ─────────────────────────────── Network Suite ───────────────────────────────

static TestSuite makeNetworkSuite() {
    TestSuite suite{"Network"};

    // Test 1: MsgHeader size is 40 bytes
    suite.add("msg_header_size", [](TestResult& r) {
        DSM_ASSERT_EQ(r, sizeof(MsgHeader), static_cast<size_t>(40));
    });

    // Test 2: Message construction defaults
    suite.add("message_construction", [](TestResult& r) {
        Message m(MsgType::READ_REQ, 1, 2, 5);
        DSM_ASSERT_EQ(r, m.header.type,    MsgType::READ_REQ);
        DSM_ASSERT_EQ(r, m.header.srcNode, NodeId{1});
        DSM_ASSERT_EQ(r, m.header.dstNode, NodeId{2});
        DSM_ASSERT_EQ(r, m.header.pageId,  PageId{5});
        DSM_ASSERT_TRUE(r, m.payload.empty());
    });

    // Test 3: msgTypeName() for all types
    suite.add("msg_type_names", [](TestResult& r) {
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::HELLO)),          "HELLO");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::HEARTBEAT)),      "HEARTBEAT");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::READ_REQ)),       "READ_REQ");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::WRITE_REQ)),      "WRITE_REQ");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::READ_ACK)),       "READ_ACK");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::WRITE_ACK)),      "WRITE_ACK");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::INVALIDATE)),     "INVALIDATE");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::LOCK_REQ)),       "LOCK_REQ");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::BARRIER_ARRIVE)), "BARRIER_ARRIVE");
        DSM_ASSERT_EQ(r, std::string(msgTypeName(MsgType::NACK)),           "NACK");
    });

    // Test 4: Payload attachment to message
    suite.add("message_payload", [](TestResult& r) {
        Message m(MsgType::WRITEBACK, 0, 1, 0);
        m.payload.resize(PAGE_SIZE, 0xAB);
        m.header.payloadLen = static_cast<uint32_t>(m.payload.size());

        DSM_ASSERT_EQ(r, m.payload.size(), PAGE_SIZE);
        DSM_ASSERT_EQ(r, m.header.payloadLen, static_cast<uint32_t>(PAGE_SIZE));
        DSM_ASSERT_EQ(r, m.payload[0], static_cast<uint8_t>(0xAB));
        DSM_ASSERT_EQ(r, m.payload[PAGE_SIZE-1], static_cast<uint8_t>(0xAB));
    });

    // Test 5: Message copy semantics
    suite.add("message_copy", [](TestResult& r) {
        Message orig(MsgType::READ_ACK, 3, 4, 7);
        orig.payload = {1, 2, 3, 4, 5};
        orig.header.seqNum = 99;

        Message copy = orig;
        DSM_ASSERT_EQ(r, copy.header.type,    MsgType::READ_ACK);
        DSM_ASSERT_EQ(r, copy.header.srcNode, NodeId{3});
        DSM_ASSERT_EQ(r, copy.header.seqNum,  SeqNum{99});
        DSM_ASSERT_EQ(r, copy.payload.size(),  static_cast<size_t>(5));
        DSM_ASSERT_EQ(r, copy.payload[2],      static_cast<uint8_t>(3));
    });

    // Test 6: Sequence number atomics
    suite.add("seq_counter_atomic", [](TestResult& r) {
        std::atomic<SeqNum> counter{1};
        const int N = 8, ITERS = 1000;
        std::atomic<SeqNum> maxSeen{0};
        std::vector<Thread> threads;

        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < ITERS; ++j) {
                    SeqNum val = counter.fetch_add(1, std::memory_order_relaxed);
                    SeqNum prev = maxSeen.load(std::memory_order_relaxed);
                    while (val > prev &&
                           !maxSeen.compare_exchange_weak(prev, val,
                               std::memory_order_relaxed)) {}
                }
            });
        }
        for (auto& t : threads) t.join();
        DSM_ASSERT_EQ(r, counter.load(), SeqNum{1 + N * ITERS});
    });

    // Test 7: PendingReply future / promise round-trip
    suite.add("pending_reply_promise", [](TestResult& r) {
        PendingReply pr;
        DSM_ASSERT_TRUE(r, pr.future.valid());

        Message response(MsgType::READ_ACK, 2, 1, 3);
        response.header.seqNum = 77;

        Thread sender([&] {
            sleep_ms(50);
            pr.promise.set_value(response);
        });

        bool ready = pr.future.wait_for(2000);
        DSM_ASSERT_TRUE(r, ready);

        Message got = pr.future.get();
        DSM_ASSERT_EQ(r, got.header.type,    MsgType::READ_ACK);
        DSM_ASSERT_EQ(r, got.header.seqNum,  SeqNum{77});
        DSM_ASSERT_EQ(r, got.header.pageId,  PageId{3});
        sender.join();
    });

    // Test 8: PendingReply timeout
    suite.add("pending_reply_timeout", [](TestResult& r) {
        PendingReply pr;
        bool ready = pr.future.wait_for(50);
        DSM_ASSERT_FALSE(r, ready);
        // Satisfy the promise
        pr.promise.set_value(Message{});
    });

    // Test 9: Payload checksum consistency
    suite.add("payload_checksum", [](TestResult& r) {
        std::vector<uint8_t> data(256);
        std::iota(data.begin(), data.end(), 0);

        uint32_t cs1 = simpleChecksum(data.data(), data.size());
        uint32_t cs2 = simpleChecksum(data.data(), data.size());
        DSM_ASSERT_EQ(r, cs1, cs2);

        // Mutate one byte
        data[0] = 0xFF;
        uint32_t cs3 = simpleChecksum(data.data(), data.size());
        DSM_ASSERT_NE(r, cs1, cs3);
    });

    // Test 10: MsgHeader fields are correctly laid out
    suite.add("msg_header_fields", [](TestResult& r) {
        MsgHeader h{};
        h.type       = MsgType::INVALIDATE;
        h.srcNode    = 7;
        h.dstNode    = 8;
        h.seqNum     = 12345;
        h.pageId     = 99;
        h.payloadLen = 4096;

        DSM_ASSERT_EQ(r, h.type,       MsgType::INVALIDATE);
        DSM_ASSERT_EQ(r, h.srcNode,    NodeId{7});
        DSM_ASSERT_EQ(r, h.dstNode,    NodeId{8});
        DSM_ASSERT_EQ(r, h.seqNum,     SeqNum{12345});
        DSM_ASSERT_EQ(r, h.pageId,     PageId{99});
        DSM_ASSERT_EQ(r, h.payloadLen, uint32_t{4096});
    });

    // Test 11: DSMConfig peer parsing
    suite.add("config_peer_storage", [](TestResult& r) {
        DSMConfig cfg;
        cfg.peers.push_back({1, "192.168.1.1", 7001});
        cfg.peers.push_back({2, "192.168.1.2", 7002});
        cfg.peers.push_back({3, "192.168.1.3", 7003});

        DSM_ASSERT_EQ(r, cfg.peers.size(), static_cast<size_t>(3));
        DSM_ASSERT_EQ(r, cfg.peers[0].id,      NodeId{1});
        DSM_ASSERT_EQ(r, cfg.peers[1].address, std::string("192.168.1.2"));
        DSM_ASSERT_EQ(r, cfg.peers[2].port,    uint16_t{7003});
    });

    // Test 12: Message move semantics
    suite.add("message_move", [](TestResult& r) {
        Message orig(MsgType::WRITE_ACK, 5, 6, 10);
        orig.payload.resize(PAGE_SIZE, 0xCC);

        Message moved = std::move(orig);
        DSM_ASSERT_EQ(r, moved.header.type,   MsgType::WRITE_ACK);
        DSM_ASSERT_EQ(r, moved.payload.size(), PAGE_SIZE);
        DSM_ASSERT_EQ(r, moved.payload[0],     static_cast<uint8_t>(0xCC));
        // After move, orig payload should be empty (moved-from state)
        DSM_ASSERT_TRUE(r, orig.payload.empty());
    });

    // Test 13: Large payload handling
    suite.add("large_payload", [](TestResult& r) {
        const size_t SIZE = 64 * 1024; // 64 KiB
        Message m(MsgType::WRITEBACK, 0, 1, 0);
        m.payload.resize(SIZE);
        std::fill(m.payload.begin(), m.payload.end(), 0x5A);
        m.header.payloadLen = static_cast<uint32_t>(SIZE);

        DSM_ASSERT_EQ(r, m.payload.size(), SIZE);
        DSM_ASSERT_EQ(r, m.payload[SIZE/2], static_cast<uint8_t>(0x5A));
        DSM_ASSERT_EQ(r, m.header.payloadLen, static_cast<uint32_t>(SIZE));
    });

    // Test 14: Multiple concurrent PendingReply objects
    suite.add("multiple_pending_replies", [](TestResult& r) {
        const int N = 8;
        std::vector<std::unique_ptr<PendingReply>> pending;
        for (int i = 0; i < N; ++i)
            pending.push_back(std::make_unique<PendingReply>());

        // Fulfill all from threads
        std::vector<Thread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&, i] {
                Message m(MsgType::READ_ACK, 0, 1, static_cast<PageId>(i));
                m.header.seqNum = static_cast<SeqNum>(i);
                pending[i]->promise.set_value(std::move(m));
            });
        }
        for (auto& t : threads) t.join();

        for (int i = 0; i < N; ++i) {
            bool ready = pending[i]->future.wait_for(100);
            DSM_ASSERT_TRUE(r, ready);
            Message got = pending[i]->future.get();
            DSM_ASSERT_EQ(r, got.header.seqNum, static_cast<SeqNum>(i));
        }
    });

    // Test 15: DEFAULT_PORT is sensible
    suite.add("default_port_value", [](TestResult& r) {
        DSM_ASSERT_TRUE(r, DEFAULT_PORT >= 1024);
        DSM_ASSERT_TRUE(r, DEFAULT_PORT < 49152);
    });

    return suite;
}

DSM_REGISTER_SUITE(makeNetworkSuite());
