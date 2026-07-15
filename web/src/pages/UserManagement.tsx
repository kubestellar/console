import { UserManagement } from '../components/cards/UserManagement'

export function UserManagementPage() {
  return (
    <div className="min-h-full p-6">
      <div className="min-h-full rounded-xl border border-border/50 bg-card/50 p-4">
        <UserManagement />
      </div>
    </div>
  )
}
