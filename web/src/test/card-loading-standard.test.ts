/**
 * Card Loading State Gold Standard Test
 *
 * Validates that ALL card components follow the gold standard pattern for
 * loading, caching, and demo data. This prevents drift where new cards or
 * edits silently break the instant-load / stale-while-revalidate behavior.
 *
 * Gold standard (from CLAUDE.md):
 *
 *   const hasData = someDataArray.length > 0
 *   const { showSkeleton, showEmptyState } = useCardLoadingState({
 *     isLoading: hookLoading && !hasData,   // Don't block when cache exists
 *     isRefreshing,                          // Required: refresh spinner
 *     hasAnyData: hasData,
 *     isFailed,                              // Required: failure badge
 *     consecutiveFailures,                   // Required: failure tracking
 *     isDemoData: isDemoMode || isDemoFallback, // Required: demo badge
 *   })
 *
 * Run:   npx vitest run src/test/card-loading-standard.test.ts
 * Watch: npx vitest src/test/card-loading-standard.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Configuration ──────────────────────────────────────────────────────────

const CARDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../components/cards',
)

/**
 * Cards exempt from ALL checks (with reasons).
 * Keep this list minimal — every exemption should have a comment.
 */
const EXEMPT_CARDS: Record<string, string> = {
  // CardWrapper itself provides the context, not a card
  'CardWrapper.tsx': 'Provides CardDataContext, not a card',
  'CardDataContext.tsx': 'Defines hooks, not a card',
  'DynamicCardErrorBoundary.tsx': 'Error boundary, not a card',
  // Component library pieces
  'CardComponents.tsx': 'Shared UI components, not a card',
  'CardRecommendations.tsx': 'Recommendations engine, not a data card',
  // Index/barrel files
  'index.ts': 'Barrel export',
  'index.tsx': 'Barrel export',
  // Registry and metadata
  'cardRegistry.ts': 'Card registry, not a card',
  'cardMetadata.ts': 'Metadata, not a card',
  'cardIcons.ts': 'Icon mapping, not a card',
  'cardDescriptions.ts': 'Description mapping',
  'cardCategories.ts': 'Category mapping',
  // Hooks and utilities
  'useStablePageHeight.ts': 'Utility hook',
  'useCardFiltering.ts': 'Utility hook',
}

/**
 * Cards that legitimately don't use useCached* hooks (e.g., pure demo cards,
 * game cards, embed cards). These are exempt from the "must have isRefreshing" check.
 */
const NO_CACHED_HOOK_EXEMPT = new Set([
  // Arcade games
  'KubeMan.tsx', 'KubeKong.tsx', 'NodeInvaders.tsx', 'PodPitfall.tsx',
  'ContainerTetris.tsx', 'FlappyPod.tsx', 'PodSweeper.tsx', 'Game2048.tsx',
  'Checkers.tsx', 'KubeChess.tsx', 'Solitaire.tsx', 'MatchGame.tsx',
  'Kubedle.tsx', 'SudokuGame.tsx', 'PodBrothers.tsx', 'KubeKart.tsx',
  'KubePong.tsx', 'KubeSnake.tsx', 'KubeGalaga.tsx', 'KubeCraft.tsx',
  'KubeCraft3D.tsx', 'KubeDoom.tsx', 'PodCrosser.tsx',
  // Embed/iframe cards
  'IframeEmbed.tsx', 'MobileBrowser.tsx',
  // Pure UI cards
  'Weather.tsx', 'StockMarketTicker.tsx', 'RSSFeed.tsx',
])

/**
 * Known violations — cards that existed before this test was introduced.
 * This list MUST ONLY SHRINK over time. Adding new entries is forbidden.
 * The ratchet test at the bottom enforces this: if the actual violation count
 * drops below the known count, update the count (or remove the entry).
 *
 * Format: relative path from CARDS_DIR → list of violated checks
 */
