import { useMemo } from 'react'
import { AlertTriangle, Lightbulb, ArrowRight, MemoryStick, Terminal, RefreshCw, ImageOff, Clock, HardDrive } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { useTranslation } from 'react-i18next'

export interface PodDiagnosisGuidanceProps {
  status: string
  issues: string[]
  restarts: number
  eventsOutput?: string | null
  logsOutput?: string | null
  onViewLogs?: () => void
  onViewEvents?: () => void
}

interface DiagnosisResult {
  rootCause: string
  explanation: string
  suggestions: string[]
  icon: typeof AlertTriangle
  severity: 'critical' | 'warning' | 'info'
}

/** Maximum restarts before flagging a rapid restart loop */
const RAPID_RESTART_THRESHOLD = 5

/**
 * Heuristic-based pod diagnosis that works WITHOUT an AI API key.
 * Analyzes status, issues, events, and logs to provide actionable guidance.
 */
function diagnoseFromHeuristics(
  status: string,
  issues: string[],
  restarts: number,
  eventsOutput?: string | null,
  logsOutput?: string | null,
): DiagnosisResult | null {
  const lowerStatus = status?.toLowerCase() || ''
  const lowerIssues = (issues || []).map(i => i.toLowerCase()).join(' ')
  const lowerEvents = (eventsOutput || '').toLowerCase()
  const lowerLogs = (logsOutput || '').toLowerCase()

  // OOMKilled detection
  if (lowerStatus.includes('oomkilled') || lowerIssues.includes('oomkilled') || lowerEvents.includes('oomkilled')) {
    return {
      rootCause: 'Out of Memory (OOMKilled)',
      explanation: 'The container exceeded its memory limit and was terminated by the kernel OOM killer. This happens when the application uses more memory than the configured resource limit.',
      suggestions: [
        'Increase memory limits in the pod spec (spec.containers[].resources.limits.memory)',
        'Profile the application to identify memory leaks or excessive allocation',
        'Check if the workload needs more memory for its current dataset/load',
        'Consider adding memory requests equal to limits for guaranteed QoS',
      ],
      icon: MemoryStick,
      severity: 'critical',
    }
  }

  // CrashLoopBackOff detection
  if (lowerStatus.includes('crashloopbackoff') || lowerIssues.includes('crashloopbackoff')) {
    // Try to determine WHY it's crashing from logs/events
    let explanation = 'The container is repeatedly crashing and Kubernetes is applying an exponential backoff delay before restarting it.'
    const suggestions: string[] = []

    if (lowerLogs.includes('exec format error') || lowerLogs.includes('no such file or directory')) {
      explanation += ' The container command or entrypoint appears to be invalid.'
      suggestions.push('Verify the container command/entrypoint exists in the image')
      suggestions.push('Check if the image architecture matches the node (amd64 vs arm64)')
    } else if (lowerLogs.includes('permission denied')) {
      explanation += ' The container process lacks required permissions.'
      suggestions.push('Check file permissions on the entrypoint script')
      suggestions.push('Verify securityContext settings (runAsUser, runAsGroup)')
    } else if (lowerLogs.includes('connection refused') || lowerLogs.includes('cannot connect')) {
      explanation += ' The application cannot connect to a required dependency.'
      suggestions.push('Verify dependent services (databases, APIs) are running and accessible')
      suggestions.push('Check service DNS names and network policies')
    } else if (lowerLogs === '' || lowerLogs.includes('no logs available')) {
      explanation += ' No logs available — the container may be exiting immediately on startup.'
      suggestions.push('Verify the container command keeps the process running (not just "exit 0")')
      suggestions.push('Check if the entrypoint/command is correct for this image')
    } else {
      suggestions.push('Check container logs for the specific error causing the crash')
    }

    suggestions.push('Verify environment variables and mounted secrets/configmaps are correct')
    suggestions.push('Test the container locally: docker run <image> <command>')

    if (restarts > RAPID_RESTART_THRESHOLD) {
      suggestions.push(`Pod has restarted ${restarts} times — the backoff delay is increasing exponentially`)
    }

    return {
      rootCause: 'CrashLoopBackOff',
      explanation,
      suggestions,
      icon: RefreshCw,
      severity: 'critical',
    }
  }

  // ImagePullBackOff / ErrImagePull
  if (lowerStatus.includes('imagepullbackoff') || lowerStatus.includes('errimagepull') ||
      lowerIssues.includes('imagepullbackoff') || lowerIssues.includes('errimagepull')) {
    const suggestions = [
      'Verify the image name and tag are correct',
      'Check if the image exists in the registry',
      'Ensure imagePullSecrets are configured for private registries',
      'Verify network connectivity to the container registry',
    ]

    if (lowerEvents.includes('unauthorized') || lowerEvents.includes('401')) {
      suggestions.unshift('Authentication failed — update or create imagePullSecrets for this namespace')
    }
    if (lowerEvents.includes('not found') || lowerEvents.includes('404')) {
      suggestions.unshift('Image or tag not found — verify the image name and tag exist in the registry')
    }

    return {
      rootCause: 'Image Pull Failure',
      explanation: 'Kubernetes cannot pull the container image from the registry. This blocks the pod from starting.',
      suggestions,
      icon: ImageOff,
      severity: 'critical',
    }
  }

  // Pending / Unschedulable
  if (lowerStatus.includes('pending') || lowerIssues.includes('unschedulable')) {
    const suggestions = [
      'Check node resources: kubectl describe nodes | grep -A 5 "Allocated resources"',
      'Verify nodeSelector/affinity constraints match available nodes',
      'Check for taints that prevent scheduling',
      'Ensure PersistentVolumeClaims are bound',
    ]

    if (lowerEvents.includes('insufficient memory') || lowerEvents.includes('insufficient cpu')) {
      suggestions.unshift('Cluster has insufficient resources — scale up nodes or reduce resource requests')
    }
    if (lowerEvents.includes('persistentvolumeclaim') || lowerEvents.includes('pvc')) {
      suggestions.unshift('PVC is not bound — check if a PersistentVolume is available with matching storage class')
    }

    return {
      rootCause: 'Pod Cannot Be Scheduled',
      explanation: 'The pod is stuck in Pending state because Kubernetes cannot find a suitable node to run it on.',
      suggestions,
      icon: Clock,
      severity: 'warning',
    }
  }

  // Evicted
  if (lowerStatus.includes('evicted') || lowerIssues.includes('evicted')) {
    return {
      rootCause: 'Pod Evicted',
      explanation: 'The pod was evicted from its node, typically due to resource pressure (disk, memory, or PID).',
      suggestions: [
        'Check node conditions: kubectl describe node <node-name>',
        'Look for DiskPressure, MemoryPressure, or PIDPressure conditions',
        'Clean up disk space on the node or increase node storage',
        'Set appropriate resource requests to avoid being evicted first',
      ],
      icon: HardDrive,
      severity: 'critical',
    }
  }

  // CreateContainerConfigError
  if (lowerStatus.includes('createcontainerconfigerror') || lowerIssues.includes('createcontainerconfigerror')) {
    return {
      rootCause: 'Container Configuration Error',
      explanation: 'Kubernetes cannot create the container due to a configuration issue, typically a missing ConfigMap, Secret, or invalid security context.',
      suggestions: [
        'Check if referenced ConfigMaps exist in this namespace',
        'Check if referenced Secrets exist in this namespace',
        'Verify volume mounts reference valid sources',
        'Check securityContext for invalid settings',
      ],
      icon: Terminal,
      severity: 'critical',
    }
  }

  // Generic high-restart pods without specific status
  if (restarts > RAPID_RESTART_THRESHOLD && !lowerStatus.includes('running')) {
    return {
      rootCause: 'Repeated Container Restarts',
      explanation: `The container has restarted ${restarts} times, indicating an unstable workload that repeatedly fails.`,
      suggestions: [
        'Check container logs for recurring errors',
        'Verify liveness/readiness probe configuration',
        'Ensure the application can start within the configured timeout',
        'Check resource limits — the container may be getting OOMKilled without clear reporting',
      ],
      icon: RefreshCw,
      severity: 'warning',
    }
  }

  return null
}

