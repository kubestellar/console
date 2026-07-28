import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CopyableCommandProps {
  command: string
  stepKey: number
  copiedStep: number | null
  onCopy: (text: string, key: number) => void
  title?: string
  multiline?: boolean
}

export function CopyableCommand({ command, stepKey, copiedStep, onCopy, title, multiline = false }: CopyableCommandProps) {
  const { t } = useTranslation()
  const isCopied = copiedStep === stepKey
  const CodeEl = multiline ? 'pre' : 'code'
  return (
    <div className="flex items-center gap-2">
      <CodeEl className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto whitespace-pre">
        {command}
      </CodeEl>
      <button
        onClick={() => onCopy(command, stepKey)}
        className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors self-start"
        title={title || t('drilldown.tooltips.copyCommand')}
      >
        {isCopied ? (
          <Check className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}
