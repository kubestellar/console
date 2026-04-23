/**
 * RepoInput — shared owner/repo text input for CI/CD cards.
 *
 * Used both as a standalone per-card repo selector (on non-CI/CD dashboards)
 * and alongside the central PipelineFilterProvider (on /ci-cd where the
 * shared filter takes precedence).
 *
 * Accepts any valid owner/repo slug or GitHub URL (reuses normalizeRepoInput
 * from the ACMM provider). Persists the user's choice so it survives page
 * reloads.
 */

import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { normalizeRepoInput } from '../../acmm/ACMMProvider'

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

interface RepoInputProps {
  /** Current effective repo (from shared filter or local state) */
  value: string
  /** Called when the user submits a new repo */
  onChange: (repo: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Additional class names */
  className?: string
}

export function RepoInput({ value, onChange, placeholder, className }: RepoInputProps) {
  const [input, setInput] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function submit() {
    const normalized = normalizeRepoInput(input)
    if (!normalized) {
      setError('Enter owner/repo')
      return
    }
    if (!REPO_RE.test(normalized)) {
      setError('Invalid — use owner/repo')
      return
    }
    setError(null)
    if (normalized !== input) setInput(normalized)
    onChange(normalized)
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            onBlur={submit}
            placeholder={placeholder || 'owner/repo or github.com URL'}
            className="w-full text-xs font-mono bg-background/60 border border-border/50 rounded px-2 py-1 focus:outline-hidden focus:border-primary/50"
          />
          {input && input !== value && (
            <button
              type="button"
              onClick={() => { setInput(value); setError(null) }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="text-[10px] text-red-400 mt-0.5">{error}</div>
      )}
    </div>
  )
}
