/**
 * dsm_network.cpp — TCP networking layer for DSM
 */

#include "dsm_network.h"
#include "dsm_core.h"
#include "dsm_logger.h"
#include <cstring>
#include <stdexcept>
#include <sstream>
#include <chrono>
#include <algorithm>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#else
#  include <sys/socket.h>
#  include <netinet/in.h>
#  include <arpa/inet.h>
#  include <unistd.h>
#  include <fcntl.h>
#  include <poll.h>
#endif

namespace dsm {

// ─────────────────────────────── Platform helpers ────────────────────────────

static void closeSock(sock_t fd) {
#ifdef _WIN32
    closesocket(fd);
#else
    ::close(fd);
#endif
}

static bool setNonBlocking(sock_t fd, bool nb) {
#ifdef _WIN32
    u_long mode = nb ? 1 : 0;
    return ioctlsocket(fd, FIONBIO, &mode) == 0;
#else
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return false;
    flags = nb ? (flags | O_NONBLOCK) : (flags & ~O_NONBLOCK);
    return fcntl(fd, F_SETFL, flags) == 0;
#endif
}

static bool setReuseAddr(sock_t fd) {
    int opt = 1;
#ifdef _WIN32
    return setsockopt(fd, SOL_SOCKET, SO_REUSEADDR,
                      reinterpret_cast<const char*>(&opt), sizeof(opt)) == 0;
#else
    return setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) == 0;
#endif
}

// ─────────────────────────────── Constructor ─────────────────────────────────

NetworkLayer::NetworkLayer(DSMManager& mgr) : mgr_(mgr) {
#ifdef _WIN32
    WSADATA wd{};
    wsaInit_ = (WSAStartup(MAKEWORD(2,2), &wd) == 0);
#endif
}

NetworkLayer::~NetworkLayer() {
    stop();
#ifdef _WIN32
    if (wsaInit_) WSACleanup();
#endif
}

// ─────────────────────────────── start() ─────────────────────────────────────

bool NetworkLayer::start() {
    listenSock_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listenSock_ == INVALID_SOCK) {
        DSM_ERROR(mgr_.logger(), "Failed to create listen socket");
        return false;
    }
    setReuseAddr(listenSock_);

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_port        = htons(mgr_.config().localPort);
    addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(listenSock_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        DSM_ERROR(mgr_.logger(), "Bind failed on port %u", mgr_.config().localPort);
        closeSock(listenSock_);
        return false;
    }
    if (listen(listenSock_, 16) != 0) {
        DSM_ERROR(mgr_.logger(), "Listen failed");
        closeSock(listenSock_);
        return false;
    }

    running_.store(true);
    acceptThread_ = Thread(&NetworkLayer::acceptLoop, this);
    DSM_INFO(mgr_.logger(), "NetworkLayer listening on port %u", mgr_.config().localPort);
    return true;
}

// ─────────────────────────────── stop() ──────────────────────────────────────

void NetworkLayer::stop() {
    if (!running_.exchange(false)) return;
    if (listenSock_ != INVALID_SOCK) {
        closeSock(listenSock_);
        listenSock_ = INVALID_SOCK;
    }
    if (acceptThread_.joinable()) acceptThread_.join();

    // Step 1: close all sockets under lock (causes recvRaw to return false,
    //         so receiveLoop threads will exit their loops)
    {
        LockGuard<Mutex> lk(peersMu_);
        for (auto& p : peers_) {
            if (p.second->fd != INVALID_SOCK) {
                closeSock(p.second->fd);
                p.second->fd = INVALID_SOCK;
            }
        }
    }
    // Step 2: join threads WITHOUT holding peersMu_ — receiveLoop also locks it
    //         on disconnect, so holding the lock here would deadlock
    {
        // We need to snapshot thread handles first
        std::vector<NodeId> peerIds;
        {
            LockGuard<Mutex> lk(peersMu_);
            for (auto& p : peers_) peerIds.push_back(p.first);
        }
        for (NodeId id : peerIds) {
            Thread* thr = nullptr;
            {
                LockGuard<Mutex> lk(peersMu_);
                auto it = peers_.find(id);
                if (it != peers_.end()) thr = &it->second->recvThread;
            }
            if (thr && thr->joinable()) thr->join();
        }
    }
    // Step 3: clean up under lock
    {
        LockGuard<Mutex> lk(peersMu_);
        peers_.clear();
    }
}

// ─────────────────────────────── acceptLoop() ────────────────────────────────

