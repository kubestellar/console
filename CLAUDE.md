# Project Configuration

## ⚠️ MANDATORY Testing Requirements

**ALL UI and API work MUST be tested before marking complete.** Do not just write code and assume it works. Use one or more of these tools:

### For UI/Frontend Testing
1. **Playwright** (preferred for comprehensive E2E tests)
   ```bash
   cd web && npx playwright test --grep "your-test-pattern"
   ```
2. **Chrome DevTools MCP** (for interactive testing)
   - `mcp__chrome-devtools__navigate_page` - Load pages
   - `mcp__chrome-devtools__take_snapshot` - Verify DOM elements
   - `mcp__chrome-devtools__click` / `mcp__chrome-devtools__fill` - Interact
   - `mcp__chrome-devtools__take_screenshot` - Capture visual state

### For API/WebSocket Testing
1. **curl** - Test REST API endpoints
   ```bash
   curl -s http://localhost:8080/api/health | jq
   ```
2. **websocat** - Test WebSocket connections
   ```bash
   websocat ws://localhost:8585/ws
   ```

### Testing Checklist
- [ ] New UI components render correctly
- [ ] User interactions work as expected
- [ ] No console errors
- [ ] API endpoints return expected data
- [ ] WebSocket connections establish properly

---

## Port Requirements

- **Backend**: Must always run on port **8080**
- **Frontend**: Must always start on port **5174** (use `npm run dev -- --port 5174`)

## Development

### Starting the Console (Recommended)

Use `./startup-oauth.sh` to start the full development environment:
```bash
./startup-oauth.sh
```

This script automatically:
- Kills existing processes on ports 8080, 5174, 8585
- Loads `.env` credentials (GitHub OAuth)
- Starts kc-agent, backend (OAuth mode), and frontend
- Handles Ctrl+C cleanup

**Requirements**: Create a `.env` file with GitHub OAuth credentials:
```
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>
```

### Manual Startup

If you need to start components individually:
```bash
npm run dev -- --port 5174  # Frontend
```

The backend (KC API server) runs on port 8080. The KC agent WebSocket runs on port 8585.

---

## Card Development Rules (ALWAYS FOLLOW)

Every dashboard card component MUST follow these patterns for loading, caching, and demo data to work correctly.

### 1. Always wire `isDemoData` and `isRefreshing`

Every card using a `useCached*` hook MUST destructure `isDemoData` (or `isDemoFallback`) and `isRefreshing`, then pass both to `useCardLoadingState()` or `useReportCardDataState()`:

```tsx
const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedXxx()

useCardLoadingState({
  isLoading,
  isRefreshing,          // ← Required for refresh icon animation
  isDemoData,            // ← Required for Demo badge + yellow outline
  hasAnyData: data.length > 0,
  isFailed,
  consecutiveFailures,
})
```

Without `isDemoData`: cards show demo data without the Demo badge/yellow outline.
Without `isRefreshing`: no refresh icon animation when data is being updated in background.

### 2. Never use demo data during loading

The hook's `isDemoFallback` must be `false` while `isLoading` is `true`. This ensures CardWrapper shows a loading skeleton instead of immediately rendering demo data.

**Correct pattern in hooks:**
```tsx
const effectiveIsDemoFallback = cacheResult.isDemoFallback && !cacheResult.isLoading
```

**Wrong pattern:**
```tsx
const effectiveIsDemoFallback = cacheResult.isDemoFallback  // BUG: true during loading
```

### 3. Expected loading behavior

| Scenario | Behavior |
|----------|----------|
| First visit, API keys present | Loading skeleton → live data |
| Revisit, API keys present | Cached data instantly → refresh icon spins → updated data |
| No API keys / demo mode | Demo data immediately (with Demo badge + yellow outline) |
| API keys present, fetch fails | Loading skeleton → demo data fallback after timeout |

### 4. Always use `useCache`/`useCached*` hooks

All data fetching in cards MUST go through the cache layer (`useCache` or a `useCached*` hook from `hooks/useCachedData.ts`). This provides:
- Persistent cache (IndexedDB/SQLite) for instant data on revisit
- SWR (stale-while-revalidate) pattern
- Automatic demo fallback
- Loading/refreshing state management

### 5. Hook ordering matters

`useCardLoadingState` / `useReportCardDataState` must be called AFTER the hooks that provide `isDemoData`. React hooks run in order — if the loading state hook runs before data hooks, it won't have the correct values.

