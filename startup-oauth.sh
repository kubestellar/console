#!/bin/bash
# KubeStellar Console - OAuth Mode Startup
# Requires GitHub OAuth credentials in .env or environment
#
# Can be used two ways:
#   1. Run locally from a cloned repo:  ./startup-oauth.sh
#   2. Bootstrap from scratch via curl:
#        curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/startup-oauth.sh | bash
#        curl -sSL .../startup-oauth.sh | bash -s -- --branch feature-x
#        curl -sSL .../startup-oauth.sh | bash -s -- --tag v1.0.0
#        curl -sSL .../startup-oauth.sh | bash -s -- --release latest
#
# Options:
#   --dev                  Use Vite dev server with HMR (slower initial load, live reload)
#   --branch, -b <name>   Branch to clone (default: main) [bootstrap mode]
#   --tag, -t <name>      Tag to checkout after cloning [bootstrap mode]
#   --release, -r <name>  Release tag to checkout ("latest" resolves automatically) [bootstrap mode]
#   --dir, -d <path>      Install directory (default: ./kubestellar-console) [bootstrap mode]
#
# Setup:
#   1. Create a GitHub OAuth App at https://github.com/settings/developers
#      - Homepage URL: http://localhost:8080 (or http://localhost:5174 with --dev)
#      - Callback URL: http://localhost:8080/auth/github/callback
#   2. Create a .env file:
#      GITHUB_CLIENT_ID=<your-client-id>
#      GITHUB_CLIENT_SECRET=<your-client-secret>
#      FEEDBACK_GITHUB_TOKEN=<your-pat>  (optional, enables Contribute dialog issue creation)
#   3. Run: ./startup-oauth.sh           (production build, fast load)
#      Or:  ./startup-oauth.sh --dev     (Vite dev server, HMR)

set -e

# Parse --dev flag before bootstrap (needs to survive exec)
USE_DEV_SERVER=false
for arg in "$@"; do
    if [ "$arg" = "--dev" ]; then USE_DEV_SERVER=true; fi
done

# --- Bootstrap: clone repo if not already inside one ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
if [ ! -f "$SCRIPT_DIR/web/package.json" ] || [ ! -d "$SCRIPT_DIR/cmd" ]; then
    REPO_URL="https://github.com/kubestellar/console.git"
    BRANCH="main"
    TAG=""
    INSTALL_DIR="./kubestellar-console"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dev) shift ;; # already parsed above
            --branch|-b) BRANCH="$2"; shift 2 ;;
            --tag|-t) TAG="$2"; shift 2 ;;
            --release|-r)
                if [ "$2" = "latest" ]; then
                    TAG=$(git ls-remote --tags --sort=-v:refname "$REPO_URL" 'v*' 2>/dev/null | head -1 | sed 's/.*refs\/tags\///' | sed 's/\^{}//')
                    echo "Latest release: ${TAG:-unknown}"
                else
                    TAG="$2"
                fi
                shift 2 ;;
            --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    echo "=== KubeStellar Console Bootstrap (OAuth) ==="
    echo ""

    # Check prerequisites
    for cmd in git go node npm; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "Error: $cmd is required but not found."
            exit 1
        fi
    done

    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "Updating existing clone at $INSTALL_DIR..."
        cd "$INSTALL_DIR"
        git fetch --all --tags --prune
        if [ -n "$TAG" ]; then git checkout "$TAG"
        else git checkout "$BRANCH" && git pull origin "$BRANCH"; fi
    else
        echo "Cloning repository..."
        git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        if [ -n "$TAG" ]; then git checkout "$TAG"; fi
    fi

    # Colors needed for safe_npm_install in bootstrap mode
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
    MAX_NPM_RETRIES=3
    safe_npm_install() {
        local dir="$1"
        local attempt=1
        while [ $attempt -le $MAX_NPM_RETRIES ]; do
            echo -e "${GREEN}Installing frontend dependencies (attempt $attempt/$MAX_NPM_RETRIES)...${NC}"
            rm -f "$dir/package-lock.json.lock" "$dir/.package-lock.json" 2>/dev/null
            if (cd "$dir" && npm install 2>&1); then
                echo -e "${GREEN}Dependencies installed successfully${NC}"
                return 0
            fi
            echo -e "${YELLOW}npm install failed — cleaning cache and retrying...${NC}"
            npm cache clean --force 2>/dev/null || true
            if [ $attempt -ge 2 ]; then rm -rf "$dir/node_modules"; fi
            attempt=$((attempt + 1))
        done
        echo -e "${RED}Error: npm install failed after $MAX_NPM_RETRIES attempts.${NC}"
        echo -e "${RED}Try: cd $dir && npm cache clean --force && npm install${NC}"
        exit 1
    }
    safe_npm_install web
    echo ""
    exec ./startup-oauth.sh
