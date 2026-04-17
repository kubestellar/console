/**
 * EmbedButton — small icon button that opens the EmbedCodeDialog for a
 * CI/CD pipeline card. Renders inline in each card's header/footer area.
 */
import { useState } from 'react'
import { Code2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmbedCodeDialog, type EmbeddableCardType } from './EmbedCodeDialog'

interface EmbedButtonProps {
  /** Slug matching the /embed/:cardType route param */
  cardType: EmbeddableCardType
  /** Human-readable title for the dialog header */
  cardTitle: string
  /** Current repo filter value, pre-filled in the dialog */
  currentRepo?: string | null
}

export function EmbedButton({ cardType, cardTitle, currentRepo }: EmbedButtonProps) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-secondary/50 transition-colors"
        title={t('embed.getEmbedCode')}
        aria-label={t('embed.getEmbedCode')}
      >
        <Code2 size={12} />
      </button>
      <EmbedCodeDialog
        open={open}
        cardType={cardType}
        cardTitle={cardTitle}
        currentRepo={currentRepo}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
