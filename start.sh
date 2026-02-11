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
#   --version, -v <tag>   Specific version to download (default: latest stable)
#   --dir, -d <path>      Install directory (default: ./kubestellar-console)
#   --port, -p <port>     Console port (default: 8080)
#
# To enable GitHub OAuth login, create a .env file:
#   GITHUB_CLIENT_ID=your-client-id
#   GITHUB_CLIENT_SECRET=your-client-secret
#   FRONTEND_URL=http://localhost:8080

set -e

# --- Defaults ---
INSTALL_DIR="./kubestellar-console"
VERSION=""
PORT=8080
REPO="kubestellar/console"
GITHUB_API="https://api.github.com"

# --- Parse args ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --version|-v) VERSION="$2"; shift 2 ;;
        --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
        --port|-p) PORT="$2"; shift 2 ;;
        *) shift ;;
    esac
done

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

    echo "Resolving latest version..." >&2

    # Try to get latest stable release (non-prerelease)
    local latest
    latest=$(curl -sSL "${GITHUB_API}/repos/${REPO}/releases" \
        | grep -o '"tag_name": *"[^"]*"' \
        | head -20 \
        | sed 's/"tag_name": *"//;s/"//' \
        | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
        | head -1)

    # Fall back to latest release (including prereleases)
    if [ -z "$latest" ]; then
        latest=$(curl -sSL "${GITHUB_API}/repos/${REPO}/releases/latest" \
            | grep -o '"tag_name": *"[^"]*"' \
            | sed 's/"tag_name": *"//;s/"//')
    fi

    if [ -z "$latest" ]; then
        echo "Error: Could not determine latest version" >&2
        exit 1
    fi

    echo "$latest"
}

# --- Download and extract ---
download_binary() {
    local name="$1" version="$2" platform="$3"
    local url="https://github.com/${REPO}/releases/download/${version}/${name}_${version#v}_${platform}.tar.gz"

    echo "  Downloading ${name} ${version} (${platform})..."
    if ! curl -sSL --fail -o "/tmp/${name}.tar.gz" "$url" 2>/dev/null; then
        echo "  Warning: Failed to download ${name} from ${url}"
        return 1
    fi

    tar xzf "/tmp/${name}.tar.gz" -C "$INSTALL_DIR"
    rm -f "/tmp/${name}.tar.gz"
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

# Make binaries executable
chmod +x "$INSTALL_DIR/console" 2>/dev/null || true
chmod +x "$INSTALL_DIR/kc-agent" 2>/dev/null || true

# Kill any existing instances on required ports
for p in $PORT 8585; do
    EXISTING_PID=$(lsof -ti :"$p" 2>/dev/null || true)
    if [ -n "$EXISTING_PID" ]; then
        echo "Killing existing process on port $p (PID: $EXISTING_PID)..."
        kill -9 "$EXISTING_PID" 2>/dev/null || true
        sleep 1
    fi
done

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

# Cleanup on exit
CONSOLE_PID=""
AGENT_PID=""
cleanup() {
    echo ""
    echo "Shutting down..."
    [ -n "$CONSOLE_PID" ] && kill "$CONSOLE_PID" 2>/dev/null || true
    [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start kc-agent if available
if [ -x "$INSTALL_DIR/kc-agent" ]; then
    echo "Starting kc-agent..."
    "$INSTALL_DIR/kc-agent" &
    AGENT_PID=$!
    sleep 1
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
while [ $WAITED -lt $MAX_WAIT ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "  %ds..." "$WAITED"
done
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo ""
    echo "=== KubeStellar Console is running ==="
    echo ""
    echo "  URL: http://localhost:${PORT}"
    echo ""
    open_browser "http://localhost:${PORT}"
    echo "Press Ctrl+C to stop"
    echo ""
    wait
else
    echo ""
    echo "Warning: Console did not respond within ${MAX_WAIT}s"
    echo "Check if it's still starting: curl http://localhost:${PORT}"
    echo ""
    wait
fi