fi

cd "$SCRIPT_DIR"

# Load shared port cleanup utilities (kill_project_port, verify_port_free)
source "$SCRIPT_DIR/scripts/port-cleanup.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Resilient npm install — handles cache corruption, permission errors, and stale locks
MAX_NPM_RETRIES=3
safe_npm_install() {
    local dir="$1"
    local attempt=1
    while [ $attempt -le $MAX_NPM_RETRIES ]; do
        echo -e "${GREEN}Installing frontend dependencies (attempt $attempt/$MAX_NPM_RETRIES)...${NC}"
        # Remove stale lockfiles that block concurrent installs
        rm -f "$dir/package-lock.json.lock" "$dir/.package-lock.json" 2>/dev/null
        if (cd "$dir" && npm install 2>&1); then
            echo -e "${GREEN}Dependencies installed successfully${NC}"
            return 0
        fi
        local exit_code=$?
        echo -e "${YELLOW}npm install failed (exit $exit_code)${NC}"

        # Attempt recovery: clean npm cache (fixes EACCES, corruption, sha512 errors)
        echo -e "${YELLOW}Cleaning npm cache and retrying...${NC}"
        npm cache clean --force 2>/dev/null || true

        # Remove potentially corrupted node_modules for a clean retry
        if [ $attempt -ge 2 ]; then
            echo -e "${YELLOW}Removing node_modules for clean install...${NC}"
            rm -rf "$dir/node_modules"
        fi

        attempt=$((attempt + 1))
    done
    echo -e "${RED}Error: npm install failed after $MAX_NPM_RETRIES attempts${NC}"
    echo -e "${RED}Try manually: cd $dir && npm cache clean --force && npm install${NC}"
    exit 1
}

echo -e "${GREEN}=== KubeStellar Console - OAuth Mode ===${NC}"
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    echo -e "${GREEN}Loading .env file...${NC}"
    while IFS='=' read -r key value; do
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < .env
fi

