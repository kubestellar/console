import { ShieldCheck } from 'lucide-react'
import { CanIChecker } from '../../rbac/CanIChecker'

export function PermissionsSection() {
  return (
    <div className="glass rounded-xl p-6 relative z-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">Permissions</h2>
          <p className="text-sm text-muted-foreground">Check your Kubernetes RBAC permissions</p>
        </div>
      </div>
      <CanIChecker />
    </div>
  )
}
