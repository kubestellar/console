/**
 * PreflightFailure — Renders a structured preflight error with remediation actions.
 *
 * Displayed inside the mission chat when a preflight permission check fails,
 * replacing the generic error message with targeted guidance.
 */

import { useState, useRef, useEffect } from 'react'

const COPY_FEEDBACK_MS = 2000
import {
  ShieldAlert,
  KeyRound,
  Clock,
  ShieldX,
  MapPin,
  WifiOff,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Info } from 'lucide-react'
import type { PreflightError, PreflightErrorCode, RemediationAction } from '../../lib/missions/preflightCheck'
import { getRemediationActions } from '../../lib/missions/preflightCheck'
import { cn } from '../../lib/cn'
import { copyToClipboard } from '../../lib/clipboard'

// ============================================================================
// Icon / color mapping per error code
// ============================================================================

const ERROR_DISPLAY: Record<PreflightErrorCode, { icon: typeof ShieldAlert; color: string; bgColor: string; title: string }> = {
  MISSING_CREDENTIALS: {
    icon: KeyRound,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    title: 'Missing Credentials' },
  EXPIRED_CREDENTIALS: {
    icon: Clock,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    title: 'Expired Credentials' },
  RBAC_DENIED: {
    icon: ShieldX,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    title: 'Permission Denied' },
  CONTEXT_NOT_FOUND: {
    icon: MapPin,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    title: 'Context Not Found' },
  CLUSTER_UNREACHABLE: {
    icon: WifiOff,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    title: 'Cluster Unreachable' },
  UNKNOWN_EXECUTION_FAILURE: {
    icon: AlertTriangle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    title: 'Preflight Check Failed' } }

// ============================================================================
// Action button renderer
// ============================================================================

function ActionButton({
  action,
  onRetry }: {
  action: RemediationAction
  onRetry?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup copy feedback timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (action.codeSnippet) {
      // #6229: route through the shared lib/clipboard helper which guards
      // typeof navigator?.clipboard?.writeText === 'function' and falls back
      // to a hidden textarea + execCommand on browsers without the API.
      // The previous direct call had an empty .catch() so failures were
      // completely silent.
      const ok = await copyToClipboard(action.codeSnippet)
      if (!ok) {
        // Surface the failure as a transient label flip — the existing
        // setCopied(true) toast becomes a no-op and the user sees nothing
        // change, which is at least less confusing than the old silent
        // failure path.
        return
      }
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        copyTimeoutRef.current = null
      }, COPY_FEEDBACK_MS)
    }
  }

  const iconMap = {
    copy: copied ? Check : Copy,
    retry: RotateCcw,
    link: ExternalLink,
    info: Info }
  const Icon = iconMap[action.actionType]

  if (action.actionType === 'info') {
    return (
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Icon size={14} className="mt-0.5 shrink-0 text-gray-400" />
        <span>{action.description}</span>
      </div>
    )
  }

  if (action.actionType === 'retry') {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-md bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-600/30"
      >
        <Icon size={14} />
        {action.label}
      </button>
    )
  }

  if (action.actionType === 'link' && action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-blue-400 hover:underline"
      >
        <Icon size={14} />
        {action.label}
      </a>
    )
  }

  // Copy action
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
        {action.codeSnippet && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-foreground"
          >
            <Icon size={12} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">{action.description}</p>
      {action.codeSnippet && (
        <pre className="mt-1 overflow-x-auto rounded-md bg-gray-900/70 p-2 text-xs text-muted-foreground">
          <code>{action.codeSnippet}</code>
        </pre>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export interface PreflightFailureProps {
  error: PreflightError
  context?: string
  onRetry?: () => void
}

export function PreflightFailure({ error, context, onRetry }: PreflightFailureProps) {
  const display = ERROR_DISPLAY[error.code]
  const Icon = display.icon
  const actions = getRemediationActions(error, context)

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-700/50 p-4',
        display.bgColor,
      )}
      data-testid="preflight-failure"
      data-error-code={error.code}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} className={display.color} />
        <h4 className="text-sm font-semibold text-gray-100">
          {display.title}
        </h4>
        <span className="ml-auto rounded bg-gray-800/80 px-2 py-0.5 text-[10px] font-mono text-gray-500">
          {error.code}
        </span>
      </div>

      {/* Error message */}
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {error.message}
      </p>

      {/* Context info */}
      {context && (
        <p className="mb-3 text-xs text-gray-500">
          Cluster context: <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-400">{context}</code>
        </p>
      )}

      {/* Remediation actions */}
      {actions.length > 0 && (
        <div className="space-y-3 border-t border-gray-700/30 pt-3">
          <p className="text-xs font-medium text-gray-400">How to fix:</p>
          {actions.map((action, i) => (
            <ActionButton key={i} action={action} onRetry={onRetry} />
          ))}
        </div>
      )}
    </div>
  )
}
