// Command input row (prompt, format controls, execute button) for the kubectl card.
// Extracted from Kubectl.tsx (issue #24058) — markup unchanged.
import type { RefObject } from 'react'
import type { OutputFormat } from './Kubectl.types'
import { KubectlExecuteButton, KubectlFormatControls } from './KubectlInputControls'

interface KubectlCommandInputProps {
  inputRef: RefObject<HTMLInputElement | null>
  command: string
  onCommandChange: (command: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  isExecuting: boolean
  selectedContext: string
  outputFormat: OutputFormat
  onFormatChange: (format: OutputFormat) => void
  isDryRun: boolean
  onToggleDryRun: () => void
  onExecute: () => void
}

export function KubectlCommandInput({
  inputRef,
  command,
  onCommandChange,
  onKeyDown,
  isExecuting,
  selectedContext,
  outputFormat,
  onFormatChange,
  isDryRun,
  onToggleDryRun,
  onExecute,
}: KubectlCommandInputProps) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 border border-border/30 focus-within:border-green-500/50">
        <span className="text-green-400 text-sm font-semibold">$</span>
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from Kubectl.tsx (pre-existing baselined violation) */}
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Enter kubectl command (without 'kubectl' prefix)"
          disabled={isExecuting || !selectedContext}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden disabled:opacity-50"
        />
        <KubectlFormatControls
          outputFormat={outputFormat}
          onFormatChange={onFormatChange}
          isDryRun={isDryRun}
          onToggleDryRun={onToggleDryRun}
        />
      </div>
      <KubectlExecuteButton
        isExecuting={isExecuting}
        disabled={isExecuting || !command.trim() || !selectedContext}
        onExecute={onExecute}
      />
    </div>
  )
}
