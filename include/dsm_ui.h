#pragma once
/**
 * dsm_ui.h — DSM Interactive Console / TUI
 *
 * Provides a terminal-based dashboard showing:
 *   - Cluster topology (nodes + status)
 *   - Page table state (per-page state, access counts)
 *   - Throughput stats (msg/s, page faults/s, bandwidth)
 *   - Live scrollable log tail
 *   - Interactive command shell
 *
 * Renders using raw ANSI escape sequences (no ncurses dependency).
 */

#include "dsm_core.h"
#include "dsm_node.h"
#include "dsm_page.h"
#include <atomic>
#include <functional>
#include <string>
#include <vector>
#include <deque>

namespace dsm {

class DSMManager;

// ─────────────────────────────── ANSI Helpers ────────────────────────────────

namespace ansi {
    constexpr const char* RESET    = "\033[0m";
    constexpr const char* BOLD     = "\033[1m";
    constexpr const char* DIM      = "\033[2m";
    constexpr const char* BLINK    = "\033[5m";
    constexpr const char* RED      = "\033[31m";
    constexpr const char* GREEN    = "\033[32m";
    constexpr const char* YELLOW   = "\033[33m";
    constexpr const char* BLUE     = "\033[34m";
    constexpr const char* MAGENTA  = "\033[35m";
    constexpr const char* CYAN     = "\033[36m";
    constexpr const char* WHITE    = "\033[37m";
    constexpr const char* BG_DARK  = "\033[40m";
    constexpr const char* BG_BLUE  = "\033[44m";
    constexpr const char* CLEAR    = "\033[2J\033[H";
    constexpr const char* HIDE_CUR = "\033[?25l";
    constexpr const char* SHOW_CUR = "\033[?25h";

    inline std::string pos(int row, int col) {
        return "\033[" + std::to_string(row) + ";" + std::to_string(col) + "H";
    }
    inline std::string clearLine() { return "\033[2K"; }
}

// ─────────────────────────────── ConsoleCommand ───────────────────────────────

using CommandHandler = std::function<std::string(const std::vector<std::string>& args)>;

struct ConsoleCommand {
    std::string      name;
    std::string      description;
    CommandHandler   handler;
};

// ─────────────────────────────── DSMConsole ───────────────────────────────────

class DSMConsole {
public:
    explicit DSMConsole(DSMManager& mgr);
    ~DSMConsole();

    bool start();
    void stop();
    bool isRunning() const { return running_.load(); }

    /// Register additional commands (beyond built-ins)
    void addCommand(ConsoleCommand cmd);

    /// Push a log line to the UI log panel
    void pushLog(const std::string& line);

private:
    // Rendering
    void renderLoop();
    void render();
    void renderHeader(int& row);
    void renderNodes(int& row);
    void renderPageTable(int& row);
    void renderStats(int& row);
    void renderLogs(int& row);
    void renderPrompt(int& row);

    // Input
    void inputLoop();
    std::string processCommand(const std::string& line);
    void registerBuiltins();

    // Terminal utilities
    std::pair<int,int> termSize();
    void clearScreen();
    void moveTo(int row, int col);
    void hideCursor();
    void showCursor();
    std::string stateColor(PageState s);
    std::string nodeColor(NodeStatus s);

    DSMManager& mgr_;
    std::atomic<bool> running_{false};
    Thread renderThread_;
    Thread inputThread_;

    Mutex cmdMu_;
    std::vector<ConsoleCommand> commands_;

    // Log ring buffer for UI
    mutable Mutex logMu_;
    std::deque<std::string> logLines_;
    static constexpr size_t LOG_PANEL_LINES = 8;

    // Command input state
    std::string inputBuf_;
    std::deque<std::string> history_;
    size_t histIdx_ = 0;

    // Snapshot state updated each render cycle (avoids holding locks during render)
    struct Snapshot {
        std::vector<NodeInfo>   nodes;
        std::vector<std::pair<PageId,LocalPageEntry*>> pages; // sample
        NodeStats               statsSnap;
        uint64_t                ts = 0;
    };
};

// ─────────────────────────────── Progress Bar ────────────────────────────────

/// Returns an ANSI progress bar string: [████░░░░] 60%
std::string progressBar(double fraction, int width = 20);

} // namespace dsm
