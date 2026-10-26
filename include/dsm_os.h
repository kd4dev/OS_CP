#pragma once
/**
 * dsm_os.h — Portable OS Abstraction Layer for Distributed Shared Memory
 *
 * Provides native OS threading, synchronization, timing, and virtual memory
 * primitives for Windows and POSIX systems.
 */

#ifndef _WIN32_WINNT
#  define _WIN32_WINNT 0x0601
#endif

#include <cstdint>
#include <cstddef>
#include <chrono>
#include <functional>
#include <memory>
#include <utility>
#include <string>

#ifdef _WIN32
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  ifdef ERROR
#    undef ERROR
#  endif
#else
#  include <pthread.h>
#  include <unistd.h>
#  include <sys/time.h>
#  include <sys/mman.h>
#  include <signal.h>
#endif

namespace dsm {

// ─────────────────────────────── Timing & Sleep ──────────────────────────────

inline void sleep_ms(uint32_t ms) {
#ifdef _WIN32
    Sleep(static_cast<DWORD>(ms));
#else
    usleep(static_cast<useconds_t>(ms) * 1000);
#endif
}

inline int64_t current_time_ms() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

// ─────────────────────────────── Mutex ───────────────────────────────────────

class Mutex {
public:
#ifdef _WIN32
    CRITICAL_SECTION cs;
    Mutex() { InitializeCriticalSection(&cs); }
    ~Mutex() { DeleteCriticalSection(&cs); }
    void lock() { EnterCriticalSection(&cs); }
    bool try_lock() { return TryEnterCriticalSection(&cs) != 0; }
    void unlock() { LeaveCriticalSection(&cs); }
#else
    pthread_mutex_t m;
    Mutex() { pthread_mutex_init(&m, nullptr); }
    ~Mutex() { pthread_mutex_destroy(&m); }
    void lock() { pthread_mutex_lock(&m); }
    bool try_lock() { return pthread_mutex_trylock(&m) == 0; }
    void unlock() { pthread_mutex_unlock(&m); }
#endif

    Mutex(const Mutex&) = delete;
    Mutex& operator=(const Mutex&) = delete;
};

// ─────────────────────────────── LockGuard & UniqueLock ───────────────────────

template <typename M>
class LockGuard {
public:
    explicit LockGuard(M& m) : m_(m) { m_.lock(); }
    ~LockGuard() { m_.unlock(); }
    LockGuard(const LockGuard&) = delete;
    LockGuard& operator=(const LockGuard&) = delete;
private:
    M& m_;
};

template <typename M>
class UniqueLock {
public:
    explicit UniqueLock(M& m) : m_(&m), owns_(true) { m_->lock(); }
    UniqueLock() : m_(nullptr), owns_(false) {}
    ~UniqueLock() {
        if (owns_ && m_) m_->unlock();
    }

    void lock() {
        if (m_ && !owns_) {
            m_->lock();
            owns_ = true;
        }
    }

    void unlock() {
        if (m_ && owns_) {
            m_->unlock();
            owns_ = false;
        }
    }

    bool owns_lock() const { return owns_; }
    M* mutex() const { return m_; }

    UniqueLock(const UniqueLock&) = delete;
    UniqueLock& operator=(const UniqueLock&) = delete;
    UniqueLock(UniqueLock&& o) noexcept : m_(o.m_), owns_(o.owns_) {
        o.m_ = nullptr;
        o.owns_ = false;
    }
    UniqueLock& operator=(UniqueLock&& o) noexcept {
        if (this != &o) {
            if (owns_ && m_) m_->unlock();
            m_ = o.m_;
            owns_ = o.owns_;
            o.m_ = nullptr;
            o.owns_ = false;
        }
        return *this;
    }

private:
    M* m_ = nullptr;
    bool owns_ = false;
};

// ─────────────────────────────── ConditionVariable ───────────────────────────

class ConditionVariable {
public:
#ifdef _WIN32
    CONDITION_VARIABLE cv;
    ConditionVariable() { InitializeConditionVariable(&cv); }
    ~ConditionVariable() = default;

    void notify_one() { WakeConditionVariable(&cv); }
    void notify_all() { WakeAllConditionVariable(&cv); }

