import { useTranslation } from 'react-i18next'

export function LoadingSkeleton() {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">
          {t('labels.loading')}
        </span>
      </div>
    </div>
  )
}

export function ContentLoadingSkeleton() {
  return <LoadingSkeleton />
}
