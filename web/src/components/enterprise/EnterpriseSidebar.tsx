/**
 * Enterprise Sidebar — Dedicated left navigation for the Enterprise Compliance Portal.
 *
 * Replaces the main sidebar when the user navigates to /enterprise.
 * Organized by compliance vertical (epic) with collapsible sections.
 * Now composes SidebarShell for consistent chrome (collapse, pin, resize, mobile).
 *
 * IMPORTANT: navSections, features, and branding are memoized to prevent
 * cascading re-renders in SidebarShell. Without memoization, every parent
 * re-render (from VersionCheckProvider, cluster cache, etc.) creates new
 * prop objects, which re-render SidebarShell and all its hook subscribers,
 * amplifying into a React #185 "too many re-renders" loop on enterprise
 * compliance pages (#9753, #9754).
 */
import { useMemo, useCallback } from 'react'
import { Building2 } from 'lucide-react'
import { SidebarShell } from '../layout/SidebarShell'
import type { NavSection } from '../layout/SidebarShell'
import { ENTERPRISE_NAV_SECTIONS } from './enterpriseNav'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'

/** Stable features config — created once outside the component */
const SIDEBAR_FEATURES = {
  missions: true,
  addCard: true,
  clusterStatus: true,
  collapsePin: true,
  resize: true,
  activeUsers: true,
} as const

export default function EnterpriseSidebar() {
  const dashboardContext = useDashboardContextOptional()

  const navSections: NavSection[] = useMemo(() =>
    ENTERPRISE_NAV_SECTIONS.map(section => ({
      id: section.id,
      label: section.title,
      items: section.items.map(item => ({
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon,
        badge: item.badge,
      })),
      collapsible: true,
    })),
  [])

  const branding = useMemo(() => ({
    title: 'Enterprise',
    logo: <Building2 className="w-5 h-5 text-purple-400" />,
    subtitle: 'Compliance Portal',
  }), [])

  const handleAddCard = useCallback(() => {
    dashboardContext?.openAddCardModal()
  }, [dashboardContext])

  const handleAddMore = useCallback(() => {
    dashboardContext?.openAddCardModal('dashboards')
  }, [dashboardContext])

  return (
    <SidebarShell
      navSections={navSections}
      features={SIDEBAR_FEATURES}
      branding={branding}
      onAddCard={handleAddCard}
      onAddMore={handleAddMore}
    />
  )
}
