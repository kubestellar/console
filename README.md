# KubeStellar Console (ksc)

A proactive, AI-powered multi-cluster Kubernetes dashboard that adapts to how you work.

**Your clusters, your way - AI that learns how you work**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      KubeStellar Console (ksc)                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Cluster     │ │ App Status  │ │ Event       │ │ Deployment  │  ← Cards  │
│  │ Health      │ │ (3 clusters)│ │ Stream      │ │ Progress    │    auto-  │
│  │ ████████░░  │ │ ✅ ✅ ⚠️    │ │ [live...]   │ │ [████░░░░]  │    swap   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## What is KubeStellar Console?

KubeStellar Console (ksc) is a web-based dashboard for managing multiple Kubernetes clusters. Unlike traditional dashboards that show static views, ksc uses AI to observe how you work and automatically restructures itself to surface the most relevant information.

### Key Features

- **Multi-cluster Overview**: See all your clusters in one place - OpenShift, GKE, EKS, kind, or any Kubernetes distribution
- **Personalized Dashboard**: Answer a few questions during onboarding, and Console creates a dashboard tailored to your role
- **Proactive AI**: AI analyzes your behavior patterns and suggests card swaps when your focus changes
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

Console uses the `kubestellar-ops` and `kubestellar-deploy` MCP servers to fetch data from your clusters. This means it works with any clusters in your kubeconfig.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Browser                                    │
│                          React + Vite SPA                                    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ WebSocket + REST
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      KubeStellar Console Backend                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Auth       │  │   Dashboard  │  │   Claude     │  │   Events     │    │
│  │   Service    │  │   Service    │  │   Service    │  │   Stream     │    │
│  │  (GitHub SSO)│  │  (REST API)  │  │  (Proactive) │  │  (WebSocket) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MCP Bridge Layer                             │   │
│  │    Wraps kubestellar-ops and kubestellar-deploy MCP servers as HTTP/WS APIs   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Clusters                                  │
│    [vllm-d]     [local-kind]     [prod-east]     [prod-west]    ...        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## KSC Agent (Local Agent)

The **ksc-agent** is a local agent that runs on your machine and bridges the browser-based console to your local kubeconfig and Claude Code CLI. This allows the hosted console to access your clusters without exposing your kubeconfig over the internet.

### Installation

```bash
brew tap kubestellar/tap
brew install --head ksc-agent
```

### Running the Agent

```bash
# Start the agent (runs on localhost:8585)
ksc-agent

# Or run as a background service
brew services start kubestellar/tap/ksc-agent
```

### Configuration

The agent supports the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `KSC_ALLOWED_ORIGINS` | Comma-separated list of allowed origins for CORS | localhost only |
| `KSC_AGENT_TOKEN` | Optional shared secret for authentication | (none) |

#### Adding Custom Origins

If you're running the console on a custom domain, add it to the allowed origins:

```bash
# Single origin
KSC_ALLOWED_ORIGINS="https://my-console.example.com" ksc-agent

# Multiple origins
KSC_ALLOWED_ORIGINS="https://console1.example.com,https://console2.example.com" ksc-agent
```

#### Running as a Service with Custom Origins

To persist the configuration when running as a brew service, add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export KSC_ALLOWED_ORIGINS="https://my-console.example.com"
```

Then restart the service:

```bash
brew services restart kubestellar/tap/ksc-agent
```

### Security

The agent implements several security measures:

- **Origin Validation**: Only allows connections from configured origins (localhost by default)
- **Localhost Only**: Binds to `127.0.0.1` - not accessible from other machines
- **Optional Token Auth**: Can require a shared secret via `KSC_AGENT_TOKEN`
- **Command Allowlist**: Only permits safe kubectl commands (get, describe, logs, etc.)

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
- GitHub OAuth App (for authentication)
- [Claude Code](https://claude.ai/claude-code) CLI installed
- KubeStellar plugins from the [Claude Code Marketplace](https://marketplace.claude.ai) (source: [claude-plugins](https://github.com/kubestellar/claude-plugins)):
  - `kubestellar-ops` - Kubernetes operations tools
  - `kubestellar-deploy` - Multi-cluster deployment tools

### Quick Start

**1. Install Claude Code** (if not already installed)

Follow the installation instructions at [claude.ai/claude-code](https://claude.ai/claude-code)

**2. Install KubeStellar Plugins from Marketplace**

```bash
# Install from Claude Code Marketplace
claude plugins install kubestellar-ops
claude plugins install kubestellar-deploy
```

**3. Or Install via Homebrew** (alternative method, source: [homebrew-tap](https://github.com/kubestellar/homebrew-tap))

```bash
# Add the KubeStellar tap
brew tap kubestellar/tap

# Install KubeStellar tools
brew install kubestellar-ops kubestellar-deploy
```

### Local Development

1. **Clone the repository**

```bash
git clone https://github.com/kubestellar/console.git
cd console
```

2. **Install KubeStellar tools** (if not already installed via brew)

```bash
brew tap kubestellar/tap
brew install kubestellar-ops kubestellar-deploy
```

3. **Create a GitHub OAuth App**

Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App

- Application name: `KubeStellar Console (dev)`
- Homepage URL: `http://localhost:5174`
- Authorization callback URL: `http://localhost:8080/auth/github/callback`

4. **Configure environment variables**

Create a `.env` file in the project root:

```bash
# .env file (copy from .env.example)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
DEV_MODE=false
FRONTEND_URL=http://localhost:5174
JWT_SECRET=your-secret-key-here
DATABASE_PATH=./data/console.db
```

**Important**: The `.env` file is gitignored. Never commit credentials.

5. **Start with production mode (recommended)**

Use the `prod.sh` script for real GitHub OAuth:

```bash
./scripts/prod.sh
```

