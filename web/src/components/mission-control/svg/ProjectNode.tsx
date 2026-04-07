/**
 * ProjectNode — Circle node in the Flight Plan SVG representing a CNCF project.
 * GitHub avatar icon, full label, status indicator. Tooltip rendered by parent as HTML overlay.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CNCF_CATEGORY_GRADIENTS } from '../../../lib/cncf-constants'

/** Map project keys to GitHub org for avatar URLs */
const PROJECT_TO_GITHUB_ORG: Record<string, string> = {
  envoy: 'envoyproxy', argo: 'argoproj', argocd: 'argoproj',
  'argo-cd': 'argoproj', harbor: 'goharbor', jaeger: 'jaegertracing',
  fluentd: 'fluent', 'fluent-bit': 'fluent', vitess: 'vitessio',
  thanos: 'thanos-io', cortex: 'cortexproject', falco: 'falcosecurity',
  keda: 'kedacore', flux: 'fluxcd', trivy: 'aquasecurity',
  'cert-manager': 'cert-manager', prometheus: 'prometheus',
  grafana: 'grafana', istio: 'istio', linkerd: 'linkerd',
  helm: 'helm', cilium: 'cilium', kyverno: 'kyverno',
  crossplane: 'crossplane', dapr: 'dapr', knative: 'knative',
  etcd: 'etcd-io', coredns: 'coredns', rook: 'rook',
  longhorn: 'longhorn', velero: 'vmware-tanzu',
  'external-secrets': 'external-secrets', kubevirt: 'kubevirt',
}

function getAvatarUrl(name: string): string {
  const key = name.toLowerCase()
  const org = PROJECT_TO_GITHUB_ORG[key] || key
  return `https://github.com/${org}.png?size=40`
}

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'

const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#64748b',
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
}

export interface ProjectNodeProps {
  id: string
  name: string
  displayName: string
  category: string
  cx: number
  cy: number
  radius?: number
  index: number
  status?: NodeStatus
  isRequired?: boolean
  /** Whether this project is already installed on the cluster */
  installed?: boolean
  reason?: string
  dependencies?: string[]
  kbPath?: string
  maturity?: string
  priority?: string
  overlay?: string
  /** Whether this node is highlighted (connected edge/project hovered) */
  glow?: boolean
  /** Whether something else is glowing and this node should fade */
  dimmed?: boolean
  onHover?: (info: ProjectHoverInfo | null) => void
  onDragStart?: (name: string) => void
  onDragEnd?: () => void
}

export interface ProjectHoverInfo {
  name: string
  displayName: string
  category: string
  status: NodeStatus
  isRequired: boolean
  installed: boolean
  reason?: string
  dependencies: string[]
  kbPath?: string
  maturity?: string
  priority?: string
  cx: number
  cy: number
  radius: number
}

/** Categories relevant to each overlay mode */
const OVERLAY_CATEGORIES: Record<string, Set<string>> = {
  compute: new Set(['Orchestration', 'Serverless', 'Runtime']),
  storage: new Set(['Storage', 'Streaming']),
  network: new Set(['Networking', 'Service Mesh']),
  security: new Set(['Security', 'Identity & Encryption', 'Policy Enforcement', 'Runtime Security', 'Vulnerability Scanning', 'Secrets Management']),
}

