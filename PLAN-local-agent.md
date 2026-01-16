# KKC Local Agent - Implementation Plan

## Overview

Build a local agent that runs on the user's laptop to bridge the cluster-hosted Console UI with local resources (kubeconfig, Claude Code).

## Architecture

```
┌─────────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│  Cluster Console        │ ←──  │  Browser            │ ←──  │  kkc-agent          │
│  (UI + GitHub Auth)     │      │  (WebSocket bridge) │      │  (localhost:8585)   │
│  - Dashboard UI         │      │                     │      │  - kubeconfig proxy │
│  - User session/JWT     │      │                     │      │  - claude-code proxy│
│  - Demo mode fallback   │      │                     │      │  - local data       │
└─────────────────────────┘      └─────────────────────┘      └─────────────────────┘
```

## Components

### 1. Local Agent (`cmd/kkc-agent/`)
- **Language**: Go
- **Distribution**: brew, binary releases
- **Port**: 8585 (configurable)
- **Features**:
  - WebSocket server for browser connections
  - Kubeconfig discovery and multi-cluster support
  - Claude Code process management / API proxy
  - Health endpoint for browser detection
  - Auto-discovery of Claude Code installation

### 2. Browser Client (`web/src/lib/local-agent.ts`)
- **Features**:
  - Auto-detect local agent on localhost:8585
  - WebSocket connection management
  - Fallback to cluster API when agent unavailable
  - Connection status indicator in UI

### 3. Protocol (`pkg/agent/protocol/`)
- **Message Types**:
  - `kubectl` - Execute kubectl commands
  - `clusters` - List available kubeconfig contexts
  - `claude` - Proxy to Claude Code
  - `health` - Agent health check

## Implementation Phases

### Phase 1: Basic Agent Infrastructure
- [ ] Create `cmd/kkc-agent/main.go`
- [ ] WebSocket server setup
- [ ] Health endpoint
- [ ] Browser detection logic in frontend

### Phase 2: Kubeconfig Integration
- [ ] Kubeconfig discovery
- [ ] Multi-context support
- [ ] kubectl command proxy
- [ ] Cluster list API

### Phase 3: Claude Code Integration
- [ ] Detect Claude Code installation
- [ ] Process management (start/connect)
- [ ] Message proxy to Claude
- [ ] Response streaming

### Phase 4: Distribution
- [ ] Homebrew formula
- [ ] Binary releases (goreleaser)
- [ ] Installation docs

## File Structure

```
console/
├── cmd/
│   ├── console/          # Existing server
│   └── kkc-agent/        # NEW: Local agent
│       └── main.go
├── pkg/
│   ├── agent/            # NEW: Agent package
│   │   ├── server.go     # WebSocket server
│   │   ├── kubectl.go    # Kubectl proxy
│   │   ├── claude.go     # Claude Code integration
│   │   └── protocol/     # Message protocol
│   └── ...
├── web/
│   └── src/
│       └── lib/
│           └── local-agent.ts  # NEW: Browser client
└── Formula/
    └── kkc-agent.rb      # NEW: Homebrew formula
```

## Security Considerations

- Agent only listens on localhost (127.0.0.1)
- No authentication needed (local trust)
- Browser same-origin policy provides isolation
- User's credentials never leave their machine

## Coordination Notes

This work can be split:
- **Agent Backend** (Go): WebSocket server, kubectl proxy, Claude integration
- **Frontend** (TypeScript): Agent detection, WebSocket client, UI indicators

---

**Status**: Planning
**Owner**: TBD
**PR**: TBD
