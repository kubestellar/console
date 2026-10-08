import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

interface KubectlTerminalOutputProps {
  outputRef: RefObject<HTMLDivElement | null>
  output: string[]
}

export function KubectlTerminalOutput({ outputRef, output }: KubectlTerminalOutputProps) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <div
      ref={outputRef}
      className="flex-1 font-mono text-xs bg-black/30 rounded-lg p-3 overflow-y-auto mb-3 min-h-0"
    >
      {output.length === 0 ? (
        <div className="text-muted-foreground/50 whitespace-pre">
          <p>{t('cards:kubectl.terminalReady')}</p>
          <p className="mt-2">{t('cards:kubectl.examples')}</p>
          <p className="ml-4">  {t('cards:kubectl.exampleGetPods')}</p>
          <p className="ml-4">  {t('cards:kubectl.exampleGetDeployments')}</p>
          <p className="ml-4">  {t('cards:kubectl.exampleDescribePod')}</p>
          <p className="ml-4">  {t('cards:kubectl.exampleLogs')}</p>
        </div>
      ) : (
        output.map((line, idx) => {
          const isCommand = line.startsWith('$')
          const isError = line.startsWith('Error:')
          const isAI = line.startsWith('AI:')
          const isEmpty = line === ''
          // Show a subtle separator for empty lines between command blocks
          if (isEmpty) {
            return <div key={idx} className="h-2 border-b border-border/10 mb-2" />
          }
          return (
            <pre
              key={idx}
              className={cn(
                'whitespace-pre-wrap wrap-break-word m-0 py-0 leading-snug',
                isCommand && 'text-green-400 font-semibold bg-green-500/5 -mx-1 px-1 rounded mt-1 py-0.5 border-l-2 border-green-500/40',
                isError && 'text-red-400 bg-red-500/5 -mx-1 px-1 rounded',
                isAI && 'text-purple-400',
                !isCommand && !isError && !isAI && 'text-foreground/90'
              )}
            >{line}</pre>
          )
        })
      )}
    </div>
  )
}
