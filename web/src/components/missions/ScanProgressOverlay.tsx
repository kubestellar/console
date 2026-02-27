/**
 * Scan Progress Overlay
 *
 * Shows a progress indicator while a mission file is being scanned.
 * Displays real-time findings as they are discovered.
 */

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { FileScanResult, ScanFinding } from '../../lib/missions/types'

interface ScanProgressOverlayProps {
  isScanning: boolean
  result: FileScanResult | null
  onComplete: (result: FileScanResult) => void
  onDismiss: () => void
}

export function ScanProgressOverlay({
  isScanning,
  result,
  onComplete,
  onDismiss,
}: ScanProgressOverlayProps) {
  const [visibleFindings, setVisibleFindings] = useState<ScanFinding[]>([])

  useEffect(() => {
    if (!result) {
      setVisibleFindings([])
      return
    }

    // Animate findings appearing one by one
    let index = 0
    const interval = setInterval(() => {
      if (index < result.findings.length) {
        setVisibleFindings((prev) => [...prev, result.findings[index]])
        index++
      } else {
        clearInterval(interval)
      }
    }, 150)

    return () => clearInterval(interval)
  }, [result])

  useEffect(() => {
    if (result && visibleFindings.length === result.findings.length) {
      const timer = setTimeout(() => onComplete(result), 800)
      return () => clearTimeout(timer)
    }
  }, [result, visibleFindings.length, onComplete])

  if (!isScanning && !result) return null

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400" />
    }
  }

  return (
    <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
      <div className="w-full max-w-sm px-6">
        {isScanning && !result && (
          <div className="flex flex-col items-center gap-3">
            <div role="status" aria-live="polite" aria-label="Scanning mission file">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">Scanning mission file…</p>
            <p className="text-xs text-muted-foreground">Validating schema and checking content</p>
          </div>
        )}

        {result && (
          <div className="flex flex-col items-center gap-4">
            {result.valid ? (
              <CheckCircle className="w-8 h-8 text-green-400" />
            ) : (
              <XCircle className="w-8 h-8 text-red-400" />
            )}

            <p className={cn('text-sm font-medium', result.valid ? 'text-green-400' : 'text-red-400')}>
              {result.valid ? 'Scan passed' : 'Issues found'}
            </p>

            {visibleFindings.length > 0 && (
              <div className="w-full space-y-1.5 max-h-40 overflow-y-auto">
                {visibleFindings.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs animate-fade-in"
                  >
                    {severityIcon(f.severity)}
                    <span className="text-muted-foreground">{f.message}</span>
                  </div>
                ))}
              </div>
            )}

            {!result.valid && (
              <button
                onClick={onDismiss}
                className="mt-2 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
