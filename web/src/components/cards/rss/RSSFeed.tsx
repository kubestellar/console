import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { RSSFeedView } from './RSSFeedView'
import type { RSSFeedProps } from './types'

export function RSSFeed(props: RSSFeedProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <DynamicCardErrorBoundary cardId="RSSFeed">
      <RSSFeedView {...props} t={t} />
    </DynamicCardErrorBoundary>
  )
}
