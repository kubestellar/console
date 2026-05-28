import type { ClusterHealth, DeploymentIssue, PodIssue } from '../../hooks/mcp/types'

const MAX_DIAGNOSE_ISSUES = 10
const MAX_REPAIR_ISSUES = 5

interface DeploymentIssuePromptFields extends Pick<DeploymentIssue, 'name' | 'namespace'> {
  readyReplicas: number | null | undefined
  replicas: number | null | undefined
  reason?: string
}

interface PodIssuePromptFields extends Pick<PodIssue, 'name' | 'namespace' | 'status'> {
  restarts?: number
}

type HealthPromptFields = Pick<ClusterHealth, 'nodeCount' | 'readyNodes' | 'podCount' | 'cpuCores'>

export interface DiagnosePromptInput {
  clusterName: string
  health?: HealthPromptFields | null
  promptMemorySummary: string
  totalGpuCount: number
  podIssues: PodIssuePromptFields[]
  deploymentIssues: DeploymentIssuePromptFields[]
}

export interface RepairPromptInput {
  clusterName: string
  podIssues: PodIssuePromptFields[]
  deploymentIssues: DeploymentIssuePromptFields[]
}

export function formatDeploymentReadyStatus(readyReplicas: number | null | undefined, totalReplicas: number | null | undefined): string {
  return `${readyReplicas ?? 0}/${totalReplicas ?? 0} ready`
}

export function buildDiagnosePrompt({ clusterName, health, promptMemorySummary, totalGpuCount, podIssues, deploymentIssues }: DiagnosePromptInput): string {
  const issuesSummary = [
    ...podIssues.map(podIssue => `Pod ${podIssue.name} in ${podIssue.namespace}: ${podIssue.status}`),
    ...deploymentIssues.map(deploymentIssue => `Deployment ${deploymentIssue.name} in ${deploymentIssue.namespace}: ${formatDeploymentReadyStatus(deploymentIssue.readyReplicas, deploymentIssue.replicas)}`),
  ].slice(0, MAX_DIAGNOSE_ISSUES).join('\n')

  return `Analyze the health of Kubernetes cluster "${clusterName}" and identify any issues that need attention.

Current cluster state:
- Nodes: ${health?.nodeCount ?? 0} total, ${health?.readyNodes ?? 0} ready
- Pods: ${health?.podCount ?? 0} total
- CPU: ${health?.cpuCores ?? 0} cores
- Memory: ${promptMemorySummary}
- GPUs: ${totalGpuCount} total

Known issues (${podIssues.length + deploymentIssues.length} total):
${issuesSummary || 'No known issues'}

Please analyze this cluster and provide:
1. Health assessment summary
2. Identified issues and their severity
3. Recommended actions to resolve issues
4. Preventive measures to avoid future problems`
}

export function buildRepairPrompt({ clusterName, podIssues, deploymentIssues }: RepairPromptInput): string {
  const issuesList = [
    ...podIssues.slice(0, MAX_REPAIR_ISSUES).map(podIssue => `- Pod "${podIssue.name}" in namespace "${podIssue.namespace}": ${podIssue.status} (${podIssue.restarts ?? 0} restarts)`),
    ...deploymentIssues.slice(0, MAX_REPAIR_ISSUES).map(deploymentIssue => `- Deployment "${deploymentIssue.name}" in namespace "${deploymentIssue.namespace}": ${formatDeploymentReadyStatus(deploymentIssue.readyReplicas, deploymentIssue.replicas)} - ${deploymentIssue.reason ?? 'Unknown reason'}`),
  ].join('\n')

  return `I need help repairing issues in Kubernetes cluster "${clusterName}".

Current issues that need to be fixed:
${issuesList}

For each issue, please:
1. Diagnose the root cause
2. Suggest a fix with the exact kubectl commands needed
3. Explain what each command does
4. Warn about any potential side effects

After I approve, help me execute the repairs step by step.`
}
