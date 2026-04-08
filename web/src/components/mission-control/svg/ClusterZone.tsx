/**
 * ClusterZone — Rounded rect SVG group representing a cluster in the Flight Plan.
 * Uses CloudProviderIcon via foreignObject, animated dashed glow border.
 * Tooltip rendered by parent FlightPlanBlueprint as an HTML overlay.
 */

import { motion } from 'framer-motion'
import { CloudProviderIcon } from '../../ui/CloudProviderIcon'
import type { LayoutRect, OverlayMode } from '../types'

/**
 * SVG fill colors — mapped from Tailwind palette equivalents.
 * SVG `fill` attributes require raw color strings; Tailwind classes cannot be used.
 * Each constant documents its Tailwind equivalent for design-token traceability.
 */
const SVG_COLORS = {
  /** red-500 */    danger:  '#ef4444',
  /** amber-500 */  warning: '#f59e0b',
  /** green-500 */  cpu:     '#22c55e',
  /** blue-500 */   mem:     '#3b82f6',
  /** purple-500 */ gpu:     '#a855f7',
  /** amber-500 */  tpu:     '#f59e0b',
  /** lime-500 */   disk:    '#84cc16',
  /** cyan-500 */   pvc:     '#06b6d4',
  /** sky-500 */    network: '#0ea5e9',
  /** slate-400 */  muted:   '#94a3b8',
  /** slate-950 */  zoneBg:  '#0a0f1a',
  /** slate-900 */  zoneFg:  '#0f172a',
  /** slate-800 */  barBg:   '#1e293b',
} as const

/** Brand colors for cloud providers — used as SVG fill values.
 *  These are intentional brand colors that cannot use Tailwind classes in SVG context. */
const PROVIDER_COLORS: Record<string, string> = {
  eks: '#FF9900',
  gke: '#4285F4',
  aks: '#0078D4',
  openshift: '#EE0000',
  coreweave: '#4F7BEF',
  k3s: '#FFC61C',
  kind: '#326CE5',
  minikube: '#326CE5',
  kubernetes: '#326CE5',
}

export interface ClusterZoneProps {
  id: string
  name: string
  provider: string
  rect: LayoutRect
  nodeCount?: number
  cpuCores?: number
  cpuUsage?: number
  memGB?: number
  memUsage?: number
  storageGB?: number
  gpuCount?: number
  tpuCount?: number
  pvcCount?: number
  pvcBoundCount?: number
  podCount?: number
  index: number
  overlay?: OverlayMode
  onHover?: (info: ClusterHoverInfo | null) => void
}

export interface ClusterHoverInfo {
  name: string
  provider: string
  nodeCount?: number
  cpuCores?: number
  cpuUsage?: number
  memGB?: number
  memUsage?: number
  storageGB?: number
  gpuCount?: number
  tpuCount?: number
  pvcCount?: number
  pvcBoundCount?: number
  podCount?: number
  /** SVG rect for positioning */
  rect: LayoutRect
}

function pct(used: number | undefined, total: number | undefined): number | undefined {
  if (used == null || total == null || total === 0) return undefined
  return Math.round((used / total) * 100)
}