const KNOWN_VIOLATIONS: Record<string, Set<string>> = {
  // ── bare isLoading violations ──
  'AppStatus.tsx': new Set(['bare-isLoading']),
  'cloudevents_status/useCloudEventsStatus.ts': new Set(['bare-isLoading']),
  'ClusterChangelog.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'ClusterDropZone.tsx': new Set(['bare-isLoading']),
  'ClusterNetwork.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'console-missions/ConsoleHealthCheckCard.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'console-missions/ConsoleIssuesCard.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'console-missions/ConsoleKubeconfigAuditCard.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'console-missions/ConsoleOfflineDetectionCard.tsx': new Set(['missing-isRefreshing']),
  'coredns_status/CoreDNSStatus.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'CRDHealth.tsx': new Set(['bare-isLoading']),
  'crio_status/useCrioStatus.ts': new Set(['bare-isLoading']),
  'crossplane-status/CrossplaneManagedResources.tsx': new Set(['bare-isLoading']),
  'DeploymentStatus.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'EtcdStatus.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'EventsTimeline.tsx': new Set(['bare-isLoading']),
  'EventStream.tsx': new Set(['bare-isLoading']),
  'flatcar_status/useFlatcarStatus.ts': new Set(['bare-isLoading']),
  'fluentd_status/useFluentdStatus.ts': new Set(['bare-isLoading']),
  'GatewayStatus.tsx': new Set(['bare-isLoading']),
  'GPUStatus.tsx': new Set(['bare-isLoading']),
  'GPUWorkloads.tsx': new Set(['missing-isRefreshing']),
  'HelmHistory.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'HelmReleaseStatus.tsx': new Set(['missing-isRefreshing']),
  'HelmValuesDiff.tsx': new Set(['missing-isRefreshing']),
  'insights/CrossClusterEventCorrelation.tsx': new Set(['missing-isRefreshing']),
  'ISO27001Audit.tsx': new Set(['missing-isRefreshing']),
  'kagenti/KagentiAgentDiscovery.tsx': new Set(['bare-isLoading']),
  'kagenti/KagentiAgentFleet.tsx': new Set(['bare-isLoading']),
  'kagenti/KagentiBuildPipeline.tsx': new Set(['bare-isLoading']),
  'kagenti/KagentiSecurityPosture.tsx': new Set(['bare-isLoading']),
  'kagenti/KagentiToolRegistry.tsx': new Set(['bare-isLoading']),
  'karmada_status/useKarmadaStatus.ts': new Set(['bare-isLoading']),
  'keda_status/useKedaStatus.ts': new Set(['bare-isLoading']),
  'Kubectl.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'kubevela_status/useKubeVelaStatus.ts': new Set(['bare-isLoading']),
  'KustomizationStatus.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'lima_status/useLimaStatus.ts': new Set(['bare-isLoading']),
  'llmd/NightlyE2EStatus.tsx': new Set(['bare-isLoading']),
  'NamespaceMonitor.tsx': new Set(['bare-isLoading']),
  'NamespaceQuotas.tsx': new Set(['missing-isRefreshing']),
  'NamespaceRBAC.tsx': new Set(['missing-isRefreshing']),
  'NetworkOverview.tsx': new Set(['bare-isLoading']),
  'NetworkPolicyCoverage.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'NodeDebug.tsx': new Set(['bare-isLoading']),
  'openfeature_status/useOpenFeatureStatus.ts': new Set(['bare-isLoading']),
  'OverlayComparison.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'PodHealthTrend.tsx': new Set(['bare-isLoading']),
  'PredictiveHealth.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'RBACExplorer.tsx': new Set(['bare-isLoading']),
  'RecommendedPolicies.tsx': new Set(['missing-isRefreshing']),
  'ResourceMarshall.tsx': new Set(['bare-isLoading', 'missing-isRefreshing']),
  'ServiceExports.tsx': new Set(['bare-isLoading']),
  'ServiceImports.tsx': new Set(['bare-isLoading']),
  'strimzi_status/useStrimziStatus.ts': new Set(['bare-isLoading']),
  'thanos_status/useThanosStatus.ts': new Set(['bare-isLoading']),
  'UserManagement.tsx': new Set(['missing-isRefreshing']),
  'weather/Weather.tsx': new Set(['bare-isLoading']),
  'WorkloadDeployment.tsx': new Set(['missing-isRefreshing']),
  'buildpacks-status/BuildpacksStatus.tsx': new Set(['missing-isRefreshing']),
}

