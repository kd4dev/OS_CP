/**
 * tests/main.cpp — Test executable entry point
 */

#include "test_runner.h"
#include <cstdio>
#include <cstring>

int main(int argc, char** argv) {
    const char* filter = nullptr;
    if (argc >= 2 && std::strncmp(argv[1], "--filter=", 9) == 0) {
        filter = argv[1] + 9;
        printf("Running tests matching filter: '%s'\n", filter);
    }
    return dsm_test::TestRegistry::instance().runAll(filter);
}
