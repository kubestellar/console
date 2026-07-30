import { useState, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useConsoleUsers, useAllK8sServiceAccounts, useAllOpenShiftUsers } from '../../hooks/useUsers'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { useDemoMode } from '../../hooks/useDemoMode'
import { emitUserRoleChanged, emitUserRemoved } from '../../lib/analytics'
import { ClusterUsersTab, ConsoleUsersTab, ServiceAccountsTab, UserManagementEmptyState, UserManagementSkeleton } from './UserManagementList'
import type { ConsoleUser, ConsoleUserSortBy, OpenShiftUser, OpenShiftUserSortBy, SASortBy, TabType, TranslateFn, UserManagementProps, UserRole } from './UserManagement.types'
import { USER_MANAGEMENT_TABS, getConsoleUserSortOptions, getOpenShiftUserSortOptions, getRoleBadgeClass, getSASortOptions, OPENSHIFT_USER_COMPARATORS, SA_COMPARATORS } from './UserManagement.utils'

export function UserManagement({ config: _config }: UserManagementProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>('clusterUsers')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({ clusterUsers: null, serviceAccounts: null, console: null })
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const { drillToRBAC } = useDrillDownActions()
  const { user: currentUser } = useAuth()
  const { users: allUsers, isLoading: usersLoading, isRefreshing: usersRefreshing, error: usersError, updateUserRole, deleteUser } = useConsoleUsers()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing } = useClusters()
  const { isDemoMode } = useDemoMode()
  // Fetch ALL SAs from ALL clusters upfront, filter locally
  const { serviceAccounts: allServiceAccounts, isLoading: sasInitialLoading } = useAllK8sServiceAccounts(allClusters)
  // Fetch ALL OpenShift users from ALL clusters upfront, filter locally
  const { users: allOpenshiftUsers, isLoading: openshiftInitialLoading } = useAllOpenShiftUsers(allClusters)

  // Only show loading state on initial load when there's no data
  const sasLoading = sasInitialLoading && (allServiceAccounts || []).length === 0
  const openshiftUsersLoading = openshiftInitialLoading && (allOpenshiftUsers || []).length === 0

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || usersLoading || sasInitialLoading || openshiftInitialLoading,
    isRefreshing: usersRefreshing || clustersRefreshing,
    hasAnyData: (allClusters || []).length > 0 || (allUsers || []).length > 0 || (allServiceAccounts || []).length > 0,
    isFailed: Boolean(usersError),
    consecutiveFailures: usersError ? 1 : 0,
    isDemoData: isDemoMode })

  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters by global filter (already deduplicated from hook)
  const clusters = useMemo(() => {
    if (isAllClustersSelected) return allClusters || []
    return (allClusters || []).filter(c => selectedClusters.includes(c.name))
  }, [isAllClustersSelected, allClusters, selectedClusters])

  // Ensure current user is always included from auth context
  const usersWithCurrent = useMemo(() => {
    let result = [...(Array.isArray(allUsers) ? allUsers : [])]
    if (currentUser && !result.some(u => u.github_id === currentUser.github_id)) {
      const authUser: ConsoleUser = {
        id: currentUser.id,
        github_id: currentUser.github_id,
        github_login: currentUser.github_login,
        email: currentUser.email,
        avatar_url: currentUser.avatar_url,
        role: currentUser.role || 'viewer',
        onboarded: currentUser.onboarded,
        created_at: new Date().toISOString() }
      result = [authUser, ...result]
    }
    return result
  }, [allUsers, currentUser])

  // Extract unique namespaces from service accounts (filtered by cluster if selected)
  const namespaces = useMemo(() => {
    const filteredSAs = selectedCluster
      ? (allServiceAccounts || []).filter(sa => sa.cluster === selectedCluster)
      : (allServiceAccounts || [])
    const nsSet = new Set((filteredSAs || []).map(sa => sa.namespace))
    return Array.from(nsSet).sort()
  }, [allServiceAccounts, selectedCluster])

  // Pre-filter OpenShift users by in-tab cluster dropdown (before passing to useCardData)
  const openshiftUsersPreFiltered = useMemo(() => {
    if (!selectedCluster) return allOpenshiftUsers || []
    return (allOpenshiftUsers || []).filter(u => u.cluster === selectedCluster)
  }, [selectedCluster, allOpenshiftUsers])

  // Pre-filter service accounts by in-tab cluster and namespace dropdowns
  const serviceAccountsPreFiltered = useMemo(() => {
    let result = allServiceAccounts || []
    if (selectedCluster) {
      result = (result || []).filter(sa => sa.cluster === selectedCluster)
    }
    if (selectedNamespace) {
      result = (result || []).filter(sa => sa.namespace === selectedNamespace)
    }
    return result
  }, [allServiceAccounts, selectedCluster, selectedNamespace])

  // Console user comparators (pins current user to top)
  const consoleUserComparators: Record<ConsoleUserSortBy, (a: ConsoleUser, b: ConsoleUser) => number> = useMemo(() => ({
    name: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return a.github_login.localeCompare(b.github_login)
    },
    role: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return a.role.localeCompare(b.role)
    },
    email: (a, b) => {
      if (a.github_id === currentUser?.github_id) return -1
      if (b.github_id === currentUser?.github_id) return 1
      return (a.email || '').localeCompare(b.email || '')
    } }), [currentUser?.github_id])

  // ---------- useCardData for OpenShift users tab ----------
  const {
    items: openshiftUserItems,
    totalItems: openshiftUserTotalItems,
    currentPage: openshiftUserCurrentPage,
    totalPages: openshiftUserTotalPages,
    itemsPerPage: openshiftUserItemsPerPage,
    goToPage: openshiftUserGoToPage,
    needsPagination: openshiftUserNeedsPagination,
    setItemsPerPage: setOpenShiftUserItemsPerPage,
    filters: openshiftUserFilters,
    sorting: openshiftUserSorting,
    containerRef,
    containerStyle } = useCardData<OpenShiftUser, OpenShiftUserSortBy>(openshiftUsersPreFiltered, {
    filter: {
      searchFields: ['name', 'cluster'] as (keyof OpenShiftUser)[],
      clusterField: 'cluster' as keyof OpenShiftUser,
      customPredicate: (u, query) =>
        (u.fullName?.toLowerCase() || '').includes(query) ||
        (u.groups?.some(g => g.toLowerCase().includes(query)) || false),
      storageKey: 'user-management-cluster-users' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: OPENSHIFT_USER_COMPARATORS },
    defaultLimit: 10 })

  // ---------- useCardData for Service Accounts tab ----------
  const {
    items: saItems,
    totalItems: saTotalItems,
    currentPage: saCurrentPage,
    totalPages: saTotalPages,
    itemsPerPage: saItemsPerPage,
    goToPage: saGoToPage,
    needsPagination: saNeedsPagination,
    setItemsPerPage: setSaItemsPerPage,
    filters: saFilters,
    sorting: saSorting } = useCardData<typeof allServiceAccounts[number], SASortBy>(serviceAccountsPreFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster'] as (keyof typeof allServiceAccounts[number])[],
      clusterField: 'cluster' as keyof typeof allServiceAccounts[number],
      storageKey: 'user-management-service-accounts' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: SA_COMPARATORS },
    defaultLimit: 10 })

  // ---------- useCardData for Console Users tab ----------
  const {
    items: consoleUserItems,
    totalItems: consoleUserTotalItems,
    currentPage: consoleUserCurrentPage,
    totalPages: consoleUserTotalPages,
    itemsPerPage: consoleUserItemsPerPage,
    goToPage: consoleUserGoToPage,
    needsPagination: consoleUserNeedsPagination,
    setItemsPerPage: setConsoleUserItemsPerPage,
    filters: consoleUserFilters,
    sorting: consoleUserSorting } = useCardData<ConsoleUser, ConsoleUserSortBy>(usersWithCurrent, {
    filter: {
      searchFields: ['github_login', 'email', 'role'] as (keyof ConsoleUser)[],
      storageKey: 'user-management-console-users' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: consoleUserComparators },
    defaultLimit: 10 })

  // Active tab's filter/sorting references for the controls row
  const activeFilters = activeTab === 'clusterUsers' ? openshiftUserFilters
    : activeTab === 'serviceAccounts' ? saFilters
    : consoleUserFilters

  const activeSorting = activeTab === 'clusterUsers' ? openshiftUserSorting
    : activeTab === 'serviceAccounts' ? saSorting
    : consoleUserSorting

  const activeItemsPerPage = activeTab === 'clusterUsers' ? openshiftUserItemsPerPage
    : activeTab === 'serviceAccounts' ? saItemsPerPage
    : consoleUserItemsPerPage

  const activeSetItemsPerPage = activeTab === 'clusterUsers' ? setOpenShiftUserItemsPerPage
    : activeTab === 'serviceAccounts' ? setSaItemsPerPage
    : setConsoleUserItemsPerPage

  const activeSortOptions = activeTab === 'clusterUsers' ? getOpenShiftUserSortOptions(t as unknown as TranslateFn)
    : activeTab === 'serviceAccounts' ? getSASortOptions(t as unknown as TranslateFn)
    : getConsoleUserSortOptions(t as unknown as TranslateFn)

  const isAdmin = currentUser?.role === 'admin'

  const focusTab = (tab: TabType) => {
    setActiveTab(tab)
    tabRefs.current[tab]?.focus()
  }

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: TabType) => {
    const currentIndex = USER_MANAGEMENT_TABS.indexOf(tab)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[(currentIndex + 1) % USER_MANAGEMENT_TABS.length])
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[(currentIndex - 1 + USER_MANAGEMENT_TABS.length) % USER_MANAGEMENT_TABS.length])
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(USER_MANAGEMENT_TABS[USER_MANAGEMENT_TABS.length - 1])
    }
  }

  // Count for current tab (shown in Row 1 LEFT)
  const currentTabCount = (() => {
    if (activeTab === 'clusterUsers') return openshiftUserTotalItems
    if (activeTab === 'serviceAccounts') return saTotalItems
    return consoleUserTotalItems
  })()

  const currentTabLabel = (() => {
    if (activeTab === 'clusterUsers') return t('userManagement.clusterUsers')
    if (activeTab === 'serviceAccounts') return t('userManagement.serviceAccounts')
    return t('userManagement.consoleUsers')
  })()

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole)
      // Issue 9285: route toast text through i18n so non-English users see
      // the message translated (previously hardcoded English).
      showToast(t('userManagement.toast.roleUpdateSuccess'), 'success')
      emitUserRoleChanged(newRole)
    } catch {
      // User-visible toast already surfaces the failure (#8816)
      showToast(t('userManagement.toast.roleUpdateError'), 'error')
    }
  }

  // Issue 9284: the ConsoleUsersTab already wraps this handler in a
  // ConfirmDialog (the app-styled modal). The extra window.confirm() call
  // here caused a double-confirm flow AND fell back to a native browser
  // popup that's blockable. Rely on the dialog-based confirmation.
  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId)
      // Issue 9285: i18n for success/error toasts.
      showToast(t('userManagement.toast.deleteSuccess'), 'success')
      emitUserRemoved()
    } catch {
      // User-visible toast already surfaces the failure (#8816)
      showToast(t('userManagement.toast.deleteError'), 'error')
    }
  }

  if (showSkeleton) return <UserManagementSkeleton />

  if (showEmptyState) return <UserManagementEmptyState />

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Row 1: Header with count badge and controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {currentTabCount} {currentTabLabel}
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={
            activeFilters.localClusterFilter.length > 0
              ? {
                  selectedCount: activeFilters.localClusterFilter.length,
                  totalCount: activeFilters.availableClusters.length }
              : undefined
          }
          clusterFilter={
            activeFilters.availableClusters.length >= 1
              ? {
                  availableClusters: activeFilters.availableClusters,
                  selectedClusters: activeFilters.localClusterFilter,
                  onToggle: activeFilters.toggleClusterFilter,
                  onClear: activeFilters.clearClusterFilter,
                  isOpen: activeFilters.showClusterFilter,
                  setIsOpen: activeFilters.setShowClusterFilter,
                  containerRef: activeFilters.clusterFilterRef,
                  minClusters: 1 }
              : undefined
          }
          cardControls={{
            limit: activeItemsPerPage,
            onLimitChange: activeSetItemsPerPage,
            sortBy: activeSorting.sortBy,
            sortOptions: activeSortOptions,
            onSortChange: (v) => {
              if (activeTab === 'clusterUsers') openshiftUserSorting.setSortBy(v as OpenShiftUserSortBy)
              else if (activeTab === 'serviceAccounts') saSorting.setSortBy(v as SASortBy)
              else consoleUserSorting.setSortBy(v as ConsoleUserSortBy)
            },
            sortDirection: activeSorting.sortDirection,
            onSortDirectionChange: activeSorting.setSortDirection }}
          className="mb-0"
        />
      </div>

      {/* Row 2: Search input */}
      <CardSearchInput
        value={activeFilters.search}
        onChange={activeFilters.setSearch}
        placeholder={
          activeTab === 'clusterUsers' ? t('userManagement.searchClusterUsers') :
          activeTab === 'serviceAccounts' ? t('userManagement.searchServiceAccounts') :
          t('userManagement.searchConsoleUsers')
        }
        className="mb-2 shrink-0"
      />

      {/* Row 3: Tab filter pills */}
      <div className="flex items-center gap-1 mb-3 shrink-0" role="tablist" aria-label={t('userManagement.consoleUsers')}>
        <button
          ref={node => { tabRefs.current.clusterUsers = node }}
          id="user-management-tab-clusterUsers"
          role="tab"
          aria-selected={activeTab === 'clusterUsers'}
          aria-controls="user-management-panel-clusterUsers"
          tabIndex={activeTab === 'clusterUsers' ? 0 : -1}
          onClick={() => setActiveTab('clusterUsers')}
          onKeyDown={(event) => handleTabKeyDown(event, 'clusterUsers')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'clusterUsers'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('userManagement.clusterUsers')}
        </button>
        <button
          ref={node => { tabRefs.current.serviceAccounts = node }}
          id="user-management-tab-serviceAccounts"
          role="tab"
          aria-selected={activeTab === 'serviceAccounts'}
          aria-controls="user-management-panel-serviceAccounts"
          tabIndex={activeTab === 'serviceAccounts' ? 0 : -1}
          onClick={() => setActiveTab('serviceAccounts')}
          onKeyDown={(event) => handleTabKeyDown(event, 'serviceAccounts')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'serviceAccounts'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('userManagement.serviceAccounts')}
        </button>
        <button
          ref={node => { tabRefs.current.console = node }}
          id="user-management-tab-console"
          role="tab"
          aria-selected={activeTab === 'console'}
          aria-controls="user-management-panel-console"
          tabIndex={activeTab === 'console' ? 0 : -1}
          onClick={() => setActiveTab('console')}
          onKeyDown={(event) => handleTabKeyDown(event, 'console')}
          className={cn(
            'px-2 py-1 rounded text-xs font-medium transition-colors',
            activeTab === 'console'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('userManagement.consoleUsers')}
        </button>
      </div>

      {/* Content - fixed height to prevent jumping, p-px prevents border clipping */}
      <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0 p-px" style={containerStyle}>
        {activeTab === 'clusterUsers' && (
          <div role="tabpanel" id="user-management-panel-clusterUsers" aria-labelledby="user-management-tab-clusterUsers">
            <ClusterUsersTab
              clusters={clusters}
              selectedCluster={selectedCluster}
              setSelectedCluster={setSelectedCluster}
              users={openshiftUserItems}
              isLoading={openshiftUsersLoading}
              showClusterBadge={true}
              onDrillToUser={(cluster, name) =>
                drillToRBAC(cluster, undefined, name, { type: 'User' })
              }
            />
          </div>
        )}

        {activeTab === 'serviceAccounts' && (
          <div role="tabpanel" id="user-management-panel-serviceAccounts" aria-labelledby="user-management-tab-serviceAccounts">
            <ServiceAccountsTab
              clusters={clusters}
              selectedCluster={selectedCluster}
              setSelectedCluster={setSelectedCluster}
              selectedNamespace={selectedNamespace}
              setSelectedNamespace={setSelectedNamespace}
              namespaces={namespaces}
              serviceAccounts={saItems}
              isLoading={sasLoading}
              showClusterBadge={true}
              onDrillToServiceAccount={(cluster, namespace, name, roles) =>
                drillToRBAC(cluster, namespace, name, {
                  type: 'ServiceAccount',
                  roles })
              }
            />
          </div>
        )}

        {activeTab === 'console' && (
          <div role="tabpanel" id="user-management-panel-console" aria-labelledby="user-management-tab-console">
            <ConsoleUsersTab
              users={consoleUserItems}
              isLoading={usersLoading}
              isAdmin={isAdmin}
              currentUserGithubId={currentUser?.github_id}
              expandedUser={expandedUser}
              setExpandedUser={setExpandedUser}
              onRoleChange={handleRoleChange}
              onDeleteUser={handleDeleteUser}
              getRoleBadgeClass={getRoleBadgeClass}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      {activeTab === 'clusterUsers' && (
        <CardPaginationFooter
          currentPage={openshiftUserCurrentPage}
          totalPages={openshiftUserTotalPages}
          totalItems={openshiftUserTotalItems}
          itemsPerPage={typeof openshiftUserItemsPerPage === 'number' ? openshiftUserItemsPerPage : openshiftUserTotalItems}
          onPageChange={openshiftUserGoToPage}
          needsPagination={openshiftUserNeedsPagination && openshiftUserItemsPerPage !== 'unlimited'}
        />
      )}
      {activeTab === 'serviceAccounts' && (
        <CardPaginationFooter
          currentPage={saCurrentPage}
          totalPages={saTotalPages}
          totalItems={saTotalItems}
          itemsPerPage={typeof saItemsPerPage === 'number' ? saItemsPerPage : saTotalItems}
          onPageChange={saGoToPage}
          needsPagination={saNeedsPagination && saItemsPerPage !== 'unlimited'}
        />
      )}
      {activeTab === 'console' && (
        <CardPaginationFooter
          currentPage={consoleUserCurrentPage}
          totalPages={consoleUserTotalPages}
          totalItems={consoleUserTotalItems}
          itemsPerPage={typeof consoleUserItemsPerPage === 'number' ? consoleUserItemsPerPage : consoleUserTotalItems}
          onPageChange={consoleUserGoToPage}
          needsPagination={consoleUserNeedsPagination && consoleUserItemsPerPage !== 'unlimited'}
        />
      )}
    </div>
  )
}
