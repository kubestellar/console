import { useState } from 'react'
import { CNCF_CATEGORY_GRADIENTS, CNCF_CATEGORY_ICONS } from '../../lib/cncf-constants'

interface ThumbnailConfig {
  gradient: [string, string]
  icon: string // SVG path data
  label: string
}

const ITEM_THUMBNAILS: Record<string, ThumbnailConfig> = {
  'sre-overview': {
    gradient: ['var(--cncf-serverless-end)', 'var(--cncf-observability-start)'],
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2', // Activity
    label: 'SRE',
  },
  'security-audit': {
    gradient: ['var(--cncf-security-start)', 'var(--cncf-runtime-end)'],
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Shield
    label: 'SEC',
  },
  'gitops-pipeline': {
    gradient: ['var(--cncf-orchestration-start)', 'var(--cncf-observability-end)'],
    icon: 'M6 3v12M18 9a3 3 0 100 6 3 3 0 000-6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 15l-6 6', // GitBranch
    label: 'OPS',
  },
}

const TYPE_FALLBACKS: Record<string, ThumbnailConfig> = {
  dashboard: {
    gradient: ['var(--cncf-default-start)', 'var(--cncf-default-end)'],
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', // LayoutGrid
    label: '',
  },
  'card-preset': {
    gradient: ['var(--cncf-service-mesh-start)', 'var(--cncf-observability-start)'],
    icon: 'M21 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3', // Card
    label: '',
  },
  theme: {
    gradient: ['var(--cncf-provisioning-start)', 'var(--cncf-serverless-start)'],
    icon: 'M12 2a10 10 0 000 20c.6 0 1-.4 1-1v-1.5c0-.8-.7-1.5-1.5-1.5H9a2 2 0 01-2-2v-1a2 2 0 012-2h1a2 2 0 002-2V8a2 2 0 012-2h.5', // Palette
    label: '',
  },
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
  spire: 'spiffe',
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
      <div className="w-12 h-12 rounded-xl bg-black/25 backdrop-blur-xs shadow-xs flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-12 h-12 rounded-xl bg-card/90 shadow-xs flex items-center justify-center">
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
        <span className="absolute bottom-1.5 right-2 text-2xs font-medium text-white/70 bg-black/20 px-1.5 py-0.5 rounded">
          {cncfCategory}
        </span>
      </div>
    )
  }

  // Non-CNCF items use same h-20 gradient header for consistent tile height
  const config = ITEM_THUMBNAILS[itemId] || TYPE_FALLBACKS[itemType] || TYPE_FALLBACKS.dashboard

  return (
    <div className={`h-20 overflow-hidden relative ${className || ''}`}>
      <svg viewBox="0 0 400 80" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
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
        <rect width="400" height="80" fill={`url(#grad-${itemId})`} />
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 16 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={25 + col * 25}
              cy={10 + row * 20}
              r="1"
              fill={config.gradient[0]}
              opacity={isHelpWanted ? 0.08 : 0.15}
            />
          ))
        )}
        <g transform="translate(188, 28)" opacity={isHelpWanted ? 0.35 : 0.5}>
          <path
            d={config.icon}
            fill="none"
            stroke={`url(#icon-grad-${itemId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <line x1="0" y1="79" x2="400" y2="79" stroke={config.gradient[0]} strokeOpacity="0.2" strokeWidth="1" />
        {isHelpWanted && (
          <rect x="1" y="1" width="398" height="78" fill="none" stroke={config.gradient[0]} strokeOpacity="0.15" strokeWidth="1" strokeDasharray="6 4" />
        )}
      </svg>
    </div>
  )
}
