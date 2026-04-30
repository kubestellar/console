#!/bin/bash
# KubeStellar Console - Quick Start
#
# Up and running in under a minute.
# Downloads pre-built binaries and starts the console locally.
# No Go, Node.js, or build tools required — just curl.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash
#
# Options:
#   --version, -v <tag>     Specific version to download (default: latest stable)
#   --channel, -c <name>    Update channel: stable, unstable (default: from ~/.kc/settings.json or stable)
#   --dir, -d <path>        Install directory (default: ./kubestellar-console)
#   --port, -p <port>       Console port (default: 8080)
#
# kc-agent runs as a background daemon (survives Ctrl+C / terminal close).
# To stop it:  kill $(cat ./kubestellar-console/kc-agent.pid)
# Logs:        ./kubestellar-console/kc-agent.log
#
# To enable GitHub OAuth login, create a .env file:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#   FRONTEND_URL=http://localhost:8080

set -e

# --- Defaults ---
INSTALL_DIR="./kubestellar-console"
VERSION=""
CHANNEL=""
PORT=8080
REPO="kubestellar/console"
GITHUB_API="https://api.github.com"

# --- Parse args ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --version|-v) VERSION="$2"; shift 2 ;;
        --channel|-c) CHANNEL="$2"; shift 2 ;;
        --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
        --port|-p) PORT="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# --- Resolve update channel ---
# Priority: CLI flag > persisted setting in ~/.kc/settings.json > default (stable)
resolve_channel() {
    if [ -n "$CHANNEL" ]; then
        echo "$CHANNEL"
        return
    fi

    local settings_file="$HOME/.kc/settings.json"
    if [ -f "$settings_file" ]; then
        local saved
        saved=$(grep -o '"autoUpdateChannel" *: *"[^"]*"' "$settings_file" 2>/dev/null \
            | sed 's/"autoUpdateChannel" *: *"//;s/"//' || true)
        if [ -n "$saved" ]; then
            echo "$saved"
            return
        fi
    fi

    echo "stable"
}

CHANNEL=$(resolve_channel)

# --- Detect platform ---
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        *)
            echo "Error: Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)  arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        *)
            echo "Error: Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    echo "${os}_${arch}"
}

