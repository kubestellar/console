/**
 * ImproveMissionDialog
 *
 * Pre-filled feedback dialog for suggesting improvements to AI-generated missions.
 * Opens a GitHub issue in kubestellar/console-kb with mission context.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquarePlus,
  ExternalLink,
} from 'lucide-react'
import { buildGitHubIssueUrl } from '@/lib/githubUrls'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import type { MissionExport } from '../../lib/missions/types'

const IMPROVEMENT_CATEGORIES = [
  { id: 'wrong-command', key: 'wrongCommand' },
  { id: 'missing-step', key: 'missingStep' },
  { id: 'better-approach', key: 'betterApproach' },
  { id: 'outdated-version', key: 'outdatedVersion' },
  { id: 'security-concern', key: 'securityConcern' },
  { id: 'other', key: 'other' },
] as const

type SectionName = 'install' | 'uninstall' | 'upgrade' | 'troubleshooting' | 'general'

interface ImproveMissionDialogProps {
  mission: MissionExport
  section?: SectionName
  isOpen: boolean
  onClose: () => void
}

function buildIssueUrl(
  mission: MissionExport,
  category: string,
  section: SectionName,
  details: string
): string {
  const projectName = mission.cncfProject || mission.title
  const qualityScore = mission.metadata?.qualityScore ?? 'N/A'
  const version = mission.metadata?.projectVersion || 'unknown'
  const repoUrl = mission.metadata?.sourceUrls?.repo || ''

  const title = `Improve AI Mission: ${projectName} (${section})`

  const body = [
    `## Mission Improvement Request`,
    ``,
    `**Project:** ${projectName}`,
    `**Section:** ${section}`,
    `**Category:** ${category}`,
    `**Mission Version:** ${mission.version}`,
    `**Project Version:** ${version}`,
    `**Quality Score:** ${qualityScore}`,
    repoUrl ? `**Project Repo:** ${repoUrl}` : '',
    ``,
    `## Details`,
    ``,
    details || '_Please describe the improvement needed._',
    ``,
    `---`,
    `_This issue was created via the KubeStellar Console "Improve this AI Mission" feature._`,
    `_Mission file: \`fixes/cncf-install/install-${(mission.cncfProject || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json\`_`,
  ].filter(Boolean).join('\n')

  const labels = ['ai-mission', 'community-improvement', section !== 'general' ? section : '']

  return buildGitHubIssueUrl({
    owner: 'kubestellar',
    repo: 'console-kb',
    title,
    body,
    labels,
  })
}

export function ImproveMissionDialog({
  mission,
  section = 'general',
  isOpen,
  onClose,
}: ImproveMissionDialogProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [details, setDetails] = useState('')
  const [activeSection, setActiveSection] = useState<SectionName>(section)

  const sections: { id: SectionName; label: string }[] = [
    { id: 'general', label: t('dialogs.improveMission.sections.general') },
    { id: 'install', label: t('dialogs.improveMission.sections.install') },
    { id: 'uninstall', label: t('dialogs.improveMission.sections.uninstall') },
    { id: 'upgrade', label: t('dialogs.improveMission.sections.upgrade') },
    { id: 'troubleshooting', label: t('dialogs.improveMission.sections.troubleshooting') },
  ]

  const handleSubmit = () => {
    const url = buildIssueUrl(mission, selectedCategory || 'other', activeSection, details)
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <BaseModal.Header title={t('dialogs.improveMission.title')} icon={MessageSquarePlus} onClose={onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 space-y-4">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-sm font-medium text-foreground">{mission.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mission.cncfProject && `${mission.cncfProject} · `}
              {mission.metadata?.projectVersion && `${mission.metadata.projectVersion} · `}
              {t('dialogs.improveMission.quality', { score: mission.metadata?.qualityScore ?? 'N/A' })}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('dialogs.improveMission.sectionLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                    activeSection === s.id
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('dialogs.improveMission.categoryLabel')}
            </label>
            <div className="space-y-1.5">
              {IMPROVEMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-colors',
                    selectedCategory === cat.id
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'bg-secondary/30 border-border hover:bg-secondary/60'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5',
                      selectedCategory === cat.id
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {selectedCategory === cat.id && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t(`dialogs.improveMission.categories.${cat.key}.label`)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`dialogs.improveMission.categories.${cat.key}.description`)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {t('dialogs.improveMission.detailsLabel')}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('dialogs.improveMission.detailsPlaceholder')}
              className="w-full h-24 px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-hidden focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <p className="text-xs text-muted-foreground">
          {t('dialogs.improveMission.footer')}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('dialogs.improveMission.openIssue')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