export function ProjectNode({
  id,
  name,
  displayName,
  category,
  cx,
  cy,
  radius = 12,
  index,
  status = 'pending',
  isRequired = false,
  installed = false,
  reason,
  dependencies = [],
  kbPath,
  maturity,
  priority,
  overlay = 'architecture',
  glow = false,
  dimmed = false,
  onHover,
  onDragStart: _onDragStart,
  onDragEnd: _onDragEnd,
}: ProjectNodeProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const gradientColors = (CNCF_CATEGORY_GRADIENTS as Record<string, [string, string]>)[category]
  const primaryColor = gradientColors?.[0] ?? '#6366f1'
  const statusColor = STATUS_COLORS[status]
  const iconSize = radius * 1.4


  const isRelevant =
    overlay === 'architecture' ||
    OVERLAY_CATEGORIES[overlay]?.has(category) ||
    false
  const overlayDim = overlay === 'architecture' ? 1 : isRelevant ? 1 : 0.25

  void _onDragStart; void _onDragEnd // Props preserved for API compatibility

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: dimmed ? 0.15 : glow ? 1 : overlayDim }}
      transition={{
        scale: { type: 'spring', stiffness: 400, damping: 25, delay: 0.3 + index * 0.08 },
        opacity: { duration: 0.1 },
      }}
      style={{ transformOrigin: `${cx}px ${cy}px`, pointerEvents: 'all' as const }}
      onMouseEnter={() => onHover?.({
        name, displayName, category, status, isRequired, installed,
        reason, dependencies, kbPath, maturity, priority,
        cx, cy, radius,
      })}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Invisible hit target — ensures mouse events fire even when dimmed */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + 4}
        fill="transparent"
        stroke="none"
        style={{ cursor: 'pointer' }}
      />

      {/* Outer ring — solid green=installed, dashed slate=needs deploy, brighter when glowing */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + 3}
        fill="none"
        stroke={glow ? (installed ? '#4ade80' : '#e2e8f0') : installed ? '#22c55e' : '#64748b'}
        strokeWidth={glow ? (installed ? 2 : 1.2) : installed ? 1.5 : 0.6}
        strokeOpacity={glow ? 1 : installed ? 0.6 : 0.3}
        strokeDasharray={installed ? 'none' : '3 2'}
      />

      {/* Running pulse */}
      {status === 'running' && (
        <circle cx={cx} cy={cy} r={radius + 3} fill="none" stroke={statusColor} strokeWidth={1}>
          <animate attributeName="r" values={`${radius + 3};${radius + 8};${radius + 3}`} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Node circle background — green border for installed, subtle slate for uninstalled */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={`url(#${id}-node-bg)`}
        stroke={glow ? (installed ? '#4ade80' : '#ffffff') : '#475569'}
        strokeWidth={glow ? 1.2 : 1}
        strokeOpacity={glow ? 0.7 : 0.4}
        cursor="pointer"
      />

      {/* Project icon — GitHub avatar via foreignObject, letter fallback on error */}
      <foreignObject
        x={cx - iconSize / 2}
        y={cy - iconSize / 2}
        width={iconSize}
        height={iconSize}
        style={{ pointerEvents: 'none', overflow: 'hidden' }}
      >
        {!imgFailed ? (
          <img
            src={getAvatarUrl(name)}
            alt={displayName}
            crossOrigin="anonymous"
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: '50%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={{
            width: iconSize,
            height: iconSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: primaryColor,
            fontSize: radius * 0.9,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </foreignObject>







      {/* Completed checkmark */}
      {status === 'completed' && (
        <motion.path
          d={`M${cx + radius - 5} ${cy - radius + 2} l2 2 l3 -3`}
          fill="none"
          stroke="white"
          strokeWidth={1}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Name label — shown on hover (glow) or when completed so project names are always visible */}
      {(glow || status === 'completed') && (() => {
        const shortName = name.length <= 16 ? name : name.replace(/-/g, ' ')
        const labelW = shortName.length * 3 + 6
        const labelY = cy - radius - 8
        return (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.08 }}
          >
            <rect
              x={cx - labelW / 2}
              y={labelY - 4.5}
              width={labelW}
              height={8.5}
              rx={2.5}
              fill="#0f172a"
              fillOpacity={0.9}
              stroke={installed ? '#22c55e' : '#ffffff'}
              strokeWidth={0.3}
              strokeOpacity={0.5}
            />
            <text
              x={cx}
              y={labelY + 1}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={4.2}
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
            >
              {shortName}
            </text>
          </motion.g>
        )
      })()}
    </motion.g>
  )
}