# Check OAuth credentials — optional when using the one-click manifest flow.
# The console will check SQLite for credentials saved by a previous manifest
# setup, or show the one-click setup button on the login page.
if [ -z "$GITHUB_CLIENT_ID" ] || [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo -e "${YELLOW}⚠ GitHub OAuth not configured via .env${NC}"
    echo "  You can set it up from the login page (one-click GitHub App setup)"
    echo "  Or add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env"
    echo ""
fi

# Generate JWT_SECRET if not set (production mode requires it)
if [ -z "$JWT_SECRET" ]; then
    export JWT_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated random JWT_SECRET (set JWT_SECRET in .env to persist across restarts)${NC}"
fi

# Environment
unset CLAUDECODE  # Allow AI Missions to spawn claude-code even when started from a Claude Code session
export SKIP_ONBOARDING=true
if [ "$USE_DEV_SERVER" = true ]; then
    export DEV_MODE=true
    export FRONTEND_URL=http://localhost:5174
else
    export DEV_MODE=false
    # Frontend served by Go backend on same port — no separate Vite process needed
    export FRONTEND_URL=http://localhost:8080
fi

# Create data directory
mkdir -p ./data

# Stage file — watchdog reads this to show startup progress
STAGE_FILE="/tmp/.kc-startup-stage"
write_stage() { echo "$1" > "$STAGE_FILE"; }

echo -e "${GREEN}Configuration:${NC}"
echo "  Mode: OAuth (real GitHub login)"
echo "  GitHub Client ID: ${GITHUB_CLIENT_ID:0:8}..."
echo "  Backend Port: 8080"
echo "  Frontend URL: $FRONTEND_URL"
if [ "$USE_DEV_SERVER" = true ]; then
    echo "  Frontend: Vite dev server (HMR enabled)"
else
    echo "  Frontend: Production build (fast load)"
fi
echo ""

# Watchdog-aware port cleanup
# The watchdog on port 8080 survives restarts so users never see "connection refused".
# Backend runs on port 8081 when watchdog is active.
WATCHDOG_PID_FILE="/tmp/.kc-watchdog.pid"
WATCHDOG_RUNNING=false
BACKEND_LISTEN_PORT=8081

# Check if watchdog is already alive on port 8080
if [ -f "$WATCHDOG_PID_FILE" ]; then
    WD_PID=$(cat "$WATCHDOG_PID_FILE" 2>/dev/null)
    if [ -n "$WD_PID" ] && kill -0 "$WD_PID" 2>/dev/null; then
        echo -e "${GREEN}Watchdog (pid $WD_PID) is alive on port 8080, preserving it${NC}"
        WATCHDOG_RUNNING=true
    else
        echo -e "${YELLOW}Stale watchdog PID file, will clean up${NC}"
        rm -f "$WATCHDOG_PID_FILE"
    fi
fi

# Clean ports — skip 8080 if watchdog is alive
# Only target LISTENING processes to avoid matching the watchdog's outgoing connections.
PORTS_TO_CLEAN="$BACKEND_LISTEN_PORT 8585"
if [ "$WATCHDOG_RUNNING" = false ]; then
    PORTS_TO_CLEAN="8080 $BACKEND_LISTEN_PORT 8585"
fi
if [ "$USE_DEV_SERVER" = true ]; then PORTS_TO_CLEAN="$PORTS_TO_CLEAN 5174"; fi
for p in $PORTS_TO_CLEAN; do
    kill_project_port "$p" "TCP:LISTEN"
done

# Verify all required ports are free before proceeding
for p in $PORTS_TO_CLEAN; do
    if ! verify_port_free "$p" "TCP:LISTEN"; then
        exit 1
    fi
done

# Cleanup on exit
SHUTDOWN_FLAG="/tmp/.kc-console-shutdown-$$"
cleanup() {
    touch "$SHUTDOWN_FLAG"
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    kill $AGENT_LOOP_PID 2>/dev/null || true
    kill $AGENT_PID 2>/dev/null || true
    kill $WATCHDOG_PID 2>/dev/null || true
    rm -f "$SHUTDOWN_FLAG" "$STAGE_FILE" "${AGENT_PID_FILE:-}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Resolve kc-agent binary path (build happens later, after the loading page is up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KC_AGENT_BIN=""
KC_AGENT_NEEDS_BUILD=false

if [ -f "$SCRIPT_DIR/cmd/kc-agent/main.go" ] && command -v go &>/dev/null; then
    KC_AGENT_NEEDS_BUILD=true
elif [ -f "$SCRIPT_DIR/bin/kc-agent" ]; then
    if [ -s "$SCRIPT_DIR/bin/kc-agent" ] && [ -x "$SCRIPT_DIR/bin/kc-agent" ]; then
        KC_AGENT_BIN="$SCRIPT_DIR/bin/kc-agent"
    else
        echo -e "${YELLOW}Warning: $SCRIPT_DIR/bin/kc-agent is invalid (empty or not executable). Run 'make build' to rebuild.${NC}"
    fi
fi

# If no valid local binary, attempt install/upgrade via brew (and resolve from PATH)
if [ -z "$KC_AGENT_BIN" ]; then
    # Install/upgrade kc-agent via brew
    if command -v brew &>/dev/null; then
        if brew list kc-agent &>/dev/null; then
            echo -e "${GREEN}Upgrading kc-agent...${NC}"
            brew update --quiet && brew upgrade kc-agent || true
        else
            echo -e "${GREEN}Installing kc-agent...${NC}"
            brew update --quiet && brew install kubestellar/tap/kc-agent
        fi

        # Validate the brew-installed binary — brew upgrade can leave a broken
        # symlink (0-byte regular file) if the link step fails silently.
        BREW_BIN="$(command -v kc-agent 2>/dev/null || true)"
        if [ -n "$BREW_BIN" ] && [ ! -s "$BREW_BIN" ]; then
            echo -e "${YELLOW}Detected broken kc-agent binary (0 bytes), relinking...${NC}"
            rm -f "$BREW_BIN"
            brew unlink kc-agent 2>/dev/null || true
            brew link kc-agent 2>/dev/null || true
            BREW_BIN="$(command -v kc-agent 2>/dev/null || true)"
        fi

        # Final fallback: if the symlink is still broken, find the binary
        # directly in the Cellar and use it without the symlink.
        if [ -n "$BREW_BIN" ] && [ ! -s "$BREW_BIN" ]; then
            echo -e "${YELLOW}Brew symlink still broken, using Cellar binary directly...${NC}"
            CELLAR_BIN="$(find "$(brew --cellar kc-agent 2>/dev/null)" -name kc-agent -type f -perm +111 2>/dev/null | head -1)"
            if [ -n "$CELLAR_BIN" ] && [ -s "$CELLAR_BIN" ]; then
                BREW_BIN="$CELLAR_BIN"
            fi
        fi
    fi
    if [ -n "$BREW_BIN" ] && [ -s "$BREW_BIN" ] && [ -x "$BREW_BIN" ]; then
        KC_AGENT_BIN="$BREW_BIN"
    elif command -v kc-agent &>/dev/null; then
        FOUND_BIN="$(command -v kc-agent)"
        if [ -f "$FOUND_BIN" ] && [ -s "$FOUND_BIN" ] && [ -x "$FOUND_BIN" ]; then
            KC_AGENT_BIN="$FOUND_BIN"
        else
            echo -e "${YELLOW}Warning: kc-agent found at $FOUND_BIN but it is not a valid executable (missing, empty, or not executable) — skipping. Run 'make build' or reinstall.${NC}"
        fi
    fi
fi

# Generate KC_AGENT_TOKEN if not already set — both kc-agent and the Go
# backend read this env var so the frontend can authenticate to the agent
# via a backend-proxied token endpoint.
if [ -z "$KC_AGENT_TOKEN" ]; then
    KC_AGENT_TOKEN="$(openssl rand -hex 32)"
    echo "Auto-generated KC_AGENT_TOKEN."
fi
export KC_AGENT_TOKEN

# Start kc-agent with auto-restart on crash
AGENT_PID=""
AGENT_LOOP_PID=""
if [ -n "$KC_AGENT_BIN" ]; then
    echo -e "${GREEN}Starting kc-agent ($KC_AGENT_BIN)...${NC}"
    # Pidfile written by the restart loop so the parent shell can target the
    # exact kc-agent process instead of whoever happens to be on port 8585.
    # Fixes #8127 — an unrelated process listening on :8585 was killed on Ctrl+C.
    AGENT_PID_FILE="/tmp/.kc-agent-pid-$$"
    : > "$AGENT_PID_FILE"
    (
        # Pass KUBECONFIG from .env / environment as --kubeconfig flag
        KC_AGENT_ARGS=()
        if [ -n "$KUBECONFIG" ]; then
            KC_AGENT_ARGS+=(--kubeconfig "$KUBECONFIG")
        fi
        while true; do
            "$KC_AGENT_BIN" "${KC_AGENT_ARGS[@]}" &
            CHILD=$!
            echo "$CHILD" > "$AGENT_PID_FILE"
            echo "[kc-agent] Started (PID $CHILD)"
            wait $CHILD
            EXIT_CODE=$?
            if [ -f "$SHUTDOWN_FLAG" ]; then
                break
            fi
            echo -e "${YELLOW}[kc-agent] Exited with code $EXIT_CODE — restarting in 5s...${NC}"
            sleep 5
        done
    ) &
    AGENT_LOOP_PID=$!
    # Give the loop a moment to spawn the child and write the pidfile.
    AGENT_PID_WAIT_ATTEMPTS=10
    AGENT_PID_WAIT_SLEEP_SECONDS=0.2
    for _ in $(seq 1 $AGENT_PID_WAIT_ATTEMPTS); do
        if [ -s "$AGENT_PID_FILE" ]; then break; fi
        sleep "$AGENT_PID_WAIT_SLEEP_SECONDS"
    done
    AGENT_PID=$(cat "$AGENT_PID_FILE" 2>/dev/null || true)
else
    echo -e "${YELLOW}Warning: kc-agent not found. Run 'make build' or install via brew.${NC}"
fi

if [ "$USE_DEV_SERVER" = true ]; then
    # Dev mode: Vite dev server with HMR (slower initial load, live reload on code changes)
    # NOTE: Do NOT pass --dev to the backend — that bypasses OAuth and creates "dev-user".
    # The --dev flag in startup-oauth.sh only controls using Vite dev server vs built assets.

    # Build and start the standalone watcher so users see a branded page immediately.
    # The watcher is stdlib-only — builds in ~2s and starts in milliseconds.
    if [ "$WATCHDOG_RUNNING" = false ]; then
        write_stage "watchdog"
        # Rebuild watcher if binary is missing or source changed
        WATCHER_BIN="./bin/kc-watcher"
        WATCHER_NEEDS_BUILD=false
        if [ ! -f "$WATCHER_BIN" ]; then
            WATCHER_NEEDS_BUILD=true
        elif [ -n "$(find cmd/watcher -name '*.go' -newer "$WATCHER_BIN" 2>/dev/null)" ]; then
            WATCHER_NEEDS_BUILD=true
        fi
        if [ "$WATCHER_NEEDS_BUILD" = true ]; then
            echo -e "${GREEN}Building kc-watcher...${NC}"
            mkdir -p ./bin
            GOWORK=off go build -ldflags "-X main.version=${VERSION:-dev}" -o "$WATCHER_BIN" ./cmd/watcher
        fi
        echo -e "${GREEN}Starting watcher on port 8080...${NC}"
        TLS_FLAG=""
        if [ "${TLS_ENABLED:-}" = "true" ]; then
            TLS_FLAG="--tls"
            echo -e "${GREEN}  HTTPS/H2 enabled (TLS_ENABLED=true)${NC}"
        fi
        "$WATCHER_BIN" $TLS_FLAG --backend-port "$BACKEND_LISTEN_PORT" &
        WATCHDOG_PID=$!
        sleep 1
        echo -e "${CYAN}  Loading page: http://localhost:8080${NC}"
    fi

    # Build kc-agent from source if running from a dev checkout.
    if [ "$KC_AGENT_NEEDS_BUILD" = true ]; then
        write_stage "agent_build"
        echo -e "${GREEN}Building kc-agent from source...${NC}"
        AGENT_LDFLAGS="-X github.com/kubestellar/console/pkg/agent.CommitSHA=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
        AGENT_LDFLAGS="$AGENT_LDFLAGS -X github.com/kubestellar/console/pkg/agent.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        mkdir -p "$SCRIPT_DIR/bin"
        if GOWORK=off go build -ldflags "$AGENT_LDFLAGS" -o "$SCRIPT_DIR/bin/kc-agent" ./cmd/kc-agent; then
            KC_AGENT_BIN="$SCRIPT_DIR/bin/kc-agent"
            echo -e "${GREEN}kc-agent built ($(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo dev))${NC}"
        else
            echo -e "${YELLOW}Warning: kc-agent build failed. Falling back to existing binary or brew.${NC}"
        fi
    fi

    # Always run npm install to pick up new/changed dependencies (#4405).
    # safe_npm_install is fast when node_modules is already up-to-date.
    write_stage "npm_install"
    safe_npm_install web

    write_stage "backend_compiling"
    echo -e "${GREEN}Starting backend on port $BACKEND_LISTEN_PORT (OAuth mode)...${NC}"
    BACKEND_PORT=$BACKEND_LISTEN_PORT GOWORK=off go run ./cmd/console &
    BACKEND_PID=$!
    sleep 2

    write_stage "vite_starting"
    echo -e "${GREEN}Starting Vite dev server...${NC}"
    (cd web && npm run dev -- --port 5174) &
    FRONTEND_PID=$!

    echo ""
    echo -e "${GREEN}=== Console is running in OAUTH + DEV mode ===${NC}"
    echo ""
    echo -e "  Frontend: ${CYAN}http://localhost:5174${NC}  (Vite HMR)"
    echo -e "  Watchdog: ${CYAN}http://localhost:8080${NC}  (reverse proxy)"
    echo -e "  Backend:  ${CYAN}http://localhost:$BACKEND_LISTEN_PORT${NC}"
    echo -e "  Agent:    ${CYAN}http://localhost:8585${NC}"
    echo -e "  Auth:     GitHub OAuth (real login)"
else
    # Production mode: pre-built frontend served by Go backend (fast load)

    # Build and start the standalone watcher so users see a branded page immediately.
    # The watcher is stdlib-only — builds in ~2s and starts in milliseconds.
    if [ "$WATCHDOG_RUNNING" = false ]; then
        write_stage "watchdog"
        # Rebuild watcher if binary is missing or source changed
        WATCHER_BIN="./bin/kc-watcher"
        WATCHER_NEEDS_BUILD=false
        if [ ! -f "$WATCHER_BIN" ]; then
            WATCHER_NEEDS_BUILD=true
        elif [ -n "$(find cmd/watcher -name '*.go' -newer "$WATCHER_BIN" 2>/dev/null)" ]; then
            WATCHER_NEEDS_BUILD=true
        fi
        if [ "$WATCHER_NEEDS_BUILD" = true ]; then
            echo -e "${GREEN}Building kc-watcher...${NC}"
            mkdir -p ./bin
            GOWORK=off go build -ldflags "-X main.version=${VERSION:-dev}" -o "$WATCHER_BIN" ./cmd/watcher
        fi
        echo -e "${GREEN}Starting watcher on port 8080...${NC}"
        TLS_FLAG=""
        if [ "${TLS_ENABLED:-}" = "true" ]; then
            TLS_FLAG="--tls"
            echo -e "${GREEN}  HTTPS/H2 enabled (TLS_ENABLED=true)${NC}"
        fi
        "$WATCHER_BIN" $TLS_FLAG --backend-port "$BACKEND_LISTEN_PORT" &
        WATCHDOG_PID=$!
        sleep 1
        echo -e "${CYAN}  Loading page: http://localhost:8080${NC}"
    fi

    # Build kc-agent from source if running from a dev checkout.
    if [ "$KC_AGENT_NEEDS_BUILD" = true ]; then
        write_stage "agent_build"
        echo -e "${GREEN}Building kc-agent from source...${NC}"
        AGENT_LDFLAGS="-X github.com/kubestellar/console/pkg/agent.CommitSHA=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
        AGENT_LDFLAGS="$AGENT_LDFLAGS -X github.com/kubestellar/console/pkg/agent.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        mkdir -p "$SCRIPT_DIR/bin"
        if GOWORK=off go build -ldflags "$AGENT_LDFLAGS" -o "$SCRIPT_DIR/bin/kc-agent" ./cmd/kc-agent; then
            KC_AGENT_BIN="$SCRIPT_DIR/bin/kc-agent"
            echo -e "${GREEN}kc-agent built ($(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo dev))${NC}"
        else
            echo -e "${YELLOW}Warning: kc-agent build failed. Falling back to existing binary or brew.${NC}"
        fi
    fi

    # Always run npm install to pick up new/changed dependencies (#4405).
    # safe_npm_install is fast when node_modules is already up-to-date.
    write_stage "npm_install"
    safe_npm_install web

    write_stage "frontend_build"
    echo -e "${GREEN}Building frontend...${NC}"
    if ! (cd web && npm run build); then
        echo ""
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  Frontend build failed.${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo "  This often happens after pulling new changes."
        echo "  Try:"
        echo "    1. git pull origin main"
        echo "    2. cd web && npm install"
        echo "    3. Re-run ./startup-oauth.sh"
        echo ""
        echo "  If the error persists, check the build output above for details."
        echo ""
        exit 1
    fi
    echo -e "${GREEN}Frontend built successfully${NC}"

    # Start backend on port 8081 — watchdog on 8080 proxies to it
    write_stage "backend_compiling"
    echo -e "${GREEN}Starting backend on port $BACKEND_LISTEN_PORT (OAuth mode)...${NC}"
    BACKEND_PORT=$BACKEND_LISTEN_PORT GOWORK=off go run ./cmd/console &
    BACKEND_PID=$!
    sleep 2

    echo ""
    echo -e "${GREEN}=== Console is running in OAUTH mode ===${NC}"
    echo ""
    echo -e "  Console:  ${CYAN}http://localhost:8080${NC}  (via watchdog)"
    echo -e "  Backend:  ${CYAN}http://localhost:$BACKEND_LISTEN_PORT${NC}"
    echo -e "  Agent:    ${CYAN}http://localhost:8585${NC}"
    echo -e "  Auth:     GitHub OAuth (real login)"
fi
echo ""
echo "Press Ctrl+C to stop"

wait
