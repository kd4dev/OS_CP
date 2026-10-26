#pragma once
/**
 * test_runner.h — Lightweight DSM test framework
 */

#include <string>
#include <vector>
#include <functional>
#include <stdexcept>
#include <sstream>
#include <cmath>

namespace dsm_test {

// ─────────────────────────────── TestResult ──────────────────────────────────

class TestResult {
public:
    bool ok() const { return ok_; }
    const std::string& message() const { return msg_; }

    void fail(const std::string& msg) {
        ok_  = false;
        msg_ = msg;
    }
    void pass() { ok_ = true; }

private:
    bool        ok_  = true;
    std::string msg_;
};

// ─────────────────────────────── Assertion helpers ───────────────────────────

#define DSM_ASSERT(result, expr) \
    do { \
        if (!(expr)) { \
            std::ostringstream _oss; \
            _oss << "ASSERT FAILED: " #expr \
                 << "  [" << __FILE__ << ":" << __LINE__ << "]"; \
            (result).fail(_oss.str()); \
            return; \
        } \
    } while (0)

#define DSM_ASSERT_EQ(result, a, b) \
    do { \
        if (!((a) == (b))) { \
            std::ostringstream _oss; \
            _oss << "ASSERT_EQ failed: " #a " == " #b \
                 << "  [" << __FILE__ << ":" << __LINE__ << "]"; \
            (result).fail(_oss.str()); \
            return; \
        } \
    } while (0)

#define DSM_ASSERT_NE(result, a, b) \
    do { \
        if ((a) == (b)) { \
            std::ostringstream _oss; \
            _oss << "ASSERT_NE failed: " #a " != " #b \
                 << "  [" << __FILE__ << ":" << __LINE__ << "]"; \
            (result).fail(_oss.str()); \
            return; \
        } \
    } while (0)

#define DSM_ASSERT_TRUE(result, expr)  DSM_ASSERT(result, (expr))
#define DSM_ASSERT_FALSE(result, expr) DSM_ASSERT(result, !(expr))

#define DSM_ASSERT_NEAR(result, a, b, eps) \
    do { \
        if (std::fabs((double)(a) - (double)(b)) > (eps)) { \
            std::ostringstream _oss; \
            _oss << "ASSERT_NEAR failed: |" #a " - " #b "| > " #eps \
                 << " (" << (a) << " vs " << (b) << ")" \
                 << "  [" << __FILE__ << ":" << __LINE__ << "]"; \
            (result).fail(_oss.str()); \
            return; \
        } \
    } while (0)

// ─────────────────────────────── Test Case ───────────────────────────────────

using TestFn = std::function<void(TestResult&)>;

struct TestCase {
    std::string name;
    TestFn      fn;
};

struct TestSuite {
    std::string           name;
    std::vector<TestCase> cases;

    TestSuite& add(std::string caseName, TestFn fn) {
        cases.push_back({std::move(caseName), std::move(fn)});
        return *this;
    }
};

// ─────────────────────────────── Registry ────────────────────────────────────

class TestRegistry {
public:
    static TestRegistry& instance();

    void add(TestSuite suite);
    int  runAll(const char* filter = nullptr);

private:
    std::vector<TestSuite> suites_;
};

#define DSM_REG_CONCAT_INNER(a, b) a##b
#define DSM_REG_CONCAT(a, b) DSM_REG_CONCAT_INNER(a, b)

// Helper macro to register a suite at static init time
#define DSM_REGISTER_SUITE(suite_expr) \
    namespace { \
        struct DSM_REG_CONCAT(_SuiteReg_, __LINE__) { \
            DSM_REG_CONCAT(_SuiteReg_, __LINE__)() { \
                ::dsm_test::TestRegistry::instance().add(suite_expr); \
            } \
        } DSM_REG_CONCAT(_suite_reg_instance_, __LINE__); \
    }

} // namespace dsm_test
