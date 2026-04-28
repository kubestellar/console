/**
 * ACMM Intro Modal
 *
 * Educational modal shown on first visit to /acmm. Explains what the
 * AI Codebase Maturity Model is, the 6 levels, the 4 source frameworks,
 * and links to the ACMM documentation.
 *
 * Key concepts introduced:
 * - Learning — how ACMM helps teams learn AI-assisted development practices
 * - Practice — the progression from ad-hoc to structured AI workflows
 * - Traceability — the citation trail connecting feedback loops to evidence
 *
 * Dismissal: the explicit Close button, the X in the header, and the
 * Escape key all close the modal. Backdrop click is still a no-op so
 * accidental taps (especially on mobile) don't dismiss before users
 * finish reading. The earlier "Escape disabled" sticky behavior was
 * rejected as a UX annoyance — returning users who already understand
 * ACMM were forced to click every time.
 *
 * Persists a "don't show again" preference in localStorage so returning
 * users skip the modal automatically. The preference can always be
 * reset by clearing the localStorage key.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  ExternalLink,
  BookOpen,
  Layers,
  Wrench,
  GitBranch,
  GraduationCap,
  Repeat,
  Link2,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'

const STORAGE_KEY = 'kc-acmm-intro-dismissed'
/** Live documentation — always up to date, unlike the static arXiv preprint */
const ACMM_DOCS_URL = 'https://console-docs.kubestellar.io/docs/console/acmm/acmm-dashboard'

/** Level definitions for rendering the level grid */
const LEVELS = [
  { label: 'L1', nameKey: 'acmmIntro.levelL1', descKey: 'acmmIntro.levelL1Desc' },
  { label: 'L2', nameKey: 'acmmIntro.levelL2', descKey: 'acmmIntro.levelL2Desc' },
  { label: 'L3', nameKey: 'acmmIntro.levelL3', descKey: 'acmmIntro.levelL3Desc' },
  { label: 'L4', nameKey: 'acmmIntro.levelL4', descKey: 'acmmIntro.levelL4Desc' },
  { label: 'L5', nameKey: 'acmmIntro.levelL5', descKey: 'acmmIntro.levelL5Desc' },
  { label: 'L6', nameKey: 'acmmIntro.levelL6', descKey: 'acmmIntro.levelL6Desc' },
] as const

export function isACMMIntroDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function dismissACMMIntro() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/** Source framework badge definitions */
const SOURCE_FRAMEWORKS = [
  { key: 'ACMM', i18nKey: 'sourceACMM', colorClasses: 'bg-primary/20 text-primary' },
  { key: 'Fullsend', i18nKey: 'sourceFullsend', colorClasses: 'bg-orange-500/20 text-orange-400' },
  { key: 'AEF', i18nKey: 'sourceAEF', colorClasses: 'bg-cyan-500/20 text-cyan-400' },
  { key: 'Reflect', i18nKey: 'sourceReflect', colorClasses: 'bg-green-500/20 text-green-400' },
] as const

interface ACMMIntroModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ACMMIntroModal({ isOpen, onClose }: ACMMIntroModalProps) {
  const { t } = useTranslation()
  const [dontShowAgain, setDontShowAgain] = useState(false)

  function handleClose() {
    if (dontShowAgain) {
      dismissACMMIntro()
    }
    onClose()
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      closeOnBackdrop={false}
      closeOnEscape
      enableBackspace={false}
    >
      <BaseModal.Header
        title={t('acmmIntro.title')}
        description={t('acmmIntro.description')}
        icon={BarChart3}
        onClose={handleClose}
      />

      <BaseModal.Content>
        <div className="space-y-5 text-sm">
          {/* What is ACMM */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">{t('acmmIntro.whatIsTitle')}</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {t('acmmIntro.whatIsBody')}
            </p>
          </section>

          {/* The 6 levels */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">{t('acmmIntro.levelsTitle')}</h3>
            </div>
            <div className="space-y-1.5">
              {LEVELS.map(({ label, nameKey, descKey }) => (
                <div key={label} className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">
                    {label}
                  </span>
                  <span className="font-medium text-foreground w-36 shrink-0">
                    {t(nameKey)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(descKey)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              {t('acmmIntro.levelsNote')}
            </p>
          </section>

          {/* Learning, Practice, Traceability — three key concepts */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <GraduationCap className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-foreground text-xs">{t('acmmIntro.learningTitle')}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('acmmIntro.learningBody')}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Repeat className="w-4 h-4 text-yellow-400" />
                <h3 className="font-semibold text-foreground text-xs">{t('acmmIntro.practiceTitle')}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('acmmIntro.practiceBody')}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Link2 className="w-4 h-4 text-green-400" />
                <h3 className="font-semibold text-foreground text-xs">{t('acmmIntro.traceabilityTitle')}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('acmmIntro.traceabilityBody')}
              </p>
            </div>
          </section>

          {/* Source frameworks */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">{t('acmmIntro.sourcesTitle')}</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-2">
              {t('acmmIntro.sourcesBody')}
            </p>
            <ul className="space-y-1 text-xs">
              {SOURCE_FRAMEWORKS.map(({ key, i18nKey, colorClasses }) => (
                <li key={key}>
                  <span className={`font-mono px-1.5 py-0.5 rounded ${colorClasses}`}>{key}</span>{' '}
                  <span className="text-muted-foreground">{`\u2014 ${t(`acmmIntro.${i18nKey}`)}`}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* What you can do here */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">{t('acmmIntro.actionsTitle')}</h3>
            </div>
            <ul className="text-muted-foreground leading-relaxed space-y-1 list-disc pl-5">
              <li>{t('acmmIntro.actionScan', { ownerRepo: 'owner/repo' })}</li>
              <li>{t('acmmIntro.actionRole')}</li>
              <li>{t('acmmIntro.actionInventory')}</li>
              <li>{t('acmmIntro.actionAgent')}</li>
              <li>{t('acmmIntro.actionBadge')}</li>
            </ul>
          </section>

          {/* Documentation link */}
          <section className="border-t border-border pt-3">
            <a
              href={ACMM_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('acmmIntro.docsLink')}
            </a>
          </section>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center justify-between w-full">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-border accent-primary"
            />
            {t('acmmIntro.dontShowAgain')}
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors"
          >
            {t('acmmIntro.gotIt')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