void NetworkLayer::acceptLoop() {
    while (running_.load()) {
        sockaddr_in caddr{};
#ifdef _WIN32
        int clen = sizeof(caddr);
#else
        socklen_t clen = sizeof(caddr);
#endif
        sock_t cfd = accept(listenSock_,
                            reinterpret_cast<sockaddr*>(&caddr), &clen);
        if (cfd == INVALID_SOCK) {
            if (running_.load()) {
                DSM_WARN(mgr_.logger(), "accept() error");
            }
            break;
        }
        // We read a HELLO to identify the node
        Message hello;
        if (!recvRaw(cfd, hello) || hello.header.type != MsgType::HELLO) {
            closeSock(cfd);
            continue;
        }
        NodeId peerId = hello.header.srcNode;
        DSM_INFO(mgr_.logger(), "Accepted connection from node %u", peerId);

        {
            LockGuard<Mutex> lk(peersMu_);
            auto& pc = peers_[peerId];
            if (!pc) pc = std::make_unique<PeerConn>();
            if (pc->fd != INVALID_SOCK) closeSock(pc->fd);
            pc->fd    = cfd;
            pc->alive.store(true);
            pc->recvThread = Thread(&NetworkLayer::receiveLoop, this, peerId, cfd);
        }

        // Send HELLO_ACK
        Message ack(MsgType::HELLO_ACK, mgr_.localId(), peerId);
        send(peerId, ack);
    }
}

// ─────────────────────────────── receiveLoop() ───────────────────────────────

void NetworkLayer::receiveLoop(NodeId peerId, sock_t fd) {
    while (running_.load()) {
        Message msg;
        if (!recvRaw(fd, msg)) {
            DSM_WARN(mgr_.logger(), "Connection to node %u closed", peerId);
            {
                LockGuard<Mutex> lk(peersMu_);
                auto it = peers_.find(peerId);
                if (it != peers_.end()) it->second->alive.store(false);
            }
            break;
        }
        mgr_.stats().messagesRecv.fetch_add(1, std::memory_order_relaxed);
        mgr_.stats().bytesRecv.fetch_add(sizeof(MsgHeader) + msg.payload.size(),
                                          std::memory_order_relaxed);

        // Check if this is a reply to a pending request
        {
            LockGuard<Mutex> lk(replyMu_);
            auto it = pending_.find(msg.header.seqNum);
            if (it != pending_.end()) {
                it->second->promise.set_value(std::move(msg));
                pending_.erase(it);
                continue;
            }
        }

        if (handler_) handler_(msg);
    }
}

// ─────────────────────────────── send() ──────────────────────────────────────

bool NetworkLayer::send(NodeId dst, Message msg) {
    msg.header.srcNode = mgr_.localId();
    msg.header.dstNode = dst;
    if (msg.header.seqNum == 0)
        msg.header.seqNum = seqCounter_.fetch_add(1, std::memory_order_relaxed);
    msg.header.payloadLen = static_cast<uint32_t>(msg.payload.size());

    LockGuard<Mutex> plk(peersMu_);
    auto it = peers_.find(dst);
    if (it == peers_.end() || !it->second->alive.load()) {
        DSM_WARN(mgr_.logger(), "send() — peer %u not connected", dst);
        return false;
    }
    LockGuard<Mutex> slk(it->second->sendMu);
    bool ok = sendRaw(it->second->fd, msg);
    if (ok) {
        mgr_.stats().messagesSent.fetch_add(1, std::memory_order_relaxed);
        mgr_.stats().bytesSent.fetch_add(sizeof(MsgHeader) + msg.payload.size(),
                                          std::memory_order_relaxed);
    }
    return ok;
}

// ─────────────────────────────── sendAndWait() ───────────────────────────────

std::pair<bool, Message> NetworkLayer::sendAndWait(NodeId dst, Message msg,
                                                  uint32_t timeoutMs) {
    msg.header.srcNode = mgr_.localId();
    msg.header.dstNode = dst;
    SeqNum seq = seqCounter_.fetch_add(1, std::memory_order_relaxed);
    msg.header.seqNum  = seq;
    msg.header.payloadLen = static_cast<uint32_t>(msg.payload.size());

    auto pending = std::make_shared<PendingReply>();
    {
        LockGuard<Mutex> lk(replyMu_);
        pending_[seq] = pending;
    }

    if (!send(dst, msg)) {
        LockGuard<Mutex> lk(replyMu_);
        pending_.erase(seq);
        return {false, Message{}};
    }

    bool ready = pending->future.wait_for(timeoutMs);
    {
        LockGuard<Mutex> lk(replyMu_);
        pending_.erase(seq);
    }
    if (!ready) {
        DSM_WARN(mgr_.logger(), "sendAndWait timeout waiting for node %u seq=%llu",
                 dst, static_cast<unsigned long long>(seq));
        return {false, Message{}};
    }
    return {true, pending->future.get()};
}

// ─────────────────────────────── connectToPeer() ─────────────────────────────

