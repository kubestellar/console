# Contributing to KubeStellar Console

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Prerequisites

- Go 1.24+
- Node.js 20+
- A kubeconfig with at least one cluster (optional - demo mode works without clusters)

### Clone and Start (No OAuth)

```bash
git clone https://github.com/kubestellar/console.git
cd console
./start-dev.sh
```

This starts:
- **Backend** on `http://localhost:8080` (Go)
- **Frontend** on `http://localhost:5174` (Vite + React)
- Uses a mock `dev-user` account - no GitHub login required

### Clone and Start (With GitHub OAuth)

1. Create a [GitHub OAuth App](https://github.com/settings/developers):
   - **Application name**: `KubeStellar Console (dev)`
   - **Homepage URL**: `http://localhost:5174`
   - **Authorization callback URL**: `http://localhost:8080/auth/github/callback`

2. Copy the Client ID and generate a Client Secret, then create a `.env` file in the project root:

   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

3. Start with OAuth:

   ```bash
   ./startup-oauth.sh
   ```

   This starts the backend with OAuth enabled and opens the console at `http://localhost:5174`. You'll be prompted to log in with GitHub.

### Frontend Only

If you're only working on the frontend:

```bash
cd web
npm install
npm run dev
```

The frontend runs on `http://localhost:5174` and connects to the backend at `http://localhost:8080`.

## Project Structure

```
console/
  pkg/              # Go backend
    api/            # HTTP handlers and routes
    models/         # Data models
    store/          # SQLite persistence
  web/              # React frontend
    src/
      components/   # UI components
        cards/      # Dashboard cards
        layout/     # Navbar, sidebar, layout
        setup/      # Setup dialogs
      hooks/        # React hooks (data fetching, state)
      lib/          # Utilities, card registry, demo data
      locales/      # i18n translations
  start-dev.sh      # Start without OAuth
  startup-oauth.sh  # Start with OAuth
```

## Making Changes

### Branch Naming

Use descriptive branch names with a prefix:
- `fix/` - bug fixes
- `feature/` - new features
- `docs/` - documentation changes

### Adding a New Dashboard Card

1. Create your card component in `web/src/components/cards/YourCard.tsx`
2. Create a data hook in `web/src/hooks/useYourData.ts`
3. Register the card in `web/src/lib/cardRegistry.ts`
4. Add demo data in `web/src/lib/unified/demo/`

See the [console-marketplace](https://github.com/kubestellar/console-marketplace) repo for examples and card templates.

### Commit Messages

- Start with an emoji prefix: `✨` feature | `🐛` bug fix | `📖` docs | `⚠️` breaking | `🌱` other
- Sign all commits with DCO: `git commit -s`
- Keep messages concise and focused on the "why"

### Pull Requests

- Keep PRs focused - one feature or fix per PR
- Include a description of what changed and why
- Add screenshots for UI changes
- PRs require passing build and lint checks

## Building and Testing

```bash
# Build frontend
cd web && npm run build

# Lint frontend
cd web && npm run lint

# Run Go backend tests
go test ./...
```

## Code Style

- **TypeScript/React**: Follow existing patterns in the codebase. Use functional components with hooks.
- **Go**: Standard Go formatting (`gofmt`). Use meaningful variable names.
- **CSS**: Tailwind CSS utility classes. Follow the existing color scheme and spacing conventions.

## Getting Help

- [Documentation](https://console-docs.kubestellar.io)
- [Slack - #kubestellar-dev](https://cloud-native.slack.com/archives/C097094RZ3M)
- [GitHub Issues](https://github.com/kubestellar/console/issues)
