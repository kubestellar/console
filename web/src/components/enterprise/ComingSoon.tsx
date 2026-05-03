/**
 * Coming Soon — Placeholder for enterprise verticals not yet implemented.
 */
import { useLocation } from 'react-router-dom'
import { Construction, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../config/routes'

export default function ComingSoon() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname.split('/').pop() ?? ''
  const title = path.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <Construction className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This compliance vertical is under development and will be available in a future release.
        </p>
        <button
          onClick={() => navigate(ROUTES.ENTERPRISE)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-primary-foreground text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Enterprise Portal
        </button>
      </div>
    </div>
  )
}
