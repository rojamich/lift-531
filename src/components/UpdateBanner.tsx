import { useSyncExternalStore } from 'react'
import { applyUpdate, getUpdateState, subscribeToUpdates } from '../data/updates'
import { Button } from './ui'

export function useUpdateState() {
  return useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState)
}

/**
 * Offered rather than forced: reloading on its own mid-workout would restart the
 * rest timer and drop you back to the top of the day.
 */
export function UpdateBanner() {
  const { needRefresh } = useUpdateState()
  if (!needRefresh) return null

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-brand-600/50 bg-brand-500/10 px-3 py-2.5 print-hide">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand-400">A new version is ready</p>
        <p className="text-xs text-ink-300">Finish your set first — nothing is lost either way.</p>
      </div>
      <Button variant="primary" size="sm" className="shrink-0" onClick={() => void applyUpdate()}>
        Update
      </Button>
    </div>
  )
}
