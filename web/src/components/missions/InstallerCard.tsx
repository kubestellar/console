/**
 * InstallerCard — Rich card for CNCF installer missions.
 * Shows project logo (falls back to category icon), maturity badge, difficulty,
 * install methods, and import button.
 */

import { useState, useEffect, useRef } from 'react'
import { ExternalLink, Download, Wrench, Trash2, ArrowUpCircle, AlertTriangle, Link, Check } from 'lucide-react'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { cn } from '../../lib/cn'
import {
  CNCF_CATEGORY_GRADIENTS,
  CNCF_CATEGORY_ICONS,
  MATURITY_CONFIG,
  DIFFICULTY_CONFIG,
} from '../../lib/cncf-constants'
import type { MissionExport } from '../../lib/missions/types'

/**
 * Map cncfProject names to their GitHub org when the org name differs.
 * Projects not listed here use cncfProject directly as the GitHub org.
 */
const PROJECT_TO_GITHUB_ORG: Record<string, string> = {
  envoy: 'envoyproxy',
  argo: 'argoproj',
  argocd: 'argoproj',
  'argo-cd': 'argoproj',
  'argo-rollouts': 'argoproj',
  'argo-workflows': 'argoproj',
  'argo-events': 'argoproj',
  harbor: 'goharbor',
  jaeger: 'jaegertracing',
  fluentd: 'fluent',
  'fluentd-operator': 'fluent',
  'fluent-bit': 'fluent',
  vitess: 'vitessio',
  thanos: 'thanos-io',
  cortex: 'cortexproject',
  falco: 'falcosecurity',
  keda: 'kedacore',
  flux: 'fluxcd',
  antrea: 'antrea-io',
  armada: 'armadaproject',
  atlantis: 'runatlantis',
  bfe: 'bfenetworks',
  'chaos-mesh': 'chaos-mesh',
  contour: 'projectcontour',
  'cloud-custodian': 'cloud-custodian',
  'in-toto': 'in-toto',
  'k8s-gateway-api': 'kubernetes-sigs',
  'kube-rs': 'kube-rs',
  'kube-vip': 'kube-vip',
  kubeedge: 'kubeedge',
  'metal-lb': 'metallb',
  metallb: 'metallb',
  'network-service-mesh': 'networkservicemesh',
  'nats-io': 'nats-io',
  nats: 'nats-io',
  notary: 'notaryproject',
  'open-policy-agent': 'open-policy-agent',
  opa: 'open-policy-agent',
  'open-telemetry': 'open-telemetry',
  opentelemetry: 'open-telemetry',
  parsec: 'parallaxsecond',
  piraeus: 'piraeusdatastore',
  porter: 'getporter',
  'service-mesh-interface': 'servicemeshinterface',
  spiffe: 'spiffe',
  spire: 'spiffe',
  strimzi: 'strimzi',
  'telepresence': 'telepresenceio',
  tikv: 'tikv',
  trivy: 'aquasecurity',
  volcano: 'volcano-sh',
  'aeraki-mesh': 'aeraki-mesh',
  akri: 'project-akri',
  'artifact-hub': 'artifacthub',
  'external-secrets': 'external-secrets',
  'kube-prometheus': 'prometheus-operator',
  'prometheus-operator': 'prometheus-operator',
}

/** GitHub avatar image size in pixels */
const GITHUB_AVATAR_SIZE = 80

/** Resolve a cncfProject name to a GitHub org avatar URL */
function getProjectLogoUrl(cncfProject: string): string {
  const org = PROJECT_TO_GITHUB_ORG[cncfProject.toLowerCase()] ?? cncfProject
  return `https://github.com/${org}.png?size=${GITHUB_AVATAR_SIZE}`
}

// ============================================================================
// CategoryIcon — SVG fallback when no project logo is available
// ============================================================================

function CategoryIcon({ iconPath, size }: { iconPath: string; size: 'sm' | 'lg' }) {
  const iconCls = size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className={cn(iconCls, 'text-white drop-shadow-md')}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPath} />
    </svg>
  )
  /* Large icons get a frosted backdrop for contrast on gradient headers */
  if (size === 'lg') {
    return (
      <div className="w-12 h-12 rounded-xl bg-black/25 backdrop-blur-sm shadow-sm flex items-center justify-center">
        {icon}
      </div>
    )
  }
  return icon
}

// ============================================================================
// ProjectLogo — Tries to load the project's GitHub avatar, falls back to SVG
// ============================================================================

function ProjectLogo({ cncfProject, iconPath, size }: {
  cncfProject?: string
  iconPath: string
  size: 'sm' | 'lg'
}) {
  const [failed, setFailed] = useState(false)

  if (!cncfProject || failed) {
    return <CategoryIcon iconPath={iconPath} size={size} />
  }

  const imgCls = size === 'lg' ? 'w-10 h-10 rounded-lg' : 'w-5 h-5 rounded'
  /** Semi-transparent white backdrop for logo contrast on colored gradients */
  const backdropCls = size === 'lg'
    ? 'w-12 h-12 rounded-xl bg-white/90 shadow-sm flex items-center justify-center'
    : 'w-6 h-6 rounded bg-white/90 shadow-sm flex items-center justify-center'
  return (
    <div className={backdropCls}>
      <img
        src={getProjectLogoUrl(cncfProject)}
        alt={cncfProject}
        className={cn(imgCls, 'object-contain')}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    </div>
  )
}

// ============================================================================
// InstallerCard
// ============================================================================

