#!/bin/bash
# KubeStellar Console - Development Startup Script
#
# Starts backend (port 8080), frontend (port 5174), and kc-agent (port 8585).
#
# Can be used two ways:
#   1. Run locally from a cloned repo:  ./start-dev.sh
#   2. Bootstrap from scratch via curl:
#        curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start-dev.sh | bash
#        curl -sSL .../start-dev.sh | bash -s -- --branch feature-x
#        curl -sSL .../start-dev.sh | bash -s -- --tag v1.0.0
#        curl -sSL .../start-dev.sh | bash -s -- --release latest
#
# Options (bootstrap mode):
#   --branch, -b <name>    Branch to clone (default: main)
#   --tag, -t <name>       Tag to checkout after cloning
#   --release, -r <name>   Release tag to checkout ("latest" resolves automatically)
#   --dir, -d <path>       Install directory (default: ./kubestellar-console)
#
# Create a .env file with your credentials:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#
# The .env file takes precedence over shell environment variables.
# Without .env or credentials, uses dev mode login (no GitHub OAuth).

set -e

# --- Bootstrap: clone repo if not already inside one ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
if [ ! -f "$SCRIPT_DIR/web/package.json" ] || [ ! -d "$SCRIPT_DIR/cmd" ]; then
    REPO_URL="https://github.com/kubestellar/console.git"
    BRANCH="main"
    TAG=""
    INSTALL_DIR="./kubestellar-console"

    while [[ $# -gt 0 ]]; do
        case $1 in
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

    echo "=== KubeStellar Console Bootstrap ==="
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

    echo "Installing frontend dependencies..."
    (cd web && npm install)
    echo ""
    exec ./start-dev.sh
fi

cd "$SCRIPT_DIR"

# Safely kill a process on a port only if it belongs to this project.
# Unrelated processes (e.g., local databases, other dev servers) are warned
# and left running to avoid disrupting non-project services.
kill_project_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti ":${port}" 2>/dev/null || true)
    [ -z "$pids" ] && return 0

    local to_kill=()
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -qF "$SCRIPT_DIR" \
           || echo "$cmd" | grep -q "cmd/console" \
           || echo "$cmd" | grep -q "kc-agent"; then
            to_kill+=("$pid")
            echo "Stopping project process on port ${port} (PID ${pid})..."
            kill -TERM "$pid" 2>/dev/null || true
        else
            echo "Warning: Port ${port} is in use by an unrelated process (PID ${pid}: ${cmd:-unknown}). Skipping."
        fi
    done

    [ ${#to_kill[@]} -eq 0 ] && return 0
    sleep 2

    # Fall back to SIGKILL for project processes that did not exit gracefully
    for pid in "${to_kill[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
    done
}

# Load .env file if it exists (overrides any existing env vars)
if [ -f .env ]; then
    echo "Loading .env file..."
    # Unset existing GitHub vars to ensure .env takes precedence
    unset GITHUB_CLIENT_ID
    unset GITHUB_CLIENT_SECRET
    unset FRONTEND_URL
    unset DEV_MODE

    # Read .env and export each variable
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Remove surrounding quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < .env
fi

export DEV_MODE=${DEV_MODE:-true}
export FRONTEND_URL=${FRONTEND_URL:-http://localhost:5174}

# Kill any existing project instances on required ports
for p in 8080 5174 8585; do
    kill_project_port "$p"
done

echo "Starting KubeStellar Console (dev mode)..."
echo "  GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:0:10}..."
echo "  Frontend: $FRONTEND_URL"
echo "  Backend: http://localhost:8080"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    kill $AGENT_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Resolve kc-agent binary path (with validation)
KC_AGENT_BIN=""
if [ -f "$SCRIPT_DIR/bin/kc-agent" ]; then
    # Local build binary found — validate it is non-empty and executable
    if [ -s "$SCRIPT_DIR/bin/kc-agent" ] && [ -x "$SCRIPT_DIR/bin/kc-agent" ]; then
        KC_AGENT_BIN="$SCRIPT_DIR/bin/kc-agent"
    else
        echo "Warning: $SCRIPT_DIR/bin/kc-agent is invalid (empty or not executable). Run 'make build' to rebuild."
    fi
fi

# If no valid local binary, attempt install/upgrade via brew (and resolve from PATH)
if [ -z "$KC_AGENT_BIN" ]; then
    # Install/upgrade kc-agent via brew
    if command -v brew &>/dev/null; then
        if brew list kc-agent &>/dev/null; then
            echo "Upgrading kc-agent..."
            brew update --quiet && brew upgrade kc-agent 2>/dev/null || true
        else
            echo "Installing kc-agent..."
            brew update --quiet && brew install kubestellar/tap/kc-agent
        fi

        # Validate the brew-installed binary — brew upgrade can leave a broken
        # symlink (0-byte regular file) if the link step fails silently.
        BREW_BIN="$(command -v kc-agent 2>/dev/null || true)"
        if [ -n "$BREW_BIN" ] && [ ! -s "$BREW_BIN" ]; then
            echo "Warning: Detected broken kc-agent binary (0 bytes), relinking..."
            rm -f "$BREW_BIN"
            brew unlink kc-agent 2>/dev/null || true
            brew link kc-agent 2>/dev/null || true
            BREW_BIN="$(command -v kc-agent 2>/dev/null || true)"
        fi

        # Final fallback: if the symlink is still broken, find the binary
        # directly in the Cellar and use it without the symlink.
        if [ -n "$BREW_BIN" ] && [ ! -s "$BREW_BIN" ]; then
            echo "Warning: Brew symlink still broken, looking for Cellar binary..."
            CELLAR_BIN="$(find "$(brew --cellar kc-agent 2>/dev/null)" -name kc-agent -type f -perm +111 2>/dev/null | head -1)"
            if [ -n "$CELLAR_BIN" ] && [ -s "$CELLAR_BIN" ]; then
                BREW_BIN="$CELLAR_BIN"
            fi
        fi
    fi
    if [ -n "${BREW_BIN:-}" ] && [ -s "$BREW_BIN" ] && [ -x "$BREW_BIN" ]; then
        KC_AGENT_BIN="$BREW_BIN"
    elif command -v kc-agent &>/dev/null; then
        FOUND_BIN="$(command -v kc-agent)"
        if [ -f "$FOUND_BIN" ] && [ -s "$FOUND_BIN" ] && [ -x "$FOUND_BIN" ]; then
            KC_AGENT_BIN="$FOUND_BIN"
        else
            echo "Warning: kc-agent found at $FOUND_BIN but it is not a valid executable (missing, empty, or not executable) — skipping. Run 'make build' or reinstall."
        fi
    fi
fi

# Start kc-agent and verify it is running
AGENT_PID=""
AGENT_RUNNING=false
if [ -n "$KC_AGENT_BIN" ]; then
    echo "Starting kc-agent ($KC_AGENT_BIN)..."
    KC_AGENT_ARGS=()
    if [ -n "$KUBECONFIG" ]; then
        KC_AGENT_ARGS+=(--kubeconfig "$KUBECONFIG")
    fi
    "$KC_AGENT_BIN" "${KC_AGENT_ARGS[@]}" &
    AGENT_PID=$!

    # Wait for kc-agent to become ready (HTTP health check, up to 10s)
    AGENT_WAIT=0
    while [ $AGENT_WAIT -lt 10 ]; do
        if ! kill -0 "$AGENT_PID" 2>/dev/null; then
            echo "Warning: kc-agent process exited unexpectedly."
            echo "  The binary may be invalid or crashed on startup."
            AGENT_PID=""
            break
        fi
        if curl -sf --max-time 1 http://localhost:8585/health >/dev/null 2>&1; then
            AGENT_RUNNING=true
            break
        fi
        sleep 1
        AGENT_WAIT=$((AGENT_WAIT + 1))
    done

    if [ "$AGENT_RUNNING" != true ] && [ -n "$AGENT_PID" ]; then
        echo "Warning: kc-agent did not become ready within 10s (health endpoint not reachable)."
        AGENT_PID=""
    fi
else
    echo "Warning: kc-agent not found. Run 'make build' or install via brew."
    AGENT_PID=""
fi

# Start backend
echo "Starting backend..."
go run ./cmd/console/ --dev &
BACKEND_PID=$!
sleep 2

# Start frontend
echo "Starting frontend..."
(cd web && npm run dev -- --port 5174) &
FRONTEND_PID=$!

echo ""
echo "=== Console is running in DEV mode ==="
echo ""
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:8080"
if [ "$AGENT_RUNNING" = true ]; then
    echo "  Agent:    http://localhost:8585"
else
    echo "  Agent:    not running (kc-agent failed to start or not installed)"
fi
echo ""
echo "Press Ctrl+C to stop"

wait
