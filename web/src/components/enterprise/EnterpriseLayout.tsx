/**
 * Enterprise Layout — Wraps enterprise routes with the dedicated sidebar.
 *
 * Replaces the main Layout when navigating to /enterprise/*.
 * Mirrors the main Layout's structure: Navbar, fixed sidebar with margin
 * offset, mission sidebar, and proper responsive handling.
 *
 * The enterprise sidebar (SidebarShell) is position:fixed, so the main
 * content area needs an explicit left margin to clear it — mirroring the
 * approach used by the primary Layout component.
 */
import { Suspense, useCallback, useMemo } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { Outlet, useLocation } from 'react-router-dom'
import EnterpriseSidebar from './EnterpriseSidebar'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { useSidebarConfig, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { Navbar } from '../layout/navbar/index'
import { NAVBAR_HEIGHT_PX, SIDEBAR_CONTROLS_OFFSET_PX } from '../../lib/constants/ui'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardCustomizer } from '../dashboard/customizer/DashboardCustomizer'
import type { CardSuggestion } from '../dashboard/shared/cardCatalog'
import type { DashboardCardPlacement } from '../../lib/unified/types'

/**
 * Map each /enterprise/* sub-route to the localStorage key used by that
 * route's UnifiedDashboard. When a route isn't listed here (for example
 * the /enterprise portal index, or compliance dashboards that don't yet
 * use UnifiedDashboard), the Studio's "Add cards" action falls back to
 * a no-op so we don't silently corrupt an unrelated dashboard's cards.
 *
 * Keep this map in sync with the storageKey values in
 * web/src/config/dashboards/*.ts — #9832.
 */
const ENTERPRISE_ROUTE_TO_STORAGE_KEY: Record<string, string> = {
  // Epic 1: FinTech & Regulatory
  '/enterprise/frameworks': 'compliance-frameworks-dashboard-cards-v2',
  '/enterprise/change-control': 'change-control-dashboard-cards-v2',
  '/enterprise/sod': 'sod-dashboard-cards-v2',
  '/enterprise/data-residency': 'data-residency-dashboard-cards-v2',
  '/enterprise/reports': 'compliance-reports-dashboard-cards-v2',
  // Epic 2: Healthcare & Life Sciences
  '/enterprise/hipaa': 'hipaa-dashboard-cards-v2',
  '/enterprise/gxp': 'gxp-dashboard-cards-v2',
  '/enterprise/baa': 'baa-dashboard-cards-v2',
  // Epic 3: Government & Defense
  '/enterprise/nist': 'nist-dashboard-cards-v2',
  '/enterprise/stig': 'stig-dashboard-cards-v2',
  '/enterprise/air-gap': 'airgap-dashboard-cards-v2',
  '/enterprise/fedramp': 'fedramp-dashboard-cards-v2',
  // Epic 4: Identity & Access
  '/enterprise/oidc': 'oidc-dashboard-cards-v2',
  '/enterprise/rbac-audit': 'rbac-audit-dashboard-cards-v2',
  '/enterprise/sessions': 'session-management-dashboard-cards-v2',
  // Epic 5: SecOps
  '/enterprise/siem': 'siem-dashboard-cards-v2',
  '/enterprise/incident-response': 'incident-response-dashboard-cards-v2',
  '/enterprise/threat-intel': 'threat-intel-dashboard-cards-v2',
  // Epic 6: Supply Chain
  '/enterprise/sbom': 'sbom-dashboard-cards-v2',
  '/enterprise/sigstore': 'sigstore-dashboard-cards-v2',
  '/enterprise/slsa': 'slsa-dashboard-cards-v2',
  // Epic 7: Enterprise Risk Management
  '/enterprise/risk-matrix': 'risk-matrix-dashboard-cards-v2',
  '/enterprise/risk-register': 'risk-register-dashboard-cards-v2',
  '/enterprise/risk-appetite': 'risk-appetite-dashboard-cards-v2',
}

/**
 * Default grid dimensions for newly added cards — mirrors
 * UnifiedDashboard.handleAddCards so placements look identical whether
 * the user added a card from inside the dashboard or from the
 * EnterpriseLayout's Studio panel.
 */
const DEFAULT_CARD_WIDTH_COLS = 6
const DEFAULT_CARD_HEIGHT_ROWS = 3
const GRID_COLUMNS = 12
const ROWS_PER_ADD_STRIDE = 2

function readExistingPlacements(storageKey: string): DashboardCardPlacement[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as DashboardCardPlacement[]
  } catch {
    // Ignore parse errors — treat as empty so we never destroy data on a bad read.
  }
  return []
}

const MissionSidebar = safeLazy(() => import('../layout/mission-sidebar'), 'MissionSidebar')
const MissionSidebarToggle = safeLazy(() => import('../layout/mission-sidebar'), 'MissionSidebarToggle')

