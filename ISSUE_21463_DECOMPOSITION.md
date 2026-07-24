# Issue #21463 Decomposition

## Analysis

**Total Files Flagged:** 51
- Production components: 24
- Test files: 27

**Conclusion:** Scope is too large (>5 files) for a single PR per instructions.

## Decomposition Strategy

### Group 1: Card Components (13 files)
**Files:**
- `src/components/cards/NightlyE2EGuideRow.tsx` — missing error state
- `src/components/cards/NamespaceQuotas.tsx` — missing error state
- `src/components/cards/PipelineFilterContext.tsx` — missing loading, error state
- `src/components/cards/GPUInventoryHistory.tsx` — missing error state
- `src/components/cards/CardToolbar.tsx` — missing error state
- `src/components/cards/ACMMFeedbackLoops.tsx` — missing error state
- `src/components/cards/KubectlAIPanel.tsx` — missing loading, error state
- `src/components/cards/DrasiFlowLine.tsx` — missing loading state
- `src/components/cards/DrasiNodeCard.tsx` — missing loading state
- `src/components/cards/KubectlHistoryPanel.tsx` — missing loading, error state
- `src/components/cards/UpgradeStatus.tsx` — missing error state
- `src/components/cards/CardErrorFallback.tsx` — missing loading state
- `src/components/cards/UserManagementList.tsx` — missing error state

**Rationale:** All card components share similar patterns and can be fixed consistently.

### Group 2: Layout & Navigation (4 files)
**Files:**
- `src/components/layout/sidebar/SidebarNavItemRow.tsx` — missing loading, error state
- `src/components/layout/mission-sidebar/MissionSidebarContainer.tsx` — missing loading, error state
- `src/components/stellar/StellarMissionBridge.tsx` — missing loading state
- `src/components/feedback/SubmitTab.tsx` — missing loading state

**Rationale:** Layout and navigation components need coordinated loading states.

### Group 3: Mission & Auth (4 files)
**Files:**
- `src/components/missions/CardRequestDialog.tsx` — missing loading state
- `src/components/mission-control/RequestApprovalModal.tsx` — missing loading state
- `src/components/auth/AuthCallback.tsx` — missing loading state
- `src/components/acmm/ACMMProvider.tsx` — missing loading state

**Rationale:** Mission-critical flows that need careful error handling.

### Group 4: Test Files (27 files)
**Files:** All `*.test.tsx` files listed in original issue

**Rationale:** Test files require different treatment (mock assertions, not UI states). Should be handled separately or reconsidered if Auto-QA flagged them incorrectly.

## Recommended Next Steps

1. Create 4 child issues (one per group)
2. Link each with "Part of #21463"
3. Tackle each group in separate PRs
4. Follow project patterns from existing card components

## Notes

- Many flagged files are tests - these may not need traditional loading/error UI
- Focus on production components first
- Keep each PR under 50 lines where possible (per issue guidance)
