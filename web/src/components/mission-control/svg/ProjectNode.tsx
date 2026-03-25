/**
 * ProjectNode — Circle node in the Flight Plan SVG representing a CNCF project.
 * GitHub avatar icon, full label, status indicator. Tooltip rendered by parent as HTML overlay.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CNCF_CATEGORY_GRADIENTS } from '../../../lib/cncf-constants'

type NodeStatus = 'pending' | 'running' | 'completed' | 'failed'

const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#64748b',
  running: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
}

/** Map project keys to GitHub org for avatar URLs */
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
  keycloak: 'keycloak', 'trivy-operator': 'aquasecurity',
  'external-secrets-operator': 'external-secrets',
  'opa-gatekeeper': 'open-policy-agent', gatekeeper: 'open-policy-agent',
  'cert-manager-operator': 'cert-manager',
  'prometheus-operator': 'prometheus-operator',
  'kube-state-metrics': 'kubernetes', alertmanager: 'prometheus',
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
  reason?: string
  dependencies?: string[]
  kbPath?: string
  maturity?: string
  priority?: string
  overlay?: string
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
  security: new Set(['Security', 'Identity & Encryption', 'Policy Enforcement', 'Runtime Security', 'Vulnerability Scanning']),
}

function getAvatarUrl(name: string): string {
  const key = name.toLowerCase()
  const org = PROJECT_TO_GITHUB_ORG[key] || key
  return `https://github.com/${org}.png?size=40`
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
  reason,
  dependencies = [],
  kbPath,
  maturity,
  priority,
  overlay = 'architecture',
  onHover,
  onDragStart,
  onDragEnd,
}: ProjectNodeProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const gradientColors = (CNCF_CATEGORY_GRADIENTS as Record<string, [string, string]>)[category]
  const primaryColor = gradientColors?.[0] ?? '#6366f1'
  const statusColor = STATUS_COLORS[status]

  const statusGlowId =
    status === 'completed' ? `${id}-glow-green` :
    status === 'failed' ? `${id}-glow-red` :
    status === 'running' ? `${id}-glow-amber` :
    undefined

  const isRelevant =
    overlay === 'architecture' ||
    OVERLAY_CATEGORIES[overlay]?.has(category) ||
    false
  const dimOpacity = overlay === 'architecture' ? 1 : isRelevant ? 1 : 0.25

  const iconSize = radius * 1.2

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: dimOpacity }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: 0.3 + index * 0.08,
      }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      onMouseEnter={() => onHover?.({
        name, displayName, category, status, isRequired,
        reason, dependencies, kbPath, maturity, priority,
        cx, cy, radius,
      })}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Outer glow ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + 3}
        fill="none"
        stroke={statusColor}
        strokeWidth={isRequired ? 1.5 : 0.8}
        strokeOpacity={0.4}
        filter={statusGlowId ? `url(#${statusGlowId})` : undefined}
      />

      {/* Running pulse */}
      {status === 'running' && (
        <circle cx={cx} cy={cy} r={radius + 3} fill="none" stroke={statusColor} strokeWidth={1}>
          <animate attributeName="r" values={`${radius + 3};${radius + 8};${radius + 3}`} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Node circle background */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={`url(#${id}-node-bg)`}
        stroke={primaryColor}
        strokeWidth={1.2}
        strokeOpacity={0.7}
        cursor="pointer"
      />

      {/* Category color accent (inner ring) */}
      <circle
        cx={cx}
        cy={cy}
        r={radius - 2}
        fill="none"
        stroke={primaryColor}
        strokeWidth={0.5}
        strokeOpacity={0.3}
      />

      {/* Project icon via foreignObject — GitHub avatar or fallback letter */}
      <foreignObject
        x={cx - iconSize / 2}
        y={cy - iconSize / 2}
        width={iconSize}
        height={iconSize}
      >
        <div
          draggable={!!onDragStart}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', name)
            e.dataTransfer.effectAllowed = 'move'
            onDragStart?.(name)
          }}
          onDragEnd={() => onDragEnd?.()}
          style={{
            width: iconSize,
            height: iconSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            overflow: 'hidden',
            cursor: onDragStart ? 'grab' : 'pointer',
          }}
        >
          {!imgFailed ? (
            <img
              src={getAvatarUrl(name)}
              alt={displayName}
              style={{
                width: iconSize,
                height: iconSize,
                borderRadius: '50%',
                objectFit: 'cover',
              }}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span style={{
              color: primaryColor,
              fontSize: radius * 0.8,
              fontWeight: 700,
              fontFamily: 'system-ui, sans-serif',
              cursor: 'pointer',
            }}>
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </foreignObject>

      {/* Label — auto-shorten long names */}
      <text
        x={cx}
        y={cy + radius + 8}
        textAnchor="middle"
        fill="white"
        fontSize={displayName.length > 18 ? 4.5 : 5.5}
        fontFamily="system-ui, sans-serif"
        opacity={0.85}
      >
        {displayName.length > 22 ? displayName.slice(0, 20) + '...' : displayName}
      </text>

      {/* Status indicator dot */}
      <circle
        cx={cx + radius - 2}
        cy={cy - radius + 2}
        r={2.5}
        fill={statusColor}
      />

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
    </motion.g>
  )
}
