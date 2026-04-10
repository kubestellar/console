/**
 * ConfirmMissionPromptDialog
 *
 * Shows the AI prompt that will be sent to an "Install via AI" mission
 * and lets the user review and edit it before the mission is executed.
 *
 * Fixes #5913 — Install-via-AI buttons previously started a mission
 * immediately with no chance for the user to see or edit the prompt.
 *
 * Usage:
 *   <ConfirmMissionPromptDialog
 *     open={open}
 *     missionTitle="Install cert-manager"
 *     missionDescription="Install and configure cert-manager"
 *     initialPrompt={prompt}
 *     onCancel={() => setOpen(false)}
 *     onConfirm={(editedPrompt) => startMission({ ..., initialPrompt: editedPrompt })}
 *   />
 */

import { useState } from 'react'
import { Wand2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals/BaseModal'
import { Button } from '../ui/Button'
import { TextArea } from '../ui/TextArea'

/** Minimum visible rows for the prompt textarea. */
const PROMPT_TEXTAREA_ROWS = 12

interface ConfirmMissionPromptDialogProps {
  /** Whether the dialog is open. */
  open: boolean
  /** Title of the mission — shown in the modal header. */
  missionTitle: string
  /** Short description of the mission — shown under the header title. */
  missionDescription?: string
  /** The prompt that will be sent to the AI agent. The user can edit this. */
  initialPrompt: string
  /** Called when the user clicks Cancel or dismisses the dialog. */
  onCancel: () => void
  /** Called with the (possibly edited) prompt when the user clicks Confirm. */
  onConfirm: (editedPrompt: string) => void
}

export function ConfirmMissionPromptDialog({
  open,
  missionTitle,
  missionDescription,
  initialPrompt,
  onCancel,
  onConfirm,
}: ConfirmMissionPromptDialogProps) {
  const { t } = useTranslation(['common'])
  // Parents of this dialog always conditionally mount it (e.g.
  // `{pending && <ConfirmMissionPromptDialog ... />}`) so a new instance
  // is created for each pending mission. That means a lazy `useState`
  // initializer is enough — we never need to sync with changing props.
  const [prompt, setPrompt] = useState<string>(() => initialPrompt)

  const trimmed = prompt.trim()
  const confirmDisabled = trimmed.length === 0

  return (
    <BaseModal isOpen={open} onClose={onCancel} size="lg">
      <BaseModal.Header
        title={t('confirmMissionPrompt.title', 'Review AI mission prompt')}
        description={missionTitle}
        icon={Wand2}
        onClose={onCancel}
      />

      <BaseModal.Content>
        <div className="flex flex-col gap-3">
          {missionDescription && (
            <p className="text-sm text-muted-foreground">{missionDescription}</p>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <p>
              {t(
                'confirmMissionPrompt.helpText',
                'Review the prompt below before running. You can edit it to add extra context, change parameters, or remove anything you do not want the AI agent to do.'
              )}
            </p>
          </div>

          <label
            htmlFor="confirm-mission-prompt-textarea"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('confirmMissionPrompt.promptLabel', 'Prompt sent to the AI agent')}
          </label>
          <TextArea
            id="confirm-mission-prompt-textarea"
            rows={PROMPT_TEXTAREA_ROWS}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            resizable
            textAreaSize="sm"
            className="font-mono"
            spellCheck={false}
            aria-label={t('confirmMissionPrompt.promptLabel', 'Prompt sent to the AI agent')}
          />

          {confirmDisabled && (
            <p className="text-2xs text-red-400">
              {t(
                'confirmMissionPrompt.emptyPromptError',
                'Prompt cannot be empty.'
              )}
            </p>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('confirmMissionPrompt.cancel', 'Cancel')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onConfirm(prompt)}
          disabled={confirmDisabled}
          className="ml-auto"
        >
          {t('confirmMissionPrompt.confirm', 'Run mission')}
        </Button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
