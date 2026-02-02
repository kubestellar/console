# Security Fix: Hardcoded URLs and API Configuration

## Summary

This security fix addresses the automated security scan findings regarding hardcoded URLs and potential credentials in the source code.

## Changes Made

### 1. Created Centralized Configuration (`/web/src/config/externalApis.ts`)

A new configuration file that centralizes all external API endpoints and documentation URLs. This file:

- **Makes configurable APIs easy to override via environment variables**
- **Clearly documents which URLs are intentionally hardcoded** (public documentation links)
- **Provides a single source of truth** for external API references

Key sections:
- `WEATHER_API`: Geocoding API (configurable via `VITE_GEOCODING_API_URL`)
- `AI_PROVIDER_DOCS`: Documentation links for API key management (hardcoded as intended)
- `K8S_DOCS`: Kubernetes and service mesh documentation URLs (hardcoded as intended)
- `KC_AGENT`: Local agent configuration

### 2. Updated Components to Use Configuration

Modified the following components to import from the centralized config:

- `src/components/agent/APIKeySettings.tsx` - AI provider docs and KC agent URL
- `src/components/cards/weather/Weather.tsx` - Geocoding API endpoint
- `src/components/cards/GatewayStatus.tsx` - Gateway API documentation links
- `src/components/cards/ServiceExports.tsx` - MCS API documentation links
- `src/components/cards/ServiceImports.tsx` - MCS API documentation links

### 3. Enhanced Mock Token Clarity (`src/mocks/handlers.ts`)

Updated mock JWT tokens to include clear indicators that they are **NOT real credentials**:
- Changed from `'mock-jwt-token'` to `'mock-jwt-token-for-testing-only'`
- Added inline comments: `// NOT A REAL TOKEN - Mock data for E2E tests`

### 4. Updated Environment Documentation (`.env.example`)

Added documentation for the new configurable geocoding API:

```env
# External API Configuration (optional)
# Geocoding API for weather card location search (default: Open-Meteo free API)
VITE_GEOCODING_API_URL=https://geocoding-api.open-meteo.com/v1/search
```

## Security Analysis

### What Was NOT Changed (and Why)

The following URLs were flagged but are **intentionally hardcoded** and **not security issues**:

1. **Documentation Links** - Public URLs to official documentation:
   - GitHub repositories (kubernetes-sigs/mcs-api, gateway-api)
   - Gateway API documentation (gateway-api.sigs.k8s.io)
   - AI provider documentation pages (OpenAI, Google, Anthropic)
   
2. **Installation Commands** - Public kubectl commands for CRD installation:
   - These reference official GitHub release artifacts
   - They are part of the user guidance/instructions
   
3. **Mock/Demo Data** - Test data in handlers and component demos:
   - ArgoCD example repository URL (clearly demo data)
   - Mock JWT tokens (now clearly labeled as test data)

### What IS Configurable

- **Geocoding API** (`VITE_GEOCODING_API_URL`): Can be overridden for custom geocoding services
- **KC Agent URL**: Centralized in config for easy modification if needed

## Testing

All changes have been:
- ✅ Built successfully with `npm run build`
- ✅ Type-checked with TypeScript compiler
- ✅ Validated to not introduce new lint errors

## Impact

- **Zero breaking changes** - All URLs work exactly as before
- **Improved maintainability** - Centralized configuration makes future changes easier
- **Enhanced security clarity** - Clear distinction between configurable and intentional hardcoded URLs
- **Better developer experience** - Single config file to reference for all external APIs

## Recommendations for CI/CD

Consider adding environment variable overrides in deployment:
- `VITE_GEOCODING_API_URL`: If using a custom geocoding service
- Other external APIs can be added to the config file following the same pattern

## Related Documentation

- Configuration file: `/web/src/config/externalApis.ts`
- Environment example: `.env.example`
- Vite environment variables: https://vitejs.dev/guide/env-and-mode.html