This script:
- Loads credentials from `.env`
- Builds the backend
- Starts backend and frontend together
- Exits with error if `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` are missing

6. **Or start manually**

```bash
# Start backend
go build -o console-server ./cmd/console
GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy FRONTEND_URL=http://localhost:5174 ./console-server

# Start frontend (in another terminal)
cd web
npm install
npm run dev
```

7. **Development mode (skip OAuth)**

For quick testing without GitHub OAuth:

```bash
./scripts/dev.sh
```

This uses a mock `dev-user` account.

8. **Access the console**

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

## GitHub OAuth Setup

GitHub OAuth is **required** for authentication. Follow these steps carefully:

### Creating a GitHub OAuth App

1. Go to **GitHub** → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**

2. Fill in the application details:
   - **Application name**: `KubeStellar Console` (or your preferred name)
   - **Homepage URL**: `http://localhost:5174` (for development)
   - **Authorization callback URL**: `http://localhost:8080/auth/github/callback`

3. Click **Register application**

4. Copy the **Client ID** (shown immediately)

5. Click **Generate a new client secret** and copy it immediately (you won't see it again)

### Callback URL Reference

| Environment | Homepage URL | Callback URL |
|-------------|--------------|--------------|
| Local dev | `http://localhost:5174` | `http://localhost:8080/auth/github/callback` |
| Docker | Your host URL | `http://your-host:8080/auth/github/callback` |
| Kubernetes | Your ingress URL | `https://console.your-domain.com/auth/github/callback` |
| OpenShift | Your route URL | `https://console-namespace.apps.cluster.com/auth/github/callback` |

### Using with Helm

When deploying with Helm, provide GitHub credentials via values or secrets:

```bash
# Option 1: Via --set flags
helm install kubestellar-console kubestellar/console \
  --namespace kubestellar-console \
  --set github.clientId=$GITHUB_CLIENT_ID \
  --set github.clientSecret=$GITHUB_CLIENT_SECRET

# Option 2: Via values file
cat > my-values.yaml <<EOF
github:
  clientId: "your-client-id"
  clientSecret: "your-client-secret"
EOF

helm install kubestellar-console kubestellar/console \
  --namespace kubestellar-console \
  -f my-values.yaml

# Option 3: Via existing secret
kubectl create secret generic github-oauth \
  --namespace kubestellar-console \
  --from-literal=client-id=$GITHUB_CLIENT_ID \
  --from-literal=client-secret=$GITHUB_CLIENT_SECRET

helm install kubestellar-console kubestellar/console \
  --namespace kubestellar-console \
  --set github.existingSecret=github-oauth
```

## Troubleshooting

### GitHub OAuth Issues

#### 404 Error or Blank Page on Login

**Symptom**: Clicking "Sign in with GitHub" shows a 404 or blank page.

**Cause**: The GitHub OAuth Client ID is not configured or not being read by the backend.

**Solutions**:
1. Verify environment variables are set:
   ```bash
   echo $GITHUB_CLIENT_ID  # Should show your client ID
   ```

2. Pass environment variables inline when starting:
   ```bash
   GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy ./console
   ```

3. Check the backend logs for OAuth configuration errors

#### "dev-user" Instead of GitHub Username

**Symptom**: After login, you see "dev-user" instead of your actual GitHub username.

**Cause**: `DEV_MODE=true` bypasses OAuth and uses a mock user.

**Solution**: Set `DEV_MODE=false` for real GitHub authentication:
```bash
DEV_MODE=false GITHUB_CLIENT_ID=xxx GITHUB_CLIENT_SECRET=yyy ./console
```

#### Callback URL Mismatch

**Symptom**: GitHub shows "The redirect_uri does not match" error.

**Solution**: Ensure the callback URL in your GitHub OAuth App **exactly** matches:
- Development: `http://localhost:8080/auth/github/callback`
- Production: `https://your-domain.com/auth/github/callback`

### MCP Bridge Issues

#### "MCP bridge failed to start"

**Symptom**: Log shows `MCP bridge failed to start: failed to start MCP clients`

**Cause**: `kubestellar-ops` or `kubestellar-deploy` plugins are not installed.

**Solution**:
```bash
# Option 1: Install from Claude Code Marketplace (recommended)
claude plugins install kubestellar-ops
claude plugins install kubestellar-deploy

# Option 2: Install via Homebrew
brew tap kubestellar/tap
brew install kubestellar-ops kubestellar-deploy

# Verify installation
which kubestellar-ops kubestellar-deploy
```

**Note**: The console will still function without MCP tools, but cluster data will not be available.

### Frontend Issues

#### CORS Errors

**Symptom**: Browser console shows CORS errors.

**Solution**: Ensure `FRONTEND_URL` is correctly configured in your environment:
```bash
FRONTEND_URL=http://localhost:5174 ./console
```

#### Vite Dependency Errors

**Symptom**: "Failed to resolve import" or "Outdated Optimize Dep"

**Solution**:
```bash
cd web
rm -rf node_modules/.vite
npm run dev
```

### Getting Help

- Check the [GitHub Issues](https://github.com/kubestellar/console/issues) for known problems
- Join the [KubeStellar Slack](https://kubestellar.io/community) for community support

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

- [console](https://github.com/kubestellar/console) - AI-powered kubectl plugins (MCP servers)
- [claude-plugins](https://github.com/kubestellar/claude-plugins) - Claude Code marketplace plugins for Kubernetes
- [homebrew-tap](https://github.com/kubestellar/homebrew-tap) - Homebrew formulae for KubeStellar tools
- [KubeStellar](https://kubestellar.io) - Multi-cluster configuration management
- [KubeFlex](https://github.com/kubestellar/kubeflex) - Lightweight Kubernetes control planes
