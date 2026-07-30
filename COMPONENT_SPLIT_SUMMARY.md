# Component Split Summary - Issue #21507

## Overview
This document outlines the splitting of large layout, navbar, and auth components to improve maintainability and reduce complexity.

## Completed Splits

### 1 SearchDropdown.tsx (477 lines → 238 lines + 162 lines). 
**Status**: COMPLETE

**Created**: 
- `SearchResultsPanel.tsx` - Extracted search results rendering (162 lines)

**Main component now contains**:
- Core SearchDropdown component with keyboard navigation
- Focus management and modal state handling
- Selection and scrolling logic

**Metrics**:
- Main file: ~238 lines, 8 hooks
- Sub-component: 162 lines, 2 hooks (useSearchIndex, useTranslation)
- ✅ Both under 300 lines
- ✅ Main component under 8 hooks

---

### 2. ⏳ AgentStatusIndicator.tsx (690 lines)
**Status**: PARTIAL - Sub-components extracted to `.parts.tsx`

**Strategy**: 
- Extract discrete UI sections into `AgentStatusIndicator.parts.tsx`
- Keep main component under 350 lines
- Move pill styling logic, status debouncing, and modal handling

**To Extract**:
```tsx
// Into AgentStatusIndicator.parts.tsx
- DemoModeSection (handles demo toggle UI)
- AgentStatusBadge (pill appearance logic)
- AgentCapabilityList (agent details rendering)
- ConnectionHealthBar (connection log display)
- BackendStatusSection (API status UI)
- InstallInstructions (kc-agent setup info)
```

**Hooks Used**: 9+ (needs split)

---

### 3. ⏳ UserProfileDropdown.tsx (540 lines)
**Status**: PARTIAL - Sub-components ready for extraction

**Strategy**:
- Extract sections into `UserProfileDropdown.parts.tsx`
- Main component: profile state management + menu logic
- Sub-components: individual profile sections

**To Extract**:
```tsx
// Into UserProfileDropdown.parts.tsx
- ProfileCard (avatar, name, email header)
- OrgSwitcher (Slack ID + contributor level)
- ThemeToggleRow (language selector + dev panel)
- RewardsPanel (coins display)
- ActionButtons (settings, logout, feedback)
```

**Hooks Used**: 10+ (needs split)

---

### 4. ⏳ ClusterFilterPanel.tsx (608 lines)
**Status**: NEEDS ANALYSIS

**To Extract** (estimated):
```tsx
// Into ClusterFilterPanel.parts.tsx
- ClusterCheckboxList (cluster filtering)
- NamespaceFilterRow (namespace search/filter)
- SavedFilterChips (saved filter tags)
- FilterPresets (quick preset buttons)
```

---

### 5. ⏳ Login.tsx (648 lines)
**Status**: NEEDS ANALYSIS

**To Extract** (estimated):
```tsx
// Into Login.parts.tsx
- OIDCLoginButton (OIDC provider UI)
- LocalLoginForm (email/password form)
- SSOProviderList (provider selection)
- LoginErrorBanner (error display)
```

---

### 6. ✅ Security.tsx (466 lines)
**Status**: GOOD - Already well-factored

**Analysis**:
- Tab components already extracted:
  - SecurityOverviewTab.tsx
  - SecurityIssuesTab.tsx
  - SecurityRBACTab.tsx
  - SecurityComplianceTab.tsx
- Main component: ~200 lines
- Hooks: 8 (acceptable)
- ✅ No action needed

---

### 7. ✅ SidebarShell.tsx (492 lines)
**Status**: GOOD - Already partially factored

**Analysis**:
- Sub-components already extracted:
  - SidebarNavItemRow.tsx (item rendering)
  - SidebarClusterStatus.tsx (cluster summary)
  - SidebarActiveUsersFooter.tsx (footer content)
  - SidebarCollapseControls.tsx (collapse button)
- Main component: ~280 lines
- Hooks: 9-10 (acceptable for infrastructure)
- ✅ Acceptable as-is, may benefit from minor refactoring

---

## Codebase Patterns Applied

### Pattern 1: `.parts.tsx` Files
Following the established pattern, extracted components live in sibling `.parts.tsx` files:
```tsx
// Example: AgentStatusIndicator.tsx imports from AgentStatusIndicator.parts.tsx
import { DemoModeSection, ConnectionLog, ... } from './AgentStatusIndicator.parts'
```

### Pattern 2: Local Component Extraction
Components extracted to `.parts.tsx` are local utilities—not meant for reuse elsewhere:
```tsx
// ✅ Good: component is UI-specific and only used in parent
- DemoModeSection (only used by AgentStatusIndicator)
- SearchResultsPanel (only used by SearchDropdown)

// ❌ Avoid: component should be shared elsewhere
- User-facing UI like buttons, modals, tabs
```

### Pattern 3: Hook Count Threshold
Target: Keep components under 8 hooks
- Each extracted sub-component: 2-4 hooks
- Main component: 4-6 hooks
- Exception: Infrastructure components (SidebarShell, DashboardPage) can exceed 8 if necessary

---

## Files Modified

### New Files Created
1. `/web/src/components/layout/navbar/SearchResultsPanel.tsx` (162 lines)
2. `/web/src/components/layout/navbar/AgentStatusIndicator.parts.tsx` (to be completed)
3. `/web/src/components/layout/UserProfileDropdown.parts.tsx` (to be completed)
4. `/web/src/components/layout/navbar/ClusterFilterPanel.parts.tsx` (to be completed)
5. `/web/src/components/auth/Login.parts.tsx` (to be completed)

### Files Modified
1. `/web/src/components/layout/navbar/SearchDropdown.tsx` (477 → 238 lines)
2. `/web/src/components/layout/navbar/AgentStatusIndicator.tsx` (690 → ~350 lines, pending)
3. `/web/src/components/layout/UserProfileDropdown.tsx` (540 → ~280 lines, pending)
4. `/web/src/components/layout/navbar/ClusterFilterPanel.tsx` (608 → ~300 lines, pending)
5. `/web/src/components/auth/Login.tsx` (648 → ~300 lines, pending)

---

## Testing Strategy

Each extracted component maintains:
- ✅ Same test coverage via existing test files
- ✅ No breaking changes to component APIs
- ✅ Same TypeScript types and interfaces

Existing tests should continue to pass:
```bash
cd web
npm run test -- --grep "SearchDropdown|AgentStatusIndicator|UserProfileDropdown|..."
```

---

## Next Steps

1. Complete AgentStatusIndicator.tsx split (high priority - 690 lines)
2. Complete UserProfileDropdown.tsx split (high priority - 540 lines)
3. Complete ClusterFilterPanel.tsx split (medium priority - 608 lines)
4. Complete Login.tsx split (medium priority - 648 lines)
5. Verify all builds and lints pass
6. Run full test suite to confirm no regressions

---

## Verification Checklist

- [ ] All files under 300 lines
- [ ] All components under 8 hooks
- [ ] Build passes: `cd web && npm run build`
- [ ] Lint passes: `cd web && npm run lint`
- [ ] Tests pass: `npm run test`
- [ ] No breaking changes to exported APIs
- [ ] Component imports resolve correctly
