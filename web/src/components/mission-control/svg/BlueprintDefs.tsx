/**
 * BlueprintDefs — Shared SVG <defs> for the Flight Plan blueprint.
 * Glow filters, gradient fills, particle gradients, drop shadows.
 */

import { CNCF_CATEGORY_GRADIENTS } from '../../../lib/cncf-constants'

interface BlueprintDefsProps {
  id: string // unique prefix to avoid filter ID collisions
}

export function BlueprintDefs({ id }: BlueprintDefsProps) {
  return (
    <defs>
      {/* ── Glow filter (for nodes & connections) ─────────────── */}
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feFlood floodColor="#8b5cf6" floodOpacity="0.4" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* ── Cluster zone glow (softer, wider) ─────────────────── */}
      <filter id={`${id}-zone-glow`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feFlood floodColor="#6366f1" floodOpacity="0.15" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* ── Drop shadow ──────────────────────────────────────── */}
      <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.3" />
      </filter>

      {/* ── Particle gradient (for animated dependency paths) ── */}
      <radialGradient id={`${id}-particle`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#a78bfa" stopOpacity="1" />
        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
      </radialGradient>

      {/* ── Cross-cluster dependency gradient ─────────────────── */}
      <linearGradient id={`${id}-cross-dep`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
      </linearGradient>

      {/* ── Intra-cluster dependency gradient ─────────────────── */}
      <linearGradient id={`${id}-intra-dep`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
      </linearGradient>

      {/* ── Background grid pattern ──────────────────────────── */}
      <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.3" opacity="0.3" />
      </pattern>

      {/* ── Status glow colors ───────────────────────────────── */}
      <filter id={`${id}-glow-green`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor="#22c55e" floodOpacity="0.5" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id={`${id}-glow-red`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor="#ef4444" floodOpacity="0.5" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id={`${id}-glow-amber`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1" result="blur" />
        <feFlood floodColor="#f59e0b" floodOpacity="0.5" result="color" />
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
          <linearGradient
            key={category}
            id={`${id}-cat-${category.toLowerCase().replace(/\s+/g, '-')}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        )
      })}

      {/* ── Center dark gradient (for depth on nodes) ──────── */}
      <radialGradient id={`${id}-node-bg`} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </radialGradient>
    </defs>
  )
}
