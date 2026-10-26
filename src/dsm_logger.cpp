/**
 * dsm_logger.cpp — Thread-safe structured logger implementation
 */

#include "dsm_logger.h"
#include <cstdio>
#include <cstring>
#include <ctime>
#include <stdarg.h>
#include <algorithm>
#include <sstream>
#include <iomanip>
#include <chrono>

#ifdef _WIN32
#  include <windows.h>
#endif

namespace dsm {

// ─────────────────────────────── Constructor ─────────────────────────────────

Logger::Logger(const std::string& filename,
               LogLevel minLevel,
               bool colorStdout,
               size_t maxFileBytes)
    : filename_(filename)
    , maxFileBytes_(maxFileBytes)
    , minLevel_(static_cast<int>(minLevel))
    , colorStdout_(colorStdout)
{
    ring_.resize(RING_SIZE);
    file_.open(filename_, std::ios::out | std::ios::app);
    if (!file_.is_open()) {
        fprintf(stderr, "[Logger] WARNING: could not open log file: %s\n", filename_.c_str());
    }

#ifdef _WIN32
#  ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
#    define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
#  endif
    // Enable ANSI escape codes on Windows 10+
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD dwMode = 0;
    if (GetConsoleMode(hOut, &dwMode)) {
        dwMode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
        SetConsoleMode(hOut, dwMode);
    }
#endif
}

Logger::~Logger() {
    LockGuard<Mutex> lk(mu_);
    if (file_.is_open()) file_.close();
}

// ─────────────────────────────── Core log() ──────────────────────────────────

void Logger::log(LogLevel level, const char* file, int line,
                 const char* fmt, ...) {
    if (static_cast<int>(level) < minLevel_.load()) return;

    char buf[2048];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    logStr(level, file, line, std::string(buf));
}

void Logger::logStr(LogLevel level, const char* file, int line,
                    const std::string& msg) {
    if (static_cast<int>(level) < minLevel_.load()) return;

    std::string entry = formatEntry(level, file, line, msg);

    LockGuard<Mutex> lk(mu_);

    // Console output
    if (colorStdout_) {
        fprintf(stdout, "%s%s%s\n", levelColor(level), entry.c_str(), "\033[0m");
        fflush(stdout);
    }

    // File output
    if (file_.is_open()) {
        file_ << entry << '\n';
        file_.flush();
        writtenBytes_ += entry.size() + 1;
        rotateIfNeeded();
    }

    // Ring buffer
    ring_[ringHead_] = entry;
    ringHead_ = (ringHead_ + 1) % RING_SIZE;
    if (ringCount_ < RING_SIZE) ++ringCount_;

    // External sinks
    for (auto& sink : sinks_) {
        sink(level, entry);
    }
}

// ─────────────────────────────── Format ──────────────────────────────────────

std::string Logger::formatEntry(LogLevel level, const char* file, int line,
                                const std::string& msg) {
    using namespace std::chrono;
    auto now   = system_clock::now();
    auto ms    = duration_cast<milliseconds>(now.time_since_epoch()) % 1000;
    time_t tt  = system_clock::to_time_t(now);
    struct tm  tmBuf{};
#if defined(_WIN32) && defined(_MSC_VER)
    localtime_s(&tmBuf, &tt);
#elif defined(_WIN32)
    struct tm* ptm = localtime(&tt);
    if (ptm) tmBuf = *ptm;
#else
    localtime_r(&tt, &tmBuf);
#endif
    char tsBuf[32];
    snprintf(tsBuf, sizeof(tsBuf), "%04d-%02d-%02d %02d:%02d:%02d.%03d",
             tmBuf.tm_year+1900, tmBuf.tm_mon+1, tmBuf.tm_mday,
             tmBuf.tm_hour, tmBuf.tm_min, tmBuf.tm_sec,
             static_cast<int>(ms.count()));

    // Shorten filename
    const char* shortFile = file ? strrchr(file, '/') : nullptr;
    if (!shortFile) shortFile = file ? strrchr(file, '\\') : nullptr;
    if (shortFile) ++shortFile; else shortFile = file ? file : "?";

    std::ostringstream oss;
    oss << "[" << tsBuf << "] "
        << "[" << levelName(level) << "] "
        << "[" << shortFile << ":" << line << "] "
        << msg;
    return oss.str();
}

// ─────────────────────────────── Rotation ────────────────────────────────────

void Logger::rotateIfNeeded() {
    if (writtenBytes_ < maxFileBytes_) return;
    file_.close();
    ++rotateIndex_;
    std::string rotated = filename_ + "." + std::to_string(rotateIndex_);
    std::rename(filename_.c_str(), rotated.c_str());
    file_.open(filename_, std::ios::out | std::ios::trunc);
    writtenBytes_ = 0;
}

// ─────────────────────────────── Helpers ─────────────────────────────────────

void Logger::addSink(LogSink sink) {
    LockGuard<Mutex> lk(mu_);
    sinks_.push_back(std::move(sink));
}

void Logger::flush() {
    LockGuard<Mutex> lk(mu_);
    if (file_.is_open()) file_.flush();
    fflush(stdout);
}

std::vector<std::string> Logger::recentLines(size_t n) const {
    LockGuard<Mutex> lk(mu_);
    n = std::min(n, ringCount_);
    std::vector<std::string> result;
    result.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        size_t idx = (ringHead_ + RING_SIZE - n + i) % RING_SIZE;
        result.push_back(ring_[idx]);
    }
    return result;
}

} // namespace dsm
