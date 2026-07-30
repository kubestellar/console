# Security: Hardcoded URLs and API Configuration

## Overview

This document explains the intentionally hardcoded URLs in the KubeStellar Console codebase, confirms they are not security vulnerabilities, and describes the centralized configuration approach.

## Centralized Configuration

All external API endpoints are centralized in `/web/src/config/externalApis.ts`:

- `WEATHER_API`: Geocoding API (configurable via `VITE_GEOCODING_API_URL`)
- `AI_PROVIDER_DOCS`: Documentation links for API key management (hardcoded as intended)
- `K8S_DOCS`: Kubernetes and service mesh documentation URLs (hardcoded as intended)
- `KC_AGENT`: Local agent configuration

## Files with Hardcoded URLs

### 1. `web/src/config/externalApis.ts`

**Purpose**: Centralized configuration for external API endpoints and documentation URLs.

- All URLs are public resources, no credentials or authentication tokens
- Documentation links are part of the application's help system
- API endpoints can be overridden via environment variables where needed

### 2. `web/src/hooks/useArgoCD.ts`

**Purpose**: Mock data for ArgoCD visualization in demo/development mode.

- Placeholder URLs (e.g., `https://github.com/example-org/...`) for UI demonstration only
- In production, actual ArgoCD data comes from the user's ArgoCD API

### 3. `web/src/mocks/handlers.ts`

**Purpose**: Mock JWT tokens for E2E testing.

- Token: `'mock-jwt-token-for-testing-only'` — not a real JWT
- Used only in MSW (Mock Service Worker) for browser-based E2E tests

## What IS Configurable

| Variable | Purpose | Default |
|---|---|---|
| `VITE_GEOCODING_API_URL` | Geocoding API endpoint | Open-Meteo free API |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth credentials | `.env` file |
| `FEEDBACK_GITHUB_TOKEN` | GitHub PAT for feature requests | `.env` file |
| AI provider keys | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | `.env` file |

## Real Security Configuration

Actual sensitive data is managed through:
- Environment variables (`.env` file, never committed)
- GitHub Secrets (for CI/CD)
- KC Agent for API key storage (local encrypted storage)

No real credentials are ever hardcoded in the source code.

## For Security Scanners

If your security scanning tool flags URLs in this codebase:

1. **Check the file path**: Is it in `web/src/config/externalApis.ts`, `web/src/hooks/useArgoCD.ts`, or `web/src/mocks/handlers.ts`?
2. **Check the context**: Look for comments like "SECURITY: Safe", "EXAMPLE URL", "NOT A REAL TOKEN"
3. **Verify the URL type**:
   - Documentation links to kubernetes.io, github.com, etc. → Safe
   - "example-org" URLs → Demo/mock data
   - Open-Meteo API → Public, free API with no authentication

## Reporting Security Issues

If you believe you've found a security issue not covered by this document:
1. Check if the URL contains actual credentials (API keys, passwords, tokens)
2. Verify it's not in the categories listed above
3. Open a security advisory at https://github.com/kubestellar/console/security/advisories