/**
 * Known failure-wiring violations — cards that use useCached or useClusters hooks
 * but do NOT pass isFailed and consecutiveFailures to useCardLoadingState.
 *
 * Same ratchet rules as KNOWN_VIOLATIONS: this list MUST ONLY SHRINK.
 */
const KNOWN_FAILURE_VIOLATIONS: Record<string, Set<string>> = {
  'ClusterComparison.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ClusterGroups.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ClusterLocations.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ClusterNetwork.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'console-missions/ConsoleKubeconfigAuditCard.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'console-missions/ConsoleOfflineDetectionCard.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'FleetComplianceHeatmap.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'GPUNamespaceAllocations.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'GPUStatus.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'GPUWorkloads.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'HelmValuesDiff.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'insights/CrossClusterEventCorrelation.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'Kubectl.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'KustomizationStatus.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'Missions.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'NamespaceEvents.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'NamespaceMonitor.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'NamespaceQuotas.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'NamespaceRBAC.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'OPAPolicies.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'OverlayComparison.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'RecommendedPolicies.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ResourceMarshall.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ResourceTrend.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'ResourceUsage.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
  'workload-detection/LLMModels.tsx': new Set(['missing-isFailed', 'missing-consecutiveFailures']),
}

/** Check if a violation is known (grandfathered in) */
function isKnownViolation(rel: string, check: string): boolean {
  return (KNOWN_VIOLATIONS[rel]?.has(check) ?? false)
    || (KNOWN_FAILURE_VIOLATIONS[rel]?.has(check) ?? false)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively find all .tsx/.ts files under a directory */
function findCardFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findCardFiles(fullPath))
    } else if (/\.(tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      results.push(fullPath)
    }
  }
  return results
}

/** Get relative path from CARDS_DIR for readable test names */
function relPath(filePath: string): string {
  const rel = path.relative(CARDS_DIR, filePath)
  // Normalize to POSIX-style separators so this matches KNOWN_VIOLATIONS keys
  return rel.replace(/\\/g, '/')
}

/** Check if a file is exempt from all checks */
function isExempt(filePath: string): boolean {
  const basename = path.basename(filePath)
  return !!EXEMPT_CARDS[basename]
}

/** Check if file uses useCardLoadingState */
function usesLoadingStateHook(src: string): boolean {
  return src.includes('useCardLoadingState')
}

/** Check if file uses a useCached* hook */
function usesCachedHook(src: string): boolean {
  return /useCached\w+/.test(src)
}

