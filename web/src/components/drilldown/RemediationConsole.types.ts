export interface LogEntry {
  id: string
  timestamp: Date
  type: 'thinking' | 'action' | 'result' | 'error' | 'info' | 'command' | 'output'
  message: string
  details?: string
}

export interface RemediationConsoleProps {
  isOpen: boolean
  onClose: () => void
  resourceType: 'pod' | 'deployment' | 'node'
  resourceName: string
  namespace: string
  cluster: string
  issues: string[]
}

export interface RemediationFlowStep {
  type: LogEntry['type']
  message: string
  details?: string
  delay: number
}

// Animation delay constants for simulated remediation steps
export const THINKING_DELAY_MS = 800
export const ACTION_DELAY_MS = 1000
export const ACTION_LONG_DELAY_MS = 1200
export const ANALYSIS_DELAY_MS = 1500
export const INFO_DELAY_MS = 600
export const RESULT_DELAY_MS = 500

// Token usage estimation constants
export const BASE_TOKEN_ESTIMATE = 1000
export const TOKENS_PER_STEP_ESTIMATE = 100

// Simulated remediation steps based on issue type
export const REMEDIATION_FLOWS: Record<string, RemediationFlowStep[]> = {
  CrashLoopBackOff: [
    { type: 'thinking', message: 'Analyzing CrashLoopBackOff issue...', delay: THINKING_DELAY_MS },
    { type: 'action', message: 'Fetching pod logs to identify root cause', delay: ACTION_LONG_DELAY_MS },
    { type: 'info', message: 'Found error in container logs: "Error: Cannot find module \'express\'"', delay: ANALYSIS_DELAY_MS },
    { type: 'thinking', message: 'This appears to be a missing dependency issue. Checking if this is a code or image problem...', delay: ACTION_DELAY_MS },
    { type: 'action', message: 'Checking deployment image and pull policy', delay: THINKING_DELAY_MS },
    { type: 'info', message: 'Image: myapp:latest, PullPolicy: Always', delay: INFO_DELAY_MS },
    { type: 'thinking', message: 'The issue is likely in the container image. Recommending image rebuild or rollback.', delay: ACTION_DELAY_MS },
    { type: 'result', message: 'Recommendation: Rollback to previous working image version or fix the Docker build', details: 'kubectl rollout undo deployment/myapp -n default', delay: RESULT_DELAY_MS },
  ],
  ImagePullBackOff: [
    { type: 'thinking', message: 'Analyzing ImagePullBackOff issue...', delay: THINKING_DELAY_MS },
    { type: 'action', message: 'Checking image reference and pull secrets', delay: ACTION_DELAY_MS },
    { type: 'info', message: 'Image: registry.example.com/app:v2.0', delay: INFO_DELAY_MS },
    { type: 'action', message: 'Verifying image pull secrets in namespace', delay: ACTION_LONG_DELAY_MS },
    { type: 'error', message: 'No valid pull secret found for registry.example.com', delay: THINKING_DELAY_MS },
    { type: 'thinking', message: 'The pod needs a pull secret to access the private registry.', delay: ACTION_DELAY_MS },
    { type: 'result', message: 'Fix: Create or update image pull secret for the registry', details: 'kubectl create secret docker-registry regcred --docker-server=registry.example.com --docker-username=<user> --docker-password=<pass> -n default', delay: RESULT_DELAY_MS },
  ],
  OOMKilled: [
    { type: 'thinking', message: 'Analyzing OOMKilled issue...', delay: THINKING_DELAY_MS },
    { type: 'action', message: 'Checking container resource limits', delay: ACTION_DELAY_MS },
    { type: 'info', message: 'Current memory limit: 256Mi, Request: 128Mi', delay: INFO_DELAY_MS },
    { type: 'action', message: 'Analyzing memory usage patterns from metrics', delay: ANALYSIS_DELAY_MS },
    { type: 'info', message: 'Peak memory usage before OOM: 254Mi (99% of limit)', delay: THINKING_DELAY_MS },
    { type: 'thinking', message: 'The container is running out of memory. Need to increase limits or optimize the application.', delay: ACTION_DELAY_MS },
    { type: 'result', message: 'Recommendation: Increase memory limit to 512Mi', details: 'kubectl patch deployment myapp -p \'{"spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"512Mi"}}}]}}}}\'', delay: RESULT_DELAY_MS },
  ],
  Pending: [
    { type: 'thinking', message: 'Analyzing why pod is stuck in Pending state...', delay: THINKING_DELAY_MS },
    { type: 'action', message: 'Checking node resources and scheduling constraints', delay: ACTION_LONG_DELAY_MS },
    { type: 'info', message: 'Pod requests: CPU 2, Memory 4Gi', delay: INFO_DELAY_MS },
    { type: 'action', message: 'Checking available cluster capacity', delay: ACTION_DELAY_MS },
    { type: 'info', message: 'Available: CPU 0.5, Memory 1Gi across all nodes', delay: THINKING_DELAY_MS },
    { type: 'thinking', message: 'Insufficient cluster resources to schedule the pod.', delay: ACTION_DELAY_MS },
    { type: 'result', message: 'Options: Scale up cluster, reduce pod resource requests, or remove other workloads', details: 'Consider: kubectl scale deployment less-critical-app --replicas=0', delay: RESULT_DELAY_MS },
  ],
  default: [
    { type: 'thinking', message: 'Analyzing the issue...', delay: THINKING_DELAY_MS },
    { type: 'action', message: 'Gathering diagnostic information', delay: ACTION_LONG_DELAY_MS },
    { type: 'action', message: 'Checking pod events and logs', delay: ACTION_DELAY_MS },
    { type: 'action', message: 'Analyzing resource configuration', delay: ACTION_DELAY_MS },
    { type: 'thinking', message: 'Determining best remediation approach...', delay: ACTION_LONG_DELAY_MS },
    { type: 'result', message: 'Analysis complete. Review the gathered information above for next steps.', delay: RESULT_DELAY_MS },
  ],
}
