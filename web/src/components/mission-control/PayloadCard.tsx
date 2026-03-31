/**
 * PayloadCard — A single CNCF project card in the payload grid.
 * Shows GitHub avatar, maturity badge, category gradient, priority, and remove button.
 */

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Star, ChevronDown, ArrowLeftRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { MATURITY_CONFIG, CNCF_CATEGORY_GRADIENTS } from '../../lib/cncf-constants'
import type { PayloadProject } from './types'

// Reuse InstallerCard's GitHub org mapping
const PROJECT_TO_GITHUB_ORG: Record<string, string> = {
  envoy: 'envoyproxy', argo: 'argoproj', argocd: 'argoproj',
  'argo-cd': 'argoproj', harbor: 'goharbor', jaeger: 'jaegertracing',
  fluentd: 'fluent', 'fluent-bit': 'fluent', vitess: 'vitessio',
  thanos: 'thanos-io', cortex: 'cortexproject', falco: 'falcosecurity',
  keda: 'kedacore', flux: 'fluxcd', trivy: 'aquasecurity',
  antrea: 'antrea-io', contour: 'projectcontour',
  'open-policy-agent': 'open-policy-agent', opa: 'open-policy-agent',
  'open-telemetry': 'open-telemetry', opentelemetry: 'open-telemetry',
  strimzi: 'strimzi', spiffe: 'spiffe', spire: 'spiffe',
  'cert-manager': 'cert-manager', prometheus: 'prometheus',
  grafana: 'grafana', istio: 'istio', linkerd: 'linkerd',
  helm: 'helm', cilium: 'cilium', calico: 'projectcalico',
  'kube-prometheus': 'prometheus-operator', metallb: 'metallb',
  kyverno: 'kyverno', crossplane: 'crossplane', dapr: 'dapr',
  knative: 'knative', nats: 'nats-io', etcd: 'etcd-io',
  coredns: 'coredns', rook: 'rook', longhorn: 'longhorn',
  velero: 'vmware-tanzu', 'external-secrets': 'external-secrets',
  kubevirt: 'kubevirt', 'chaos-mesh': 'chaos-mesh',
}

function getAvatarUrl(project: PayloadProject): string {
  const key = project.name.toLowerCase()
  const org = project.githubOrg || PROJECT_TO_GITHUB_ORG[key] || key
  return `https://github.com/${org}.png?size=80`
}

function getCategoryGradient(category: string): [string, string] {
  return (CNCF_CATEGORY_GRADIENTS as Record<string, [string, string]>)[category] ?? ['var(--cncf-default-start)', 'var(--cncf-default-end)']
}

const PRIORITY_STYLES = {
  required: 'bg-red-500/15 dark:bg-red-500/20 text-red-400 dark:text-red-300 border-red-500/30 dark:border-red-400/30',
  recommended: 'bg-blue-500/15 dark:bg-blue-500/20 text-blue-400 dark:text-blue-300 border-blue-500/30 dark:border-blue-400/30',
  optional: 'bg-gray-500/15 dark:bg-gray-400/15 text-gray-400 dark:text-gray-300 border-gray-500/30 dark:border-gray-400/30',
} as const

interface PayloadCardProps {
  project: PayloadProject
  onRemove: () => void
  onUpdatePriority: (priority: PayloadProject['priority']) => void
  onHover?: (project: PayloadProject | null) => void
  onClick?: () => void
  installed?: boolean
}

