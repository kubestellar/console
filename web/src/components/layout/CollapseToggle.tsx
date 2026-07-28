import { SidebarCollapseControls } from './sidebar/SidebarCollapseControls'

interface CollapseToggleProps {
  showCollapsePin: boolean
  isMobile: boolean
  isCollapsed: boolean
  isPinned: boolean
  sidebarWidth: number
  isMissionFullScreen: boolean
  configCollapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
  toggleSidebarPin: () => void
}

export function CollapseToggle({
  showCollapsePin,
  isMobile,
  isCollapsed,
  isPinned,
  sidebarWidth,
  isMissionFullScreen,
  configCollapsed,
  setCollapsed,
  toggleCollapsed,
  toggleSidebarPin,
}: CollapseToggleProps) {
  if (!showCollapsePin || isMobile) return null

  return (
    <SidebarCollapseControls
      isCollapsed={isCollapsed}
      isPinned={isPinned}
      sidebarWidth={sidebarWidth}
      isMissionFullScreen={isMissionFullScreen}
      onToggleCollapse={() => {
        if (configCollapsed) {
          setCollapsed(false)
        } else {
          toggleCollapsed()
        }
      }}
      onTogglePin={toggleSidebarPin}
    />
  )
}
