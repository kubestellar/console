import { useState } from 'react'

interface ThumbnailConfig {
  gradient: [string, string]
  icon: string // SVG path data
  label: string
}

const ITEM_THUMBNAILS: Record<string, ThumbnailConfig> = {
  'sre-overview': {
    gradient: ['#7c3aed', '#3b82f6'],
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2', // Activity
    label: 'SRE',
  },
  'security-audit': {
    gradient: ['#ef4444', '#f97316'],
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Shield
    label: 'SEC',
  },
  'gitops-pipeline': {
    gradient: ['#10b981', '#06b6d4'],
    icon: 'M6 3v12M18 9a3 3 0 100 6 3 3 0 000-6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 15l-6 6', // GitBranch
    label: 'OPS',
  },
}

const TYPE_FALLBACKS: Record<string, ThumbnailConfig> = {
  dashboard: {
    gradient: ['#6366f1', '#8b5cf6'],
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', // LayoutGrid
    label: '',
  },
  'card-preset': {
    gradient: ['#06b6d4', '#3b82f6'],
    icon: 'M21 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3', // Card
    label: '',
  },
  theme: {
    gradient: ['#ec4899', '#a855f7'],
    icon: 'M12 2a10 10 0 000 20c.6 0 1-.4 1-1v-1.5c0-.8-.7-1.5-1.5-1.5H9a2 2 0 01-2-2v-1a2 2 0 012-2h1a2 2 0 002-2V8a2 2 0 012-2h.5', // Palette
    label: '',
  },
}

// CNCF landscape category gradients
const CNCF_CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  'Observability': ['#3b82f6', '#06b6d4'],
  'Orchestration': ['#10b981', '#14b8a6'],
  'Runtime': ['#f59e0b', '#f97316'],
  'Provisioning': ['#ec4899', '#f43f5e'],
  'Security': ['#ef4444', '#dc2626'],
  'Service Mesh': ['#06b6d4', '#0ea5e9'],
  'App Definition': ['#8b5cf6', '#6366f1'],
  'Serverless': ['#a855f7', '#7c3aed'],
  'Storage': ['#84cc16', '#22c55e'],
  'Streaming': ['#f97316', '#eab308'],
  'Networking': ['#0ea5e9', '#3b82f6'],
}

// CNCF category icons (SVG path data)
const CNCF_CATEGORY_ICONS: Record<string, string> = {
  'Observability': 'M22 12h-4l-3 9L9 3l-3 9H2', // Activity
  'Orchestration': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', // Layers
  'Runtime': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2', // Clock
  'Provisioning': 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z', // Wrench
  'Security': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Shield
  'Service Mesh': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', // Network
  'App Definition': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM2 8h20M8 2v4', // App Window
  'Serverless': 'M13 2L3 14h9l-1 8 10-12h-9l1-8', // Zap
  'Storage': 'M21 5c0 1.1-4 2-9 2S3 6.1 3 5m18 0c0-1.1-4-2-9-2S3 3.9 3 5m18 0v14c0 1.1-4 2-9 2s-9-.9-9-2V5m18 7c0 1.1-4 2-9 2s-9-.9-9-2', // Database
  'Streaming': 'M22 12h-4l-3 9L9 3l-3 9H2', // Activity
  'Networking': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z', // Globe
}

/** Map CNCF project names to GitHub org for avatar URLs (shared with InstallerCard) */
const PROJECT_TO_GITHUB_ORG: Record<string, string> = {
  envoy: 'envoyproxy',
  argo: 'argoproj',
  argocd: 'argoproj',
  'argo-cd': 'argoproj',
  harbor: 'goharbor',
  jaeger: 'jaegertracing',
  fluentd: 'fluent',
  'fluent-bit': 'fluent',
  vitess: 'vitessio',
  thanos: 'thanos-io',
  cortex: 'cortexproject',
  falco: 'falcosecurity',
  keda: 'kedacore',
  flux: 'fluxcd',
  contour: 'projectcontour',
  'open-policy-agent': 'open-policy-agent',
  opa: 'open-policy-agent',
  'open-telemetry': 'open-telemetry',
  opentelemetry: 'open-telemetry',
  trivy: 'aquasecurity',
  'cert-manager': 'cert-manager',
  'kube-prometheus': 'prometheus-operator',
  'prometheus-operator': 'prometheus-operator',
  kubescape: 'kubescape',
  kyverno: 'kyverno',
  opencost: 'opencost',
  nats: 'nats-io',
  strimzi: 'strimzi',
  metallb: 'metallb',
  containerd: 'containerd',
  coredns: 'coredns',
  etcd: 'etcd-io',
  linkerd: 'linkerd',
  cilium: 'cilium',
  crossplane: 'crossplane',
  dapr: 'dapr',
  backstage: 'backstage',
  'chaos-mesh': 'chaos-mesh',
  volcano: 'volcano-sh',
  kubeedge: 'kubeedge',
  spiffe: 'spiffe',
  notary: 'notaryproject',
}

