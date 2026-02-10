# Security Documentation: Hardcoded URLs

## Overview

This document explains the intentionally hardcoded URLs in the KubeStellar Console codebase and confirms they are not security vulnerabilities.

## Files with Hardcoded URLs

### 1. `web/src/config/externalApis.ts`

**Purpose**: Centralized configuration for external API endpoints and documentation URLs

**URLs Present**:
- Public API endpoints (Open-Meteo geocoding API) - configurable via environment variables
- Documentation links to official Kubernetes, GitHub, and AI provider sites
- Installation commands using public GitHub releases

**Security Status**: ✅ **SAFE**
- All URLs are public resources
- No credentials or authentication tokens
- Documentation links are part of the application's help system
- API endpoints can be overridden via environment variables where needed

### 2. `web/src/hooks/useArgoCD.ts`

**Purpose**: Mock data for ArgoCD application visualization in demo/development mode

**URLs Present**:
- Example GitHub repository URLs (e.g., `https://github.com/example-org/...`)

**Security Status**: ✅ **SAFE**
- These are placeholder URLs for UI demonstration only
- "example-org" organization clearly indicates these are not real repositories
- In production, actual ArgoCD data would come from the user's ArgoCD API
- Used only for local development and testing

### 3. `web/src/mocks/handlers.ts`

**Content**: Mock JWT tokens for E2E testing

**Tokens Present**:
```
token: 'mock-jwt-token-for-testing-only'
```

**Security Status**: ✅ **SAFE**
- Not a real JWT token
- Used only in MSW (Mock Service Worker) for browser-based E2E tests
- Clearly labeled as mock data in comments
- Never used in production or with real authentication systems

## Environment Variable Configuration

The application properly uses environment variables for sensitive configuration:

### Required for Production (`.env`)
- `GITHUB_CLIENT_ID` - GitHub OAuth credentials
- `GITHUB_CLIENT_SECRET` - GitHub OAuth credentials
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` - AI provider keys

### Optional Configuration
- `VITE_GEOCODING_API_URL` - Override for geocoding API endpoint
- `FEEDBACK_GITHUB_TOKEN` - GitHub PAT for feature requests

See `.env.example` for full configuration options.

## For Security Scanners

If your security scanning tool flags URLs in this codebase:

1. **Check the file path**: Is it in `web/src/config/externalApis.ts`, `web/src/hooks/useArgoCD.ts`, or `web/src/mocks/handlers.ts`?
2. **Check the context**: Look for comments like "SECURITY: Safe", "EXAMPLE URL", "NOT A REAL TOKEN"
3. **Verify the URL type**:
   - Documentation links to kubernetes.io, github.com, etc. → Safe
   - "example-org" URLs → Demo/mock data
   - Open-Meteo API → Public, free API with no authentication

## Real Security Configuration

Actual sensitive data is managed through:
- Environment variables (`.env` file, never committed)
- GitHub Secrets (for CI/CD)
- KC Agent for API key storage (local encrypted storage)

No real credentials are ever hardcoded in the source code.

## Questions?

If you believe you've found a security issue not covered by this document, please:
1. Check if the URL contains actual credentials (API keys, passwords, tokens)
2. Verify it's not in the categories listed above
3. Open a security advisory at https://github.com/kubestellar/console/security/advisories

Thank you for helping keep KubeStellar Console secure!
