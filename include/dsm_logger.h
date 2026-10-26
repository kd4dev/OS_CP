#pragma once
/**
 * dsm_logger.h — Thread-safe structured logger for DSM
 *
 * Supports: TRACE / DEBUG / INFO / WARN / ERROR / FATAL levels,
 * file-based rotating log, optional ANSI-colored console output,
 * and printf-style + stream-style APIs.
 */

#include "dsm_os.h"
#include <string>
#include <fstream>
#include <atomic>
#include <sstream>
#include <functional>
#include <vector>
#include <cstdio>
#include <ctime>
#include <cstdarg>

namespace dsm {

// ─────────────────────────────── Log Level ───────────────────────────────────

#ifdef ERROR
#  undef ERROR
#endif

enum class LogLevel : int {
    TRACE = 0,
    DEBUG = 1,
    INFO  = 2,
    WARN  = 3,
    ERROR = 4,
    FATAL = 5,
    OFF   = 6,
};

inline const char* levelName(LogLevel l) {
    switch (l) {
        case LogLevel::TRACE: return "TRACE";
        case LogLevel::DEBUG: return "DEBUG";
        case LogLevel::INFO:  return "INFO ";
        case LogLevel::WARN:  return "WARN ";
        case LogLevel::ERROR: return "ERROR";
        case LogLevel::FATAL: return "FATAL";
        default:              return "OFF  ";
    }
}

// ANSI colors
inline const char* levelColor(LogLevel l) {
    switch (l) {
        case LogLevel::TRACE: return "\033[37m";   // white
        case LogLevel::DEBUG: return "\033[36m";   // cyan
        case LogLevel::INFO:  return "\033[32m";   // green
        case LogLevel::WARN:  return "\033[33m";   // yellow
        case LogLevel::ERROR: return "\033[31m";   // red
        case LogLevel::FATAL: return "\033[35m";   // magenta
        default:              return "\033[0m";
    }
}

// ─────────────────────────────── Logger ──────────────────────────────────────

using LogSink = std::function<void(LogLevel, const std::string&)>;

class Logger {
public:
    Logger(const std::string& filename,
           LogLevel minLevel   = LogLevel::INFO,
           bool     colorStdout = true,
           size_t   maxFileBytes = 10 * 1024 * 1024);
    ~Logger();

    // Core log call
    void log(LogLevel level, const char* file, int line, const char* fmt, ...);

    // Stream-style helper — usage: logger.stream(INFO) << "val=" << v;
    struct Stream {
        Logger&   owner;
        LogLevel  level;
        const char* file;
        int         line;
        std::ostringstream oss;

        Stream(Logger& o, LogLevel l, const char* f, int ln)
            : owner(o), level(l), file(f), line(ln) {}
        Stream(Stream&&) = default;
        ~Stream() { owner.logStr(level, file, line, oss.str()); }

        template<typename T>
        Stream& operator<<(const T& v) { oss << v; return *this; }
    };
    Stream stream(LogLevel level, const char* file, int line) {
        return Stream(*this, level, file, line);
    }

    void setLevel(LogLevel l) { minLevel_.store(static_cast<int>(l)); }
    LogLevel level() const { return static_cast<LogLevel>(minLevel_.load()); }

    void addSink(LogSink sink);

    // Retrieve recent log entries for UI display
    std::vector<std::string> recentLines(size_t n) const;

    void flush();

private:
    void logStr(LogLevel level, const char* file, int line, const std::string& msg);
    void rotateIfNeeded();
    std::string formatEntry(LogLevel level, const char* file, int line, const std::string& msg);

    mutable Mutex       mu_;
    std::ofstream       file_;
    std::string         filename_;
    size_t              maxFileBytes_;
    size_t              writtenBytes_{0};
    int                 rotateIndex_{0};
    std::atomic<int>    minLevel_;
    bool                colorStdout_;
    std::vector<LogSink> sinks_;

    // Ring buffer of recent lines for UI
    static constexpr size_t RING_SIZE = 500;
    std::vector<std::string> ring_;
    size_t ringHead_{0};
    size_t ringCount_{0};
};

// ─────────────────────────────── Convenience Macros ──────────────────────────

#define DSM_LOG(logger, level, fmt, ...) \
    (logger).log(dsm::LogLevel::level, __FILE__, __LINE__, fmt, ##__VA_ARGS__)

#define DSM_TRACE(logger, fmt, ...) DSM_LOG(logger, TRACE, fmt, ##__VA_ARGS__)
#define DSM_DEBUG(logger, fmt, ...) DSM_LOG(logger, DEBUG, fmt, ##__VA_ARGS__)
#define DSM_INFO(logger,  fmt, ...) DSM_LOG(logger, INFO,  fmt, ##__VA_ARGS__)
#define DSM_WARN(logger,  fmt, ...) DSM_LOG(logger, WARN,  fmt, ##__VA_ARGS__)
#define DSM_ERROR(logger, fmt, ...) DSM_LOG(logger, ERROR, fmt, ##__VA_ARGS__)
#define DSM_FATAL(logger, fmt, ...) DSM_LOG(logger, FATAL, fmt, ##__VA_ARGS__)

} // namespace dsm
