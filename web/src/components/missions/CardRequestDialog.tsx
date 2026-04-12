/**
 * CardRequestDialog — Opens a pre-filled GitHub issue when no monitoring card
 * exists for a deployed CNCF project. Reuses the existing feedback pipeline.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, X, Send, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { emitGroundControlCardRequestOpened } from '../../lib/analytics'
import { useToast } from '../ui/Toast'

interface CardRequestDialogProps {
  /** Projects that have no direct monitoring card mapping */
  missingProjects: string[]
  onClose: () => void
}

export function CardRequestDialog({ missingProjects, onClose }: CardRequestDialogProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [submittingProject, setSubmittingProject] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Set<string>>(new Set())
  const [failedProjects, setFailedProjects] = useState<Set<string>>(new Set())

  const handleRequest = useCallback(async (project: string) => {
    setSubmittingProject(project)
    setFailedProjects(prev => { const next = new Set(prev); next.delete(project); return next })
    try {
      await api.post('/api/feedback/requests', {
        title: `Card Request: ${project} monitoring card`,
        description: `A user deployed ${project} via Mission Control and a Ground Control dashboard was generated, but no specific monitoring card exists for ${project}. Please consider adding a dedicated monitoring card for this CNCF project.\n\nRequested automatically by the Orbital Maintenance system.`,
        request_type: 'feature',
      })
      emitGroundControlCardRequestOpened(project)
      setSubmitted(prev => new Set(prev).add(project))
      showToast(`Card request submitted for ${project}`, 'success')
    } catch {
      setFailedProjects(prev => new Set(prev).add(project))
      showToast('Could not submit request — try opening a GitHub issue directly', 'warning')
    } finally {
      setSubmittingProject(null)
    }
  }, [showToast])

  if ((missingProjects || []).length === 0) return null

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border bg-secondary/20 overflow-hidden">
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Missing monitoring cards</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      <div className="px-4 pb-3 space-y-2">
        {(missingProjects || []).map(project => (
          <div key={project} className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {t('orbit.cardRequest', { project })}
            </span>
            {submitted.has(project) ? (
              <span className="text-[10px] text-green-400 font-medium">Requested</span>
            ) : failedProjects.has(project) ? (
              <button
                onClick={() => handleRequest(project)}
                disabled={submittingProject !== null}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 rounded transition-colors"
              >
                <Send className="w-2.5 h-2.5" />
                Retry
              </button>
            ) : (
              <button
                onClick={() => handleRequest(project)}
                disabled={submittingProject !== null}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 rounded transition-colors"
              >
                {submittingProject === project ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Send className="w-2.5 h-2.5" />
                )}
                {submittingProject === project ? 'Sending...' : t('orbit.cardRequestAction')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