    void wait(UniqueLock<Mutex>& lock) {
        if (!lock.owns_lock() || !lock.mutex()) return;
        SleepConditionVariableCS(&cv, &lock.mutex()->cs, INFINITE);
    }

    template <typename Predicate>
    void wait(UniqueLock<Mutex>& lock, Predicate pred) {
        while (!pred()) {
            wait(lock);
        }
    }

    bool wait_for(UniqueLock<Mutex>& lock, uint32_t ms) {
        if (!lock.owns_lock() || !lock.mutex()) return false;
        return SleepConditionVariableCS(&cv, &lock.mutex()->cs, static_cast<DWORD>(ms)) != 0;
    }

    template <typename Predicate>
    bool wait_for(UniqueLock<Mutex>& lock, uint32_t ms, Predicate pred) {
        int64_t start = current_time_ms();
        while (!pred()) {
            int64_t elapsed = current_time_ms() - start;
            if (elapsed >= static_cast<int64_t>(ms)) return pred();
            uint32_t remaining = static_cast<uint32_t>(static_cast<int64_t>(ms) - elapsed);
            if (!wait_for(lock, remaining)) {
                return pred();
            }
        }
        return true;
    }
#else
    pthread_cond_t c;
    ConditionVariable() { pthread_cond_init(&c, nullptr); }
    ~ConditionVariable() { pthread_cond_destroy(&c); }

    void notify_one() { pthread_cond_signal(&c); }
    void notify_all() { pthread_cond_broadcast(&c); }

    void wait(UniqueLock<Mutex>& lock) {
        if (!lock.owns_lock() || !lock.mutex()) return;
        pthread_cond_wait(&c, &lock.mutex()->m);
    }

    template <typename Predicate>
    void wait(UniqueLock<Mutex>& lock, Predicate pred) {
        while (!pred()) wait(lock);
    }

    bool wait_for(UniqueLock<Mutex>& lock, uint32_t ms) {
        if (!lock.owns_lock() || !lock.mutex()) return false;
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_sec += ms / 1000;
        ts.tv_nsec += (ms % 1000) * 1000000;
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec += 1;
            ts.tv_nsec -= 1000000000;
        }
        return pthread_cond_timedwait(&c, &lock.mutex()->m, &ts) == 0;
    }

    template <typename Predicate>
    bool wait_for(UniqueLock<Mutex>& lock, uint32_t ms, Predicate pred) {
        int64_t start = current_time_ms();
        while (!pred()) {
            int64_t elapsed = current_time_ms() - start;
            if (elapsed >= static_cast<int64_t>(ms)) return pred();
            uint32_t remaining = static_cast<uint32_t>(static_cast<int64_t>(ms) - elapsed);
            wait_for(lock, remaining);
        }
        return pred();
    }
#endif

    ConditionVariable(const ConditionVariable&) = delete;
    ConditionVariable& operator=(const ConditionVariable&) = delete;
};

// ─────────────────────────────── SharedMutex (RW Lock) ────────────────────────

class SharedMutex {
public:
    SharedMutex() : readers_(0), writer_(false) {}

    void lock() {
        UniqueLock<Mutex> lk(mu_);
        cv_.wait(lk, [this] { return !writer_ && readers_ == 0; });
        writer_ = true;
    }

    void unlock() {
        UniqueLock<Mutex> lk(mu_);
        writer_ = false;
        cv_.notify_all();
    }

    void lock_shared() {
        UniqueLock<Mutex> lk(mu_);
        cv_.wait(lk, [this] { return !writer_; });
        readers_++;
    }

    void unlock_shared() {
        UniqueLock<Mutex> lk(mu_);
        readers_--;
        if (readers_ == 0) {
            cv_.notify_all();
        }
    }

private:
    Mutex mu_;
    ConditionVariable cv_;
    int readers_;
    bool writer_;
};

class SharedLock {
public:
    explicit SharedLock(SharedMutex& sm) : sm_(sm) { sm_.lock_shared(); }
    ~SharedLock() { sm_.unlock_shared(); }
    SharedLock(const SharedLock&) = delete;
    SharedLock& operator=(const SharedLock&) = delete;
private:
    SharedMutex& sm_;
};

