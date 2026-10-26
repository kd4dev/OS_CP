# ─────────────────────────────────────────────────────────────────
#  DSM System — Cross-Platform Makefile (macOS, Linux, Windows)
# ─────────────────────────────────────────────────────────────────

ifeq ($(OS),Windows_NT)
    PLATFORM := Windows
    EXE_EXT  := .exe
    CXX      := g++
    CXXFLAGS := -std=c++17 -Wall -Wextra -O2 -DNDEBUG -Iinclude -D_WIN32_WINNT=0x0601
    LDFLAGS  := -lws2_32
    MKDIR    := if not exist bin mkdir bin && if not exist build mkdir build && if not exist build\obj mkdir build\obj
    RM       := rmdir /s /q
else
    PLATFORM := POSIX
    EXE_EXT  :=
    CXX      ?= clang++
    CXXFLAGS := -std=c++17 -Wall -Wextra -O2 -DNDEBUG -Iinclude
    LDFLAGS  := -lpthread
    MKDIR    := mkdir -p bin build/obj
    RM       := rm -rf
endif

BINDIR   := bin
OBJDIR   := build/obj

# ─── Source files ────────────────────────────────────────────────
DSM_SRCS := src/dsm_core.cpp \
            src/dsm_logger.cpp \
            src/dsm_network.cpp \
            src/dsm_node.cpp \
            src/dsm_page.cpp \
            src/dsm_protocol.cpp \
            src/dsm_sync.cpp \
            src/dsm_ui.cpp

MAIN_SRC  := src/main.cpp

TEST_SRCS := tests/test_runner.cpp \
             tests/test_page_coherence.cpp \
             tests/test_sync.cpp \
             tests/test_network.cpp \
             tests/test_integration.cpp \
             tests/main.cpp

# ─── Object files ────────────────────────────────────────────────
DSM_OBJS  := $(patsubst src/%.cpp,  $(OBJDIR)/%.o, $(DSM_SRCS))
MAIN_OBJ  := $(OBJDIR)/main.o
TEST_OBJS := $(patsubst tests/%.cpp, $(OBJDIR)/test_%.o, $(TEST_SRCS))

NODE_BIN  := $(BINDIR)/dsm_node$(EXE_EXT)
TEST_BIN  := $(BINDIR)/dsm_tests$(EXE_EXT)

# ─── Targets ─────────────────────────────────────────────────────
.PHONY: all tests run_tests clean dirs

all: dirs $(NODE_BIN) $(TEST_BIN)

tests: dirs $(TEST_BIN)

dirs:
	@$(MKDIR)

# ─── DSM node executable ─────────────────────────────────────────
$(NODE_BIN): $(DSM_OBJS) $(MAIN_OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS)
	@echo "[OK] Built: $@"

# ─── Test executable ─────────────────────────────────────────────
$(TEST_BIN): $(DSM_OBJS) $(TEST_OBJS)
	$(CXX) $(CXXFLAGS) -Itests -o $@ $^ $(LDFLAGS)
	@echo "[OK] Built: $@"

# ─── Compile DSM sources ──────────────────────────────────────────
$(OBJDIR)/%.o: src/%.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

# ─── Compile main ─────────────────────────────────────────────────
$(OBJDIR)/main.o: src/main.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

# ─── Compile test sources ─────────────────────────────────────────
$(OBJDIR)/test_%.o: tests/%.cpp
	$(CXX) $(CXXFLAGS) -Itests -c $< -o $@

# ─── Shortcut: run tests ──────────────────────────────────────────
run_tests: tests
	$(TEST_BIN)

clean:
ifeq ($(OS),Windows_NT)
	@if exist build $(RM) build
	@if exist bin   $(RM) bin
else
	@$(RM) build bin
endif
	@echo Cleaned.
