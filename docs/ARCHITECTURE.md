# Architecture

This document describes the high-level architecture of KubeStellar Console.

## Overview

KubeStellar Console is an AI-powered multi-cluster Kubernetes dashboard. It consists of a Go backend, a React frontend, and a local agent (`kc-agent`) that bridges browser-based and CLI-based tools to Kubernetes clusters.

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React Frontend (Vite/TypeScript)             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │Dashboard │ │Missions  │ │Marketplace│ │ AI Chat    │  │  │
│  │  │Cards     │ │(Guided   │ │(CNCF     │ │ (MCP       │  │  │
│  │  │          │ │ Install) │ │ Projects)│ │  Bridge)   │  │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │  │
│  └───────┼─────────────┼───────────┼──────────────┼──────────┘  │
│          │ REST/WS     │           │              │              │
└──────────┼─────────────┼───────────┼──────────────┼──────────────┘
           │             │           │              │
┌──────────┼─────────────┼───────────┼──────────────┼──────────────┐
│          ▼             ▼           ▼              ▼              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                Go Backend (Fiber)                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │REST API  │ │WebSocket │ │OAuth/JWT │ │ Store      │  │  │
│  │  │Handlers  │ │Server    │ │Auth      │ │ (SQLite)   │  │  │
│  │  └────┬─────┘ └────┬─────┘ └──────────┘ └────────────┘  │  │
│  └───────┼─────────────┼────────────────────────────────────┘  │
│          │             │                                        │
│  ┌───────▼─────────────▼────────────────────────────────────┐  │
│  │              kc-agent (Local Agent)                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐ │  │
│  │  │Kubeconfig│ │MCP       │ │Coding Agent Bridge       │ │  │
│  │  │Discovery │ │Servers   │ │(Codex, Copilot, Claude)  │ │  │
│  │  └────┬─────┘ └────┬─────┘ └──────────────────────────┘ │  │
│  └───────┼─────────────┼────────────────────────────────────┘  │
│          │             │                                        │
│          ▼             ▼                                        │
│  ┌──────────────┐ ┌──────────────────┐                         │
│  │ Kubernetes   │ │ MCP Servers       │                         │
│  │ Clusters     │ │ (kubestellar-ops, │                         │
│  │ (via         │ │  kubestellar-     │                         │
│  │  kubeconfig) │ │  deploy)          │                         │
│  └──────────────┘ └──────────────────┘                         │
│                       Host Machine                              │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Frontend (`web/`)

- **Framework**: React 18 with TypeScript, built with Vite
- **UI**: Tailwind CSS with a card-based adaptive dashboard
- **State**: React hooks with cached data hooks (`useCached*`) for cluster resources
- **Real-time**: WebSocket client for live event streaming from clusters
- **Testing**: Vitest (unit), Playwright (E2E, accessibility, visual regression)

The dashboard is composed of modular **cards** registered in a card registry (`web/src/cards/`). Each card is a self-contained React component that fetches and displays specific cluster data. The AI system tracks user interactions and suggests card layout changes based on observed usage patterns.

### Backend (`cmd/console/`, `pkg/`)

