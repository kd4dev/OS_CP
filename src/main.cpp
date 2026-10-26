/**
 * main.cpp — DSM Node Entry Point
 *
 * Usage:
 *   dsm_node --id <nodeId> --addr <ip> --port <port>
 *            [--peer <id>:<ip>:<port>] ...
 *            [--mem <MiB>]
 *            [--no-ui]
 *            [--verbose]
 *
 * Example (3-node cluster):
 *   Node 0:  dsm_node --id 0 --port 7000
 *   Node 1:  dsm_node --id 1 --port 7001 --peer 0:127.0.0.1:7000
 *   Node 2:  dsm_node --id 2 --port 7002 --peer 0:127.0.0.1:7000 --peer 1:127.0.0.1:7001
 */

#include "dsm_core.h"
#include "dsm_logger.h"
#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <csignal>
#include <cstdlib>
#include <stdexcept>
#include <thread>
#include <chrono>

#ifdef _WIN32
#  include <windows.h>
#endif

// ─────────────────────────────── Signal handling ─────────────────────────────

static dsm::DSMManager* g_mgr = nullptr;

static void handleSig(int sig) {
    printf("\n[main] Signal %d received — stopping...\n", sig);
    if (g_mgr) g_mgr->stop();
}

// ─────────────────────────────── Argument parsing ────────────────────────────

static void printUsage(const char* prog) {
    printf(
        "Usage: %s [options]\n"
        "  --id      <N>           Node ID (required)\n"
        "  --addr    <ip>          Local bind address (default: 127.0.0.1)\n"
        "  --port    <port>        Local port (default: 7000)\n"
        "  --peer    <id>:<ip>:<port>  Add a peer (repeatable)\n"
        "  --mem     <MiB>         Shared memory size in MiB (default: 64)\n"
        "  --log     <file>        Log file (default: dsm.log)\n"
        "  --no-ui               Disable interactive TUI\n"
        "  --verbose             Verbose logging (DEBUG level)\n"
        "  --demo                Run built-in read/write demo after startup\n"
        "  -h, --help            Show this help\n",
        prog);
}

static dsm::DSMConfig parseArgs(int argc, char** argv) {
    dsm::DSMConfig cfg;
    bool gotId = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];

        if (arg == "-h" || arg == "--help") {
            printUsage(argv[0]);
            exit(0);
        } else if (arg == "--id" && i+1 < argc) {
            cfg.localNodeId = static_cast<dsm::NodeId>(std::stoul(argv[++i]));
            gotId = true;
        } else if (arg == "--addr" && i+1 < argc) {
            cfg.localAddress = argv[++i];
        } else if (arg == "--port" && i+1 < argc) {
            cfg.localPort = static_cast<uint16_t>(std::stoul(argv[++i]));
        } else if (arg == "--mem" && i+1 < argc) {
            cfg.memorySize = static_cast<size_t>(std::stoul(argv[++i])) * 1024 * 1024;
        } else if (arg == "--log" && i+1 < argc) {
            cfg.logFile = argv[++i];
        } else if (arg == "--no-ui") {
            cfg.enableUI = false;
        } else if (arg == "--verbose") {
            cfg.verboseLog = true;
        } else if (arg == "--demo") {
            // Handled in main()
        } else if (arg == "--peer" && i+1 < argc) {
            std::string peerStr = argv[++i];
            // Format: id:ip:port
            std::istringstream iss(peerStr);
            std::string idStr, addrStr, portStr;
            if (std::getline(iss, idStr,  ':') &&
                std::getline(iss, addrStr, ':') &&
                std::getline(iss, portStr)) {
                dsm::DSMConfig::PeerInfo peer;
                peer.id      = static_cast<dsm::NodeId>(std::stoul(idStr));
                peer.address = addrStr;
                peer.port    = static_cast<uint16_t>(std::stoul(portStr));
                cfg.peers.push_back(peer);
            } else {
                fprintf(stderr, "Bad --peer format '%s', expected id:ip:port\n", peerStr.c_str());
                exit(1);
            }
        } else {
            fprintf(stderr, "Unknown argument: %s\n", arg.c_str());
            printUsage(argv[0]);
            exit(1);
        }
    }

    if (!gotId) {
        fprintf(stderr, "Error: --id <nodeId> is required\n");
        printUsage(argv[0]);
        exit(1);
    }

    return cfg;
}

// ─────────────────────────────── Demo workload ────────────────────────────────

static void runDemo(dsm::DSMManager& mgr) {
    DSM_INFO(mgr.logger(), "=== Running built-in demo workload ===");

    // Allocate shared region pointer
    void* base = mgr.allocate(4096 * 4);
    if (!base) {
        DSM_ERROR(mgr.logger(), "Demo: allocate failed");
        return;
    }

    int* arr = static_cast<int*>(base);

    DSM_INFO(mgr.logger(), "Demo: Writing 1024 integers to shared memory...");
    for (int i = 0; i < 1024; ++i) {
        arr[i] = i * i;  // This will trigger page faults handled by DSM
    }

    DSM_INFO(mgr.logger(), "Demo: Reading back and verifying...");
    int errors = 0;
    for (int i = 0; i < 1024; ++i) {
        if (arr[i] != i * i) {
            DSM_ERROR(mgr.logger(), "Demo: mismatch at [%d]: got %d expected %d",
                      i, arr[i], i * i);
            ++errors;
        }
    }
    if (errors == 0)
        DSM_INFO(mgr.logger(), "Demo: All values verified correctly!");
    else
        DSM_ERROR(mgr.logger(), "Demo: %d verification errors!", errors);

    // Test distributed lock
    DSM_INFO(mgr.logger(), "Demo: Acquiring distributed lock 'demo_lock'...");
    if (mgr.distributedLock("demo_lock")) {
        DSM_INFO(mgr.logger(), "Demo: Lock acquired!");
        dsm::sleep_ms(100);
        mgr.distributedUnlock("demo_lock");
        DSM_INFO(mgr.logger(), "Demo: Lock released.");
    }

    DSM_INFO(mgr.logger(), "=== Demo complete ===");
}

// ─────────────────────────────── main() ──────────────────────────────────────

int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif

    bool runDemoFlag = false;
    // Pre-scan for --demo (we handle it after init)
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--demo") runDemoFlag = true;
    }

    dsm::DSMConfig cfg = parseArgs(argc, argv);

    try {
        dsm::DSMManager mgr(cfg);
        g_mgr = &mgr;

        // Signal handlers
        std::signal(SIGINT,  handleSig);
        std::signal(SIGTERM, handleSig);
#ifndef _WIN32
        std::signal(SIGPIPE, SIG_IGN);
#endif

        if (!mgr.start()) {
            fprintf(stderr, "Failed to start DSM node\n");
            return 1;
        }

        if (runDemoFlag) {
            // Wait a moment for peers to connect
            dsm::sleep_ms(1000);
            runDemo(mgr);
        }

        // Main loop — keep running until stop() is called
        while (mgr.isRunning()) {
            dsm::sleep_ms(200);
        }

        g_mgr = nullptr;
    } catch (const std::exception& e) {
        fprintf(stderr, "Fatal exception: %s\n", e.what());
        return 2;
    }

    printf("\n[main] DSM node %u exited cleanly.\n", cfg.localNodeId);
    return 0;
}
