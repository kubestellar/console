/**
 * MissionDetailView metadata sections — type/category/maturity chips,
 * section-completeness badges, source links, prerequisites and the
 * content-fetch error banner.
 *
 * Extracted from `MissionDetailView.tsx` (issue #21786). Pure move — markup
 * and behaviour are unchanged.
 */

import { Tag, CheckCircle, AlertTriangle, ExternalLink, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { validateExternalUrl } from '../../lib/validateExternalUrl'
import { StatusBadge } from '../ui/StatusBadge'
import type { MissionDetailViewProps } from './MissionDetailView.types'
import { SectionBadge } from './MissionDetailView.parts'

/** Chip colours per mission type. Keys match `MissionExport['type']` values. */
const TYPE_COLORS: Record<string, string> = {
  troubleshoot: 'bg-red-500/10 text-red-400 border-red-500/20',
  deploy: 'bg-green-500/10 text-green-400 border-green-500/20',
  upgrade: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  analyze: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  repair: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  custom: 'bg-purple-500/10 text-purple-400 border-purple-500/20' }

type MissionDetailMetaProps = Pick<MissionDetailViewProps, 'mission' | 'error' | 'onRetry'>

export function MissionDetailMeta({ mission, error = null, onRetry }: MissionDetailMetaProps) {
  const { t } = useTranslation()

  const qualityScore = mission.metadata?.qualityScore
  const maturity = mission.metadata?.maturity
  const projectVersion = mission.metadata?.projectVersion
  const sourceUrls = mission.metadata?.sourceUrls

  return (
    <>
        {/* Metadata bar */}
        <div className="flex items-center flex-wrap gap-2">
          <span
            className={cn(
              'px-2.5 py-1 text-xs rounded-full border',
              TYPE_COLORS[mission.type] || TYPE_COLORS.custom
            )}
          >
            {mission.type}
          </span>
          {mission.category && (
            <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-muted-foreground border border-border">
              {mission.category}
            </span>
          )}
          {mission.cncfProject && (
            <StatusBadge color="blue" size="md" variant="outline" rounded="full">
              {mission.cncfProject}
            </StatusBadge>
          )}
          {mission.difficulty && (
            <StatusBadge color="purple" size="md" variant="outline" rounded="full">
              {mission.difficulty}
            </StatusBadge>
          )}
          {maturity && (
            <span
              className={cn(
                'px-2.5 py-1 text-xs rounded-full border',
                maturity === 'graduated'
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : maturity === 'incubating'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              )}
            >
              {maturity}
            </span>
          )}
          {projectVersion && projectVersion !== 'latest' && (
            <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-muted-foreground border border-border">
              {projectVersion}
            </span>
          )}
          {qualityScore != null && (
            <span
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border',
                qualityScore >= 80
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : qualityScore >= 60
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
              )}
            >
              <Shield className="w-3 h-3" />
              {qualityScore}/100
            </span>
          )}
          {mission.installMethods?.map((method) => (
            <span
              key={method}
              className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
            >
              {method}
            </span>
          ))}
          {(mission.tags || [])
            .filter((tag) => !['installation', 'configuration', 'cncf'].includes(tag))
            .slice(0, 4)
            .map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
        </div>

        {/* Section completeness badges */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('missions.detail.sections.sections')}</span>
          <SectionBadge present={(mission.steps || []).length > 0} label={t('missions.detail.sections.install')} />
          <SectionBadge present={(mission.uninstall || []).length > 0} label={t('missions.detail.sections.uninstall')} />
          <SectionBadge present={(mission.upgrade || []).length > 0} label={t('missions.detail.sections.upgrade')} />
          <SectionBadge present={(mission.troubleshooting || []).length > 0} label={t('missions.detail.sections.troubleshooting')} />
        </div>

        {/* Source links */}
        {sourceUrls && (
          <div className="flex items-center gap-3 text-xs">
            {validateExternalUrl(sourceUrls.repo) && (
              <a
                href={validateExternalUrl(sourceUrls.repo)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t('missions.detail.links.repository')}
              </a>
            )}
            {validateExternalUrl(sourceUrls.docs) && sourceUrls.docs !== sourceUrls.repo && (
              <a
                href={validateExternalUrl(sourceUrls.docs)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t('missions.detail.links.documentation')}
              </a>
            )}
            {validateExternalUrl(sourceUrls.helm) && (
              <a
                href={validateExternalUrl(sourceUrls.helm)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t('missions.detail.links.helmChart')}
              </a>
            )}
            {validateExternalUrl(sourceUrls.issue) && (
              <a
                href={validateExternalUrl(sourceUrls.issue)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t('missions.detail.links.issue')}
              </a>
            )}
            {validateExternalUrl(sourceUrls.pr) && (
              <a
                href={validateExternalUrl(sourceUrls.pr)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t('missions.detail.links.pullRequest')}
              </a>
            )}
          </div>
        )}

        {/* Prerequisites */}
        {mission.prerequisites && mission.prerequisites.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">{t('missions.detail.sections.prerequisites')}</h3>
            <ul className="space-y-1">
              {mission.prerequisites.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error banner — shown when full mission content could not be fetched */}
        {error && (
          <div role="alert" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-400 flex-1">{error}</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="shrink-0 px-3 py-1 text-xs rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
              >
                {t('missions.detail.sections.retry')}
              </button>
            )}
          </div>
        )}
    </>
  )
}
