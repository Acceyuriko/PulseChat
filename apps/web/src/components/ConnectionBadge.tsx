import type { RealtimeStatus } from '../realtime/useRealtime'

const TONE: Record<RealtimeStatus, string> = {
  idle: 'bg-slate-100 text-slate-600',
  connecting: 'bg-amber-100 text-amber-800',
  connected: 'bg-emerald-100 text-emerald-800',
  error: 'bg-rose-100 text-rose-700',
}

export interface ConnectionBadgeProps {
  status: RealtimeStatus
  detail: string | null
}

export function ConnectionBadge({ status, detail }: ConnectionBadgeProps) {
  return (
    <span
      title={detail ?? undefined}
      data-testid="connection-badge"
      className={`rounded-full px-2 py-1 text-xs font-medium ${TONE[status]}`}
    >
      socket: {status}
    </span>
  )
}
