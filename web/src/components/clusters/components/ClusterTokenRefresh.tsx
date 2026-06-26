import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ClusterInfo } from '../../../hooks/useMCP'
import { copyToClipboard } from '../../../lib/clipboard'
import { COPY_FEEDBACK_MS, MIN_SPIN_DURATION_MS } from './ClusterGrid.constants'

export function useClusterRefreshSpin(
  refreshing: boolean,
  minDurationMs = MIN_SPIN_DURATION_MS,
): boolean {
  const [spinning, setSpinning] = useState(false)
  const spinningRef = useRef(false)
  const spinStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (refreshing) {
      clearTimeout(timerRef.current)
      if (!spinningRef.current) {
        spinStartRef.current = Date.now()
        spinningRef.current = true
        setSpinning(true)
      }
      return
    }

    if (!spinningRef.current) return

    const elapsed = Date.now() - spinStartRef.current
    const remaining = Math.max(0, minDurationMs - elapsed)
    timerRef.current = setTimeout(() => {
      spinningRef.current = false
      setSpinning(false)
    }, remaining)
  }, [minDurationMs, refreshing])

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  return spinning
}

export function isTokenExpired(cluster: ClusterInfo): boolean {
  return cluster.errorType === 'auth'
}

const IAM_REFRESH_COMMANDS: Record<string, string> = {
  aws: 'aws sso login',
  'aws-iam-authenticator': 'aws sso login',
  gcloud: 'gcloud auth login',
  gke: 'gcloud auth login',
  az: 'az login',
  kubelogin: 'az login',
  oc: 'oc login <api-server-url>',
}

export function getIAMRefreshHint(cluster: ClusterInfo): string | null {
  if (cluster.authMethod !== 'exec') return null

  const userLower = (cluster.user || '').toLowerCase()
  const nameLower = (cluster.name || '').toLowerCase()

  for (const [key, command] of Object.entries(IAM_REFRESH_COMMANDS)) {
    if (userLower.includes(key) || nameLower.includes(key)) return command
  }

  if (nameLower.includes('eks') || nameLower.includes('aws')) return 'aws sso login'
  if (nameLower.includes('gke') || nameLower.includes('gcp')) return 'gcloud auth login'
  if (nameLower.includes('aks') || nameLower.includes('azure')) return 'az login'
  if (nameLower.includes('openshift') || nameLower.includes('ocp')) return 'oc login <api-server-url>'
  return null
}

export function CopyCommandButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy command to clipboard"
      aria-label="Copy command to clipboard"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Copy className="w-2.5 h-2.5" />}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied!' : ''}
      </span>
    </button>
  )
}
