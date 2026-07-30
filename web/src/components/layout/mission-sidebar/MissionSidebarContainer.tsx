import { useLocation, useSearchParams } from 'react-router-dom'
import { useMobile } from '../../../hooks/useMobile'
import type { MissionExport } from '../../../lib/missions/types'
import { MISSION_IMPORT_QUERY_KEY } from './missionSidebarConstants'
import { useMissionSidebarState } from './useMissionSidebarState'
import { useMissionSidebarActions } from './useMissionSidebarActions'
import { useSidebarResize } from './useSidebarResize'
import { MissionSidebarMinimized } from './MissionSidebarMinimized'
import { MissionSidebarSurface } from './MissionSidebarContainer.parts'
import { MissionSidebarDialogHost, MissionSidebarToggle } from './MissionSidebarContainer.dialogs'

export { MissionSidebarToggle }

type MissionSidebarLocationState = {
  prefetchedMission?: MissionExport
} | null

export function MissionSidebar() {
  const { isMobile } = useMobile()
  const { sidebarWidth, isResizing, isTablet, handleResizeStart } = useSidebarResize()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const prefetchedMission = (location.state as MissionSidebarLocationState)?.prefetchedMission
  const directImportSlug = searchParams.get(MISSION_IMPORT_QUERY_KEY)

  const state = useMissionSidebarState()
  const actions = useMissionSidebarActions({
    state,
    searchParams,
    setSearchParams,
    prefetchedMission,
    directImportSlug,
    isMobile,
    isTablet,
    sidebarWidth,
  })

  if (state.isSidebarOpen && state.isSidebarMinimized && !isMobile) {
    return (
      <MissionSidebarMinimized
        onExpand={state.expandSidebar}
        activeMissionsCount={state.activeMissions.length}
        runningCount={state.runningCount}
        needsAttention={state.needsAttention}
      />
    )
  }

  return (
    <>
      {state.isSidebarOpen && !state.isSidebarMinimized && (
        <MissionSidebarSurface
          state={state}
          actions={actions}
          isMobile={isMobile}
          isTablet={isTablet}
          isResizing={isResizing}
          sidebarWidth={sidebarWidth}
          onResizeStart={handleResizeStart}
        />
      )}

      <MissionSidebarDialogHost state={state} actions={actions} isMobile={isMobile} />
    </>
  )
}
