'use client'

import { useLocalAgent } from '@/hooks/useLocalAgent'

export function AgentStatus() {
  const { status, health, error, isDemoMode, installInstructions } = useLocalAgent()

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        Connecting to local agent...
      </div>
    )
  }

  if (isDemoMode) {
    return (
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          Demo Mode - Local Agent Not Connected
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || 'Install the local agent to access your clusters and Claude Code.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <div className="h-2 w-2 rounded-full bg-green-500" />
      Connected to local agent v{health?.version}
      {health?.clusters && ` - ${health.clusters} clusters`}
      {health?.hasClaude && ' - Claude available'}
    </div>
  )
}

export function AgentInstallBanner() {
  const { isDemoMode, installInstructions } = useLocalAgent()

  if (!isDemoMode) return null

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6">
      <h3 className="text-lg font-semibold">{installInstructions.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{installInstructions.description}</p>

      <div className="mt-4 space-y-3">
        {installInstructions.steps.map((step, i) => (
          <div key={i}>
            <div className="text-sm font-medium">{step.title}</div>
            <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm font-mono">
              {step.command}
            </code>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium">Benefits:</div>
        <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
          {installInstructions.benefits.map((benefit, i) => (
            <li key={i}>{benefit}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
