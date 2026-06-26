/**
 * BlueprintDefs — Shared SVG <defs> for the Flight Plan blueprint.
 * Glow filters, gradient fills, particle gradients, drop shadows.
 */

import { createElement } from 'react'
import { CNCF_CATEGORY_GRADIENTS } from '../../../lib/cncf-constants'
import {
  AMBER_500,
  BLACK,
  GREEN_500_BRIGHT,
  INDIGO_500,
  PURPLE_300,
  PURPLE_500,
  RED_500,
  SLATE_700,
  SLATE_800,
  SLATE_900,
} from '../../../lib/theme/chartColors'

interface BlueprintDefsProps {
  id: string // unique prefix to avoid filter ID collisions
}

export function BlueprintDefs({ id }: BlueprintDefsProps) {
  const renderLinearGradient = (
    gradientId: string,
    x2: string,
    y2: string,
    startColor: string,
    endColor: string,
    startOpacity = '1',
    endOpacity = '1',
    key?: string,
  ) => createElement(
    'linearGradient',
    {
      id: gradientId,
      x1: '0%',
      y1: '0%',
      x2,
      y2,
      key,
    },
    createElement('stop', { offset: '0%', stopColor: startColor, stopOpacity: startOpacity }),
    createElement('stop', { offset: '100%', stopColor: endColor, stopOpacity: endOpacity }),
  )

  return (
    <defs>
      {/* ── Glow filter (for nodes & connections) ─────────────── */}
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* ── Cluster zone glow (softer, wider) ─────────────────── */}
      <filter id={`${id}-zone-glow`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feFlood floodColor={INDIGO_500} floodOpacity="0.15" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* ── Drop shadow ──────────────────────────────────────── */}
      <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={BLACK} floodOpacity="0.3" />
      </filter>

      {/* ── Particle gradient (for animated dependency paths) ── */}
      <radialGradient id={`${id}-particle`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={PURPLE_300} stopOpacity="1" />
        <stop offset="100%" stopColor={PURPLE_300} stopOpacity="0" />
      </radialGradient>

      {/* ── Cross-cluster dependency gradient ─────────────────── */}
      {renderLinearGradient(`${id}-cross-dep`, '100%', '0%', AMBER_500, RED_500, '0.8', '0.8')}

      {/* ── Intra-cluster dependency gradient ─────────────────── */}
      {renderLinearGradient(`${id}-intra-dep`, '100%', '0%', INDIGO_500, PURPLE_500, '0.6', '0.6')}

      {/* ── Background grid pattern ──────────────────────────── */}
      <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke={SLATE_700} strokeWidth="0.3" opacity="0.3" />
      </pattern>

      {/* ── Status glow colors ───────────────────────────────── */}
      <filter id={`${id}-glow-green`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor={GREEN_500_BRIGHT} floodOpacity="0.5" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id={`${id}-glow-red`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor={RED_500} floodOpacity="0.5" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id={`${id}-glow-amber`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor={AMBER_500} floodOpacity="0.5" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* ── Category gradients (from CNCF constants) ──────── */}
      {Object.entries(CNCF_CATEGORY_GRADIENTS).map(([category, colors]) => {
        const [c1, c2] = colors as [string, string]
        return (
          renderLinearGradient(
            `${id}-cat-${category.toLowerCase().replace(/\s+/g, '-')}`,
            '100%',
            '100%',
            c1,
            c2,
            category,
          )
        )
      })}

      {/* ── Center dark gradient (for depth on nodes) ──────── */}
      <radialGradient id={`${id}-node-bg`} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor={SLATE_800} />
        <stop offset="100%" stopColor={SLATE_900} />
      </radialGradient>
    </defs>
  )
}