interface InstallerCardProps {
  mission: MissionExport
  onImport: () => void
  onSelect: () => void
  onCopyLink?: (e: React.MouseEvent) => void
  compact?: boolean
}

export function InstallerCard({ mission, onImport, onSelect, onCopyLink, compact }: InstallerCardProps) {
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])
  const category = mission.category ?? 'Orchestration'
  const gradient = CNCF_CATEGORY_GRADIENTS[category] ?? ['#6366f1', '#8b5cf6']
  const iconPath = CNCF_CATEGORY_ICONS[category] ?? CNCF_CATEGORY_ICONS['Orchestration']
  const maturityTag = mission.tags?.find(t => ['graduated', 'incubating', 'sandbox'].includes(t))
  const maturity = maturityTag ? MATURITY_CONFIG[maturityTag] : null
  const difficulty = mission.difficulty ? DIFFICULTY_CONFIG[mission.difficulty] : null
  // Strip repetitive "Install and Configure … on Kubernetes" prefix/suffix for cleaner cards
  const shortTitle = (mission.title ?? '')
    .replace(/^Install and Configure\s+/i, '')
    .replace(/\s+on Kubernetes$/i, '')

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-all cursor-pointer group"
        onClick={onSelect}
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
        >
          <ProjectLogo cncfProject={mission.cncfProject} iconPath={iconPath} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate group-hover:text-purple-400 transition-colors">
            {shortTitle || mission.title}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('text-[10px]', mission.steps?.length ? 'text-green-400' : 'text-muted-foreground/30')} title="Install"><Download className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.uninstall?.length ? 'text-red-400' : 'text-muted-foreground/30')} title="Uninstall"><Trash2 className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.upgrade?.length ? 'text-blue-400' : 'text-muted-foreground/30')} title="Upgrade"><ArrowUpCircle className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.troubleshooting?.length ? 'text-yellow-400' : 'text-muted-foreground/30')} title="Troubleshoot"><AlertTriangle className="w-3 h-3" /></span>
        </div>
        {maturity && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded-full border flex-shrink-0', maturity.bg, maturity.color, maturity.border)}>
            {maturity.label}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          className="px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex-shrink-0"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card hover:border-purple-500/30 transition-all cursor-pointer group overflow-hidden"
      onClick={onSelect}
    >
      {/* Category gradient header with project logo */}
      <div
        className="relative h-20 flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        }}
      >
        <ProjectLogo cncfProject={mission.cncfProject} iconPath={iconPath} size="lg" />
        {/* Share link button */}
        {onCopyLink && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCopyLink(e)
              setLinkCopied(true)
              if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
              linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
            }}
            className="absolute top-1.5 right-1.5 p-1 rounded bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-colors"
            title="Copy shareable link"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link className="w-3.5 h-3.5" />}
          </button>
        )}
        {/* Category label */}
        <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-white/70 bg-black/20 px-1.5 py-0.5 rounded">
          {category}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors inline-flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          {shortTitle || mission.title}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2">{mission.description}</p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1 mt-auto">
          {maturity && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full border', maturity.bg, maturity.color, maturity.border)}>
              {maturity.label}
            </span>
          )}
          {difficulty && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full', difficulty.bg, difficulty.color)}>
              {mission.difficulty}
            </span>
          )}
          {mission.installMethods?.map(method => (
            <span key={method} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
              {method}
            </span>
          ))}
        </div>

        {/* Section coverage icons */}
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.steps?.length ? 'text-green-400' : 'text-muted-foreground/30')} title={mission.steps?.length ? `Install: ${mission.steps.length} steps` : 'No install steps'}>
            <Download className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.uninstall?.length ? 'text-red-400' : 'text-muted-foreground/30')} title={mission.uninstall?.length ? `Uninstall: ${mission.uninstall.length} steps` : 'No uninstall steps'}>
            <Trash2 className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.upgrade?.length ? 'text-blue-400' : 'text-muted-foreground/30')} title={mission.upgrade?.length ? `Upgrade: ${mission.upgrade.length} steps` : 'No upgrade steps'}>
            <ArrowUpCircle className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.troubleshooting?.length ? 'text-yellow-400' : 'text-muted-foreground/30')} title={mission.troubleshooting?.length ? `Troubleshooting: ${mission.troubleshooting.length} steps` : 'No troubleshooting steps'}>
            <AlertTriangle className="w-3 h-3" />
          </span>
        </div>

        {/* Author + Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            {mission.authorGithub && (
              <a
                href={`https://github.com/${mission.authorGithub}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] hover:text-purple-400 transition-colors group/author"
                title={mission.author ?? mission.authorGithub}
              >
                <img
                  src={`https://github.com/${mission.authorGithub}.png?size=32`}
                  alt={mission.authorGithub}
                  className="w-4 h-4 rounded-full"
                />
                <span className="truncate max-w-[80px]">{mission.authorGithub}</span>
              </a>
            )}
            {mission.cncfProject && (
              <a
                href={`https://www.cncf.io/projects/${mission.cncfProject}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-[10px] hover:text-purple-400 transition-colors"
                title="View on CNCF"
              >
                <ExternalLink className="w-3 h-3" />
                CNCF
              </a>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onCopyLink && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCopyLink(e)
                  setLinkCopied(true)
                  if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
                  linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                title="Copy shareable link"
              >
                {linkCopied ? <Check className="w-3 h-3 text-green-400" /> : <Link className="w-3 h-3" />}
                {linkCopied ? 'Copied' : 'Share'}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onImport()
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              <Download className="w-3 h-3" />
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
