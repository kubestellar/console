const POD_PRIMARY_REASON_PRIORITY = [
  'OOMKilled',
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
  'CreateContainerError',
  'RunContainerError',
  'PostStartHookError',
  'Unschedulable',
  'Failed',
] as const

export function appendUniqueProblem(problems: string[], problem: string | undefined): void {
  if (!problem || problems.includes(problem)) {
    return
  }
  problems.push(problem)
}

export function normalizePodProblems(problems: string[]): string[] {
  if (!problems.includes('OOMKilled')) {
    return problems
  }

  return problems.filter(problem => (
    problem === 'OOMKilled' ||
    problem === 'CrashLoopBackOff' ||
    problem.startsWith('High restarts')
  ))
}

export function getPrimaryPodProblem(problems: string[], fallback: string): string {
  for (const reason of POD_PRIMARY_REASON_PRIORITY) {
    if (problems.includes(reason)) {
      return reason
    }
  }
  return fallback
}

export function parseResourceQuantity(value: string | undefined): number {
  if (!value) return 0
  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T|m)?$/)
  if (!match) {
    const num = parseFloat(value)
    return isNaN(num) ? 0 : num
  }
  const num = parseFloat(match[1])
  const suffix = match[2]
  switch (suffix) {
    case 'Ki':
      return num * 1024
    case 'Mi':
      return num * 1024 * 1024
    case 'Gi':
      return num * 1024 * 1024 * 1024
    case 'Ti':
      return num * 1024 * 1024 * 1024 * 1024
    case 'K':
      return num * 1000
    case 'M':
      return num * 1000 * 1000
    case 'G':
      return num * 1000 * 1000 * 1000
    case 'T':
      return num * 1000 * 1000 * 1000 * 1000
    case 'm':
      return num / 1000
    default:
      return num
  }
}

export function parseResourceQuantityMillicores(value: string | undefined): number {
  if (!value) return 0
  const trimmed = value.trim()

  if (trimmed.endsWith('m')) {
    const num = parseFloat(trimmed.slice(0, -1))
    return isNaN(num) ? 0 : num
  }

  const num = parseFloat(trimmed)
  return isNaN(num) ? 0 : num * 1000
}
