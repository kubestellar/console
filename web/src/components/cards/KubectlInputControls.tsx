import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TRANSITION_DELAY_MS } from '../../lib/constants/network'
import { cn } from '../../lib/cn'
import type { OutputFormat } from './Kubectl.types'

interface KubectlFormatControlsProps {
  outputFormat: OutputFormat
  onFormatChange: (format: OutputFormat) => void
  isDryRun: boolean
  onToggleDryRun: () => void
}

/** Output-format dropdown and dry-run toggle shown inside the kubectl command input. */
export function KubectlFormatControls({
  outputFormat,
  onFormatChange,
  isDryRun,
  onToggleDryRun,
}: KubectlFormatControlsProps) {
  const { t } = useTranslation(['common', 'cards'])
  const [showFormatMenu, setShowFormatMenu] = useState(false)
  const formatMenuBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (formatMenuBlurTimeoutRef.current !== null) clearTimeout(formatMenuBlurTimeoutRef.current)
    }
  }, [])

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <button
          onClick={() => setShowFormatMenu(!showFormatMenu)}
          onBlur={() => {
            if (formatMenuBlurTimeoutRef.current !== null) clearTimeout(formatMenuBlurTimeoutRef.current)
            formatMenuBlurTimeoutRef.current = setTimeout(() => setShowFormatMenu(false), TRANSITION_DELAY_MS)
          }}
          className="p-1 rounded text-muted-foreground hover:text-foreground"
          title={`Output format: ${outputFormat}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {showFormatMenu && (
          <div className="absolute bottom-full right-0 mb-1 bg-secondary border border-border/50 rounded-lg py-1 shadow-lg z-10 min-w-[100px]">
            {['table', 'yaml', 'json', 'wide'].map(format => (
              <button
                key={format}
                onClick={() => {
                  onFormatChange(format as OutputFormat)
                  setShowFormatMenu(false)
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-xs text-left hover:bg-secondary/50',
                  outputFormat === format ? 'text-green-400' : 'text-muted-foreground'
                )}
              >
                {format}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onToggleDryRun}
        className={cn(
          'px-2 py-1 text-2xs rounded',
          isDryRun ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:bg-secondary'
        )}
        title="Toggle dry-run mode"
      >
        {isDryRun ? t('cards:kubectl.dry') : t('cards:kubectl.run')}
      </button>
    </div>
  )
}

interface KubectlExecuteButtonProps {
  isExecuting: boolean
  disabled: boolean
  onExecute: () => void
}

/** Primary "Run" button for the kubectl command input. */
export function KubectlExecuteButton({ isExecuting, disabled, onExecute }: KubectlExecuteButtonProps) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <button
      onClick={onExecute}
      disabled={disabled}
      className="px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      title="Execute command (or press Enter)"
    >
      {isExecuting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t('cards:kubectl.running')}</span>
        </>
      ) : (
        <>
          <Send className="w-4 h-4" />
          <span className="text-sm">{t('cards:kubectl.run')}</span>
        </>
      )}
    </button>
  )
}
