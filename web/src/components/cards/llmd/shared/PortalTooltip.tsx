/**
 * Portal Tooltip Component
 *
 * Renders tooltips outside the card DOM tree using React Portal
 * so they don't get clipped by overflow:hidden on parent containers.
 */
import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

interface PortalTooltipProps {
  children: ReactNode
  content: ReactNode
  className?: string
}

export function PortalTooltip({ children, content, className = '' }: PortalTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)

  // Update position on scroll/resize to keep tooltip attached
  useEffect(() => {
    if (!isVisible || !triggerRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      })
    }

    updatePosition()

    // Update on scroll (capture phase for nested scrolls)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible])

  return (
    <>
      <span
        ref={triggerRef}
        className={`cursor-help border-b border-dotted border-slate-500 ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </span>

      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs whitespace-nowrap shadow-xl backdrop-blur-sm">
                {content}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

// Acronym definitions for LLM-d terminology
export const ACRONYM_DEFINITIONS: Record<string, { full: string; desc: string }> = {
  EPP: { full: 'Endpoint Picker Pod', desc: 'Intelligent scheduler that routes requests to optimal inference pods based on KV cache state' },
  KV: { full: 'Key-Value (Cache)', desc: 'Stores attention keys and values from the prefill phase to avoid recomputation during decode' },
  RPS: { full: 'Requests Per Second', desc: 'Number of inference requests processed per second' },
  TTFT: { full: 'Time To First Token', desc: 'Latency from request submission to receiving the first generated token' },
  TPOT: { full: 'Time Per Output Token', desc: 'Average time to generate each subsequent token after the first' },
  GPU: { full: 'Graphics Processing Unit', desc: 'Hardware accelerator used for neural network inference' },
  HPA: { full: 'Horizontal Pod Autoscaler', desc: 'Kubernetes autoscaler that scales pods based on CPU/memory metrics' },
  VPA: { full: 'Vertical Pod Autoscaler', desc: 'Kubernetes autoscaler that adjusts CPU/memory requests for pods' },
  WVA: { full: 'Weighted Variant Autoscaler', desc: 'LLM-d autoscaler that scales model variants based on traffic patterns and hardware availability' },
  VA: { full: 'Variant Autoscaler', desc: 'Scales inference pods based on model-specific metrics like queue depth and latency' },
  VRAM: { full: 'Video RAM', desc: 'GPU memory used for storing model weights and KV cache during inference' },
  MoE: { full: 'Mixture of Experts', desc: 'Architecture where only a subset of model parameters (experts) are activated per token' },
  RDMA: { full: 'Remote Direct Memory Access', desc: 'High-speed memory transfer between servers, used for KV cache transfer in disaggregated serving' },
  NVLink: { full: 'NVIDIA NVLink', desc: 'High-bandwidth GPU interconnect for fast data transfer between GPUs' },
  P50: { full: '50th Percentile (Median)', desc: 'Half of requests complete faster than this latency' },
  P95: { full: '95th Percentile', desc: '95% of requests complete faster than this latency' },
  P99: { full: '99th Percentile', desc: '99% of requests complete faster than this latency' },
}

// Convenience component for acronym tooltips
interface AcronymProps {
  term: string
  className?: string
}

export function Acronym({ term, className = '' }: AcronymProps) {
  const def = ACRONYM_DEFINITIONS[term]
  if (!def) return <span className={className}>{term}</span>

  return (
    <PortalTooltip
      className={className}
      content={
        <>
          <span className="font-semibold text-white">{def.full}</span>
          <br />
          <span className="text-slate-400">{def.desc}</span>
        </>
      }
    >
      {term}
    </PortalTooltip>
  )
}

export default PortalTooltip