export function PayloadCard({ project, onRemove, onUpdatePriority, onHover, onClick, installed }: PayloadCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [showDeps, setShowDeps] = useState(false)
  const depRef = useRef<HTMLSpanElement>(null)
  const gradient = getCategoryGradient(project.category)
  const maturity = project.maturity ? MATURITY_CONFIG[project.maturity] : null

  return (
    <motion.div
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="relative group"
      onMouseEnter={() => onHover?.(project)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        className={cn(
          'rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow',
          onClick && 'cursor-pointer'
        )}
        onClick={onClick}
        style={{
          borderTopColor: gradient[0],
          borderTopWidth: 2,
        }}
      >
        {/* Header with gradient accent */}
        <div className="flex items-start gap-3 p-3">
          {/* Avatar */}
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/90 dark:bg-white/10 shadow-sm flex items-center justify-center overflow-hidden">
            {!imgFailed ? (
              <img
                src={getAvatarUrl(project)}
                alt={project.displayName}
                className="w-8 h-8 rounded object-contain"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
                style={{
                  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                }}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium truncate">{project.displayName}</h4>
              {/* Remove button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="opacity-0 group-hover:opacity-100 !p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                title="Remove"
                icon={<X className="w-3 h-3" />}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {project.reason}
            </p>
          </div>
        </div>

        {/* Footer: badges */}
        <div className="flex items-center gap-1.5 px-3 pb-2.5 flex-wrap">
          {/* Category */}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full text-white/90 font-medium"
            style={{
              background: `linear-gradient(135deg, ${gradient[0]}90, ${gradient[1]}90)`,
            }}
          >
            {project.category}
          </span>

          {/* Installed / Needs deploy */}
          {installed != null && (
            installed ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 dark:bg-green-500/20 text-green-400 dark:text-green-300 border border-green-500/30 dark:border-green-400/30 font-medium">
                Installed
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 dark:bg-slate-400/15 text-slate-400 dark:text-slate-300 border border-dashed border-slate-500/30 dark:border-slate-400/30 font-medium">
                Needs deploy
              </span>
            )
          )}

          {/* Swapped indicator */}
          {project.originalName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 dark:bg-amber-500/20 text-amber-400 dark:text-amber-300 border border-amber-500/30 dark:border-amber-400/30 font-medium flex items-center gap-0.5">
              <ArrowLeftRight className="w-2.5 h-2.5" />
              Swapped
            </span>
          )}

          {/* Maturity */}
          {maturity && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                maturity.color,
                maturity.bg,
                maturity.border
              )}
            >
              {maturity.label}
            </span>
          )}

          {/* Priority dropdown */}
          <div className="relative ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setShowPriorityMenu(!showPriorityMenu)
              }}
              className={cn(
                '!text-[10px] !px-1.5 !py-0.5 rounded-full border !gap-0.5 cursor-pointer',
                PRIORITY_STYLES[project.priority]
              )}
              icon={project.priority === 'required' ? <Star className="w-2.5 h-2.5" /> : undefined}
              iconRight={<ChevronDown className={cn('w-2.5 h-2.5 transition-transform', showPriorityMenu && 'rotate-180')} />}
            >
              {project.priority}
            </Button>
            {showPriorityMenu && (
              <>
                {/* Backdrop to close on outside click */}
                <div className="fixed inset-0 z-20" role="presentation" onClick={() => setShowPriorityMenu(false)} />
                <div className="absolute right-0 bottom-full mb-1 bg-slate-900 border border-border rounded-lg shadow-lg py-1 z-30 min-w-[100px]">
                  {(['required', 'recommended', 'optional'] as const).map((p) => (
                    <Button
                      key={p}
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdatePriority(p)
                        setShowPriorityMenu(false)
                      }}
                      className={cn(
                        'w-full !justify-start !text-xs !px-3 !py-1.5 !rounded-none capitalize',
                        project.priority === p && 'font-medium text-primary'
                      )}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Dependencies indicator with portal tooltip */}
          {project.dependencies.length > 0 && (
            <>
              <span
                ref={depRef}
                className="text-[10px] text-muted-foreground cursor-default underline decoration-dotted"
                onMouseEnter={() => setShowDeps(true)}
                onMouseLeave={() => setShowDeps(false)}
              >
                +{project.dependencies.length} dep{project.dependencies.length !== 1 ? 's' : ''}
              </span>
              {showDeps && depRef.current && createPortal(
                <div
                  className="fixed z-[100] pointer-events-none"
                  style={{
                    left: depRef.current.getBoundingClientRect().left + depRef.current.getBoundingClientRect().width / 2,
                    top: depRef.current.getBoundingClientRect().top - 4,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-xl px-3 py-2 whitespace-nowrap">
                    <p className="text-[10px] font-medium text-slate-400 mb-1">Dependencies:</p>
                    {project.dependencies.map((dep) => (
                      <p key={dep} className="text-xs text-white">{dep}</p>
                    ))}
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
