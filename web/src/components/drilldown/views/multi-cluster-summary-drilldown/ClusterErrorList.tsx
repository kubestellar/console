import { Server } from 'lucide-react'
import type { ClusterErrorEntry } from './types'

interface ClusterErrorListProps {
  errors: ClusterErrorEntry[]
  authLabel: string
  titlePrefix: string
}

export function ClusterErrorList({ errors, authLabel, titlePrefix }: ClusterErrorListProps) {
  return (
    <>
      <div className="text-muted-foreground mt-1">
        {titlePrefix}
        {' '}
        {errors.length}
        {' '}
        cluster{errors.length === 1 ? '' : 's'}:
      </div>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {errors.map((err) => {
          const isAuth = err.errorType === 'auth'
          const isTimeout = err.errorType === 'timeout'
          const kindLabel = isAuth
            ? authLabel
            : isTimeout
              ? 'Transient timeout'
              : `Endpoint failure (${err.errorType})`
          return (
            <li key={`${err.cluster}-${err.errorType}`} className="flex items-start gap-2">
              <Server className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                <span className="font-mono">{err.cluster.split('/').pop()}</span>
                {' — '}
                <span className={isAuth ? 'text-red-400' : 'text-yellow-400'}>{kindLabel}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
