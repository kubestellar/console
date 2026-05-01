/**
 * PipelineFilterBar — dashboard-level repo selector with multi-select + CRUD.
 *
 * - Pills are multi-select (toggle on/off, multiple can be active)
 * - "All" deselects everything (= no filter)
 * - "+" opens an inline form to add a custom repo
 * - "x" on each pill hides/removes it
 * - Manage icon shows hidden repos + "Reset to defaults"
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, X, RotateCcw, Eye } from 'lucide-react'
import { usePipelineFilter } from './PipelineFilterContext'
import { cn } from '../../../lib/cn'
import { isDemoMode } from '../../../lib/demoMode'

/** Extracted user-visible strings */
const LABEL_ADD_REPO = 'Add repo'
const LABEL_REMOVE_REPO = 'Remove repo'
const PLACEHOLDER_REPO = 'owner/repo'
const LABEL_RESET = 'Reset to defaults'

/** Minimum length for a valid owner/repo string */
const MIN_REPO_LENGTH = 3

export function PipelineFilterBar() {
  const ctx = usePipelineFilter()
  const [showAdd, setShowAdd] = useState(false)
  const [showManage, setShowManage] = useState(false)

  // In demo mode (console.kubestellar.io), repo CRUD is gated behind
  // the install dialog — we don't give away the full feature for free.
  // The custom event 'open-install' is listened to by Layout.tsx:114
  // which renders the SetupInstructionsDialog.
  const isDemo = isDemoMode()
  const showInstallGate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-install'))
  }, [])
  const [addValue, setAddValue] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const manageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showAdd && inputRef.current) inputRef.current.focus()
  }, [showAdd])

  // Close manage dropdown on outside click
  useEffect(() => {
    if (!showManage) return
    function onClickOutside(e: MouseEvent) {
      if (manageRef.current && !manageRef.current.contains(e.target as Node)) {
        setShowManage(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showManage])

  if (!ctx) return null

  const { selectedRepos, toggleRepo, selectAll, repos, hiddenRepos, hasCustomization, addRepo, removeRepo, restoreRepo, resetToDefaults } = ctx
  const isAllSelected = selectedRepos.size === 0

  function handleAdd() {
    const trimmed = addValue.trim()
    if (trimmed.length < MIN_REPO_LENGTH || !trimmed.includes('/')) {
      setAddError('Enter owner/repo (e.g. myorg/myrepo)')
      return
    }
    const ok = addRepo(trimmed)
    if (!ok) {
      setAddError('Already in the list')
      return
    }
    setAddValue('')
    setAddError(null)
    setShowAdd(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
    if (e.key === 'Escape') { setShowAdd(false); setAddValue(''); setAddError(null) }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium">Repos</span>

      <div className="flex items-center gap-1 flex-wrap">
        {/* "All" pill — clears the multi-selection */}
        <button
          type="button"
          onClick={selectAll}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs border transition-colors',
            isAllSelected
              ? 'bg-primary/20 text-primary border-primary/40'
              : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary/50',
          )}
        >
          All
        </button>

        {/* Repo pills — multi-select toggle */}
        {repos.map((repo) => {
          const short = repo.split('/')[1] ?? repo
          const isSelected = selectedRepos.has(repo)
          return (
            <span key={repo} className="group relative inline-flex items-center">
              <button
                type="button"
                onClick={() => toggleRepo(repo)}
                title={repo}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors pr-6',
                  isSelected
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'bg-secondary/30 text-muted-foreground border-border hover:bg-secondary/50',
                )}
              >
                {short}
              </button>
              {!isDemo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeRepo(repo) }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                  title={LABEL_REMOVE_REPO}
                  aria-label={`${LABEL_REMOVE_REPO}: ${repo}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          )
        })}

        {/* Add repo */}
        {showAdd ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={addValue}
              onChange={(e) => { setAddValue(e.target.value); setAddError(null) }}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER_REPO}
              className={cn(
                'w-40 px-2 py-1 text-xs rounded-full border bg-secondary/30 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary/50',
                addError ? 'border-red-500/50' : 'border-border',
              )}
              aria-label={LABEL_ADD_REPO}
            />
            <button
              type="button"
              onClick={handleAdd}
              className="px-2 py-1 rounded-full text-xs bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddValue(''); setAddError(null) }}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => isDemo ? showInstallGate() : setShowAdd(true)}
            className="px-2 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            title={LABEL_ADD_REPO}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}

        {/* Manage: restore hidden + reset */}
        {(hasCustomization || hiddenRepos.length > 0) && (
          <div className="relative" ref={manageRef}>
            <button
              type="button"
              onClick={() => isDemo ? showInstallGate() : setShowManage(!showManage)}
              className={cn(
                'px-2 py-1 rounded-full text-xs border transition-colors',
                showManage ? 'bg-primary/20 text-primary border-primary/40' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            {showManage && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[220px]">
                {hiddenRepos.length > 0 && (
                  <>
                    <div className="text-[11px] text-muted-foreground font-medium mb-1">Hidden repos</div>
                    {hiddenRepos.map((repo) => (
                      <button
                        key={repo}
                        type="button"
                        onClick={() => { restoreRepo(repo); setShowManage(false) }}
                        className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded"
                      >
                        <Eye className="w-3 h-3" />
                        {repo}
                      </button>
                    ))}
                    <div className="border-t border-border my-2" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { resetToDefaults(); setShowManage(false) }}
                  className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded"
                >
                  <RotateCcw className="w-3 h-3" />
                  {LABEL_RESET}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {addError && (
        <span className="text-[11px] text-red-400">{addError}</span>
      )}
    </div>
  )
}
