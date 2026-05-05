/** Determine issue severity for styling */
export function getIssueSeverity(issue: string): 'critical' | 'warning' | 'info' {
  const lowerIssue = issue.toLowerCase()

  if (lowerIssue.includes('crashloopbackoff') ||
      lowerIssue.includes('oomkilled') ||
      lowerIssue.includes('oom') ||
      lowerIssue.includes('imagepullbackoff') ||
      lowerIssue.includes('errimagepull') ||
      lowerIssue.includes('failed') ||
      lowerIssue.includes('error') ||
      lowerIssue.includes('evicted')) {
    return 'critical'
  }
  if (lowerIssue.includes('pending') || lowerIssue.includes('waiting')) {
    return 'warning'
  }
  if (lowerIssue.includes('creating') || lowerIssue.includes('running')) {
    return 'info'
  }

  return 'warning'
}

export type PodDiagnosisKind = 'crash-loop' | 'oom-killed' | 'image-pull' | 'config-error' | 'probe-failure' | 'unknown'

export interface PodDiagnosisInput {
  status?: string
  reason?: string
  issues?: string[]
  describeOutput?: string | null
  eventsOutput?: string | null
  logsOutput?: string | null
}

export interface PodDiagnosis {
  kind: PodDiagnosisKind
  currentStateReason?: string
  lastExitReason?: string
  exitCode?: string
  lastExitMessage?: string
  warningEvent?: string
  logSnippet?: string
}

const LAST_STATE_REASON_PATTERN = /Last State:\s+Terminated[\s\S]*?Reason:\s*([^\n]+)/i
const LAST_STATE_EXIT_CODE_PATTERN = /Last State:\s+Terminated[\s\S]*?Exit Code:\s*(\d+)/i
const LAST_STATE_MESSAGE_PATTERN = /Last State:\s+Terminated[\s\S]*?Message:\s*([^\n]+)/i
const WAITING_REASON_PATTERN = /State:\s+Waiting[\s\S]*?Reason:\s*([^\n]+)/i
const PROBE_FAILURE_PATTERN = /(liveness|startup) probe failed/i
const OOM_KILLED_PATTERN = /oomkilled|out of memory|memory limit/i
const IMAGE_PULL_PATTERN = /imagepullbackoff|errimagepull|failed to pull image|pull access denied|image pull/i
const CONFIG_ERROR_PATTERN = /createcontainerconfigerror|configmap .* not found|secret .* not found|invalid image name/i
const CRASH_LOOP_PATTERN = /crashloopbackoff|back-off restarting failed container|container cannot run|exited with/i
const UNKNOWN_ISSUE_PATTERN = /error|failed|warning|backoff|crash|killed/i
const MAX_LOG_SNIPPET_LENGTH = 160

function extractMatch(source: string | null | undefined, pattern: RegExp): string | undefined {
  const match = source?.match(pattern)
  return match?.[1]?.trim()
}

function extractWarningEvent(eventsOutput?: string | null): string | undefined {
  if (!eventsOutput || eventsOutput.includes('No resources found')) {
    return undefined
  }

  const eventLines = eventsOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  return eventLines.find(line => /^warning\b/i.test(line) || line.toLowerCase().includes(' backoff '))
}

function extractLogSnippet(logsOutput?: string | null): string | undefined {
  if (!logsOutput) {
    return undefined
  }

  const firstLine = logsOutput
    .split('\n')
    .map(line => line.trim())
    .find(Boolean)

  if (!firstLine) {
    return undefined
  }

  return firstLine.length > MAX_LOG_SNIPPET_LENGTH
    ? `${firstLine.slice(0, MAX_LOG_SNIPPET_LENGTH)}…`
    : firstLine
}

export function getPodDiagnosis({
  status,
  reason,
  issues = [],
  describeOutput,
  eventsOutput,
  logsOutput,
}: PodDiagnosisInput): PodDiagnosis | null {
  const searchText = [
    status,
    reason,
    ...issues,
    describeOutput || '',
    eventsOutput || '',
    logsOutput || '',
  ].join('\n').toLowerCase()

  if (!searchText.trim()) {
    return null
  }

  const diagnosis: PodDiagnosis = {
    kind: 'unknown',
    currentStateReason: extractMatch(describeOutput, WAITING_REASON_PATTERN),
    lastExitReason: extractMatch(describeOutput, LAST_STATE_REASON_PATTERN),
    exitCode: extractMatch(describeOutput, LAST_STATE_EXIT_CODE_PATTERN),
    lastExitMessage: extractMatch(describeOutput, LAST_STATE_MESSAGE_PATTERN),
    warningEvent: extractWarningEvent(eventsOutput),
    logSnippet: extractLogSnippet(logsOutput),
  }

  if (OOM_KILLED_PATTERN.test(searchText)) {
    diagnosis.kind = 'oom-killed'
  } else if (IMAGE_PULL_PATTERN.test(searchText)) {
    diagnosis.kind = 'image-pull'
  } else if (CONFIG_ERROR_PATTERN.test(searchText)) {
    diagnosis.kind = 'config-error'
  } else if (PROBE_FAILURE_PATTERN.test(searchText)) {
    diagnosis.kind = 'probe-failure'
  } else if (CRASH_LOOP_PATTERN.test(searchText)) {
    diagnosis.kind = 'crash-loop'
  } else if (!UNKNOWN_ISSUE_PATTERN.test(searchText)) {
    return null
  }

  return diagnosis
}
