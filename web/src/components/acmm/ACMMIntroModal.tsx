/**
 * ACMM Intro Modal
 *
 * Educational modal shown on first visit to /acmm. Explains what the
 * AI Codebase Maturity Model is, the 5 levels, the 4 source frameworks,
 * and links to the underlying paper.
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
import { BarChart3, ExternalLink, BookOpen, Layers, Wrench, GitBranch } from 'lucide-react'
import { BaseModal } from '../../lib/modals'

const STORAGE_KEY = 'kc-acmm-intro-dismissed'
const PAPER_URL = 'https://arxiv.org/abs/2604.09388'

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

interface ACMMIntroModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ACMMIntroModal({ isOpen, onClose }: ACMMIntroModalProps) {
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
        title="Welcome to the AI Codebase Maturity Model"
        description="Score any GitHub repo on a 5-level framework for AI-assisted engineering"
        icon={BarChart3}
        onClose={handleClose}
      />

      <BaseModal.Content>
        <div className="space-y-5 text-sm">
          {/* What is ACMM */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">What is ACMM?</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              The AI Codebase Maturity Model is a 5-level framework that scores how
              ready your repository is for AI-assisted engineering. It looks for
              concrete, detectable signals — instruction files, measurement
              workflows, feedback loops, gating policies — and scores from{' '}
              <span className="font-mono text-foreground">L1 Assisted</span> (an AI
              suggests completions) up to{' '}
              <span className="font-mono text-foreground">L5 Self-Sustaining</span>{' '}
              (the codebase proposes, triages, and gates its own work).
            </p>
            <p className="text-muted-foreground leading-relaxed mt-2">
              The dashboard scans the repo&apos;s file structure, workflows, and
              configuration to detect these signals. No source code is uploaded;
              only public file paths are read.
            </p>
          </section>

          {/* The 5 levels */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">The 5 levels</h3>
            </div>
            <div className="space-y-1.5">
              <div className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">L1</span>
                <span className="font-medium text-foreground w-28 shrink-0">Assisted</span>
                <span className="text-xs text-muted-foreground">AI suggests completions, no persistent rules</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">L2</span>
                <span className="font-medium text-foreground w-28 shrink-0">Instructed</span>
                <span className="text-xs text-muted-foreground">Judgment encoded in CLAUDE.md / AGENTS.md / Copilot instructions</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">L3</span>
                <span className="font-medium text-foreground w-28 shrink-0">Measured</span>
                <span className="text-xs text-muted-foreground">Metrics instrument the AI loop itself</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">L4</span>
                <span className="font-medium text-foreground w-28 shrink-0">Adaptive</span>
                <span className="text-xs text-muted-foreground">Metrics feed back into instructions and gating thresholds</span>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">L5</span>
                <span className="font-medium text-foreground w-28 shrink-0">Self-Sustaining</span>
                <span className="text-xs text-muted-foreground">Codebase proposes, triages, and gates its own work</span>
              </div>
            </div>
          </section>

          {/* Source frameworks */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">Source frameworks</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-2">
              ACMM aggregates criteria from four open-source frameworks. Each
              criterion in the inventory is tagged with its source so you can
              follow the citation trail back to the upstream definition.
            </p>
            <ul className="space-y-1 text-xs">
              <li>
                <span className="font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary">ACMM</span>{' '}
                <span className="text-muted-foreground">— the 5-level model itself</span>
              </li>
              <li>
                <span className="font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Fullsend</span>{' '}
                <span className="text-muted-foreground">— readiness + autonomy criteria (test coverage, CI/CD, auto-merge policy)</span>
              </li>
              <li>
                <span className="font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">AEF</span>{' '}
                <span className="text-muted-foreground">— Agentic Engineering Framework: governance criteria (task traceability, structural gates)</span>
              </li>
              <li>
                <span className="font-mono px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Reflect</span>{' '}
                <span className="text-muted-foreground">— Claude Reflect: self-tuning criteria (correction capture, CLAUDE.md auto-sync)</span>
              </li>
            </ul>
          </section>

          {/* What you can do here */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">What you can do here</h3>
            </div>
            <ul className="text-muted-foreground leading-relaxed space-y-1 list-disc pl-5">
              <li>Type any <span className="font-mono text-foreground">owner/repo</span> in the picker above to scan it.</li>
              <li>See your role and the next transition trigger on the <strong>Your Role</strong> card.</li>
              <li>Browse all detected vs missing criteria on the <strong>Feedback Loops Inventory</strong> card.</li>
              <li>For any missing criterion, click <strong>Ask agent for help</strong> to launch an agent that adds it.</li>
              <li>Generate a shields.io badge for your README from the picker — it updates as your score changes.</li>
            </ul>
          </section>

          {/* Paper link */}
          <section className="border-t border-border pt-3">
            <a
              href={PAPER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Read the paper on arXiv (2604.09388)
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
            Don&apos;t show this again
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors"
          >
            Got it — let&apos;s go
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

