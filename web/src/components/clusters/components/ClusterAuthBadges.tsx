import type { ClusterInfo } from '../../../hooks/useMCP'
import { CopyCommandButton, getIAMRefreshHint, isTokenExpired } from './ClusterTokenRefresh'

const AUTH_BADGE_MAP: Record<string, { label: string; color: string }> = {
  exec: { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  token: { label: 'token', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  certificate: { label: 'cert', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
  'auth-provider': { label: 'IAM', color: 'bg-black/5 dark:bg-white/5 text-muted-foreground' },
}

export function ClusterAuthBadges({
  cluster,
  className,
}: {
  cluster: ClusterInfo
  className: string
}) {
  if (!cluster.authMethod || !AUTH_BADGE_MAP[cluster.authMethod]) return null

  const badge = AUTH_BADGE_MAP[cluster.authMethod]
  const loginHint = getIAMRefreshHint(cluster)
  const title = cluster.authMethod === 'exec'
    ? `Auth: IAM (exec plugin)${loginHint ? `
Login: ${loginHint}` : ''}`
    : `Auth: ${cluster.authMethod}`

  return (
    <span className={`${className} ${badge.color}`} title={title}>
      {badge.label}
    </span>
  )
}

export function ClusterIAMRefreshHint({
  cluster,
  className,
  label = 'Login:',
}: {
  cluster: ClusterInfo
  className: string
  label?: string | null
}) {
  if (cluster.authMethod !== 'exec' || (!isTokenExpired(cluster) && cluster.reachable !== false)) {
    return null
  }

  const hint = getIAMRefreshHint(cluster)
  if (!hint) return null

  return (
    <span className={className}>
      {label ? <>{label} </> : null}
      <code className="bg-black/5 dark:bg-white/5 px-1 rounded">{hint}</code>
      <CopyCommandButton text={hint} />
    </span>
  )
}
