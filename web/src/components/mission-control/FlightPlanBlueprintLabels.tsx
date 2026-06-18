/**
 * FlightPlanBlueprintLabels — Dependency label rendering logic
 *
 * Extracted from FlightPlanBlueprint.tsx (#18875)
 */

import { DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
import { LABEL_OFFSET_Y, MIN_LABEL_GAP, NODE_RADIUS } from './FlightPlanBlueprintConstants'
import type { LayoutResult } from './BlueprintLayout'

interface RenderLabelsProps {
  layout: LayoutResult
  glowEdges: Set<string>
  glowProjectKeys: Set<string>
  overlayArchitecture: boolean
  onHover: (edge: { from: string; to: string } | null) => void
}

/**
 * Renders dependency labels with collision avoidance logic
 */
export function renderDependencyLabels({
  layout,
  glowEdges,
  glowProjectKeys,
  overlayArchitecture,
  onHover,
}: RenderLabelsProps) {
  const labelSlots: { x: number; y: number }[] = []
  const nodeCenters = Array.from(layout.projectPositions.values())

  return layout.dependencyEdges.map((edge) => {
    if (!edge.label) return null
    const from = edge.fromPos
    const to = edge.toPos
    if (!from || !to) return null
    if (from.cx <= 0 || from.cy <= 0 || to.cx <= 0 || to.cy <= 0) return null

    const { midX, midY: rawMidY } = computeEdgeMidpoint(from.cx, from.cy, to.cx, to.cy)
    let labelY = rawMidY - LABEL_OFFSET_Y

    // Push away from project nodes
    for (const node of nodeCenters) {
      const dx = Math.abs(midX - node.cx)
      const dy = Math.abs(labelY - node.cy)
      if (dx < 40 && dy < NODE_RADIUS + 8) {
        labelY = node.cy - NODE_RADIUS - LABEL_OFFSET_Y
      }
    }

    // Avoid overlapping other labels
    for (const slot of labelSlots) {
      const dxL = Math.abs(midX - slot.x)
      const dyL = Math.abs(labelY - slot.y)
      if (dxL < 60 && dyL < MIN_LABEL_GAP) {
        labelY = slot.y - MIN_LABEL_GAP
      }
    }

    labelSlots.push({ x: midX, y: labelY })
    const clusterEdgeKey = `${from.clusterName}:${edge.from}-${edge.to}`

    return (
      <DependencyLabel
        key={`label-${clusterEdgeKey}`}
        midX={midX}
        midY={labelY}
        label={edge.label}
        crossCluster={edge.crossCluster}
        fromName={edge.from}
        toName={edge.to}
        anchorX={midX}
        anchorY={rawMidY}
        onHover={onHover}
        highlight={glowEdges.has(clusterEdgeKey)}
        dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
        overlayDim={!overlayArchitecture}
      />
    )
  })
}
