# Security Guide: Hardcoded URLs and Credentials

This guide explains the security patterns used in the KubeStellar Console codebase and how to distinguish between safe hardcoded values and actual security risks.

## Overview

The Auto-QA security scanner checks for hardcoded URLs, tokens, and credentials. However, not all hardcoded values are security risks. This guide clarifies what's safe and what's not.

## Safe Patterns

### 1. Documentation URLs in `config/externalApis.ts`

**Status**: ✅ Safe

These are intentional public documentation URLs:
- Gateway API documentation (https://gateway-api.sigs.k8s.io/)
- MCS API documentation (https://github.com/kubernetes-sigs/mcs-api)
- AI provider documentation (OpenAI, Gemini, Claude API key pages)

**Why they're safe**:
- They're public documentation links
- They guide users to obtain their own API keys
- They contain no credentials or sensitive information
- They're marked with "SECURITY: Safe" comments

**Example**:
```typescript
export const AI_PROVIDER_DOCS = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',  // SECURITY: Safe - Documentation link
  gemini: 'https://makersuite.google.com/app/apikey',
} as const
```

### 2. Mock/Demo Data

**Status**: ✅ Safe

Mock data in several locations:

#### `mocks/handlers.ts` - Test Tokens
Mock JWT tokens for E2E tests with explicit comments:
```typescript
token: 'mock-jwt-token-for-testing-only', // SECURITY: Safe - NOT A REAL TOKEN
```

#### `hooks/useArgoCD.ts` - Example Repository URLs
Mock ArgoCD applications using fictional "example-org":
```typescript
repoURL: 'https://github.com/example-org/api-gateway',
// SECURITY: Safe - Mock example URL (example-org is fictional)
```

**Why they're safe**:
- Clearly marked as mock/demo data
- Use fictional organization names (example-org)
- Contain explicit "NOT A REAL TOKEN" comments
- Only used for UI demonstration and testing

### 3. Public API Endpoints

**Status**: ✅ Safe (with environment variable override)

Public APIs that don't require authentication:
```typescript
geocodingUrl: import.meta.env.VITE_GEOCODING_API_URL || 
  'https://geocoding-api.open-meteo.com/v1/search',
// SECURITY: Safe - Public API with environment variable override
```

**Why it's safe**:
- Free public API (no authentication required)
- Can be overridden via environment variable
- No credentials involved

## Unsafe Patterns ⚠️

### What IS a security risk:

1. **Real API keys or tokens**:
   ```typescript
   // ❌ UNSAFE - Real credential
   const apiKey = 'sk-proj-abc123...'
   ```

2. **Production API endpoints with embedded credentials**:
   ```typescript
   // ❌ UNSAFE - Embedded token
   const url = 'https://api.example.com?token=real-secret-token'
   ```

3. **Hardcoded passwords**:
   ```typescript
   // ❌ UNSAFE - Real password
   const password = 'MyActualPassword123'
   ```

4. **Private repository URLs with tokens**:
   ```typescript
   // ❌ UNSAFE - Token in URL
   const repo = 'https://username:token@github.com/private/repo.git'
   ```

## Auto-QA Scanner Exclusions

The Auto-QA security scanner automatically excludes:

### URL Scanning
- `config/externalApis.ts` file
- `mocks/` directory
- Lines containing "SECURITY: Safe"
- Lines containing "example-org"
- Lines containing "example.com"

### Token Scanning
- `mocks/handlers.ts` file
- Lines containing "NOT A REAL TOKEN"
- Token values matching "mock-.*-token"

### Password Scanning
- `mocks/` directory
- Type definitions (interface, type)
- UI text (placeholder, label, name=)

## Best Practices

### When adding new code:

1. **For documentation URLs**: Add a "SECURITY: Safe" comment explaining why
   ```typescript
   // SECURITY: Safe - Public documentation link
   const docsUrl = 'https://kubernetes.io/docs/concepts/'
   ```

2. **For mock data**: Use explicit comments and fictional values
   ```typescript
   // SECURITY: Safe - Mock demo data (not a real organization)
   repoURL: 'https://github.com/example-org/demo-app'
   ```

3. **For test tokens**: Use clear mock patterns
   ```typescript
   // SECURITY: Safe - NOT A REAL TOKEN - Mock data for tests only
   token: 'mock-jwt-token-for-testing-only'
   ```

4. **For configurable APIs**: Use environment variables with safe fallbacks
   ```typescript
   apiUrl: import.meta.env.VITE_API_URL || 'https://public-api.example.com'
   ```

### When reviewing code:

Ask yourself:
- Does this value contain real credentials?
- Could this value be used to access production systems?
- Is this a public documentation or reference URL?
- Is this clearly marked as mock/demo data?

## Environment Variables

Real credentials should always use environment variables:

```bash
# .env file (never committed)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GITHUB_CLIENT_SECRET=...
```

See `.env.example` for the full list of supported environment variables.

## Reporting Security Issues

If you discover an actual security vulnerability (real credentials, tokens, or private URLs), please:

1. **DO NOT** create a public GitHub issue
2. Report it privately to the maintainers
3. Include the file location and nature of the issue

## Summary

| Pattern | Safe? | Notes |
|---------|-------|-------|
| Public documentation URLs | ✅ Yes | Mark with "SECURITY: Safe" |
| Mock data with "example-org" | ✅ Yes | Clearly mark as mock/demo |
| Test tokens with explicit comments | ✅ Yes | Use "NOT A REAL TOKEN" |
| Public APIs with env override | ✅ Yes | Allow environment customization |
| Real API keys/tokens | ❌ No | Use environment variables |
| Production endpoints with credentials | ❌ No | Use environment variables |
| Hardcoded passwords | ❌ No | Use environment variables |

## Related Documentation

- [Environment Variables](.env.example)
- [Auto-QA Workflow](.github/workflows/auto-qa.yml)
- [External APIs Configuration](web/src/config/externalApis.ts)