bool NetworkLayer::connectToPeer(NodeId id, const std::string& addr, uint16_t port) {
    sock_t fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (fd == INVALID_SOCK) return false;

    sockaddr_in saddr{};
    saddr.sin_family = AF_INET;
    saddr.sin_port   = htons(port);
#ifdef _WIN32
    saddr.sin_addr.s_addr = inet_addr(addr.c_str());
#else
    inet_pton(AF_INET, addr.c_str(), &saddr.sin_addr);
#endif

    if (connect(fd, reinterpret_cast<sockaddr*>(&saddr), sizeof(saddr)) != 0) {
        DSM_WARN(mgr_.logger(), "connectToPeer: cannot reach node %u at %s:%u",
                 id, addr.c_str(), port);
        closeSock(fd);
        return false;
    }

    {
        LockGuard<Mutex> lk(peersMu_);
        auto& pc = peers_[id];
        if (!pc) pc = std::make_unique<PeerConn>();
        pc->fd      = fd;
        pc->address = addr;
        pc->port    = port;
        pc->alive.store(true);
        pc->recvThread = Thread(&NetworkLayer::receiveLoop, this, id, fd);
    }

    // Send HELLO
    Message hello(MsgType::HELLO, mgr_.localId(), id);
    send(id, hello);

    DSM_INFO(mgr_.logger(), "Connected to node %u at %s:%u", id, addr.c_str(), port);
    return true;
}

// ─────────────────────────────── broadcast() ─────────────────────────────────

void NetworkLayer::broadcast(Message msg) {
    std::vector<NodeId> ids;
    {
        LockGuard<Mutex> lk(peersMu_);
        for (auto& p : peers_) {
            if (p.second->alive.load()) ids.push_back(p.first);
        }
    }
    for (NodeId id : ids) {
        Message copy = msg;
        send(id, copy);
    }
}

// ─────────────────────────────── connectedPeers() ────────────────────────────

size_t NetworkLayer::connectedPeers() const {
    LockGuard<Mutex> lk(peersMu_);
    size_t n = 0;
    for (auto& p : peers_) if (p.second->alive.load()) ++n;
    return n;
}

bool NetworkLayer::isConnected(NodeId id) const {
    LockGuard<Mutex> lk(peersMu_);
    auto it = peers_.find(id);
    return it != peers_.end() && it->second->alive.load();
}

// ─────────────────────────────── Raw I/O ─────────────────────────────────────

static bool sendAll(sock_t fd, const uint8_t* buf, size_t len) {
    size_t sent = 0;
    while (sent < len) {
#ifdef _WIN32
        int n = ::send(fd, reinterpret_cast<const char*>(buf+sent),
                       static_cast<int>(len-sent), 0);
#else
        ssize_t n = ::send(fd, buf+sent, len-sent, MSG_NOSIGNAL);
#endif
        if (n <= 0) return false;
        sent += static_cast<size_t>(n);
    }
    return true;
}

static bool recvAll(sock_t fd, uint8_t* buf, size_t len) {
    size_t got = 0;
    while (got < len) {
#ifdef _WIN32
        int n = ::recv(fd, reinterpret_cast<char*>(buf+got),
                       static_cast<int>(len-got), 0);
#else
        ssize_t n = ::recv(fd, buf+got, len-got, 0);
#endif
        if (n <= 0) return false;
        got += static_cast<size_t>(n);
    }
    return true;
}

uint32_t NetworkLayer::computeChecksum(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; ++i) {
        crc ^= static_cast<uint32_t>(data[i]) << 24u;
        for (int j = 0; j < 8; ++j) {
            if (crc & 0x80000000u) crc = (crc << 1u) ^ 0x04C11DB7u;
            else                   crc <<= 1u;
        }
    }
    return crc ^ 0xFFFFFFFFu;
}

bool NetworkLayer::sendRaw(sock_t fd, const Message& msg) {
    // Fix magic field
    MsgHeader hdr = msg.header;
    hdr.magic = 0xD5CAFE01U;
    hdr.payloadLen = static_cast<uint32_t>(msg.payload.size());
    hdr.checksum = computeChecksum(msg.payload.data(), msg.payload.size());
    if (!sendAll(fd, reinterpret_cast<const uint8_t*>(&hdr), sizeof(hdr)))
        return false;
    if (!msg.payload.empty()) {
        if (!sendAll(fd, msg.payload.data(), msg.payload.size()))
            return false;
    }
    return true;
}

bool NetworkLayer::recvRaw(sock_t fd, Message& out) {
    MsgHeader hdr{};
    if (!recvAll(fd, reinterpret_cast<uint8_t*>(&hdr), sizeof(hdr)))
        return false;
    out.header = hdr;
    if (hdr.payloadLen > 0) {
        out.payload.resize(hdr.payloadLen);
        if (!recvAll(fd, out.payload.data(), hdr.payloadLen))
            return false;
        // Verify checksum (skip if sender sent 0 = legacy/no checksum)
        if (hdr.checksum != 0) {
            uint32_t expected = computeChecksum(out.payload.data(), out.payload.size());
            if (expected != hdr.checksum) {
                // Corrupted message — drop silently
                return false;
            }
        }
    }
    return true;
}

} // namespace dsm
