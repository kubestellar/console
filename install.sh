#!/bin/bash
# KubeStellar Console - Quick Start Installer
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/install.sh | bash
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/install.sh | bash -s -- --branch feature-x
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/install.sh | bash -s -- --tag v1.0.0
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/install.sh | bash -s -- --release latest
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/install.sh | bash -s -- --oauth
#
# Options:
#   --branch <name>    Clone and run from a specific branch (default: main)
#   --tag <name>       Clone and checkout a specific tag
#   --release <name>   Clone and checkout a specific release tag (e.g. v1.0.0 or "latest")
#   --oauth            Start in OAuth mode (requires .env with GitHub credentials)
#   --dir <path>       Install directory (default: ./kubestellar-console)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_URL="https://github.com/kubestellar/console.git"
BRANCH="main"
TAG=""
RELEASE=""
OAUTH_MODE=false
INSTALL_DIR="./kubestellar-console"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --branch|-b)
            BRANCH="$2"
            shift 2
            ;;
        --tag|-t)
            TAG="$2"
            shift 2
            ;;
        --release|-r)
            RELEASE="$2"
            shift 2
            ;;
        --oauth)
            OAUTH_MODE=true
            shift
            ;;
        --dir|-d)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "KubeStellar Console - Quick Start Installer"
            echo ""
            echo "Usage:"
            echo "  curl -sSL .../install.sh | bash"
            echo "  curl -sSL .../install.sh | bash -s -- [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --branch, -b <name>    Branch to clone (default: main)"
            echo "  --tag, -t <name>       Tag to checkout"
            echo "  --release, -r <name>   Release to checkout (e.g. v1.0.0 or 'latest')"
            echo "  --oauth                Start in OAuth mode (needs .env)"
            echo "  --dir, -d <path>       Install directory (default: ./kubestellar-console)"
            echo "  --help, -h             Show this help"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

echo -e "${GREEN}=== KubeStellar Console Installer ===${NC}"
echo ""

# Check prerequisites
MISSING_DEPS=()
command -v git &>/dev/null || MISSING_DEPS+=("git")
command -v go &>/dev/null || MISSING_DEPS+=("go (1.22+)")
command -v node &>/dev/null || MISSING_DEPS+=("node (20+)")
command -v npm &>/dev/null || MISSING_DEPS+=("npm")

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${RED}Missing required dependencies:${NC}"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "Please install the missing dependencies and try again."
    exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC} (git, go, node, npm)"

# Resolve release tag if --release was used
if [ -n "$RELEASE" ]; then
    if [ "$RELEASE" = "latest" ]; then
        echo -e "Fetching latest release tag..."
        if command -v gh &>/dev/null; then
            TAG=$(gh release view --repo kubestellar/console --json tagName -q .tagName 2>/dev/null || true)
        fi
        if [ -z "$TAG" ]; then
            TAG=$(git ls-remote --tags --sort=-v:refname "$REPO_URL" 'v*' 2>/dev/null | head -1 | sed 's/.*refs\/tags\///' | sed 's/\^{}//')
        fi
        if [ -z "$TAG" ]; then
            echo -e "${RED}Could not determine latest release. Using main branch.${NC}"
        else
            echo -e "Latest release: ${CYAN}${TAG}${NC}"
        fi
    else
        TAG="$RELEASE"
    fi
fi

# Clone repository
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Directory $INSTALL_DIR already exists.${NC}"
    echo -e "Pulling latest changes..."
    cd "$INSTALL_DIR"
    git fetch --all --tags --prune
    if [ -n "$TAG" ]; then
        git checkout "$TAG"
    else
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    fi
else
    echo -e "Cloning repository..."
    if [ -n "$TAG" ]; then
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        git checkout "$TAG"
    else
        git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
fi

echo -e "${GREEN}Repository ready${NC} at $(pwd)"
echo -e "  Ref: ${CYAN}$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)${NC}"
echo ""

# Install frontend dependencies
echo -e "Installing frontend dependencies..."
(cd web && npm install)
echo ""

# Install/upgrade kc-agent via brew
if command -v brew &>/dev/null; then
    if brew list kc-agent &>/dev/null; then
        echo -e "${GREEN}Upgrading kc-agent...${NC}"
        brew update --quiet && brew upgrade kc-agent 2>/dev/null || true
    else
        echo -e "${GREEN}Installing kc-agent...${NC}"
        brew update --quiet && brew install kubestellar/tap/kc-agent
    fi
else
    echo -e "${YELLOW}Homebrew not found. kc-agent will not be installed automatically.${NC}"
    echo -e "Install manually: ${CYAN}brew install kubestellar/tap/kc-agent${NC}"
fi
echo ""

# Launch the appropriate start script
if [ "$OAUTH_MODE" = true ]; then
    echo -e "${GREEN}Starting in OAuth mode...${NC}"
    exec ./startup-oauth.sh
else
    echo -e "${GREEN}Starting in dev mode...${NC}"
    exec ./start-dev.sh
fi
