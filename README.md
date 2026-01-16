# KubeStellar Klaude Console (kkc)

A proactive, AI-powered multi-cluster Kubernetes dashboard that adapts to how you work.

**Your clusters, your way - AI that learns how you work**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KubeStellar Klaude Console (kkc)                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Cluster     │ │ App Status  │ │ Event       │ │ Deployment  │  ← Cards  │
│  │ Health      │ │ (3 clusters)│ │ Stream      │ │ Progress    │    auto-  │
│  │ ████████░░  │ │ ✅ ✅ ⚠️    │ │ [live...]   │ │ [████░░░░]  │    swap   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## What is KubeStellar Klaude Console?

KubeStellar Klaude Console (kkc) is a web-based dashboard for managing multiple Kubernetes clusters. Unlike traditional dashboards that show static views, kkc uses AI to observe how you work and automatically restructures itself to surface the most relevant information.

### Key Features

- **Multi-cluster Overview**: See all your clusters in one place - OpenShift, GKE, EKS, kind, or any Kubernetes distribution
- **Personalized Dashboard**: Answer a few questions during onboarding, and Console creates a dashboard tailored to your role
- **Proactive AI**: Claude AI analyzes your behavior patterns and suggests card swaps when your focus changes
- **Real-time Updates**: WebSocket-powered live event streaming from all clusters
- **Card Swap Mechanism**: Dashboard cards auto-swap based on context, with snooze/expedite/cancel controls
- **App-Centric View**: Focus on applications, not just resources - see app health across all clusters

## How It Works

### 1. Personalized Onboarding

When you first sign in with GitHub, Console asks 5-10 questions about your role and preferences:

- What's your primary role? (SRE, DevOps, Platform Engineer, Developer...)
- Which layer do you focus on? (Infrastructure, Platform, Application...)
- Do you use GitOps?
- Do you manage GPU workloads?

Based on your answers, Console generates an initial dashboard with relevant cards.

### 2. Adaptive Dashboard

Console tracks which cards you interact with most:
- Which cards you hover over and expand
- How long you focus on different information
- What actions you take

### 3. AI-Powered Card Swaps

When Claude detects a shift in your focus, it suggests swapping dashboard cards:

```
┌─────────────────────────────────────────────────────────────────┐
│  🔄 This card will be replaced in 30s                          │
│  New: "App Deployment Status" - based on your recent focus     │
│                                                                 │
│  [Snooze 1hr] [Swap Now] [Keep This Card]                      │
└─────────────────────────────────────────────────────────────────┘
```

### 4. MCP Integration

Console uses the `klaude-ops` and `klaude-deploy` MCP servers to fetch data from your clusters. This means it works with any clusters in your kubeconfig.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Browser                                    │
│                          React + Vite SPA                                    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ WebSocket + REST
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    KubeStellar Klaude Console Backend                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Auth       │  │   Dashboard  │  │   Claude     │  │   Events     │    │
│  │   Service    │  │   Service    │  │   Service    │  │   Stream     │    │
│  │  (GitHub SSO)│  │  (REST API)  │  │  (Proactive) │  │  (WebSocket) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MCP Bridge Layer                             │   │
│  │    Wraps klaude-ops and klaude-deploy MCP servers as HTTP/WS APIs   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Clusters                                  │
│    [vllm-d]     [local-kind]     [prod-east]     [prod-west]    ...        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Available Card Types

| Card Type | Description | Data Source |
|-----------|-------------|-------------|
| Cluster Health | Availability graph per cluster | `get_cluster_health` |
| App Status | Multi-cluster app health | `get_app_status` |
| Event Stream | Live event feed | `get_events` |
| Deployment Progress | Rollout status | `get_app_status` |
| Pod Issues | CrashLoopBackOff, OOMKilled | `find_pod_issues` |
| Deployment Issues | Stuck rollouts | `find_deployment_issues` |
| Top Pods | By CPU/memory/restarts | `get_pods` |
| Resource Capacity | CPU/memory/GPU utilization | `list_cluster_capabilities` |
| GitOps Drift | Out of sync clusters | `detect_drift` |
| Security Issues | Privileged, root, host | `check_security_issues` |
| RBAC Overview | Permission summary | `get_roles` |
| Policy Violations | OPA Gatekeeper | `list_ownership_violations` |
| Upgrade Status | Cluster upgrades | `get_upgrade_status` |

## Installation

### Prerequisites