export function PodDiagnosisGuidance({
  status,
  issues,
  restarts,
  eventsOutput,
  logsOutput,
  onViewLogs,
  onViewEvents,
}: PodDiagnosisGuidanceProps) {
  const { t } = useTranslation()

  const diagnosis = useMemo(
    () => diagnoseFromHeuristics(status, issues, restarts, eventsOutput, logsOutput),
    [status, issues, restarts, eventsOutput, logsOutput],
  )

  if (!diagnosis) return null

  const Icon = diagnosis.icon
  const severityColors = {
    critical: 'border-red-500/30 bg-red-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
  }
  const headerColors = {
    critical: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400',
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', severityColors[diagnosis.severity])}>
      {/* Header: Root cause */}
      <div className="flex items-center gap-2">
        <Icon className={cn('w-5 h-5', headerColors[diagnosis.severity])} />
        <h3 className={cn('text-sm font-semibold', headerColors[diagnosis.severity])}>
          {t('drilldown.diagnosis.rootCause', { defaultValue: 'Likely Root Cause' })}: {diagnosis.rootCause}
        </h3>
      </div>

      {/* Explanation */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {diagnosis.explanation}
      </p>

      {/* Suggestions */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {t('drilldown.diagnosis.nextSteps', { defaultValue: 'Next Steps' })}
          </span>
        </div>
        <ul className="space-y-1.5 ml-1">
          {diagnosis.suggestions.map((suggestion, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <ArrowRight className="w-3 h-3 mt-1 text-primary shrink-0" />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Quick Actions */}
      {(onViewLogs || onViewEvents) && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          {onViewLogs && (
            <button
              onClick={onViewLogs}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
            >
              {t('drilldown.diagnosis.viewLogs', { defaultValue: 'View Logs' })}
            </button>
          )}
          {onViewEvents && (
            <button
              onClick={onViewEvents}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
            >
              {t('drilldown.diagnosis.viewEvents', { defaultValue: 'View Events' })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
