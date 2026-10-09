import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import {
  API_ENDPOINT_INPUT_ID,
  MIN_REFRESH_INTERVAL_SECONDS,
  REFRESH_INTERVAL_INPUT_ID
} from './widgetExportConstants'

interface WidgetExportConfigSectionProps {
  apiEndpoint: string
  onApiEndpointChange: (value: string) => void
  refreshInterval: number
  onRefreshIntervalChange: (value: number) => void
  isOnPublicSite: boolean
}

export function WidgetExportConfigSection({
  apiEndpoint,
  onApiEndpointChange,
  refreshInterval,
  onRefreshIntervalChange,
  isOnPublicSite
}: WidgetExportConfigSectionProps) {
  const { t } = useTranslation('common')

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3 shrink-0">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label
            htmlFor={API_ENDPOINT_INPUT_ID}
            className="block text-xs text-muted-foreground"
          >
            {t('widgets.apiEndpoint')}
          </label>
          <div className="relative group">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-lg bg-card border border-border shadow-xl text-xs text-muted-foreground opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-dropdown">
              Widgets require a locally installed or cluster-deployed
              Console. The API endpoint must match your deployment.
              {isOnPublicSite && (
                <a
                  href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1.5 text-primary hover:underline"
                >
                  Install your Console now →
                </a>
              )}
            </div>
          </div>
        </div>
        <Input
          id={API_ENDPOINT_INPUT_ID}
          type="text"
          value={apiEndpoint}
          onChange={(e) => onApiEndpointChange(e.target.value)}
          className="focus:border-purple-500"
        />
        {isOnPublicSite && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-yellow-400">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>
              You're on console.kubestellar.io —{' '}
              <a
                href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-yellow-300"
              >
                install your Console locally
              </a>{' '}
              for widgets to work.
            </span>
          </div>
        )}
      </div>
      <div>
        <label
          htmlFor={REFRESH_INTERVAL_INPUT_ID}
          className="block text-xs text-muted-foreground mb-1"
        >
          {t('widgets.refreshInterval')}
        </label>
        <Input
          id={REFRESH_INTERVAL_INPUT_ID}
          type="number"
          value={refreshInterval}
          onChange={(e) =>
            onRefreshIntervalChange(
              Math.max(
                MIN_REFRESH_INTERVAL_SECONDS,
                parseInt(e.target.value) || 30
              )
            )
          }
          min={MIN_REFRESH_INTERVAL_SECONDS}
          className="w-24 focus:border-purple-500"
        />
      </div>
    </div>
  )
}