- Go 1.23+
- Node.js 20+
- Docker (for containerized deployment)
- `klaude-ops` and `klaude-deploy` installed (from [klaude](https://github.com/kubestellar/klaude))
- GitHub OAuth App (for authentication)

### Local Development

1. **Clone the repository**

```bash
git clone https://github.com/kubestellar/console.git
cd console
```

2. **Create a GitHub OAuth App**

Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

- Application name: `KubeStellar Klaude Console (dev)`
- Homepage URL: `http://localhost:5174`
- Authorization callback URL: `http://localhost:8080/auth/github/callback`

3. **Set environment variables**

```bash
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
export DEV_MODE=true
export FRONTEND_URL=http://localhost:5174
```

4. **Start the backend**

```bash
# Build and run
go build -o console ./cmd/console
./console --dev

# Or run directly
go run ./cmd/console --dev
```

5. **Start the frontend**

```bash
cd web
npm install
npm run dev
```

6. **Access the console**

Open http://localhost:5174 and sign in with GitHub.

### Docker Deployment

1. **Build the image**

```bash
docker build -t kubestellar/console:latest .
```

2. **Run the container**

```bash
docker run -d \
  -p 8080:8080 \
  -e GITHUB_CLIENT_ID=your_client_id \
  -e GITHUB_CLIENT_SECRET=your_client_secret \
  -e CLAUDE_API_KEY=your_claude_api_key \
  -v ~/.kube:/root/.kube:ro \
  kubestellar/console:latest
```

### Kubernetes Deployment (Helm)

1. **Add the Helm repository**

```bash
helm repo add kubestellar https://kubestellar.github.io/helm-charts
helm repo update
```

2. **Create a secret for credentials**

```bash
kubectl create namespace kubestellar-console

kubectl create secret generic console-secrets \
  --namespace kubestellar-console \
  --from-literal=github-client-id=your_client_id \
  --from-literal=github-client-secret=your_client_secret \
  --from-literal=claude-api-key=your_claude_api_key
```

3. **Install the chart**

```bash
helm install kubestellar-console kubestellar/console \
  --namespace kubestellar-console \
  --set ingress.enabled=true \
  --set ingress.host=console.your-domain.com
```

### OpenShift Deployment

```bash
helm install kubestellar-console kubestellar/console \
  --namespace kubestellar-console \
  --create-namespace \
  -f deploy/helm/kubestellar-console/values-openshift.yaml \
  --set github.clientId=$GITHUB_CLIENT_ID \
  --set github.clientSecret=$GITHUB_CLIENT_SECRET
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `DEV_MODE` | Enable dev mode (CORS, hot reload) | `false` |
| `DATABASE_PATH` | SQLite database path | `./data/console.db` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | (required) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | (required) |
| `JWT_SECRET` | JWT signing secret | (auto-generated) |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:5174` |
| `CLAUDE_API_KEY` | Claude API key for AI features | (optional) |

### Helm Values

See [deploy/helm/kubestellar-console/values.yaml](deploy/helm/kubestellar-console/values.yaml) for all available options.

## Development

### Project Structure

```
console/
├── cmd/console/          # Entry point
├── pkg/
│   ├── api/              # HTTP/WS server
│   │   ├── handlers/     # Request handlers
│   │   └── middleware/   # Auth, logging
│   ├── mcp/              # MCP bridge layer
│   ├── claude/           # Claude AI integration
│   ├── models/           # Data models
│   └── store/            # Database layer
├── web/                  # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   └── lib/          # Utilities
│   └── ...
└── deploy/
    ├── helm/             # Helm chart
    └── docker/           # Dockerfile
```

### Running Tests

```bash
# Backend tests
go test ./...

# Frontend tests
cd web && npm test
```

### Building for Production

```bash
# Backend
go build -o console ./cmd/console

# Frontend
cd web && npm run build
```

## Roadmap

- [ ] Phase 1: Foundation - Backend, auth, basic dashboard
- [ ] Phase 2: Core Dashboard - Card grid, real-time updates
- [ ] Phase 3: Onboarding & Personalization
- [ ] Phase 4: Claude AI Integration
- [ ] Phase 5: Polish & Deploy

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Related Projects

- [klaude](https://github.com/kubestellar/klaude) - AI-powered kubectl plugins
- [KubeStellar](https://kubestellar.io) - Multi-cluster configuration management
- [KubeFlex](https://github.com/kubestellar/kubeflex) - Lightweight Kubernetes control planes
