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
