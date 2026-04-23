/**
 * Enterprise Sidebar — Dedicated left navigation for the Enterprise Compliance Portal.
 *
 * Replaces the main sidebar when the user navigates to /enterprise.
 * Organized by compliance vertical (epic) with collapsible sections.
 * Now composes SidebarShell for consistent chrome (collapse, pin, resize, mobile).
 */
import { Building2 } from 'lucide-react'
import { SidebarShell } from '../layout/SidebarShell'
import type { NavSection } from '../layout/SidebarShell'
import { ENTERPRISE_NAV_SECTIONS } from './enterpriseNav'

export default function EnterpriseSidebar() {
  const navSections: NavSection[] = ENTERPRISE_NAV_SECTIONS.map(section => ({
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
  }))

  return (
    <SidebarShell
      navSections={navSections}
      features={{
        missions: true,
        addCard: true,
        clusterStatus: true,
        collapsePin: true,
        resize: true,
        activeUsers: true,
      }}
      branding={{
        title: 'Enterprise',
        logo: <Building2 className="w-5 h-5 text-purple-400" />,
        subtitle: 'Compliance Portal',
      }}
    />
  )
}
