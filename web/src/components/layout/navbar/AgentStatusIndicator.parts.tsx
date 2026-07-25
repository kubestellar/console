import { useState, useRef, useEffect } from 'react'
import { Box, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { useDemoMode, isDemoModeForced, getDemoMode } from '../../../hooks/useDemoMode'

const CONNECTING_DEBOUNCE_MS = 300
const DEMO_EXIT_TIMER_MS = 3000

interface DemoModeSectionProps {
  isDemoMode: boolean
  isDiscoveringAgents: boolean
  onToggleDemoMode: () => void
  onOpenSetupDialog: () => void
}

export function DemoModeSection({
  isDemoMode,
  isDiscoveringAgents,
  onToggleDemoMode,
  onOpenSetupDialog,
}: DemoModeSectionProps) {
  const { t } = useTranslation(['common'])
  const { isDemoMode: isDemoModeHook } = useDemoMode()
  const isDemoModeForced_ = isDemoModeForced()

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">
            {t('agent.demoMode')}
          </span>
        </div>
        <button
          role="menuitem"
          data-testid="demo-mode-toggle"
          disabled={isDiscoveringAgents}
          onClick={() => {
            if (isDemoModeForced_ && isDemoModeHook) {
              onOpenSetupDialog()
              return
            }
            onToggleDemoMode()
          }}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors',
            isDemoModeHook ? 'bg-purple-500' : 'bg-secondary',
            isDiscoveringAgents && 'opacity-50 cursor-wait',
          )}
        >
          {isDiscoveringAgents ? (
            <Loader2 className="absolute top-1 left-3.5 w-4 h-4 animate-spin text-purple-200" />
          ) : (
            <span
              className={cn(
                'absolute top-1 left-1 w-4 h-4 bg-foreground rounded-full transition-transform shadow-xs',
                isDemoModeHook ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        {isDemoModeHook
          ? t('agent.demoModeShowingSample')
          : t('agent.enableToViewDemo')}
      </p>
    </div>
  )
}
