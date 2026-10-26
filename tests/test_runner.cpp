/**
 * test_runner.cpp — Lightweight test framework for DSM unit tests
 *
 * A minimal self-contained test harness (no external dependencies).
 * Each test file registers suites; this runner collects and executes them.
 */

#include "test_runner.h"
#include <cstdio>
#include <cstring>
#include <chrono>

namespace dsm_test {

// ─────────────────────────────── Registry (singleton) ────────────────────────

TestRegistry& TestRegistry::instance() {
    static TestRegistry reg;
    return reg;
}

void TestRegistry::add(TestSuite suite) {
    suites_.push_back(std::move(suite));
}

// ─────────────────────────────── Run all ─────────────────────────────────────

int TestRegistry::runAll(const char* filter) {
    int totalPassed = 0, totalFailed = 0, totalSkipped = 0;

    printf("\n");
    printf("╔══════════════════════════════════════════════════════════╗\n");
    printf("║           DSM System — Unit Test Runner                 ║\n");
    printf("╚══════════════════════════════════════════════════════════╝\n\n");

    for (auto& suite : suites_) {
        if (filter && std::string(suite.name).find(filter) == std::string::npos)
            continue;

        printf("┌─ Suite: \033[1;34m%s\033[0m\n", suite.name.c_str());

        int passed = 0, failed = 0, skipped = 0;

        for (auto& tc : suite.cases) {
            if (filter && std::string(tc.name).find(filter) == std::string::npos) {
                ++skipped;
                continue;
            }

            auto t0 = std::chrono::steady_clock::now();
            TestResult result;
            try {
                tc.fn(result);
            } catch (const std::exception& e) {
                result.fail("Exception: " + std::string(e.what()));
            } catch (...) {
                result.fail("Unknown exception");
            }
            auto t1  = std::chrono::steady_clock::now();
            double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

            if (result.ok()) {
                printf("│  \033[32m✓\033[0m %-45s \033[2m%.2fms\033[0m\n",
                       tc.name.c_str(), ms);
                ++passed;
            } else {
                printf("│  \033[31m✗\033[0m %-45s \033[2m%.2fms\033[0m\n",
                       tc.name.c_str(), ms);
                printf("│      \033[31m→ %s\033[0m\n", result.message().c_str());
                ++failed;
            }
        }

        printf("└─ Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m, %d skipped\n\n",
               passed, failed, skipped);

        totalPassed  += passed;
        totalFailed  += failed;
        totalSkipped += skipped;
    }

    printf("══════════════════════════════════════════\n");
    printf("Total: \033[32m%d passed\033[0m / \033[31m%d failed\033[0m / %d skipped\n",
           totalPassed, totalFailed, totalSkipped);
    printf("══════════════════════════════════════════\n\n");

    return totalFailed == 0 ? 0 : 1;
}

} // namespace dsm_test
