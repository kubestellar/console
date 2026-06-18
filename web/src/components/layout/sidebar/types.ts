/**
 * Sidebar type definitions extracted from SidebarShell.
 */

export interface NavSection {
  id: string
  label?: string
  items: SidebarNavItem[]
  collapsible?: boolean
}

export interface SidebarNavItem {
  id: string
  label: string
  href: string
  icon: string
  badge?: string
  badgeColor?: string
  /** When true the item came from the user's sidebar config and supports
   *  inline rename / removal. Maps to `SidebarItem.isCustom`. */
  isCustom?: boolean
}

export interface SidebarFeatures {
  missions?: boolean
  addCard?: boolean
  addMore?: boolean
  clusterStatus?: boolean
  activeUsers?: boolean
  versionCheck?: boolean
  dragReorder?: boolean
  resize?: boolean
  collapsePin?: boolean
  snoozedCards?: boolean
}

export interface SidebarBranding {
  title?: string
  logo?: React.ReactNode
  subtitle?: string
}

export interface SidebarShellProps {
  navSections: NavSection[]
  features?: SidebarFeatures
  branding?: SidebarBranding
  storageKeyPrefix?: string
  footer?: React.ReactNode
  onAddMore?: () => void
  onAddCard?: () => void
  children?: React.ReactNode
  widthOverride?: number
}