export default function EnterpriseLayout() {
  const { config } = useSidebarConfig()
  const { isMobile } = useMobile()
  const location = useLocation()
  const dashboardContext = useDashboardContextOptional()

  // Enterprise sidebar always uses the standard default width — it does not
  // inherit the user-resized width from the main console sidebar (#9823).
  const sidebarWidthPx = isMobile
    ? 0
    : config.collapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : SIDEBAR_DEFAULT_WIDTH_PX

  const handleOpenStudio = useCallback(() => {
    dashboardContext?.openAddCardModal()
  }, [dashboardContext])

  const handleCloseStudio = useCallback(() => {
    dashboardContext?.closeAddCardModal()
  }, [dashboardContext])

  // #9832 — The enterprise sub-route currently displayed determines which
  // dashboard's card list the Studio should mutate. If the route isn't
  // mapped (e.g. the /enterprise portal index), the handler below falls
  // back to a safe no-op instead of silently mutating an unrelated slot.
  const activeStorageKey = ENTERPRISE_ROUTE_TO_STORAGE_KEY[location.pathname] ?? null

  /**
   * #9832 — Existing card types on the active enterprise dashboard. We
   * pass these to DashboardCustomizer so the Studio can disable / mark
   * already-added cards and avoid producing duplicates.
   *
   * We intentionally recompute this whenever the route or the open state
   * changes so the Studio always reflects what's currently persisted.
   */
  const existingCardTypes = useMemo(() => {
    if (!activeStorageKey) return []
    if (!dashboardContext?.isAddCardModalOpen) return []
    return readExistingPlacements(activeStorageKey).map((c) => c.cardType)
  }, [activeStorageKey, dashboardContext?.isAddCardModalOpen])

  /**
   * #9832 — Wire DashboardCustomizer's onAddCards to the active enterprise
   * dashboard's persisted card list. We append the newly selected cards
   * to the storage slot the matching UnifiedDashboard reads from on mount
   * and on `storage` events, then dispatch a synthetic StorageEvent so
   * the already-mounted dashboard picks up the change without a reload.
   *
   * If the current route isn't mapped (portal index, non-UnifiedDashboard
   * compliance pages), we fall back to a no-op — previously every
   * /enterprise/* route behaved this way, which is the bug this fix
   * addresses.
   */
  const handleAddCards = useCallback((cards: CardSuggestion[]) => {
    if (!activeStorageKey || cards.length === 0) return

    const existing = readExistingPlacements(activeStorageKey)
    const timestamp = Date.now()
    const additions: DashboardCardPlacement[] = cards.map((card, index) => ({
      id: `${card.type}-${timestamp}-${index}`,
      cardType: card.type,
      title: card.title,
      config: card.config,
      position: {
        x: (existing.length + index) % GRID_COLUMNS,
        y: Math.floor((existing.length + index) / ROWS_PER_ADD_STRIDE) * DEFAULT_CARD_HEIGHT_ROWS,
        w: DEFAULT_CARD_WIDTH_COLS,
        h: DEFAULT_CARD_HEIGHT_ROWS,
      },
    }))
    const updated = [...existing, ...additions]
    const serialized = JSON.stringify(updated)

    try {
      localStorage.setItem(activeStorageKey, serialized)
    } catch {
      // If persistence fails we still fire the storage event below so the
      // in-memory dashboard at least reflects the user's intent for the
      // current session. Swallowing here matches UnifiedDashboard's own
      // persistence error handling.
    }

    // Same-tab listeners don't receive native storage events, so synthesize
    // one. UnifiedDashboard's handler (see UnifiedDashboard.tsx) treats the
    // flat-cards key as authoritative when `hasTabs` is false, which is
    // the case for every enterprise dashboard today.
    window.dispatchEvent(new StorageEvent('storage', {
      key: activeStorageKey,
      newValue: serialized,
      storageArea: localStorage,
    }))
  }, [activeStorageKey])

  return (
    <VersionCheckProvider>
      {/* flex flex-col is required so the flex container below stretches
          to fill remaining height, giving <main> a constrained height
          for overflow-y-auto to work (scroll fix). */}
      <div className="h-screen bg-background text-foreground overflow-hidden flex flex-col">
        <Navbar />

        <div
          className="flex flex-1 overflow-hidden"
          style={{ paddingTop: NAVBAR_HEIGHT_PX }}
        >
          <EnterpriseSidebar />

          <main
            id="main-content"
            style={{
              marginLeft: isMobile ? 0 : sidebarWidthPx + SIDEBAR_CONTROLS_OFFSET_PX,
              marginRight: isMobile ? 0 : 'var(--mission-sidebar-width, 0px)',
            }}
            className="relative flex-1 p-4 pb-24 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:pb-28 md:pb-[calc(7rem+env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden scroll-enhanced min-w-0"
            data-transition-margin="true"
          >
            <div key={location.pathname} className="contents">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Console Studio floating action button */}
        <FloatingDashboardActions onOpenCustomizer={handleOpenStudio} />

        {/* Console Studio panel — responds to context's isAddCardModalOpen state.
            Without this, sidebar "Add more..." and FAB buttons set context state
            but nothing renders the Studio panel (#9801). */}
        {dashboardContext && (
          <DashboardCustomizer
            isOpen={dashboardContext.isAddCardModalOpen}
            onClose={handleCloseStudio}
            dashboardName="Enterprise Portal"
            onAddCards={handleAddCards}
            existingCardTypes={existingCardTypes}
            initialSection={dashboardContext.studioInitialSection}
            initialWidgetCardType={dashboardContext.studioWidgetCardType}
          />
        )}

        {/* AI Mission sidebar — same as main Layout */}
        <Suspense fallback={null}>
          <MissionSidebar />
          <MissionSidebarToggle />
        </Suspense>
      </div>
    </VersionCheckProvider>
  )
}
