cmake_minimum_required(VERSION 3.16)
project(DSM_System VERSION 1.0.0 LANGUAGES CXX)

# ─────────────────────────────── C++ Standard ────────────────────────────────
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ─────────────────────────────── Build type ───────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Compiler:   ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")

# ─────────────────────────────── Compiler flags ───────────────────────────────
if(MSVC)
    add_compile_options(/W4 /WX- /permissive- /MP /utf-8)
    add_compile_options(
        $<$<CONFIG:Debug>:/Od /Zi /RTC1>
        $<$<CONFIG:Release>:/O2 /DNDEBUG>
    )
    # Disable noisy MSVC warnings from system headers
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS _WINSOCK_DEPRECATED_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
    add_compile_options(
        $<$<CONFIG:Debug>:-O0 -g -fsanitize=address,undefined>
        $<$<CONFIG:Release>:-O3 -DNDEBUG -march=native>
    )
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        add_link_options(-fsanitize=address,undefined)
    endif()
endif()

# ─────────────────────────────── Threading ───────────────────────────────────
find_package(Threads REQUIRED)

# ─────────────────────────────── Include dirs ────────────────────────────────
include_directories(${CMAKE_SOURCE_DIR}/include)

# ─────────────────────────────── DSM Library ─────────────────────────────────
set(DSM_SOURCES
    src/dsm_core.cpp
    src/dsm_logger.cpp
    src/dsm_network.cpp
    src/dsm_node.cpp
    src/dsm_page.cpp
    src/dsm_protocol.cpp
    src/dsm_sync.cpp
    src/dsm_ui.cpp
)

add_library(dsm_lib STATIC ${DSM_SOURCES})
target_include_directories(dsm_lib PUBLIC ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(dsm_lib PUBLIC Threads::Threads)

if(WIN32)
    target_link_libraries(dsm_lib PUBLIC ws2_32)
endif()

# ─────────────────────────────── Main executable ─────────────────────────────
add_executable(dsm_node src/main.cpp)
target_link_libraries(dsm_node PRIVATE dsm_lib)
set_target_properties(dsm_node PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# ─────────────────────────────── Test executable ─────────────────────────────
set(TEST_SOURCES
    tests/main.cpp
    tests/test_runner.cpp
    tests/test_page_coherence.cpp
    tests/test_sync.cpp
    tests/test_network.cpp
    tests/test_integration.cpp
)

add_executable(dsm_tests ${TEST_SOURCES})
target_include_directories(dsm_tests PRIVATE ${CMAKE_SOURCE_DIR}/tests)
target_link_libraries(dsm_tests PRIVATE dsm_lib)
set_target_properties(dsm_tests PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# ─────────────────────────────── CTest integration ───────────────────────────
enable_testing()

add_test(NAME PageCoherence
    COMMAND dsm_tests --filter=PageCoherence
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)
add_test(NAME Synchronization
    COMMAND dsm_tests --filter=Synchronization
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)
add_test(NAME Network
    COMMAND dsm_tests --filter=Network
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)
add_test(NAME Integration
    COMMAND dsm_tests --filter=Integration
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)
add_test(NAME AllTests
    COMMAND dsm_tests
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# ─────────────────────────────── Install ─────────────────────────────────────
install(TARGETS dsm_node dsm_tests
    RUNTIME DESTINATION bin
)
install(DIRECTORY include/ DESTINATION include/dsm)

# ─────────────────────────────── Summary ─────────────────────────────────────
message(STATUS "")
message(STATUS "╔══════════════════════════════════════════════╗")
message(STATUS "║   DSM System Configuration Summary          ║")
message(STATUS "╠══════════════════════════════════════════════╣")
message(STATUS "║  Build type  : ${CMAKE_BUILD_TYPE}")
message(STATUS "║  CXX Std     : C++17")
message(STATUS "║  Install dir : ${CMAKE_INSTALL_PREFIX}")
message(STATUS "║  Targets     : dsm_node, dsm_tests, dsm_lib")
message(STATUS "╚══════════════════════════════════════════════╝")
message(STATUS "")