# --- Resolve version ---
resolve_version() {
    if [ -n "$VERSION" ]; then
        echo "$VERSION"
        return
    fi

    echo "Resolving latest version (channel: $CHANNEL)..." >&2

    local latest api_response http_code

    api_response=$(curl -sSL -w '\n%{http_code}' "${GITHUB_API}/repos/${REPO}/releases" 2>/dev/null)
    http_code=$(echo "$api_response" | tail -1)
    api_response=$(echo "$api_response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        if [ "$CHANNEL" = "unstable" ]; then
            # Unstable channel: pick the latest nightly pre-release
            latest=$(echo "$api_response" \
                | grep -o '"tag_name": *"[^"]*"' \
                | head -20 \
                | sed 's/"tag_name": *"//;s/"//' \
                | grep -E 'nightly' \
                | head -1)
        else
            # Stable channel: pick the latest stable (non-prerelease) tag
            latest=$(echo "$api_response" \
                | grep -o '"tag_name": *"[^"]*"' \
                | head -20 \
                | sed 's/"tag_name": *"//;s/"//' \
                | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
                | head -1)
        fi
    fi

    # Fall back to /releases/latest endpoint (stable only, GitHub excludes prereleases)
    if [ -z "$latest" ] && [ "$CHANNEL" != "unstable" ]; then
        api_response=$(curl -sSL -w '\n%{http_code}' "${GITHUB_API}/repos/${REPO}/releases/latest" 2>/dev/null)
        http_code=$(echo "$api_response" | tail -1)
        api_response=$(echo "$api_response" | sed '$d')

        if [ "$http_code" = "200" ]; then
            latest=$(echo "$api_response" \
                | grep -o '"tag_name": *"[^"]*"' \
                | sed 's/"tag_name": *"//;s/"//')
        fi
    fi

    # Fall back to git tags if API is unavailable (rate-limited, network issues)
    if [ -z "$latest" ]; then
        echo "  API unavailable (HTTP $http_code), trying git ls-remote..." >&2
        if [ "$CHANNEL" = "unstable" ]; then
            latest=$(git ls-remote --tags --sort=-v:refname "https://github.com/${REPO}.git" 'v*nightly*' 2>/dev/null \
                | grep -o 'refs/tags/v[^ ]*' \
                | head -1 \
                | sed 's|refs/tags/||')
        else
            latest=$(git ls-remote --tags --sort=-v:refname "https://github.com/${REPO}.git" 'v*' 2>/dev/null \
                | grep -o 'refs/tags/v[0-9]*\.[0-9]*\.[0-9]*$' \
                | head -1 \
                | sed 's|refs/tags/||')
        fi
    fi

    if [ -z "$latest" ]; then
        echo "Error: Could not determine latest version." >&2
        echo "  This may be due to GitHub API rate limiting for unauthenticated requests." >&2
        echo "  Try specifying a version manually:" >&2
        echo "    curl -sSL https://raw.githubusercontent.com/${REPO}/main/start.sh | bash -s -- --version v0.3.14" >&2
        exit 1
    fi

    echo "$latest"
}

# --- Download and extract ---
# Downloads to a temp file then atomically moves into place to prevent
# partial writes from corrupting a running binary.
download_binary() {
    local name="$1" version="$2" platform="$3"
    local url="https://github.com/${REPO}/releases/download/${version}/${name}_${version#v}_${platform}.tar.gz"
    local tmp_extract_dir
    tmp_extract_dir=$(mktemp -d)

    echo "  Downloading ${name} ${version} (${platform})..."
    if ! curl -sSL --fail -o "/tmp/${name}.tar.gz" "$url" 2>/dev/null; then
        echo "  Warning: Failed to download ${name} from ${url}"
        rm -rf "$tmp_extract_dir"
        return 1
    fi

    # Extract to a temporary directory first
    tar xzf "/tmp/${name}.tar.gz" -C "$tmp_extract_dir"
    rm -f "/tmp/${name}.tar.gz"

    # Move the binary into the install directory
    chmod +x "$tmp_extract_dir/${name}" 2>/dev/null || true
    mv -f "$tmp_extract_dir/${name}" "$INSTALL_DIR/${name}"

    # Move web/dist/ if present (console tarball includes the built frontend)
    if [ -d "$tmp_extract_dir/web/dist" ]; then
        rm -rf "$INSTALL_DIR/web/dist"
        mkdir -p "$INSTALL_DIR/web"
        mv -f "$tmp_extract_dir/web/dist" "$INSTALL_DIR/web/dist"
    fi

    rm -rf "$tmp_extract_dir"
    return 0
}

# --- Open browser ---
open_browser() {
    local url="$1"
    if command -v open &>/dev/null; then
        open "$url"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$url"
    else
        echo "  Open your browser to: $url"
    fi
}

# --- Main ---
echo "=== KubeStellar Console — Up in Under a Minute ==="
echo ""

# Check prerequisites
if ! command -v curl &>/dev/null; then
    echo "Error: curl is required but not found."
    exit 1
fi

PLATFORM=$(detect_platform)
VERSION=$(resolve_version)

echo "  Version:  $VERSION"
echo "  Channel:  $CHANNEL"
echo "  Platform: $PLATFORM"
echo "  Directory: $INSTALL_DIR"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download binaries
echo "Downloading binaries..."
download_binary "console" "$VERSION" "$PLATFORM"

# kc-agent is optional — it bridges the browser to local kubeconfig
if ! download_binary "kc-agent" "$VERSION" "$PLATFORM"; then
    echo "  (kc-agent is optional — local cluster features will be limited)"
fi

# Kill any existing console instance on the console port.
# Only kill processes that look like they belong to this project to avoid
# disrupting unrelated services (e.g., a database on the same port).
EXISTING_PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$EXISTING_PIDS" ]; then
    for epid in $EXISTING_PIDS; do
        ECMD=$(ps -p "$epid" -o args= 2>/dev/null || true)
        if echo "$ECMD" | grep -q "console" \
           || echo "$ECMD" | grep -q "kubestellar"; then
            echo "Stopping stale console process on port $PORT (PID: $epid)..."
            kill -TERM "$epid" 2>/dev/null || true
        else
            echo "Warning: Port $PORT is in use by an unrelated process (PID $epid: ${ECMD:-unknown}). Skipping."
        fi
    done
    # Wait for graceful shutdown then force-kill any remaining project processes
    sleep 2
    for epid in $EXISTING_PIDS; do
        if kill -0 "$epid" 2>/dev/null; then
            ECMD=$(ps -p "$epid" -o args= 2>/dev/null || true)
            if echo "$ECMD" | grep -q "console" \
               || echo "$ECMD" | grep -q "kubestellar"; then
                echo "Force-killing stale process on port $PORT (PID: $epid)..."
                kill -9 "$epid" 2>/dev/null || true
            fi
        fi
    done
fi

# Verify the port is free before starting
REMAINING_PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$REMAINING_PID" ]; then
    echo "Error: Port $PORT is still in use after cleanup."
    for rpid in $REMAINING_PID; do
        RCMD=$(ps -p "$rpid" -o args= 2>/dev/null || true)
        echo "  PID $rpid: ${RCMD:-unknown}"
    done
    echo "Manually stop the process(es) above, then try again:"
    echo "  kill $REMAINING_PID"
    exit 1
fi
# Note: kc-agent on port 8585 is managed via PID file — not force-killed here

# Load .env file if it exists
if [ -f "$INSTALL_DIR/.env" ]; then
    echo "Loading .env file..."
    while IFS='=' read -r key value; do
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < "$INSTALL_DIR/.env"
elif [ -f ".env" ]; then
    echo "Loading .env file..."
    while IFS='=' read -r key value; do
        [[ $key =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key=$value"
    done < ".env"
fi

# Warn when GitHub OAuth credentials are not configured
if [ -z "$GITHUB_CLIENT_ID" ] || [ -z "$GITHUB_CLIENT_SECRET" ]; then
    echo ""
    echo "Note: No GitHub OAuth credentials found in .env."
    echo "  You can set up GitHub sign-in from the login page (one-click setup)"
    echo "  or add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env manually."
    echo ""
fi

# Cleanup on exit — console stops, kc-agent keeps running as a background service
CONSOLE_PID=""
cleanup() {
    echo ""
    echo "Shutting down console..."
    [ -n "$CONSOLE_PID" ] && kill "$CONSOLE_PID" 2>/dev/null || true
    if [ -f "$INSTALL_DIR/kc-agent.pid" ] && kill -0 "$(cat "$INSTALL_DIR/kc-agent.pid")" 2>/dev/null; then
        echo "  kc-agent continues running in the background (PID file: $INSTALL_DIR/kc-agent.pid)"
        echo "  To stop it: kill \$(cat $INSTALL_DIR/kc-agent.pid)"
    else
        echo "  kc-agent has stopped."
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start kc-agent as a background daemon (survives console/script exit)
AGENT_PORT=8585
if [ -x "$INSTALL_DIR/kc-agent" ]; then
    AGENT_PID_FILE="$INSTALL_DIR/kc-agent.pid"
    AGENT_LOG_FILE="$INSTALL_DIR/kc-agent.log"

    # Check if kc-agent is already running — restart it with the new binary
    if [ -f "$AGENT_PID_FILE" ]; then
        EXISTING_AGENT_PID=$(cat "$AGENT_PID_FILE")
        if kill -0 "$EXISTING_AGENT_PID" 2>/dev/null; then
            echo "Restarting kc-agent (PID: $EXISTING_AGENT_PID) with updated binary..."
            kill -TERM "$EXISTING_AGENT_PID" 2>/dev/null || true
            sleep 2
            # Fall back to SIGKILL if process did not exit gracefully
            kill -9 "$EXISTING_AGENT_PID" 2>/dev/null || true
            rm -f "$AGENT_PID_FILE"
        else
            echo "Stale PID file found, removing..."
            rm -f "$AGENT_PID_FILE"
        fi
    fi

    # Start kc-agent if not already running
    if [ ! -f "$AGENT_PID_FILE" ]; then
        echo "Starting kc-agent as background daemon..."
        nohup "$INSTALL_DIR/kc-agent" >> "$AGENT_LOG_FILE" 2>&1 &
        echo $! > "$AGENT_PID_FILE"
        sleep 1

        # Verify it started
        if kill -0 "$(cat "$AGENT_PID_FILE")" 2>/dev/null; then
            echo "  kc-agent started (PID: $(cat "$AGENT_PID_FILE"), log: $AGENT_LOG_FILE)"
            # Warn if Claude Code is running — it needs to be restarted to pick up MCP server changes
            if pgrep -f "claude" > /dev/null 2>&1 && [ -f "$HOME/.claude/claude_desktop_config.json" ]; then
                echo ""
                echo "  ⚠️  Claude Code is running in another session."
                echo "     If MCP servers appear as 'failed' in Claude Code, restart Claude Code"
                echo "     to pick up the new kubestellar-ops and kubestellar-deploy servers."
                echo ""
            fi
        else
            echo "  Warning: kc-agent failed to start. Check $AGENT_LOG_FILE for details."
            rm -f "$AGENT_PID_FILE"
        fi
    fi
fi

# Check for MCP tool binaries (kubestellar-ops, kubestellar-deploy)
# These are optional but required for full MCP integration
MCP_OPS_PATH="${KUBESTELLAR_OPS_PATH:-kubestellar-ops}"
MCP_DEPLOY_PATH="${KUBESTELLAR_DEPLOY_PATH:-kubestellar-deploy}"
MCP_MISSING=""

if ! command -v "$MCP_OPS_PATH" &>/dev/null; then
    MCP_MISSING="kubestellar-ops"
fi
if ! command -v "$MCP_DEPLOY_PATH" &>/dev/null; then
    if [ -n "$MCP_MISSING" ]; then
        MCP_MISSING="$MCP_MISSING and kubestellar-deploy"
    else
        MCP_MISSING="kubestellar-deploy"
    fi
fi

if [ -n "$MCP_MISSING" ]; then
    echo ""
    echo "  Note: $MCP_MISSING not found on PATH."
    echo "  MCP tools (Kubernetes ops and deploy) will be unavailable."
    echo ""
    echo "  Quick install via Homebrew:"
    echo "    brew install kubestellar/tap/kubestellar-ops kubestellar/tap/kubestellar-deploy"
    echo ""
    echo "  Or follow the full Quick Start guide:"
    echo "    https://kubestellar.io/docs/console/overview/quick-start#step-1-install-kubestellar-mcp-tools"
    echo ""
fi

# Generate JWT_SECRET if not set (required in production mode)
if [ -z "$JWT_SECRET" ]; then
    if command -v openssl &>/dev/null; then
        export JWT_SECRET=$(openssl rand -hex 32)
    else
        export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    fi
fi

# Start console (serves frontend from web/dist at the specified port)
echo "Starting console on port $PORT..."
cd "$INSTALL_DIR"
./console --port "$PORT" &
CONSOLE_PID=$!

# Wait for console to be ready
echo ""
echo "Waiting for console to start..."
MAX_WAIT=60
WAITED=0
CONSOLE_READY=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Any response that proves Fiber is up and routing is sufficient:
    # - 200 from dev mode SPA (web/dist/index.html)
    # - 301/302 → /login when OAuth is enabled
    # - 401/403 if middleware rejects without redirect
    # Note: 404 is NOT accepted — the warmup phase may start a temporary
    # listener that returns 404 for / before Fiber is fully ready.
    # 000 (connection refused/error) or 5xx also mean not ready.
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/" 2>/dev/null || echo "000")
    case "$HTTP_CODE" in
        200|301|302|401|403)
            CONSOLE_READY=1
            break
            ;;
    esac
    sleep 2
    WAITED=$((WAITED + 2))
    printf "  %ds..." "$WAITED"
done
echo ""

if [ "$CONSOLE_READY" = "1" ]; then
    echo ""
    echo "=== KubeStellar Console is running ==="
    echo ""
    echo "  Console:  http://localhost:${PORT}"
    if [ -f "$INSTALL_DIR/kc-agent.pid" ] && kill -0 "$(cat "$INSTALL_DIR/kc-agent.pid")" 2>/dev/null; then
        echo "  kc-agent: http://localhost:${AGENT_PORT} (PID: $(cat "$INSTALL_DIR/kc-agent.pid"))"
    fi
    echo ""
    open_browser "http://localhost:${PORT}"
    echo "Press Ctrl+C to stop the console (kc-agent continues in background)"
    echo ""
    wait
else
    echo ""
    echo "Warning: Console did not respond within ${MAX_WAIT}s"
    echo "Check if it's still starting: curl http://localhost:${PORT}"
    echo ""
    wait
fi
