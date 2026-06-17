export function makeWorkerRequestId(seed = 1): number {
  return seed
}

export function makeWorkerKey(scope = 'pods'): string {
  return `${scope}:all`
}