- **Framework**: [Fiber](https://gofiber.io/) (Go HTTP framework)
- **Authentication**: GitHub OAuth 2.0 with JWT session tokens
- **Storage**: SQLite via the `pkg/store` package for user preferences, onboarding state, and settings
- **API**: RESTful endpoints under `/api/` for cluster data, missions, marketplace, settings
- **WebSocket**: Real-time event push for cluster state changes, mission progress, and alerts
- **Metrics**: Prometheus `/metrics` endpoint for operational monitoring (served by `kc-agent`)

The backend serves the built frontend as static assets on port 8080 and proxies Kubernetes API requests through the user's kubeconfig.

### kc-agent (`cmd/kc-agent/`)

A lightweight local agent that runs on the user's machine and:

1. **Discovers kubeconfigs** — Finds all Kubernetes contexts available locally
2. **Bridges to MCP servers** — Connects AI chat features to `kubestellar-ops` and `kubestellar-deploy` MCP servers for cluster querying
3. **Connects to hosted Console** — Links local clusters to [console.kubestellar.io](https://console.kubestellar.io) via secure WebSocket tunnel
4. **Bridges coding agents** — Provides Codex, GitHub Copilot, and Claude Code with cluster context

### MCP Bridge (`pkg/mcp/`)

The [Model Context Protocol](https://modelcontextprotocol.io/) integration allows AI providers (Claude, OpenAI, Gemini) to query live cluster state through structured tool calls. The bridge translates natural language questions into MCP tool invocations against `kubestellar-ops` (read operations) and `kubestellar-deploy` (write operations).

## Data Flow

### Cluster Data

```
User browses dashboard
  → Frontend requests data via REST API
    → Backend reads kubeconfig contexts
      → kc-agent forwards to Kubernetes API
        → Response cached and rendered as dashboard cards
          → WebSocket pushes real-time updates
```

### Guided Install Missions

```
User starts a mission
  → Frontend loads mission definition from console-kb
    → Pre-flight checks run against target cluster
      → Each step executes kubectl/helm commands via backend
        → Validation confirms resources are healthy
          → Rollback available if any step fails
```

### AI Chat

```
User asks a question in AI chat
  → Frontend sends to backend AI endpoint
    → Backend routes to configured AI provider (Claude/OpenAI/Gemini)
      → AI provider calls MCP tools for cluster context
        → MCP bridge queries kubestellar-ops/kubestellar-deploy
          → Response with cluster-aware answer rendered in chat
```

## Deployment Modes

| Mode | Command | Port | Use Case |
|------|---------|------|----------|
| **Local** | `./start.sh` | 8080 | Development and personal use |
| **OAuth** | `./startup-oauth.sh` | 8080 | Local with GitHub authentication |
| **Container** | `docker run ghcr.io/kubestellar/console` | 8080 | Containerized deployment |
| **Kubernetes** | `./deploy.sh` | Ingress | In-cluster deployment |
| **Helm** | `helm install` from `deploy/helm/` | Ingress | Production Kubernetes deployment |
| **Hosted** | [console.kubestellar.io](https://console.kubestellar.io) | 443 | SaaS with kc-agent for cluster access |

## Security Architecture

- **Authentication**: GitHub OAuth 2.0 flow with JWT tokens. No passwords stored.
- **Authorization**: JWT-based session validation. Kubernetes RBAC inherited from kubeconfig.
- **Secrets**: All secrets loaded from environment variables or `.env` files (gitignored). No secrets in source code.
- **Transport**: HTTPS in production (Netlify/Ingress TLS termination). WebSocket connections authenticated via JWT.
- **Scanning**: Automated CodeQL (Go + TypeScript), gosec, nilaway, container scanning, secret scanning, and dependency audits via CI/CD.
- **Supply chain**: Dependabot for automated dependency updates. OpenSSF Scorecard monitoring.

## Directory Structure

```
├── cmd/
│   ├── console/       # Backend entry point
│   └── kc-agent/      # Local agent entry point
├── pkg/
│   ├── api/           # REST API handlers
│   ├── k8s/           # Kubernetes client wrappers
│   ├── mcp/           # MCP bridge for AI providers
│   ├── store/         # SQLite storage layer
│   ├── agent/         # kc-agent connection management
│   └── models/        # Shared data models
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── cards/       # Dashboard card components
│   │   │   └── dashboard/   # Dashboard layout and modals
│   │   ├── config/
│   │   │   └── cards/       # Card configs (category, columns, filters)
│   │   ├── contexts/        # React context providers
│   │   ├── hooks/           # React hooks (useCached*, useCardLoadingState)
│   │   ├── lib/             # Shared utilities and unified card framework
│   │   ├── locales/         # i18n translation files
│   │   ├── pages/           # Route pages (dashboard, missions, marketplace)
│   │   └── types/           # TypeScript type definitions
│   └── e2e/                 # Playwright end-to-end tests
├── deploy/
│   ├── helm/          # Helm chart
│   └── deploy.sh      # Kubernetes deployment script
├── scripts/           # CI/CD and testing scripts
└── docs/              # Project documentation
```

## Card Configuration

Each dashboard card is registered in `CARD_CONFIGS` (`web/src/config/cards/index.ts`).
Card configs specify a `category` field (e.g., `'security'`, `'insights'`, `'ci-cd'`,
`'network'`) used for browse/filter in the Add Card dialog. The card component itself
lives in `web/src/components/cards/` and is registered in `cardRegistry.ts`.