/** Check if file uses useClusters */
function usesClustersHook(src: string): boolean {
  return /useClusters\(\)/.test(src)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Card Loading State Gold Standard', () => {
  const allFiles = findCardFiles(CARDS_DIR)
  const cardFiles = allFiles.filter(f => !isExempt(f))

  // Files that use useCardLoadingState or useReportCardDataState
  const filesWithLoadingHook = cardFiles.filter(f => {
    const src = fs.readFileSync(f, 'utf-8')
    return usesLoadingStateHook(src)
  })

  it('should find card files to audit', () => {
    expect(cardFiles.length).toBeGreaterThan(50)
    expect(filesWithLoadingHook.length).toBeGreaterThan(30)
  })

  describe('Bare isLoading check (must use isLoading && !hasData pattern)', () => {
    for (const filePath of filesWithLoadingHook) {
      const rel = relPath(filePath)

      it(`${rel}: no bare isLoading in useCardLoadingState`, () => {
        if (isKnownViolation(rel, 'bare-isLoading')) return // grandfathered

        const src = fs.readFileSync(filePath, 'utf-8')
        const calls = extractLoadingStateCalls(src)
        for (const call of calls) {
          const barePattern = /isLoading:\s*(?!false\b)(\w+)\s*[,}]/
          const match = call.match(barePattern)
          if (match) {
            const isLoadingValue = extractPropValue(call, 'isLoading')
            if (isLoadingValue && !isLoadingValue.includes('!') && isLoadingValue !== 'false') {
              expect.fail(
                `${rel}: bare isLoading found: "isLoading: ${isLoadingValue}"\n` +
                `  Expected: isLoading: ${isLoadingValue} && !hasData (or similar guard)\n` +
                `  This causes skeleton flash when cached data exists.`
              )
            }
          }

          if (/(?<![:\w])isLoading\s*[,}]/.test(call) && !call.includes('isLoading:')) {
            expect.fail(
              `${rel}: shorthand "isLoading" found in useCardLoadingState\n` +
              `  Expected: isLoading: someLoadingVar && !hasData`
            )
          }
        }
      })
    }
  })

  describe('isRefreshing must be wired', () => {
    for (const filePath of filesWithLoadingHook) {
      const basename = path.basename(filePath)
      if (NO_CACHED_HOOK_EXEMPT.has(basename)) continue

      const rel = relPath(filePath)
      const src = fs.readFileSync(filePath, 'utf-8')

      if (!usesCachedHook(src) && !usesClustersHook(src)) continue

      it(`${rel}: isRefreshing wired in useCardLoadingState`, () => {
        if (isKnownViolation(rel, 'missing-isRefreshing')) return // grandfathered

        const calls = extractLoadingStateCalls(src)
        if (calls.length === 0) return

        const hasRefreshing = calls.some(call => call.includes('isRefreshing'))
        expect(hasRefreshing, `${rel}: missing isRefreshing in useCardLoadingState`).toBe(true)
      })
    }
  })

  describe('isDemoData must be wired', () => {
    for (const filePath of filesWithLoadingHook) {
      const basename = path.basename(filePath)
      if (NO_CACHED_HOOK_EXEMPT.has(basename)) continue

      const rel = relPath(filePath)
      const src = fs.readFileSync(filePath, 'utf-8')

      if (!usesCachedHook(src) && !usesClustersHook(src)) continue

      it(`${rel}: isDemoData wired in useCardLoadingState`, () => {
        if (isKnownViolation(rel, 'missing-isDemoData')) return // grandfathered

        const calls = extractLoadingStateCalls(src)
        if (calls.length === 0) return

        const hasDemoData = calls.some(call =>
          call.includes('isDemoData') || call.includes('isDemoFallback')
        )
        expect(hasDemoData, `${rel}: missing isDemoData in useCardLoadingState`).toBe(true)
      })
    }
  })

  describe('isFailed must be wired', () => {
    for (const filePath of filesWithLoadingHook) {
      const basename = path.basename(filePath)
      if (NO_CACHED_HOOK_EXEMPT.has(basename)) continue

      const rel = relPath(filePath)
      const src = fs.readFileSync(filePath, 'utf-8')

      if (!usesCachedHook(src) && !usesClustersHook(src)) continue

      it(`${rel}: isFailed wired in useCardLoadingState`, () => {
        if (isKnownViolation(rel, 'missing-isFailed')) return // grandfathered

        const calls = extractLoadingStateCalls(src)
        if (calls.length === 0) return

        const hasFailed = calls.some(call => call.includes('isFailed'))
        expect(hasFailed, `${rel}: missing isFailed in useCardLoadingState`).toBe(true)
      })
    }
  })

  describe('consecutiveFailures must be wired', () => {
    for (const filePath of filesWithLoadingHook) {
      const basename = path.basename(filePath)
      if (NO_CACHED_HOOK_EXEMPT.has(basename)) continue

      const rel = relPath(filePath)
      const src = fs.readFileSync(filePath, 'utf-8')

      if (!usesCachedHook(src) && !usesClustersHook(src)) continue

      it(`${rel}: consecutiveFailures wired in useCardLoadingState`, () => {
        if (isKnownViolation(rel, 'missing-consecutiveFailures')) return // grandfathered

        const calls = extractLoadingStateCalls(src)
        if (calls.length === 0) return

        const hasConsecutiveFailures = calls.some(call => call.includes('consecutiveFailures'))
        expect(hasConsecutiveFailures, `${rel}: missing consecutiveFailures in useCardLoadingState`).toBe(true)
      })
    }
  })

  describe('No hardcoded isLoading: false', () => {
    for (const filePath of filesWithLoadingHook) {
      const rel = relPath(filePath)
      const src = fs.readFileSync(filePath, 'utf-8')

      if (src.includes('DEMO_DATA_CARDS') || (!usesCachedHook(src) && !usesClustersHook(src))) continue

      it(`${rel}: no hardcoded isLoading: false`, () => {
        if (isKnownViolation(rel, 'hardcoded-false')) return // grandfathered

        const calls = extractLoadingStateCalls(src)
        for (const call of calls) {
          const isLoadingValue = extractPropValue(call, 'isLoading')
          if (isLoadingValue === 'false') {
            expect.fail(
              `${rel}: hardcoded "isLoading: false" found\n` +
              `  This bypasses the loading system. Use actual loading state from the data hook.`
            )
          }
        }
      })
    }
  })

  describe('Ratchet: known violations must not grow', () => {
    it('total KNOWN_VIOLATIONS count must not increase', () => {
      let totalKnown = 0
      for (const checks of Object.values(KNOWN_VIOLATIONS)) {
        totalKnown += checks.size
      }

      // This number MUST ONLY DECREASE. If you fix a card, remove it from
      // KNOWN_VIOLATIONS and decrease this count. If this test fails because
      // the count dropped, that's great — update the expected count!
      const EXPECTED_KNOWN_VIOLATION_COUNT = 75
      expect(totalKnown).toBeLessThanOrEqual(EXPECTED_KNOWN_VIOLATION_COUNT)
    })

    it('isRefreshing violation count must not increase', () => {
      let refreshCount = 0
      for (const checks of Object.values(KNOWN_VIOLATIONS)) {
        if (checks.has('missing-isRefreshing')) refreshCount++
      }

      // Separate ratchet for isRefreshing violations. MUST ONLY DECREASE.
      const EXPECTED_REFRESH_VIOLATION_COUNT = 27
      expect(refreshCount).toBeLessThanOrEqual(EXPECTED_REFRESH_VIOLATION_COUNT)
    })

    it('isFailed/consecutiveFailures violation count must not increase', () => {
      let failureCount = 0
      for (const checks of Object.values(KNOWN_FAILURE_VIOLATIONS)) {
        failureCount += checks.size
      }

      // Separate ratchet for failure-wiring violations. MUST ONLY DECREASE.
      // Each card entry has 2 violations (missing-isFailed + missing-consecutiveFailures).
      const EXPECTED_FAILURE_VIOLATION_COUNT = 52
      expect(failureCount).toBeLessThanOrEqual(EXPECTED_FAILURE_VIOLATION_COUNT)
    })
  })
})

// ── Extraction helpers ──────────────────────────────────────────────────────

/**
 * Extract the argument object(s) from useCardLoadingState({ ... }) calls.
 * Returns the text inside the parentheses for each call.
 */
function extractLoadingStateCalls(src: string): string[] {
  const results: string[] = []
  const pattern = /useCardLoadingState\s*\(\s*\{/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(src)) !== null) {
    const start = match.index + match[0].length - 1 // position of {
    const text = extractBalancedBraces(src, start)
    if (text) results.push(text)
  }

  return results
}

/**
 * Extract text inside balanced braces starting at position `start`.
 */
function extractBalancedBraces(src: string, start: number): string | null {
  if (src[start] !== '{') return null

  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    if (depth === 0) {
      return src.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Extract the value of a property from an object literal string.
 * e.g., extractPropValue("{ isLoading: foo && !bar, ... }", "isLoading") → "foo && !bar"
 */
function extractPropValue(objStr: string, prop: string): string | null {
  const pattern = new RegExp(`${prop}\\s*:\\s*([^,}]+)`)
  const match = objStr.match(pattern)
  return match ? match[1].trim() : null
}