/** Extract project name from marketplace item ID (strip 'cncf-' prefix) */
function getProjectName(itemId: string): string {
  return itemId.startsWith('cncf-') ? itemId.slice(5) : itemId
}

function getProjectLogoUrl(projectName: string): string {
  const org = PROJECT_TO_GITHUB_ORG[projectName.toLowerCase()] ?? projectName
  return `https://github.com/${org}.png?size=80`
}

// ============================================================================
// ProjectLogo — GitHub avatar with SVG fallback (matches InstallerCard style)
// ============================================================================

function ProjectLogo({ projectName, iconPath }: { projectName: string; iconPath: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-black/25 backdrop-blur-sm shadow-sm flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-12 h-12 rounded-xl bg-white/90 shadow-sm flex items-center justify-center">
      <img
        src={getProjectLogoUrl(projectName)}
        alt={projectName}
        className="w-10 h-10 rounded-lg object-contain"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    </div>
  )
}

export function MarketplaceThumbnail({ itemId, itemType, className, cncfCategory, isHelpWanted }: {
  itemId: string
  itemType: 'dashboard' | 'card-preset' | 'theme'
  className?: string
  cncfCategory?: string
  isHelpWanted?: boolean
}) {
  const cncfGradient = cncfCategory ? CNCF_CATEGORY_GRADIENTS[cncfCategory] : undefined
  const cncfIcon = cncfCategory ? CNCF_CATEGORY_ICONS[cncfCategory] : undefined

  // CNCF items with a category get the installer-style gradient header + project logo
  if (cncfGradient) {
    const projectName = getProjectName(itemId)
    const iconPath = cncfIcon || TYPE_FALLBACKS['card-preset'].icon
    return (
      <div
        className={`relative h-20 flex items-center justify-center ${isHelpWanted ? 'opacity-70' : ''} ${className || ''}`}
        style={{ background: `linear-gradient(135deg, ${cncfGradient[0]}, ${cncfGradient[1]})` }}
      >
        <ProjectLogo projectName={projectName} iconPath={iconPath} />
        <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-white/70 bg-black/20 px-1.5 py-0.5 rounded">
          {cncfCategory}
        </span>
      </div>
    )
  }

  // Non-CNCF items keep the original SVG thumbnail
  const config = ITEM_THUMBNAILS[itemId] || TYPE_FALLBACKS[itemType] || TYPE_FALLBACKS.dashboard

  return (
    <div className={`h-36 overflow-hidden relative ${className || ''}`}>
      <svg viewBox="0 0 400 144" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`grad-${itemId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.gradient[0]} stopOpacity={isHelpWanted ? 0.15 : 0.25} />
            <stop offset="100%" stopColor={config.gradient[1]} stopOpacity={isHelpWanted ? 0.08 : 0.15} />
          </linearGradient>
          <linearGradient id={`icon-grad-${itemId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.gradient[0]} stopOpacity={isHelpWanted ? 0.4 : 0.6} />
            <stop offset="100%" stopColor={config.gradient[1]} stopOpacity={isHelpWanted ? 0.25 : 0.4} />
          </linearGradient>
        </defs>
        <rect width="400" height="144" fill={`url(#grad-${itemId})`} />
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 16 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={25 + col * 25}
              cy={12 + row * 18}
              r="1"
              fill={config.gradient[0]}
              opacity={isHelpWanted ? 0.08 : 0.15}
            />
          ))
        )}
        <g transform="translate(176, 48)" opacity={isHelpWanted ? 0.35 : 0.5}>
          <path
            d={config.icon}
            fill="none"
            stroke={`url(#icon-grad-${itemId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="scale(2)"
          />
        </g>
        <line x1="0" y1="143" x2="400" y2="143" stroke={config.gradient[0]} strokeOpacity="0.2" strokeWidth="1" />
        {isHelpWanted && (
          <rect x="1" y="1" width="398" height="142" fill="none" stroke={config.gradient[0]} strokeOpacity="0.15" strokeWidth="1" strokeDasharray="6 4" />
        )}
      </svg>
    </div>
  )
}
