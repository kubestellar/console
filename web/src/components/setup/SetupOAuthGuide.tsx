import { useTranslation } from 'react-i18next'
import { emitInstallCommandCopied } from '../../lib/analytics'
import { CopyableCommand } from './SetupInstructionsParts'
import { OAUTH_RESTART_STEP_IDX, OAUTH_STEP_KEY_BASE, OAUTH_STEPS } from './setupInstructions.constants'

/**
 * Body of the "Enable GitHub OAuth login" disclosure — the numbered OAuth app
 * registration steps, some of which carry copyable commands.
 */
export function SetupOAuthGuide({
  copiedStep,
  onCopy,
}: {
  copiedStep: number | null
  onCopy: (text: string, stepKey: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
      {OAUTH_STEPS.map((oStep, idx) => (
        <div key={idx} className="text-xs">
          {oStep.link ? (
            <span className="text-muted-foreground">
              {idx + 1}. {oStep.label}{' '}
              <a
                href={oStep.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                {oStep.linkText}
              </a>
            </span>
          ) : oStep.value ? (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-muted-foreground shrink-0">{oStep.label}</span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground select-all">
                {oStep.value}
              </code>
            </div>
          ) : oStep.command ? (
            <div className="ml-4 mt-1">
              <span className="text-muted-foreground">{idx + 1}. {oStep.label}</span>
              <div className="mt-1">
                <CopyableCommand
                  command={oStep.command}
                  multiline
                  isCopied={copiedStep === OAUTH_STEP_KEY_BASE + idx}
                  copyTitle={t('common.copy')}
                  onCopy={() => {
                    onCopy(oStep.command!, OAUTH_STEP_KEY_BASE + idx)
                    emitInstallCommandCopied(
                      idx === OAUTH_RESTART_STEP_IDX ? 'setup_oauth_restart' : 'setup_oauth_env',
                      oStep.command!,
                    )
                  }}
                />
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {idx + 1}. {oStep.label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
