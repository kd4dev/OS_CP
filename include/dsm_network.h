#pragma once
/**
 * dsm_network.h — DSM Network Layer
 *
 * Provides reliable TCP-based messaging between DSM nodes.
 * Each message has a fixed 32-byte header followed by variable payload.
 * A thread-per-connection model handles concurrent peers.
 */

#include "dsm_core.h"
#include <functional>
#include <map>
#include <queue>
#include <utility>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  pragma comment(lib, "ws2_32.lib")
   using sock_t = SOCKET;
   static constexpr sock_t INVALID_SOCK = INVALID_SOCKET;
#else
#  include <sys/socket.h>
#  include <netinet/in.h>
#  include <arpa/inet.h>
#  include <unistd.h>
   using sock_t = int;
   static constexpr sock_t INVALID_SOCK = -1;
#endif

namespace dsm {

// ─────────────────────────────── Message Types ───────────────────────────────

enum class MsgType : uint16_t {
    // Handshake
    HELLO           = 1,
    HELLO_ACK       = 2,
    BYE             = 3,

    // Heartbeat
    HEARTBEAT       = 10,
    HEARTBEAT_ACK   = 11,

    // Coherence — node to home
    READ_REQ        = 20,   ///< Request shared copy
    WRITE_REQ       = 21,   ///< Request exclusive copy
    WRITEBACK       = 22,   ///< Dirty page return
    INV_ACK         = 23,   ///< Acknowledgment of invalidation

    // Coherence — home to node
    READ_ACK        = 30,   ///< Page data (shared)
    WRITE_ACK       = 31,   ///< Page data (exclusive)
    INVALIDATE      = 32,   ///< Invalidate your copy
    DOWNGRADE       = 33,   ///< MOD → SHR downgrade request

    // Synchronization
    LOCK_REQ        = 40,
    LOCK_GRANT      = 41,
    LOCK_RELEASE    = 42,
    BARRIER_ARRIVE  = 50,
    BARRIER_RELEASE = 51,

    // Error / generic reply
    NACK            = 60,
    ERROR_MSG       = 61,
};

inline const char* msgTypeName(MsgType t) {
    switch (t) {
        case MsgType::HELLO:          return "HELLO";
        case MsgType::HELLO_ACK:      return "HELLO_ACK";
        case MsgType::BYE:            return "BYE";
        case MsgType::HEARTBEAT:      return "HEARTBEAT";
        case MsgType::HEARTBEAT_ACK:  return "HEARTBEAT_ACK";
        case MsgType::READ_REQ:       return "READ_REQ";
        case MsgType::WRITE_REQ:      return "WRITE_REQ";
        case MsgType::WRITEBACK:      return "WRITEBACK";
        case MsgType::INV_ACK:        return "INV_ACK";
        case MsgType::READ_ACK:       return "READ_ACK";
        case MsgType::WRITE_ACK:      return "WRITE_ACK";
        case MsgType::INVALIDATE:     return "INVALIDATE";
        case MsgType::DOWNGRADE:      return "DOWNGRADE";
        case MsgType::LOCK_REQ:       return "LOCK_REQ";
        case MsgType::LOCK_GRANT:     return "LOCK_GRANT";
        case MsgType::LOCK_RELEASE:   return "LOCK_RELEASE";
        case MsgType::BARRIER_ARRIVE: return "BARRIER_ARRIVE";
        case MsgType::BARRIER_RELEASE:return "BARRIER_RELEASE";
        case MsgType::NACK:           return "NACK";
        case MsgType::ERROR_MSG:      return "ERROR_MSG";
        default:                      return "UNKNOWN";
    }
}

// ─────────────────────────────── Message Header ──────────────────────────────

#pragma pack(push, 1)
struct MsgHeader {
    uint32_t magic      = 0xD5CAFE01U;  ///< Framing magic (DSM CAFE)
    uint16_t version    = MSG_VERSION;
    MsgType  type       = MsgType::HEARTBEAT;
    NodeId   srcNode    = INVALID_NODE_ID;
    NodeId   dstNode    = INVALID_NODE_ID;
    SeqNum   seqNum     = 0;
    PageId   pageId     = 0;
    uint32_t payloadLen = 0;
    uint32_t checksum   = 0;
    uint8_t  _pad[4]    = {};           ///< Align to 32 bytes
};
#pragma pack(pop)

static_assert(sizeof(MsgHeader) == 40, "MsgHeader size mismatch");

struct Message {
    MsgHeader            header;
    std::vector<uint8_t> payload;

    Message() = default;
    explicit Message(MsgType t, NodeId src, NodeId dst, PageId pid = 0)
    { header.type=t; header.srcNode=src; header.dstNode=dst; header.pageId=pid; }
};

// ─────────────────────────────── Reply Awaiter ───────────────────────────────

struct PendingReply {
    Promise<Message>    promise;
    Future<Message>     future;
    int64_t             sentAt = 0;

    PendingReply()
        : future(promise.get_future())
        , sentAt(current_time_ms()) {}
};

// ─────────────────────────────── NetworkLayer ────────────────────────────────

using MessageHandler = std::function<void(const Message&)>;

class NetworkLayer {
public:
    NetworkLayer(DSMManager& mgr);
    ~NetworkLayer();

    bool start();
    void stop();

    /// Send a message and optionally wait for a matching reply
    bool send(NodeId dst, Message msg);
    std::pair<bool, Message> sendAndWait(NodeId dst, Message msg,
                                         uint32_t timeoutMs = 5000);

    /// Register handler called on every received message (runs on recv thread)
    void setHandler(MessageHandler h) { handler_ = std::move(h); }

    /// Connect to a known peer (called at startup)
    bool connectToPeer(NodeId id, const std::string& addr, uint16_t port);

    /// Number of connected peers
    size_t connectedPeers() const;

    bool isConnected(NodeId id) const;

    /// Broadcast to all connected peers
    void broadcast(Message msg);

private:
    void acceptLoop();
    void receiveLoop(NodeId peerId, sock_t fd);
    void handleMessage(const Message& msg);

    bool    sendRaw(sock_t fd, const Message& msg);
    bool    recvRaw(sock_t fd, Message& out);
    uint32_t computeChecksum(const uint8_t* data, size_t len);

    DSMManager& mgr_;
    sock_t      listenSock_  = INVALID_SOCK;
    std::atomic<bool> running_{false};
    Thread      acceptThread_;
    MessageHandler handler_;

    struct PeerConn {
        sock_t      fd      = INVALID_SOCK;
        Thread      recvThread;
        Mutex       sendMu;
        std::atomic<bool> alive{false};
        std::string address;
        uint16_t    port = 0;
    };

    mutable Mutex                                  peersMu_;
    std::map<NodeId, std::unique_ptr<PeerConn>>    peers_;

    // Pending reply map: keyed by seqNum
    Mutex                                          replyMu_;
    std::map<SeqNum, std::shared_ptr<PendingReply>> pending_;
    std::atomic<SeqNum>                            seqCounter_{1};

#ifdef _WIN32
    bool wsaInit_ = false;
#endif
};

} // namespace dsm