// ─────────────────────────────── Thread ──────────────────────────────────────

class Thread {
public:
    Thread() = default;

    template <typename F, typename... Args>
    explicit Thread(F&& f, Args&&... args) {
        auto fn = new std::function<void()>(std::bind(std::forward<F>(f), std::forward<Args>(args)...));
#ifdef _WIN32
        handle_ = CreateThread(nullptr, 0, &Thread::winRunner, fn, 0, nullptr);
#else
        pthread_create(&thread_, nullptr, &Thread::posixRunner, fn);
        started_ = true;
#endif
    }

    ~Thread() {
        if (joinable()) {
            join();
        }
    }

    bool joinable() const {
#ifdef _WIN32
        return handle_ != nullptr;
#else
        return started_;
#endif
    }

    void join() {
#ifdef _WIN32
        if (handle_) {
            WaitForSingleObject(handle_, INFINITE);
            CloseHandle(handle_);
            handle_ = nullptr;
        }
#else
        if (started_) {
            pthread_join(thread_, nullptr);
            started_ = false;
        }
#endif
    }

    void detach() {
#ifdef _WIN32
        if (handle_) {
            CloseHandle(handle_);
            handle_ = nullptr;
        }
#else
        if (started_) {
            pthread_detach(thread_);
            started_ = false;
        }
#endif
    }

    Thread(Thread&& o) noexcept {
#ifdef _WIN32
        handle_ = o.handle_;
        o.handle_ = nullptr;
#else
        thread_ = o.thread_;
        started_ = o.started_;
        o.started_ = false;
#endif
    }

    Thread& operator=(Thread&& o) noexcept {
        if (this != &o) {
            if (joinable()) join();
#ifdef _WIN32
            handle_ = o.handle_;
            o.handle_ = nullptr;
#else
            thread_ = o.thread_;
            started_ = o.started_;
            o.started_ = false;
#endif
        }
        return *this;
    }

    Thread(const Thread&) = delete;
    Thread& operator=(const Thread&) = delete;

private:
#ifdef _WIN32
    HANDLE handle_ = nullptr;
    static DWORD WINAPI winRunner(LPVOID p) {
        auto* fn = static_cast<std::function<void()>*>(p);
        (*fn)();
        delete fn;
        return 0;
    }
#else
    pthread_t thread_{};
    bool started_ = false;
    static void* posixRunner(void* p) {
        auto* fn = static_cast<std::function<void()>*>(p);
        (*fn)();
        delete fn;
        return nullptr;
    }
#endif
};

// ─────────────────────────────── Promise & Future ─────────────────────────────

template <typename T>
class Future;

template <typename T>
class Promise {
public:
    struct State {
        Mutex mu;
        ConditionVariable cv;
        bool ready = false;
        T value;
    };

    Promise() : state_(std::make_shared<State>()) {}

    void set_value(const T& val) {
        LockGuard<Mutex> lk(state_->mu);
        state_->value = val;
        state_->ready = true;
        state_->cv.notify_all();
    }

    void set_value(T&& val) {
        LockGuard<Mutex> lk(state_->mu);
        state_->value = std::move(val);
        state_->ready = true;
        state_->cv.notify_all();
    }

    Future<T> get_future();

private:
    std::shared_ptr<State> state_;
};

template <typename T>
class Future {
public:
    explicit Future(std::shared_ptr<typename Promise<T>::State> s) : state_(std::move(s)) {}
    Future() = default;

    bool valid() const { return state_ != nullptr; }

    bool wait_for(uint32_t ms) {
        if (!state_) return false;
        UniqueLock<Mutex> lk(state_->mu);
        return state_->cv.wait_for(lk, ms, [this] { return state_->ready; });
    }

    T get() {
        if (!state_) return T{};
        UniqueLock<Mutex> lk(state_->mu);
        state_->cv.wait(lk, [this] { return state_->ready; });
        return std::move(state_->value);
    }

private:
    std::shared_ptr<typename Promise<T>::State> state_;
};

template <typename T>
Future<T> Promise<T>::get_future() {
    return Future<T>(state_);
}

} // namespace dsm
