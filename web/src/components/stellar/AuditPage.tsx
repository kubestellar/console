import { StellarAuditLogSection } from './StellarAuditLogSection'
import '../../styles/stellar.css'

const APP_TOP_NAV_OFFSET_PX = 56

export function AuditPage() {
  return (
    <div
      className="bg-[var(--s-bg)] px-4 py-6 text-[var(--s-text)] md:px-6 lg:px-8"
      style={{ minHeight: `calc(100vh - ${APP_TOP_NAV_OFFSET_PX}px)` }}
    >
      <div className="mx-auto max-w-[1600px]">
        <StellarAuditLogSection />
      </div>
    </div>
  )
}
