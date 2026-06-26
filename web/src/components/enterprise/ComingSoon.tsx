/**
 * Coming Soon — Placeholder for enterprise verticals not yet implemented.
 */
import { useLocation } from 'react-router-dom'
import { Construction, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
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
        <Button
          onClick={() => navigate(ROUTES.ENTERPRISE)}
          variant="primary"
          size="md"
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          Back to Enterprise Portal
        </Button>
      </div>
    </div>
  )
}
