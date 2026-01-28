/**
 * Save Resolution Dialog
 *
 * Dialog for saving a successful mission resolution for future reference.
 * Auto-detects issue signature and allows user to edit before saving.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  X,
  Save,
  Share2,
  AlertCircle,
  CheckCircle,
  Tag,
  FileText,
  ListOrdered,
  Code,
} from 'lucide-react'
import type { Mission } from '../../hooks/useMissions'
import { useResolutions, detectIssueSignature, type IssueSignature, type ResolutionSteps } from '../../hooks/useResolutions'
import { cn } from '../../lib/cn'

interface SaveResolutionDialogProps {
  mission: Mission
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export function SaveResolutionDialog({
  mission,
  isOpen,
  onClose,
  onSaved,
}: SaveResolutionDialogProps) {
  const { saveResolution } = useResolutions()

  // Auto-detect issue signature from mission content
  const autoDetectedSignature = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...mission.messages.map(m => m.content),
    ].join('\n')

    return detectIssueSignature(content)
  }, [mission])

  // Form state
  const [title, setTitle] = useState('')
  const [issueType, setIssueType] = useState('')
  const [resourceKind, setResourceKind] = useState('')
  const [summary, setSummary] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [yaml, setYaml] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize form with auto-detected values
  useEffect(() => {
    if (isOpen) {
      setTitle(mission.title)
      setIssueType(autoDetectedSignature.type || '')
      setResourceKind(autoDetectedSignature.resourceKind || '')

      // Try to extract summary from last assistant message
      const lastAssistant = [...mission.messages].reverse().find(m => m.role === 'assistant')
      if (lastAssistant) {
        // Look for a summary section or use first paragraph
        const summaryMatch = lastAssistant.content.match(/(?:summary|solution|fix)[:\s]*([^\n]+)/i)
        if (summaryMatch) {
          setSummary(summaryMatch[1].trim())
        } else {
          // Use first non-empty paragraph
          const firstPara = lastAssistant.content.split('\n\n')[0]?.trim() || ''
          setSummary(firstPara.length > 200 ? firstPara.substring(0, 197) + '...' : firstPara)
        }

        // Try to extract steps from numbered lists
        const numberedSteps = lastAssistant.content.match(/^\d+\.\s+.+$/gm) || []
        if (numberedSteps.length > 0) {
          setSteps(numberedSteps.map(s => s.replace(/^\d+\.\s+/, '')))
        }

        // Extract YAML code blocks
        const yamlBlocks = lastAssistant.content.match(/```ya?ml\n([\s\S]*?)```/g) || []
        if (yamlBlocks.length > 0) {
          setYaml(yamlBlocks.map(b => b.replace(/```ya?ml\n|```/g, '')).join('\n---\n'))
        }
      }

      setError(null)
    }
  }, [isOpen, mission, autoDetectedSignature])

  const handleAddStep = () => {
    setSteps(prev => [...prev, ''])
  }

  const handleRemoveStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index))
  }

  const handleStepChange = (index: number, value: string) => {
    setSteps(prev => prev.map((s, i) => i === index ? value : s))
  }

  const handleSave = async () => {
    // Validate
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!issueType.trim()) {
      setError('Issue type is required')
      return
    }
    if (!summary.trim()) {
      setError('Summary is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const issueSignature: IssueSignature = {
        type: issueType.trim(),
        resourceKind: resourceKind.trim() || undefined,
        errorPattern: autoDetectedSignature.errorPattern,
        namespace: autoDetectedSignature.namespace,
      }

      const resolution: ResolutionSteps = {
        summary: summary.trim(),
        steps: steps.filter(s => s.trim()),
        yaml: yaml.trim() || undefined,
      }

      saveResolution({
        missionId: mission.id,
        title: title.trim(),
        issueSignature,
        resolution,
        context: {
          cluster: mission.cluster,
        },
        visibility,
      })

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save resolution')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Save Resolution</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Fix OOM in payment service"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Issue Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
                <Tag className="w-4 h-4 text-muted-foreground" />
                Issue Type
              </label>
              <input
                type="text"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                placeholder="e.g., CrashLoopBackOff"
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Resource Kind
              </label>
              <input
                type="text"
                value={resourceKind}
                onChange={(e) => setResourceKind(e.target.value)}
                placeholder="e.g., Pod, Deployment"
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description of the fix..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Steps */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <ListOrdered className="w-4 h-4 text-muted-foreground" />
              Steps
            </label>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{index + 1}.</span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => handleStepChange(index, e.target.value)}
                    placeholder="Step description..."
                    className="flex-1 px-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {steps.length > 1 && (
                    <button
                      onClick={() => handleRemoveStep(index)}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-muted-foreground hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddStep}
                className="text-xs text-primary hover:text-primary/80 ml-7"
              >
                + Add step
              </button>
            </div>
          </div>

          {/* YAML */}
          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-1.5">
              <Code className="w-4 h-4 text-muted-foreground" />
              YAML Snippets (optional)
            </label>
            <textarea
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              placeholder="Paste relevant YAML configuration..."
              rows={4}
              className="w-full px-3 py-2 text-xs font-mono bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Visibility
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setVisibility('private')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'private'
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Save className="w-4 h-4" />
                <span className="text-sm">Save Private</span>
              </button>
              <button
                onClick={() => setVisibility('shared')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  visibility === 'shared'
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                    : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm">Share to Org</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save Resolution
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
