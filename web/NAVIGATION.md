# Navigation and Routing Guide

This document describes the navigation and routing patterns used in the KubeStellar Console.

## Route Constants

All route paths are defined in `config/routes.ts` as constants. **Never hardcode route paths** — always import and use these constants.

```tsx
import { ROUTES } from '../config/routes'

// ✅ Good
<Link to={ROUTES.CLUSTERS}>Clusters</Link>

// ❌ Bad
<Link to="/clusters">Clusters</Link>
```

### Dynamic Routes

For routes with parameters, use the helper functions:

```tsx
import { getCustomDashboardRoute, getMissionRoute } from '../config/routes'

// Custom dashboard
const dashboardUrl = getCustomDashboardRoute('my-dashboard')

// Mission deep-link
const missionUrl = getMissionRoute('mission-123')
```

## Drill-Down Navigation

Deep navigation (cluster → namespace → pod) uses the `DrillDownProvider` context with automatic:

- **Breadcrumbs** — Visual path showing current location
- **Back navigation** — Keyboard (`Backspace`, `Space`) and UI buttons
- **Browser history integration** — Back/forward browser buttons work
- **View stack management** — Navigate to any breadcrumb level

### Opening Drill-Downs

```tsx
import { useDrillDownActions } from '../hooks/useDrillDown'

function MyComponent() {
  const { drillToCluster, drillToPod } = useDrillDownActions()
  
  return (
    <button onClick={() => drillToCluster('prod-cluster')}>
      View Cluster
    </button>
  )
}
```

### Keyboard Shortcuts

- `Esc` — Close drill-down modal
- `Backspace` or `Space` — Go back one level (or close if at root)

## External Links

All external links (http/https to external sites) **must** use the `ExternalLink` component to ensure proper security attributes:

```tsx
import { ExternalLink } from '../components/ui/ExternalLink'

<ExternalLink href="https://kubernetes.io/docs">
  Kubernetes Docs
</ExternalLink>
```

This automatically adds:
- `target="_blank"` — Opens in new tab
- `rel="noopener noreferrer"` — Prevents security vulnerabilities

### Security Note

**Never** manually add `target="_blank"` without `rel="noopener noreferrer"`. This prevents:
- **Tabnabbing attacks** — Malicious sites can manipulate the parent window
- **Reverse tabnabbing** — `window.opener` access exploitation

## Route Tests

All routes have smoke tests in `test/route-smoke.test.ts` to ensure:
- All ROUTES constants resolve correctly
- No hardcoded paths in navigation
- Helper functions generate valid URLs

## Navigation Analytics

Drill-down navigation automatically emits analytics events:
- `drilldown_opened` — When a drill-down view opens
- `drilldown_closed` — When a drill-down modal closes (with depth)

No manual tracking needed in drill-down views.
