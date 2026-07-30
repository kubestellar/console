/**
 * MissionTypeExplainer — Educates demo visitors about mission types.
 * Shows a collapsible "How AI Missions work" section explaining how
 * Install, Fix, Mission Control, and Orbit missions work together.
 * Only visible in demo mode.
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Rocket, Wrench, Sparkles, Satellite } from 'lucide-react'
import { isDemoMode } from '../../lib/demoMode'
import { cn } from '../../lib/cn'

const MISSION_TYPES = [
  {
    icon: Rocket,
    label: 'Install',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    description: 'Deploy CNCF projects to your clusters with guided steps and validation.',
  },
  {
    icon: Wrench,
    label: 'Fix',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    description: 'AI diagnoses issues, finds root cause, and applies fixes automatically.',
  },
  {
    icon: Sparkles,
    label: 'Mission Control',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    description: 'Orchestrate multi-project deployments across clusters in phased rollouts.',
  },
  {
    icon: Satellite,
    label: 'Orbit',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    description: 'Recurring maintenance keeps deployments healthy with auto-run scheduling.',
  },
] as const

export function MissionTypeExplainer() {
  const [isExpanded, setIsExpanded] = useState(true)

  if (!isDemoMode()) return null

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border/50 bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/30 transition-colors"
      >
        <span className="text-[11px] font-semibold text-foreground">How AI Missions work</span>
        {isExpanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {MISSION_TYPES.map(type => (
            <div key={type.label} className="flex items-start gap-2">
              <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5', type.bg)}>
                <type.icon className={cn('w-3 h-3', type.color)} />
              </div>
              <div>
                <span className={cn('text-[11px] font-medium', type.color)}>{type.label}</span>
                <p className="text-[10px] text-muted-foreground leading-snug">{type.description}</p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
            Mission Control combines all types: install projects, fix issues during deployment, then set up orbital maintenance to keep everything running.
          </p>
        </div>
      )}
    </div>
  )
}
