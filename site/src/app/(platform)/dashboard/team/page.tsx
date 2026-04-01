import { TeamAuthGate } from '@/components/team/TeamAuthGate'
import { TeamDashboardShell } from '@/components/team/TeamDashboardShell'

export const metadata = {
  title: 'Team Dashboard | Ambr',
  robots: 'noindex, nofollow',
}

export default function TeamDashboardPage() {
  return (
    <TeamAuthGate>
      <TeamDashboardShell />
    </TeamAuthGate>
  )
}
