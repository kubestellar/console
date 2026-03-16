'use client'

import { useState, useEffect, useRef } from 'react'
import { Code2, Copy, Check, GitBranch, RefreshCw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

interface DeveloperSetupDialogProps {
  isOpen: boolean
  onClose: () => void
}

const REPO_URL = 'https://github.com/kubestellar/console'

const DEV_CLONE_CMD = `git clone ${REPO_URL}.git && cd console`
const DEV_START_OAUTH_CMD = 'bash startup-oauth.sh'

const ENV_TEMPLATE = `GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>`

/** Unique keys for clipboard copy feedback per code block */
const COPY_KEY_CLONE = 1
const COPY_KEY_ENV = 2
const COPY_KEY_START = 3

export function DeveloperSetupDialog({ isOpen, onClose }: DeveloperSetupDialogProps) {
  const { t } = useTranslation()
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const [showUpdateChannel, setShowUpdateChannel] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = async (text: string, stepKey: number) => {
    await copyToClipboard(text)
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={t('developerSetup.title')}
        description={t('developerSetup.description')}
        icon={Code2}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Prerequisites */}
          <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
            <h3 className="text-sm font-medium text-foreground mb-2">{t('developerSetup.prerequisites')}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Go 1.24+</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Node.js 20+</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Git</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">kubeconfig (optional)</span>
              </div>
            </div>
          </div>

          {/* Step 1: Clone */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <StepBadge step={1} />
              <span className="text-sm font-medium text-foreground">{t('developerSetup.cloneRepo')}</span>
            </div>
            <div className="flex items-center gap-2 ml-7">
              <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                {DEV_CLONE_CMD}
              </code>
              <CopyButton copied={copiedStep === COPY_KEY_CLONE} onClick={() => handleCopy(DEV_CLONE_CMD, COPY_KEY_CLONE)} />
            </div>
          </div>

          {/* Step 2: Configure GitHub OAuth */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <StepBadge step={2} />
              <span className="text-sm font-medium text-foreground">{t('developerSetup.configureOAuth')}</span>
            </div>
            <div className="ml-7 space-y-2">
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                  {t('developerSetup.oauthStep1')}{' '}
                  <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline inline-block py-2">
                    GitHub Developer Settings
                  </a>
                </li>
                <li>{t('developerSetup.oauthStep2')}</li>
              </ol>
              <div className="rounded-lg border border-border/30 bg-muted/30 p-2.5 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/70 shrink-0">Homepage URL:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">http://localhost:8080</code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/70 shrink-0">Callback URL:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">http://localhost:8080/auth/github/callback</code>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('developerSetup.oauthStep3')}</p>
              <p className="text-xs text-muted-foreground">{t('developerSetup.envFile')}</p>
              <div className="flex items-center gap-2">
                <pre className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto whitespace-pre">
                  {ENV_TEMPLATE}
                </pre>
                <CopyButton copied={copiedStep === COPY_KEY_ENV} onClick={() => handleCopy(ENV_TEMPLATE, COPY_KEY_ENV)} />
              </div>
            </div>
          </div>

          {/* Step 3: Start with OAuth */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <StepBadge step={3} />
              <span className="text-sm font-medium text-foreground">{t('developerSetup.startDev')}</span>
            </div>
            <div className="flex items-center gap-2 ml-7">
              <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono text-foreground select-all overflow-x-auto">
                {DEV_START_OAUTH_CMD}
              </code>
              <CopyButton copied={copiedStep === COPY_KEY_START} onClick={() => handleCopy(DEV_START_OAUTH_CMD, COPY_KEY_START)} />
            </div>
            <p className="text-xs text-muted-foreground ml-7">
              {t('developerSetup.startDevDesc')}
            </p>
          </div>

          {/* What you get */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-950 p-3 ml-7">
            <div className="font-mono text-[11px] text-foreground/70 leading-relaxed space-y-0.5">
              <div><span className="text-purple-400">Frontend</span> {'\u2192'} <span className="text-muted-foreground">http://localhost:5174 (Vite HMR)</span></div>
              <div><span className="text-purple-400">Backend</span> {'  \u2192'} <span className="text-muted-foreground">http://localhost:8080</span></div>
              <div><span className="text-purple-400">kc-agent</span> {'\u2192'} <span className="text-muted-foreground">http://localhost:8585</span></div>
            </div>
          </div>

          {/* Developer update channel (collapsible) */}
          <div className="border-t border-border/30 pt-3">
            <button
              onClick={() => setShowUpdateChannel(!showUpdateChannel)}
              className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              {showUpdateChannel ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <RefreshCw className="w-3.5 h-3.5" />
              {t('developerSetup.updateChannelTitle')}
            </button>
            {showUpdateChannel && (
              <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-950 p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {t('developerSetup.updateChannelDesc')}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <GitBranch className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-foreground font-medium">Settings</span>
                  <span className="text-muted-foreground">{'\u2192'}</span>
                  <span className="text-foreground font-medium">Updates</span>
                  <span className="text-muted-foreground">{'\u2192'}</span>
                  <span className="text-orange-400 font-medium">Developer</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('developerSetup.updateChannelNote')}
                </p>
              </div>
            )}
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            GitHub
          </a>
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          {t('common.close')}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}

function StepBadge({ step }: { step: number }) {
  return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400">
      {step}
    </span>
  )
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={t('common.copy')}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}
