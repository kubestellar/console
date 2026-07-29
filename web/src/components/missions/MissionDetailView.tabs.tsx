/**
 * MissionDetailView tab navigation and tab content (step cards, security
 * fallback panel and the install "Expected Result" resolution block).
 *
 * Extracted from `MissionDetailView.tsx` (issue #21786). Pure move — markup
 * and behaviour are unchanged.
 */

import { AlertTriangle, ExternalLink, Shield, CheckCircle, MessageSquarePlus } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { MissionExport } from '../../lib/missions/types'
import {
  type TabId,
  type TabDef,
  SECURITY_MODEL_DOC_URL,
  SECURITY_AI_DOC_URL,
  LOADING_SKELETON_COUNT,
} from './MissionDetailView.types'
import { CopyButton, StepCard } from './MissionDetailView.parts'

export function MissionDetailTabNav({
  tabs,
  activeTab,
  onSelectTab }: {
  tabs: TabDef[]
  activeTab: TabId
  onSelectTab: (id: TabId) => void
}) {
  return (
    <div className="border-b border-border">
      <nav className="flex gap-0 -mb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const hasContent = tab.steps.length > 0
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                !hasContent && 'opacity-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {hasContent && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-secondary">
                  {tab.steps.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export function MissionDetailTabContent({
  mission,
  activeTab,
  activeTabDef,
  loading,
  onImprove }: {
  mission: MissionExport
  activeTab: TabId
  activeTabDef: TabDef
  loading: boolean
  onImprove?: () => void
}) {
  return (
    <>
        {/* Tab content */}
        <div className="space-y-3">
          {loading ? (
            /* Shimmer skeleton placeholders while full mission content loads */
            Array.from({ length: LOADING_SKELETON_COUNT }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="shrink-0 w-7 h-7 rounded-full animate-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded animate-shimmer" />
                  <div className="h-3 w-full rounded animate-shimmer" />
                  <div className="h-3 w-2/3 rounded animate-shimmer" />
                  <div className="h-16 w-full rounded animate-shimmer" />
                </div>
              </div>
            ))
          ) : activeTabDef.steps.length > 0 ? (
            <>
              {activeTabDef.steps.map((step, i) => (
                <StepCard
                  key={`${activeTab}-${i}`}
                  step={step}
                  index={i}
                  accentColor={activeTabDef.color}
                />
              ))}
              {activeTab === 'security' && (
                <div className="mt-4 p-4 rounded-lg border border-purple-500/20 bg-purple-500/5 text-xs text-muted-foreground space-y-1">
                  <p>
                    The bullets above are specific to this mission. For the Console's overall security model — how kc-agent binds,
                    where AI keys live, what leaves your machine, and how to run air-gapped — read the
                    {' '}
                    <a
                      href={SECURITY_MODEL_DOC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
                    >
                      KubeStellar Console Security Model
                      <ExternalLink className="w-3 h-3" />
                    </a>.
                  </p>
                  <p>
                    For the LLM-specific threat model (prompt injection, supply chain, agent drift), see the
                    {' '}
                    <a
                      href={SECURITY_AI_DOC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
                    >
                      AI automation threat model
                      <ExternalLink className="w-3 h-3" />
                    </a>.
                  </p>
                </div>
              )}
            </>
          ) : activeTab === 'security' ? (
            <div className="py-6 px-4 rounded-lg border border-purple-500/20 bg-purple-500/5 text-sm text-muted-foreground space-y-3">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-foreground">No mission-specific security notes yet</p>
                  <p>
                    This mission does not yet include a <code className="font-mono text-foreground/70">security</code> section
                    in its definition. The Console's overall security posture — kc-agent loopback bind, user-kubeconfig RBAC,
                    AI-key storage, air-gapped and local-LLM options — applies regardless:
                  </p>
                  <p>
                    <a
                      href={SECURITY_MODEL_DOC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
                    >
                      Read the KubeStellar Console Security Model
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {' · '}
                    <a
                      href={SECURITY_AI_DOC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300"
                    >
                      AI automation threat model
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                  {onImprove && (
                    <button
                      onClick={onImprove}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Suggest security notes for this mission
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{activeTabDef.emptyMessage}</p>
              {onImprove && (
                <button
                  onClick={onImprove}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  Help improve this section
                </button>
              )}
            </div>
          )}
        </div>

        {/* Resolution */}
        {activeTab === 'install' && mission.resolution && (
          <div className="mt-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
            <h3 className="text-sm font-medium text-green-400 mb-2">
              <CheckCircle className="w-4 h-4 inline-block mr-1.5" />
              Expected Result
            </h3>
            {mission.resolution.summary && (
              <p className="text-sm text-muted-foreground">{mission.resolution.summary}</p>
            )}
            {mission.resolution.steps && mission.resolution.steps.length > 0 && (
              <ul className="mt-2 space-y-1 ml-2">
                {mission.resolution.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-muted-foreground/50">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {mission.resolution.yaml && (
              <div className="relative mt-2">
                <pre className="p-3 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                  {mission.resolution.yaml}
                </pre>
                <CopyButton text={mission.resolution.yaml} />
              </div>
            )}
          </div>
        )}
    </>
  )
}
