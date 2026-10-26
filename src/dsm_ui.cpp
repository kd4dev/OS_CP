/**
 * dsm_ui.cpp — DSM Interactive Console / TUI
 *
 * Renders live dashboard to terminal using raw ANSI escape sequences.
 * Input loop handles interactive commands from stdin.
 */

#include "dsm_ui.h"
#include "dsm_core.h"
#include "dsm_logger.h"
#include "dsm_node.h"
#include "dsm_page.h"
#include <cstdio>
#include <cstring>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <chrono>
#include <thread>

#ifdef _WIN32
#  include <windows.h>
#  include <conio.h>
#else
#  include <termios.h>
#  include <sys/ioctl.h>
#  include <unistd.h>
#endif

namespace dsm {

// ─────────────────────────────── progressBar() ───────────────────────────────

std::string progressBar(double fraction, int width) {
    fraction = std::max(0.0, std::min(1.0, fraction));
    int filled = static_cast<int>(fraction * width);
    std::string bar = "[";
    for (int i = 0; i < width; ++i) {
        if (i < filled) bar += "\xe2\x96\x88"; // full block
        else            bar += "\xe2\x96\x91"; // light shade
    }
    bar += "]";
    return bar;
}

// ─────────────────────────────── Constructor ─────────────────────────────────

DSMConsole::DSMConsole(DSMManager& mgr) : mgr_(mgr) {
    registerBuiltins();
}

DSMConsole::~DSMConsole() {
    stop();
}

// ─────────────────────────────── start() / stop() ────────────────────────────

bool DSMConsole::start() {
    running_.store(true);
    renderThread_ = Thread(&DSMConsole::renderLoop, this);
    inputThread_  = Thread(&DSMConsole::inputLoop,  this);
    return true;
}

void DSMConsole::stop() {
    if (!running_.exchange(false)) return;
    // Restore cursor
    printf("%s", ansi::SHOW_CUR);
    fflush(stdout);
    if (renderThread_.joinable()) renderThread_.join();
    if (inputThread_.joinable())  inputThread_.join();
}

// ─────────────────────────────── pushLog() ───────────────────────────────────

void DSMConsole::pushLog(const std::string& line) {
    LockGuard<Mutex> lk(logMu_);
    logLines_.push_back(line);
    while (logLines_.size() > 200) logLines_.pop_front();
}

// ─────────────────────────────── renderLoop() ────────────────────────────────

void DSMConsole::renderLoop() {
    while (running_.load()) {
        render();
        sleep_ms(500);
    }
}

// ─────────────────────────────── termSize() ──────────────────────────────────

std::pair<int,int> DSMConsole::termSize() {
#ifdef _WIN32
    CONSOLE_SCREEN_BUFFER_INFO csbi;
    if (GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &csbi)) {
        int cols = csbi.srWindow.Right - csbi.srWindow.Left + 1;
        int rows = csbi.srWindow.Bottom - csbi.srWindow.Top + 1;
        return {rows, cols};
    }
    return {40, 120};
#else
    struct winsize ws{};
    ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws);
    return {ws.ws_row > 0 ? ws.ws_row : 40,
            ws.ws_col > 0 ? ws.ws_col : 120};
#endif
}

// ─────────────────────────────── render() ────────────────────────────────────

void DSMConsole::render() {
    auto ts = termSize();
    (void)ts;
    // Jump to home and hide cursor during draw
    printf("%s%s", ansi::HIDE_CUR, ansi::CLEAR);

    int row = 1;
    renderHeader(row);
    renderNodes(row);
    renderPageTable(row);
    renderStats(row);
    renderLogs(row);
    renderPrompt(row);

    fflush(stdout);
}

// ─────────────────────────────── renderHeader() ──────────────────────────────

void DSMConsole::renderHeader(int& row) {
    auto ts = termSize();
    int cols = ts.second;
    printf("%s%s%s%s",
           ansi::pos(row, 1).c_str(),
           ansi::BG_BLUE, ansi::BOLD, ansi::WHITE);

    std::string title = " ██████╗ ███████╗███╗   ███╗    v1.0 ";
    std::string sub   = " Distributed Shared Memory System   ";
    std::string node  = " Node " + std::to_string(mgr_.localId())
                      + "  [" + mgr_.config().localAddress
                      + ":" + std::to_string(mgr_.config().localPort) + "]";

    // Pad to terminal width
    auto pad = [&](const std::string& s) -> std::string {
        std::string r = s;
        if ((int)r.size() < cols) r += std::string(cols - r.size(), ' ');
        return r;
    };

    printf("%s\n", pad(" ╔══════════════════════════════════════════╗").c_str());
    printf("%s", ansi::pos(++row, 1).c_str());
    printf("%s\n", pad(" ║  DSM System — Distributed Shared Memory  ║").c_str());
    printf("%s", ansi::pos(++row, 1).c_str());
    printf("%s\n", pad((" ║  Node ID: " + std::to_string(mgr_.localId())
                        + "  Running: "
                        + (mgr_.isRunning() ? "YES" : "NO")
                        + "  ║")).c_str());
    printf("%s", ansi::pos(++row, 1).c_str());
    printf("%s\n", pad(" ╚══════════════════════════════════════════╝").c_str());
    printf("%s", ansi::RESET);
    row += 2;
}

