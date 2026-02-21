/**
 * Compare two Flatcar version strings (semver major.minor.patch) for
 * descending sort — i.e. newer versions come first.
 *
 * The string "unknown" sorts after all real versions.
 *
 * @returns negative if a > b, positive if a < b, 0 if equal
 */
export function compareFlatcarVersions(a: string, b: string): number {
  if (a === 'unknown' && b === 'unknown') return 0
  if (a === 'unknown') return 1
  if (b === 'unknown') return -1
  const [aMaj = 0, aMin = 0, aPatch = 0] = a.split('.').map(Number)
  const [bMaj = 0, bMin = 0, bPatch = 0] = b.split('.').map(Number)
  if (aMaj !== bMaj) return bMaj - aMaj
  if (aMin !== bMin) return bMin - aMin
  return bPatch - aPatch
}
