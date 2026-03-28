/**
 * RotatingTip — a lightweight "Did you know?" banner that shows a different
 * tip on every page visit, creating variable-reward engagement.
 *
 * Pick one tip per page key from a seeded index stored in sessionStorage so
 * the tip stays stable within a session but rotates across visits.
 */

import { useState, useEffect } from 'react'
import { Lightbulb } from 'lucide-react'
import { emitTipShown } from '../../lib/analytics'

const TIPS: Record<string, string[]> = {
  clusters: [
    'You can drag cluster cards to reorder them on the dashboard.',
    'Use the filter tabs to quickly isolate unhealthy or unreachable clusters.',
    'Clicking a cluster card opens a detailed view with node-level metrics.',
    'KubeStellar can manage clusters across multiple cloud providers simultaneously.',
    'The GPU panel shows NVIDIA operator status for AI/ML workloads.',
  ],
  compliance: [
    'Kyverno policies can auto-remediate non-compliant resources automatically.',
    'KubeStellar aggregates compliance scores across your entire fleet in real time.',
    'You can filter compliance results by cluster, profile, or severity.',
    'Trivy scans container images for CVEs directly from the console.',
    'Kubescape provides CIS Kubernetes Benchmark checks out of the box.',
  ],
  arcade: [
    'The Arcade dashboard lets you build a fully custom monitoring view.',
    'Drag and drop cards to create the perfect layout for your workflow.',
    'You can add the same card multiple times with different configurations.',
    'Arcade cards remember your layout between sessions automatically.',
    'Try combining GPU, compliance, and cluster cards for a unified overview.',
  ],
}

interface RotatingTipProps {
  page: keyof typeof TIPS
}

function pickTip(page: string): string {
  const tips = TIPS[page] ?? []
  if (tips.length === 0) return ''
  const key = `ksc_tip_idx_${page}`
  const stored = sessionStorage.getItem(key)
  if (stored !== null) {
    const parsed = parseInt(stored, 10)
    if (!isNaN(parsed)) return tips[parsed % tips.length]
  }
  const idx = Math.floor(Math.random() * tips.length)
  sessionStorage.setItem(key, String(idx))
  return tips[idx]
}

export function RotatingTip({ page }: RotatingTipProps) {
  const [tip] = useState(() => pickTip(page))

  useEffect(() => {
    if (tip) emitTipShown(page, tip)
  }, [page, tip])

  if (!tip) return null

  return (
    <div role="status" aria-label="Page tip" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
      <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" aria-hidden="true" />
      <span><span className="font-medium">Tip:</span> {tip}</span>
    </div>
  )
}