// ─────────────────────────────── renderNodes() ───────────────────────────────

void DSMConsole::renderNodes(int& row) {
    printf("%s%s[ CLUSTER NODES ]%s\n", ansi::pos(row++, 1).c_str(), ansi::CYAN, ansi::RESET);
    printf("%s%-8s %-16s %-6s %-10s %-8s\n", ansi::pos(row++, 1).c_str(),
           "NodeID", "Address", "Port", "Status", "Phi");

    auto nodes = mgr_.nodeRegistry().allNodes();
    for (auto& ni : nodes) {
        std::string statusStr = nodeStatusName(ni.status);
        const char* col =
            ni.status == NodeStatus::Alive     ? ansi::GREEN  :
            ni.status == NodeStatus::Suspected ? ansi::YELLOW :
            ni.status == NodeStatus::Dead      ? ansi::RED    : ansi::WHITE;

        printf("%s%s%-8u %-16s %-6u %s%-10s%s %-8.2f\n",
               ansi::pos(row++, 1).c_str(), ansi::WHITE,
               ni.id, ni.address.c_str(), ni.port,
               col, statusStr.c_str(), ansi::RESET,
               ni.phiSusp);
    }
    ++row;
}

// ─────────────────────────────── renderPageTable() ───────────────────────────

void DSMConsole::renderPageTable(int& row) {
    printf("%s%s[ PAGE TABLE SAMPLE (first 16) ]%s\n",
           ansi::pos(row++, 1).c_str(), ansi::CYAN, ansi::RESET);
    printf("%s%-8s %-8s %-8s %-8s\n", ansi::pos(row++, 1).c_str(),
           "PageID", "State", "Version", "Dirty");

    size_t count = 0;
    mgr_.pageTable().forEachPage([&](const LocalPageEntry& pe) {
        if (count >= 16) return;
        if (pe.state == PageState::Invalid && !pe.dirty) { ++count; return; }
        const char* col =
            pe.state == PageState::Modified ? ansi::YELLOW :
            pe.state == PageState::Shared   ? ansi::GREEN  : ansi::WHITE;

        printf("%s%s%-8u %-8s %-8llu %-8s%s\n",
               ansi::pos(row++, 1).c_str(), col,
               pe.pageId, pageStateName(pe.state),
               static_cast<unsigned long long>(pe.version),
               pe.dirty ? "YES" : "no",
               ansi::RESET);
        ++count;
    });

    size_t total   = mgr_.pageTable().totalPages();
    size_t valid   = mgr_.pageTable().validPages();
    double frac    = total > 0 ? static_cast<double>(valid) / total : 0.0;
    printf("%s%s%s %s%.1f%%%s\n",
           ansi::pos(row++, 1).c_str(), ansi::DIM,
           progressBar(frac).c_str(), ansi::RESET, frac * 100.0, ansi::RESET);
    ++row;
}

// ─────────────────────────────── renderStats() ───────────────────────────────

void DSMConsole::renderStats(int& row) {
    printf("%s%s[ STATISTICS ]%s\n", ansi::pos(row++, 1).c_str(), ansi::CYAN, ansi::RESET);
    auto& s = mgr_.stats();
    auto print_stat = [&](const char* label, uint64_t val) {
        printf("%s  %-25s %s%llu%s\n",
               ansi::pos(row++, 1).c_str(), label,
               ansi::YELLOW, static_cast<unsigned long long>(val), ansi::RESET);
    };
    print_stat("Page Faults:",      s.pageFaults.load());
    print_stat("Read Requests:",    s.readRequests.load());
    print_stat("Write Requests:",   s.writeRequests.load());
    print_stat("Invalidations:",    s.invalidations.load());
    print_stat("Messages Sent:",    s.messagesSent.load());
    print_stat("Messages Recv:",    s.messagesRecv.load());
    print_stat("Bytes Sent:",       s.bytesSent.load());
    print_stat("Bytes Recv:",       s.bytesRecv.load());
    print_stat("Barrier Events:",   s.barrierCount.load());
    print_stat("Lock Acquires:",    s.lockAcquires.load());
    ++row;
}

