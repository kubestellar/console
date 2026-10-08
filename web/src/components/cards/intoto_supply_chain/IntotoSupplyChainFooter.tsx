import { CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Static feature highlights and external links shown at the bottom of the card. */
export function IntotoSupplyChainFooter() {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
      {/* Features highlight */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-2xs text-muted-foreground font-medium mb-2">{t('intoto_supply_chain.featuresTitle')}</p>
        <div className="grid grid-cols-2 gap-1.5 text-2xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            {t('intoto_supply_chain.featureStepVerification')}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            {t('intoto_supply_chain.featureProvenanceTracking')}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            {t('intoto_supply_chain.featureFunctionarySigning')}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-400" />
            {t('intoto_supply_chain.featureSlsaCompliance')}
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-2xs">
        <a
          href="https://in-toto.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          {t('intoto_supply_chain.footerDocs')}
        </a>
        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://github.com/in-toto/in-toto"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          {t('intoto_supply_chain.footerGitHub')}
        </a>
        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://slsa.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          {t('intoto_supply_chain.footerSlsa')}
        </a>
      </div>
    </>
  )
}
