/**
 * ImproveMissionDialog
 *
 * Pre-filled feedback dialog for suggesting improvements to AI-generated missions.
 * Opens a GitHub issue in kubestellar/console-kb with mission context.
 */

import { useState } from 'react'
import {
  MessageSquarePlus,
  ExternalLink,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { BaseModal } from '../../lib/modals/BaseModal'
import type { MissionExport } from '../../lib/missions/types'

const IMPROVEMENT_CATEGORIES = [
  { id: 'wrong-command', label: 'Wrong command', description: 'A command is incorrect or does not work' },
  { id: 'missing-step', label: 'Missing step', description: 'An important step is missing from the guide' },
  { id: 'better-approach', label: 'Better approach', description: 'There is a better way to do this' },
  { id: 'outdated-version', label: 'Outdated version', description: 'The version or image tag is outdated' },
  { id: 'security-concern', label: 'Security concern', description: 'There is a security issue with the steps' },
  { id: 'other', label: 'Other', description: 'Something else needs improvement' },
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

  const labels = ['ai-mission', 'community-improvement', section !== 'general' ? section : ''].filter(Boolean).join(',')

  const params = new URLSearchParams({
    title,
    body,
    labels,
  })

  return `https://github.com/kubestellar/console-kb/issues/new?${params.toString()}`
}

export function ImproveMissionDialog({
  mission,
  section = 'general',
  isOpen,
  onClose,
}: ImproveMissionDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [details, setDetails] = useState('')
  const [activeSection, setActiveSection] = useState<SectionName>(section)

  const sections: { id: SectionName; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'install', label: 'Install' },
    { id: 'uninstall', label: 'Uninstall' },
    { id: 'upgrade', label: 'Upgrade' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
  ]

  const handleSubmit = () => {
    const url = buildIssueUrl(mission, selectedCategory || 'other', activeSection, details)
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm">
      <BaseModal.Header title="Improve this AI Mission" icon={MessageSquarePlus} onClose={onClose} />

      <BaseModal.Content noPadding>
        <div className="p-4 space-y-4">
          {/* Mission info */}
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-sm font-medium text-foreground">{mission.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mission.cncfProject && `${mission.cncfProject} · `}
              {mission.metadata?.projectVersion && `${mission.metadata.projectVersion} · `}
              Quality: {mission.metadata?.qualityScore ?? 'N/A'}/100
            </p>
          </div>

          {/* Section selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Which section needs improvement?
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

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              What kind of improvement?
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
                    <p className="text-sm font-medium text-foreground">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the improvement needed. Include the correct command, better approach, or updated version..."
              className="w-full h-24 px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-hidden focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <p className="text-xs text-muted-foreground">
          Opens a GitHub issue in kubestellar/console-kb
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Issue
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