// ─────────────────────────────── renderLogs() ────────────────────────────────

void DSMConsole::renderLogs(int& row) {
    printf("%s%s[ LOG (last 8 lines) ]%s\n",
           ansi::pos(row++, 1).c_str(), ansi::CYAN, ansi::RESET);
    auto lines = mgr_.logger().recentLines(LOG_PANEL_LINES);
    for (auto& l : lines) {
        // Truncate to avoid wrapping
        auto ts = termSize();
        int cols = ts.second;
        std::string trimmed = l;
        if ((int)trimmed.size() > cols - 2) trimmed = trimmed.substr(0, cols - 5) + "...";
        printf("%s%s%s%s\n",
               ansi::pos(row++, 1).c_str(), ansi::DIM, trimmed.c_str(), ansi::RESET);
    }
    ++row;
}

// ─────────────────────────────── renderPrompt() ──────────────────────────────

void DSMConsole::renderPrompt(int& row) {
    printf("%s%sDSM> %s%s",
           ansi::pos(row, 1).c_str(), ansi::GREEN,
           inputBuf_.c_str(), ansi::SHOW_CUR);
}

// ─────────────────────────────── nodeColor() / stateColor() ─────────────────

std::string DSMConsole::nodeColor(NodeStatus s) {
    switch (s) {
        case NodeStatus::Alive:     return ansi::GREEN;
        case NodeStatus::Suspected: return ansi::YELLOW;
        case NodeStatus::Dead:      return ansi::RED;
        default:                    return ansi::WHITE;
    }
}

std::string DSMConsole::stateColor(PageState s) {
    switch (s) {
        case PageState::Modified: return ansi::YELLOW;
        case PageState::Shared:   return ansi::GREEN;
        default:                  return ansi::WHITE;
    }
}

// ─────────────────────────────── inputLoop() ─────────────────────────────────

void DSMConsole::inputLoop() {
#ifndef _WIN32
    struct termios raw, orig;
    tcgetattr(STDIN_FILENO, &orig);
    raw = orig;
    raw.c_lflag &= ~(ECHO | ICANON);
    tcsetattr(STDIN_FILENO, TCSANOW, &raw);
#endif

    while (running_.load()) {
        int c;
#ifdef _WIN32
        if (!_kbhit()) {
            sleep_ms(50);
            continue;
        }
        c = _getch();
#else
        c = getchar();
        if (c == EOF) { sleep_ms(50); continue; }
#endif
        if (c == '\r' || c == '\n') {
            std::string line = inputBuf_;
            inputBuf_.clear();
            if (!line.empty()) {
                history_.push_back(line);
                histIdx_ = history_.size();
                std::string result = processCommand(line);
                pushLog("DSM> " + line);
                if (!result.empty()) pushLog(result);
            }
        } else if (c == 127 || c == 8) { // backspace
            if (!inputBuf_.empty()) inputBuf_.pop_back();
#ifdef _WIN32
        } else if (c == 0 || c == 0xE0) {
            // Extended key — read second byte
            int c2 = _getch();
            if (!history_.empty()) {
                if (c2 == 0x48) { // up arrow
                    if (histIdx_ > 0) --histIdx_;
                    inputBuf_ = history_[histIdx_];
                } else if (c2 == 0x50) { // down arrow
                    if (histIdx_ + 1 < history_.size()) {
                        ++histIdx_;
                        inputBuf_ = history_[histIdx_];
                    } else {
                        histIdx_ = history_.size();
                        inputBuf_.clear();
                    }
                }
            }
#else
        } else if (c == 27) { // ESC sequence
            int c2 = getchar();
            if (c2 == '[') {
                int c3 = getchar();
                if (!history_.empty()) {
                    if (c3 == 'A') { // up arrow
                        if (histIdx_ > 0) --histIdx_;
                        inputBuf_ = history_[histIdx_];
                    } else if (c3 == 'B') { // down arrow
                        if (histIdx_ + 1 < history_.size()) {
                            ++histIdx_;
                            inputBuf_ = history_[histIdx_];
                        } else {
                            histIdx_ = history_.size();
                            inputBuf_.clear();
                        }
                    }
                }
            }
#endif
        } else if (c >= 32 && c < 127) {
            inputBuf_ += static_cast<char>(c);
        }
    }

#ifndef _WIN32
    tcsetattr(STDIN_FILENO, TCSANOW, &orig);
#endif
}

