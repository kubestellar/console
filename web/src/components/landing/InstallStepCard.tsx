import { Check, Copy } from 'lucide-react'

import { ACCENT_CLASSES, type AccentColor } from './styles'

export interface InstallStep {
  step: number
  title: string
  commands?: string[]
  note?: string
  description: string
}

interface InstallStepCardProps {
  step: InstallStep
  copyKey: string
  isCopied: boolean
  onCopy: (commands: string[], step: number) => void
  accentColor: AccentColor
  variant?: 'tabbed' | 'linear'
}

export function InstallStepCard({
  step,
  copyKey,
  isCopied,
  onCopy,
  accentColor,
  variant = 'tabbed',
}: InstallStepCardProps) {
  const accent = ACCENT_CLASSES[accentColor]
  void copyKey

  if (variant === 'linear') {
    return (
      <div className="p-5 rounded-xl border border-slate-700/50 bg-slate-900/30">
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-7 h-7 rounded-full ${accent.bgLight} ${accent.text} font-bold text-sm flex items-center justify-center`}>
            {step.step}
          </span>
          <h3 className="font-semibold">{step.title}</h3>
        </div>
        {step.commands && (
          <div className="relative mb-3">
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-300 text-sm font-mono overflow-x-auto">
              {(step.commands || []).join('\n')}
            </pre>
            <button
              onClick={() => onCopy(step.commands!, step.step)}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors"
              aria-label="Copy commands"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        )}
        {step.note && (
          <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            {step.note}
          </div>
        )}
        <p className="text-sm text-slate-400">{step.description}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
      <div className="flex items-start gap-4">
        <div className={`shrink-0 w-8 h-8 rounded-full ${accent.bgLight} ${accent.text} flex items-center justify-center font-bold text-sm`}>
          {step.step}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold mb-2">{step.title}</h3>
          {step.commands && step.commands.length > 0 && (
            <div className="relative group">
              <pre className="bg-slate-900 border border-slate-700/50 rounded-lg px-4 py-3 mb-3 text-sm text-green-400 overflow-x-auto pr-12">
                <code>{step.commands.map((command, index) => (
                  <span key={index}>{index > 0 && '\n'}$ {command}</span>
                ))}</code>
              </pre>
              <button
                onClick={() => onCopy(step.commands!, step.step)}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Copy commands"
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
          {step.note && (
            <div className="rounded-lg border border-slate-600/30 bg-slate-900/50 px-4 py-2.5 mb-3 text-xs text-slate-400">
              {step.note}
            </div>
          )}
          <p className="text-sm text-slate-400">{step.description}</p>
        </div>
      </div>
    </div>
  )
}

export default InstallStepCard