/** Format large GB values as TB for readability */
function formatStorage(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(gb >= 10240 ? 0 : 1)} TB`
  return `${Math.round(gb)} GB`
}

/** Mini stat block for SVG overlays */
function StatBlock({ x, y, label, value, max, unit, color, displayOverride, noAlert }: {
  x: number; y: number; label: string; value?: number; max?: number; unit: string; color: string; displayOverride?: string; noAlert?: boolean
}) {
  const pctVal = pct(value, max)
  const display = displayOverride ?? (value != null && max != null
    ? `${Math.round(value)}/${Math.round(max)}${unit}`
    : max != null
      ? `${Math.round(max)}${unit}`
      : '—')
  const barColor = pctVal != null && !noAlert
    ? pctVal >= 80 ? SVG_COLORS.danger : pctVal >= 50 ? SVG_COLORS.warning : color
    : color

  return (
    <g>
      {/* Background */}
      <rect x={x} y={y} width={56} height={14} rx={2} fill={SVG_COLORS.zoneFg} stroke={color} strokeWidth={0.4} strokeOpacity={0.3} />
      {/* Label */}
      <text x={x + 3} y={y + 5} fill={color} fontSize={5.5} fontWeight="700" fontFamily="system-ui, sans-serif" opacity={0.8}>
        {label}
      </text>
      {/* Value */}
      <text x={x + 53} y={y + 5} textAnchor="end" fill="white" fontSize={5.5} fontFamily="system-ui, sans-serif" opacity={0.9}>
        {display}
      </text>
      {/* Gauge bar */}
      <rect x={x + 2} y={y + 8.5} width={52} height={2.5} rx={1} fill={SVG_COLORS.barBg} />
      {pctVal != null ? (
        <rect x={x + 2} y={y + 8.5} width={52 * pctVal / 100} height={2.5} rx={1} fill={barColor} />
      ) : max != null ? (
        <rect x={x + 2} y={y + 8.5} width={52} height={2.5} rx={1} fill={color} opacity={0.3} />
      ) : null}
    </g>
  )
}

export function ClusterZone({
  id,
  name,
  provider,
  rect,
  nodeCount,
  cpuCores,
  cpuUsage,
  memGB,
  memUsage,
  storageGB,
  gpuCount,
  tpuCount,
  pvcCount,
  pvcBoundCount,
  podCount,
  index,
  overlay = 'architecture',
  onHover,
}: ClusterZoneProps) {
  const color = PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.kubernetes
  const { x, y, width, height } = rect

  const showCompute = overlay === 'architecture' || overlay === 'compute'
  const showStorage = overlay === 'architecture' || overlay === 'storage'
  const showNetwork = overlay === 'network'
  const showSecurity = overlay === 'security'

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      onMouseEnter={() => onHover?.({
        name, provider, nodeCount, cpuCores, cpuUsage,
        memGB, memUsage, storageGB, gpuCount, tpuCount,
        pvcCount, pvcBoundCount, podCount, rect,
      })}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Zone background — fully opaque */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={SVG_COLORS.zoneBg}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={SVG_COLORS.zoneFg}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="6 3"
        strokeOpacity={0.5}
        filter={`url(#${id}-zone-glow)`}
      />

      {/* Animated dash border */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        strokeDasharray="4 4"
        strokeOpacity={0.3}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-16"
          dur="3s"
          repeatCount="indefinite"
        />
      </rect>

      {/* Provider icon via foreignObject */}
      <foreignObject x={x + 6} y={y + 4} width={20} height={20}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CloudProviderIcon
            provider={provider as Parameters<typeof CloudProviderIcon>[0]['provider']}
            size={16}
          />
        </div>
      </foreignObject>

      {/* Cluster name (positioned after icon) */}
      <text
        x={x + 30}
        y={y + 17}
        textAnchor="start"
        fill="white"
        fontSize={11}
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
        opacity={0.9}
        cursor="pointer"
      >
        {name}
      </text>

      {/* ── Overlay-dependent resource display ─────────────── */}

      {/* Compute overlay: CPU, Memory, GPU, TPU stat blocks */}
      {showCompute && (
        <g>
          {/* Stat block row at top-right */}
          <StatBlock x={x + width - 120} y={y + height - 35} label="CPU" value={cpuUsage} max={cpuCores} unit="" color={SVG_COLORS.cpu} displayOverride={pct(cpuUsage, cpuCores) != null ? `${pct(cpuUsage, cpuCores)}%` : cpuCores != null ? `${cpuCores} cores` : '—'} />
          <StatBlock x={x + width - 60} y={y + height - 35} label="MEM" value={memUsage} max={memGB} unit="" color={SVG_COLORS.mem} displayOverride={pct(memUsage, memGB) != null ? `${pct(memUsage, memGB)}%` : memGB != null ? formatStorage(memGB) : '—'} />
          {/* GPU / TPU row */}
          {(gpuCount != null || tpuCount != null) && (
            <>
              <StatBlock x={x + width - 120} y={y + height - 51} label="GPU" value={undefined} max={gpuCount} unit="" color={SVG_COLORS.gpu} />
              <StatBlock x={x + width - 60} y={y + height - 51} label="TPU" value={undefined} max={tpuCount} unit="" color={SVG_COLORS.tpu} />
            </>
          )}
        </g>
      )}

      {/* Storage overlay: PVC, Storage capacity */}
      {showStorage && (
        <g>
          <StatBlock x={x + width - 120} y={y + height - 35} label="DISK" value={undefined} max={storageGB != null ? Math.round(storageGB) : undefined} unit="" color={SVG_COLORS.disk} displayOverride={storageGB != null ? formatStorage(storageGB) : '—'} />
          <StatBlock x={x + width - 60} y={y + height - 35} label="PVC" value={pvcBoundCount} max={pvcCount} unit="" color={SVG_COLORS.pvc} noAlert />
        </g>
      )}

      {/* Network overlay: pod count, node info */}
      {showNetwork && (
        <g>
          <StatBlock x={x + width - 120} y={y + height - 35} label="PODS" value={undefined} max={podCount} unit="" color={SVG_COLORS.network} noAlert />
          <StatBlock x={x + width - 60} y={y + height - 35} label="NODES" value={undefined} max={nodeCount} unit="" color={SVG_COLORS.network} noAlert />
        </g>
      )}

      {/* Security overlay: RBAC, PSS */}
      {showSecurity && (
        <g>
          <StatBlock x={x + width - 120} y={y + height - 35} label="NODES" value={undefined} max={nodeCount} unit="" color={SVG_COLORS.muted} noAlert />
          <StatBlock x={x + width - 60} y={y + height - 35} label="PODS" value={undefined} max={podCount} unit="" color={SVG_COLORS.muted} noAlert />
        </g>
      )}

      {/* Resource summary at bottom — mini icon + number pairs */}
      <g opacity={0.55}>
        {nodeCount != null && (
          <g>
            <title>{nodeCount} nodes</title>
            <text x={x + width / 2 - 48} y={y + height - 7} fill={color} fontSize={9} fontFamily="system-ui, sans-serif">⊞</text>
            <text x={x + width / 2 - 40} y={y + height - 7} fill="white" fontSize={8} fontFamily="system-ui, sans-serif">{nodeCount}</text>
          </g>
        )}
        {cpuCores != null && (
          <g>
            <title>{cpuCores} CPU cores</title>
            <text x={x + width / 2 - 18} y={y + height - 7} fill={color} fontSize={9} fontFamily="system-ui, sans-serif">⚙</text>
            <text x={x + width / 2 - 10} y={y + height - 7} fill="white" fontSize={8} fontFamily="system-ui, sans-serif">{cpuCores}</text>
          </g>
        )}
        {podCount != null && (
          <g>
            <title>{podCount} pods</title>
            <text x={x + width / 2 + 12} y={y + height - 7} fill={color} fontSize={9} fontFamily="system-ui, sans-serif">▣</text>
            <text x={x + width / 2 + 20} y={y + height - 7} fill="white" fontSize={8} fontFamily="system-ui, sans-serif">{podCount}</text>
          </g>
        )}
        {memGB != null && (
          <g>
            <title>{memGB.toFixed(0)} GB memory</title>
            <text x={x + width / 2 + 38} y={y + height - 7} fill={color} fontSize={9} fontFamily="system-ui, sans-serif">◧</text>
            <text x={x + width / 2 + 46} y={y + height - 7} fill="white" fontSize={8} fontFamily="system-ui, sans-serif">{memGB.toFixed(0)}</text>
          </g>
        )}
      </g>
    </motion.g>
  )
}
