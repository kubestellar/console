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