// ─────────────────────────────── processCommand() ────────────────────────────

std::string DSMConsole::processCommand(const std::string& line) {
    std::istringstream iss(line);
    std::vector<std::string> args;
    std::string tok;
    while (iss >> tok) args.push_back(tok);
    if (args.empty()) return "";

    LockGuard<Mutex> lk(cmdMu_);
    for (auto& cmd : commands_) {
        if (cmd.name == args[0]) {
            return cmd.handler(args);
        }
    }
    return "Unknown command: " + args[0] + " (type 'help' for list)";
}

// ─────────────────────────────── registerBuiltins() ──────────────────────────

void DSMConsole::registerBuiltins() {
    addCommand({"help", "Show available commands",
        [this](const std::vector<std::string>&) -> std::string {
            std::ostringstream oss;
            LockGuard<Mutex> lk(cmdMu_);
            oss << "Available commands:\n";
            for (auto& cmd : commands_) {
                oss << "  " << std::left << std::setw(16) << cmd.name
                    << " — " << cmd.description << "\n";
            }
            return oss.str();
        }
    });

    addCommand({"nodes", "List cluster nodes",
        [this](const std::vector<std::string>&) -> std::string {
            auto nodes = mgr_.nodeRegistry().allNodes();
            std::ostringstream oss;
            for (auto& n : nodes) {
                oss << "  node=" << n.id << " addr=" << n.address
                    << ":" << n.port << " status=" << nodeStatusName(n.status)
                    << " phi=" << std::fixed << std::setprecision(2) << n.phiSusp << "\n";
            }
            return oss.str();
        }
    });

    addCommand({"stats", "Show statistics",
        [this](const std::vector<std::string>&) -> std::string {
            auto& s = mgr_.stats();
            std::ostringstream oss;
            oss << "  pageFaults="   << s.pageFaults.load()
                << " reads="         << s.readRequests.load()
                << " writes="        << s.writeRequests.load()
                << " invalids="      << s.invalidations.load() << "\n"
                << "  msgSent="      << s.messagesSent.load()
                << " msgRecv="       << s.messagesRecv.load()
                << " barriers="      << s.barrierCount.load()
                << " locks="         << s.lockAcquires.load();
            return oss.str();
        }
    });

    addCommand({"pages", "Dump non-invalid pages",
        [this](const std::vector<std::string>&) -> std::string {
            std::ostringstream oss;
            mgr_.pageTable().forEachPage([&](const LocalPageEntry& pe) {
                if (pe.state == PageState::Invalid) return;
                oss << "  page=" << pe.pageId
                    << " state=" << pageStateName(pe.state)
                    << " ver=" << pe.version
                    << " dirty=" << (pe.dirty ? "yes" : "no") << "\n";
            });
            return oss.str();
        }
    });

    addCommand({"loglevel", "Set log level (TRACE/DEBUG/INFO/WARN/ERROR)",
        [this](const std::vector<std::string>& args) -> std::string {
            if (args.size() < 2) return "Usage: loglevel <LEVEL>";
            std::string lv = args[1];
            LogLevel level = LogLevel::INFO;
            if (lv == "TRACE") level = LogLevel::TRACE;
            else if (lv == "DEBUG") level = LogLevel::DEBUG;
            else if (lv == "INFO")  level = LogLevel::INFO;
            else if (lv == "WARN")  level = LogLevel::WARN;
            else if (lv == "ERROR") level = LogLevel::ERROR;
            else return "Unknown level: " + lv;
            mgr_.logger().setLevel(level);
            return "Log level set to " + lv;
        }
    });

    addCommand({"quit", "Stop the DSM node",
        [this](const std::vector<std::string>&) -> std::string {
            mgr_.stop();
            return "Stopping DSM node...";
        }
    });

    addCommand({"clear", "Clear the screen",
        [this](const std::vector<std::string>&) -> std::string {
            printf("%s", ansi::CLEAR);
            return "";
        }
    });
}

void DSMConsole::addCommand(ConsoleCommand cmd) {
    LockGuard<Mutex> lk(cmdMu_);
    commands_.push_back(std::move(cmd));
}

void DSMConsole::clearScreen() {
    printf("%s", ansi::CLEAR);
    fflush(stdout);
}

void DSMConsole::moveTo(int row, int col) {
    printf("%s", ansi::pos(row, col).c_str());
    fflush(stdout);
}

void DSMConsole::hideCursor() {
    printf("%s", ansi::HIDE_CUR);
    fflush(stdout);
}

void DSMConsole::showCursor() {
    printf("%s", ansi::SHOW_CUR);
    fflush(stdout);
}

} // namespace dsm
