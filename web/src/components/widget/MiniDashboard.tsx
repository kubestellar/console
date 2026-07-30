/**
 * Mini Dashboard - PWA Widget Mode
 *
 * A compact, always-refreshing dashboard designed to be installed as a
 * Progressive Web App (PWA) for desktop monitoring.
 *
 * Install: Click browser menu → "Install app" or "Add to Desktop"
 *
 * State/effect logic lives in `./useMiniDashboard`.
 * Presentational subcomponents live in `./MiniDashboard.parts`.
 */

import { useTranslation } from 'react-i18next'
import { useMiniDashboard } from './useMiniDashboard'
import {
  DashboardHeader,
  StatsGrid,
  IssuesList,
  InstallFooter,
} from './MiniDashboard.parts'

export function MiniDashboard() {
  const { t } = useTranslation()
  const {
    totalClusters,
    healthyClusters,
    totalGPUs,
    allocatedGPUs,
    totalIssues,
    offlineCount,
    criticalIssues,
    allNodes,
    podIssues,
    overallStatus,
    isRefreshing,
    lastUpdated,
    isInstalled,
    isSafariBrowser,
    installPrompt,
    handleRefresh,
    handleInstall,
    openInBrowser,
    openFullDashboard,
  } = useMiniDashboard()

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-900 to-gray-800 text-white flex items-center justify-center p-2">
      {/* Fixed-size widget container */}
      <div className="w-[520px] h-[320px] flex flex-col bg-background/50 rounded-xl border border-border/50 overflow-hidden">
        <div className="flex-1 p-4 overflow-hidden">
          <DashboardHeader
            overallStatus={overallStatus}
            lastUpdated={lastUpdated}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onOpenFullDashboard={openFullDashboard}
            t={t}
          />

          {/* Stats Grid – 3 columns × 2 rows, status display only */}
          <StatsGrid
            totalClusters={totalClusters}
            healthyClusters={healthyClusters}
            allocatedGPUs={allocatedGPUs}
            totalGPUs={totalGPUs}
            offlineCount={offlineCount}
            totalIssues={totalIssues}
            criticalIssues={criticalIssues}
            allNodes={allNodes}
            overallStatus={overallStatus}
          />

          <IssuesList
            totalIssues={totalIssues}
            podIssues={podIssues}
            onOpenIssue={(podName) =>
              openInBrowser(`/pods?search=${encodeURIComponent(podName)}`)
            }
          />
        </div>{/* End scrollable content */}

        {/* Footer / Install Prompt */}
        <div className="p-3 bg-background/90 border-t border-border/50 shrink-0">
          <InstallFooter
            isInstalled={isInstalled}
            isSafariBrowser={isSafariBrowser}
            installPrompt={installPrompt}
            onInstall={handleInstall}
            onOpenFullDashboard={openFullDashboard}
            t={t}
          />
        </div>
      </div>{/* End fixed-size container */}
    </div>
  )
}

export default MiniDashboard
