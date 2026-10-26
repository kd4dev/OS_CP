/**
 * dsm_protocol.cpp — MSI Coherence Protocol Implementation
 */

#include "dsm_protocol.h"
#include "dsm_core.h"
#include "dsm_page.h"
#include "dsm_logger.h"
#include "dsm_node.h"
#include <cstring>
#include <cassert>

namespace dsm {

// ─────────────────────────────── Constructor ─────────────────────────────────

CoherenceProtocol::CoherenceProtocol(DSMManager& mgr) : mgr_(mgr) {}

// ─────────────────────────────── Helpers ─────────────────────────────────────

Message CoherenceProtocol::makeMsg(MsgType t, NodeId dst, PageId pid) const {
    Message m(t, mgr_.localId(), dst, pid);
    return m;
}

NodeId CoherenceProtocol::homeOf(PageId pid) const {
    return mgr_.nodeRegistry().homeNodeFor(pid);
}

bool CoherenceProtocol::isHome(PageId pid) const {
    return homeOf(pid) == mgr_.localId();
}

// ─────────────────────────────── requestRead() ───────────────────────────────

bool CoherenceProtocol::requestRead(PageId pid) {
    NodeId home = homeOf(pid);
    DSM_DEBUG(mgr_.logger(), "requestRead: page=%u home=%u", pid, home);

    if (home == mgr_.localId()) {
        // We ARE the home node — serve locally
        auto dataOpt = mgr_.pageTable().directoryRead(mgr_.localId(), pid);
        if (!dataOpt.first) return false;
        auto& pe = mgr_.pageTable().entry(pid);
        LockGuard<Mutex> lk(pe.pageMu);
        mgr_.pageTable().protectPage(pid, PageState::Modified);
        std::memcpy(pe.addr, dataOpt.second.data(), PAGE_SIZE);
        pe.state = PageState::Shared;
        pe.version++;
        // Protect as read-only
        mgr_.pageTable().protectPage(pid, PageState::Shared);
        return true;
    }

    // Send READ_REQ to home node
    Message req = makeMsg(MsgType::READ_REQ, home, pid);
    auto reply  = mgr_.network().sendAndWait(home, req, 8000);
    if (!reply.first || reply.second.header.type != MsgType::READ_ACK) {
        DSM_ERROR(mgr_.logger(), "requestRead: no READ_ACK from home for page %u", pid);
        return false;
    }
    if (reply.second.payload.size() != PAGE_SIZE) {
        DSM_ERROR(mgr_.logger(), "requestRead: bad payload size %zu for page %u",
                  reply.second.payload.size(), pid);
        return false;
    }

    auto& pe = mgr_.pageTable().entry(pid);
    LockGuard<Mutex> lk(pe.pageMu);
    mgr_.pageTable().protectPage(pid, PageState::Modified);
    std::memcpy(pe.addr, reply.second.payload.data(), PAGE_SIZE);
    pe.state = PageState::Shared;
    pe.version++;
    mgr_.pageTable().protectPage(pid, PageState::Shared);
    DSM_DEBUG(mgr_.logger(), "requestRead: page=%u obtained SHR copy", pid);
    return true;
}

// ─────────────────────────────── requestWrite() ──────────────────────────────

bool CoherenceProtocol::requestWrite(PageId pid) {
    NodeId home = homeOf(pid);
    DSM_DEBUG(mgr_.logger(), "requestWrite: page=%u home=%u", pid, home);

    if (home == mgr_.localId()) {
        auto dataOpt = mgr_.pageTable().directoryWrite(mgr_.localId(), pid);
        if (!dataOpt.first) return false;
        auto& pe = mgr_.pageTable().entry(pid);
        LockGuard<Mutex> lk(pe.pageMu);
        mgr_.pageTable().protectPage(pid, PageState::Modified);
        std::memcpy(pe.addr, dataOpt.second.data(), PAGE_SIZE);
        pe.state = PageState::Modified;
        pe.dirty = true;
        pe.version++;
        return true;
    }

    // If we have a shared copy, send a writeback of current content first
    auto& pe = mgr_.pageTable().entry(pid);
    bool hadShared = (pe.state == PageState::Shared);

    Message req = makeMsg(MsgType::WRITE_REQ, home, pid);
    if (hadShared) {
        req.payload.resize(PAGE_SIZE);
        std::memcpy(req.payload.data(), pe.addr, PAGE_SIZE);
    }

    auto reply = mgr_.network().sendAndWait(home, req, 8000);
    if (!reply.first || reply.second.header.type != MsgType::WRITE_ACK) {
        DSM_ERROR(mgr_.logger(), "requestWrite: no WRITE_ACK from home for page %u", pid);
        return false;
    }
    if (reply.second.payload.size() != PAGE_SIZE) {
        DSM_ERROR(mgr_.logger(), "requestWrite: bad payload size for page %u", pid);
        return false;
    }

    {
        LockGuard<Mutex> lk(pe.pageMu);
        mgr_.pageTable().protectPage(pid, PageState::Modified);
        std::memcpy(pe.addr, reply.second.payload.data(), PAGE_SIZE);
        pe.state = PageState::Modified;
        pe.dirty = true;
        pe.version++;
    }
    DSM_DEBUG(mgr_.logger(), "requestWrite: page=%u obtained MOD copy", pid);
    return true;
}

// ─────────────────────────────── writeback() ─────────────────────────────────

bool CoherenceProtocol::writeback(PageId pid, const std::vector<uint8_t>& data) {
    NodeId home = homeOf(pid);
    if (home == mgr_.localId()) {
        mgr_.pageTable().directoryWriteback(mgr_.localId(), pid, data);
        return true;
    }
    Message wb = makeMsg(MsgType::WRITEBACK, home, pid);
    wb.payload = data;
    return mgr_.network().send(home, wb);
}

// ─────────────────────────────── onMessage() ─────────────────────────────────

void CoherenceProtocol::onMessage(const Message& msg) {
    DSM_TRACE(mgr_.logger(), "CoherenceProtocol::onMessage type=%s page=%u src=%u",
              msgTypeName(msg.header.type), msg.header.pageId, msg.header.srcNode);

    switch (msg.header.type) {
        // Home-node receives
        case MsgType::READ_REQ:    handleReadReq(msg);  break;
        case MsgType::WRITE_REQ:   handleWriteReq(msg); break;
        case MsgType::WRITEBACK:   handleWriteback(msg);break;
        case MsgType::INV_ACK:     handleInvAck(msg);   break;

        // Remote-node receives
        case MsgType::READ_ACK:    handleReadAck(msg);  break;
        case MsgType::WRITE_ACK:   handleWriteAck(msg); break;
        case MsgType::INVALIDATE:  handleInvalidate(msg);break;
        case MsgType::DOWNGRADE:   handleDowngrade(msg);break;

        default:
            DSM_WARN(mgr_.logger(), "CoherenceProtocol: unhandled msg type %s",
                     msgTypeName(msg.header.type));
            break;
    }
}

// ─────────────────────────────── Home handlers ───────────────────────────────

void CoherenceProtocol::handleReadReq(const Message& msg) {
    PageId pid       = msg.header.pageId;
    NodeId requester = msg.header.srcNode;

    auto dataOpt = mgr_.pageTable().directoryRead(requester, pid);
    Message ack  = makeMsg(MsgType::READ_ACK, requester, pid);
    ack.header.seqNum = msg.header.seqNum;

    if (dataOpt.first) {
        ack.payload = std::move(dataOpt.second);
    } else {
        ack.header.type = MsgType::NACK;
    }
    mgr_.network().send(requester, ack);
}

void CoherenceProtocol::handleWriteReq(const Message& msg) {
    PageId pid       = msg.header.pageId;
    NodeId requester = msg.header.srcNode;

    // If payload provided (upgrade from shared), apply it first
    if (msg.payload.size() == PAGE_SIZE) {
        mgr_.pageTable().directoryWriteback(requester, pid, msg.payload);
    }

    auto dataOpt = mgr_.pageTable().directoryWrite(requester, pid);
    Message ack  = makeMsg(MsgType::WRITE_ACK, requester, pid);
    ack.header.seqNum = msg.header.seqNum;

    if (dataOpt.first) {
        ack.payload = std::move(dataOpt.second);
    } else {
        ack.header.type = MsgType::NACK;
    }
    mgr_.network().send(requester, ack);
}

void CoherenceProtocol::handleWriteback(const Message& msg) {
    PageId pid    = msg.header.pageId;
    NodeId sender = msg.header.srcNode;
    mgr_.pageTable().directoryWriteback(sender, pid, msg.payload);
    // No reply needed for async writeback
}

void CoherenceProtocol::handleInvAck(const Message& msg) {
    // INV_ACK is normally matched by seqNum in NetworkLayer's pending reply map
    // (sendAndWait in directoryWrite). If we get here, it's an orphaned ACK
    // (e.g., after a timeout) — just log and discard.
    DSM_TRACE(mgr_.logger(), "INV_ACK from node %u for page %u (orphaned)",
              msg.header.srcNode, msg.header.pageId);
}

// ─────────────────────────────── Remote handlers ─────────────────────────────

void CoherenceProtocol::handleReadAck(const Message& msg) {
    // Handled by NetworkLayer's pending reply map (sendAndWait returns it)
    (void)msg;
}

void CoherenceProtocol::handleWriteAck(const Message& msg) {
    (void)msg;
}

void CoherenceProtocol::handleInvalidate(const Message& msg) {
    PageId pid = msg.header.pageId;
    DSM_DEBUG(mgr_.logger(), "INVALIDATE received for page %u from node %u",
              pid, msg.header.srcNode);
    mgr_.pageTable().invalidate(pid);

    // Send ACK
    Message ack = makeMsg(MsgType::INV_ACK, msg.header.srcNode, pid);
    ack.header.seqNum = msg.header.seqNum;
    mgr_.network().send(msg.header.srcNode, ack);
}

void CoherenceProtocol::handleDowngrade(const Message& msg) {
    PageId pid = msg.header.pageId;
    DSM_DEBUG(mgr_.logger(), "DOWNGRADE received for page %u from home node %u",
              pid, msg.header.srcNode);

    auto& pe = mgr_.pageTable().entry(pid);
    std::vector<uint8_t> data;
    {
        LockGuard<Mutex> lk(pe.pageMu);
        if (pe.state == PageState::Modified) {
            data = mgr_.pageTable().writebackAndDowngrade(pid);
        } else {
            data.resize(PAGE_SIZE);
            std::memcpy(data.data(), pe.addr, PAGE_SIZE);
        }
    }

    // Reply with the page data
    Message reply = makeMsg(MsgType::WRITEBACK, msg.header.srcNode, pid);
    reply.header.seqNum = msg.header.seqNum;
    reply.payload = std::move(data);
    mgr_.network().send(msg.header.srcNode, reply);
}

} // namespace dsm
