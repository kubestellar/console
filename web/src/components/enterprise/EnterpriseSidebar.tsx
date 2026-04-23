/**
 * Enterprise Sidebar — Dedicated left navigation for the Enterprise Compliance Portal.
 *
 * Replaces the main sidebar when the user navigates to /enterprise.
 * Organized by compliance vertical (epic) with collapsible sections.
 */
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2, ChevronLeft, ChevronDown, ChevronRight,
  LayoutDashboard, Landmark, Heart, Shield, KeyRound, Radar,
  Container, Scale, GitBranch, Users, Globe, FileText,
  ShieldCheck, FlaskConical, Handshake, BookOpen, ShieldAlert,
  WifiOff, Award, Fingerprint, Lock, Clock, Radio, Siren, Bug,
  Package, BadgeCheck, GitCommitHorizontal, Monitor, AlertTriangle,
  CheckCircle, FileCheck,
} from 'lucide-react'
import { ENTERPRISE_NAV_SECTIONS } from './enterpriseNav'
import type { EnterpriseNavSection } from './enterpriseNav'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, LayoutDashboard, Landmark, Heart, Shield, KeyRound, Radar,
  Container, Scale, GitBranch, Users, Globe, FileText,
  ShieldCheck, FlaskConical, Handshake, BookOpen, ShieldAlert,
  WifiOff, Award, Fingerprint, Lock, Clock, Radio, Siren, Bug,
  Package, BadgeCheck, GitCommitHorizontal, Monitor, AlertTriangle,
  CheckCircle, FileCheck,
}

function SectionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}

function NavSection({ section, defaultOpen }: { section: EnterpriseNavSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? true)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors"
      >
        <SectionIcon name={section.icon} className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{section.title}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="ml-2 space-y-0.5">
          {section.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.href}
              end={item.href === '/enterprise'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-purple-500/15 text-purple-400 border-l-2 border-purple-500'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white border-l-2 border-transparent'
                }`
              }
            >
              <SectionIcon name={item.icon} className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 font-medium">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EnterpriseSidebar() {
  const navigate = useNavigate()

  return (
    <aside className="w-64 h-screen bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Console</span>
        </button>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-purple-400" />
          <h1 className="text-base font-semibold text-white">Enterprise</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">Compliance & Governance</p>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-1 space-y-1 scrollbar-thin scrollbar-thumb-gray-700">
        {ENTERPRISE_NAV_SECTIONS.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            defaultOpen={section.id === 'overview'}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800">
        <div className="text-[10px] text-gray-600 text-center">
          3 of 7 verticals active
        </div>
      </div>
    </aside>
  )
}
