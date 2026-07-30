/**
 * Quantum Workload Detection Banner
 *
 * Shows when quantum-kc-demo is not detected as running in the cluster.
 * Alerts users that cards are in demo mode and provides a link to installation instructions.
 *
 * When quantum workload IS detected, banner is hidden (live data is available).
 *
 * Both states include a learn-more section linking to free IBM Quantum
 * resources (Circuit Composer + Learning Hub) so users coming from the
 * demo have an immediate path to hands-on quantum work.
 */

import { useState, useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isQuantumWorkloadAvailable, subscribeDemoMode } from '../../lib/demoMode'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

const STORAGE_KEY_QUANTUM_BANNER_DISMISSED = 'kc-quantum-banner-dismissed'

const IBM_COMPOSER_URL = 'https://quantum.cloud.ibm.com/composer'
const IBM_LEARNING_URL = 'https://quantum.cloud.ibm.com/learning'

function IBMQuantumLinks() {
  const { t } = useTranslation(['cards'])
  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-xs font-semibold text-foreground">
        {t('cards:quantumWorkloadBanner.learnMore')}
      </p>
      <div className="flex gap-2 mt-1.5">
        <a
          href={IBM_COMPOSER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          {t('cards:quantumWorkloadBanner.circuitComposer')}
          <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={IBM_LEARNING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          {t('cards:quantumWorkloadBanner.learningHub')}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export function QuantumWorkloadBanner() {
  const { t } = useTranslation(['cards'])
  const [workloadAvailable, setWorkloadAvailable] = useState(() => isQuantumWorkloadAvailable())
  const [dismissed, setDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_QUANTUM_BANNER_DISMISSED) === 'true'
  )

  // Subscribe to workload availability changes and demo mode changes
  useEffect(() => {
    // Check initial state
    setWorkloadAvailable(isQuantumWorkloadAvailable())

    // Subscribe to demo mode changes (which reflect workload availability)
    const unsubscribe = subscribeDemoMode(() => {
      setWorkloadAvailable(isQuantumWorkloadAvailable())
    })

    return unsubscribe
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_QUANTUM_BANNER_DISMISSED, 'true')
  }

  // Show appropriate banner based on workload state
  if (workloadAvailable) {
    // Workload detected — show green success banner with IBM learning links
    return (
      <div data-testid="quantum-workload-banner-running" className="mb-4 rounded-xl border border-green-500/20 bg-linear-to-br from-green-500/5 via-emerald-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('cards:quantumWorkloadBanner.workloadRunning')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('cards:quantumWorkloadBanner.liveDataAvailable')}
            </p>
          </div>
        </div>
        <IBMQuantumLinks />
      </div>
    )
  }

  // Workload not detected — show amber setup banner (dismissible)
  if (dismissed) return null

  return (
    <div data-testid="quantum-workload-banner-not-detected" className="mb-4 rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-500/5 via-orange-500/5 to-transparent p-4 animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t('cards:quantumWorkloadBanner.workloadNotDetected')}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t('cards:quantumWorkloadBanner.demoDataMessage')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('cards:quantumWorkloadBanner.notDetectedHelp')}
          </p>
          <div className="flex gap-2 mt-2">
            <a
              href="https://github.com/kproche/quantum-kc-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              {t('cards:quantumWorkloadBanner.viewRepository')}
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://github.com/kproche/quantum-kc-demo/blob/main/CONSOLE_DEPLOYMENT.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              {t('cards:quantumWorkloadBanner.setupInstructions')}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <IBMQuantumLinks />
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors duration-150 shrink-0 flex items-center justify-center"
          aria-label={t('cards:quantumWorkloadBanner.dismiss')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
