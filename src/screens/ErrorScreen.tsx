import { useWeight } from '../components/hooks'
import { Button, Card, Sheet } from '../components/ui'
import type { FriendlyError } from '../data/errors'
import { getExercise } from '../lib/exercises'
import { useApp } from '../state/useApp'

/** Shown when the app cannot load at all — almost always unpublished rules. */
export function ErrorScreen({ error }: { error: FriendlyError }) {
  const retryLoad = useApp((s) => s.retryLoad)
  const signOut = useApp((s) => s.signOut)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Card className="border-red-500/40 p-5">
        <h1 className="text-lg font-bold text-red-300">{error.title}</h1>
        <p className="mt-2 text-sm text-ink-300">{error.detail}</p>

        {error.fix ? (
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-800/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">How to fix it</div>
            <p className="mt-1 text-sm text-ink-100">{error.fix}</p>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={retryLoad}>
            Try again
          </Button>
          <Button variant="quiet" onClick={signOut}>
            Sign out
          </Button>
        </div>

        <p className="mt-4 text-xs text-ink-400">
          Error code <span className="tabular">{error.code}</span>
        </p>
      </Card>
    </div>
  )
}

/**
 * A quieter banner for when saves start failing mid-workout. Logging carries on
 * against local state, so this warns without interrupting a session.
 */
export function SaveErrorBanner() {
  const saveError = useApp((s) => s.saveError)
  const dismissSaveError = useApp((s) => s.dismissSaveError)
  if (!saveError) return null

  return (
    <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 print-hide">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-300">Not saving to the cloud</p>
          <p className="mt-0.5 text-xs text-ink-300">
            {saveError.detail} Your sets are still being recorded on this device.
          </p>
          {saveError.fix ? <p className="mt-1 text-xs text-ink-400">{saveError.fix}</p> : null}
        </div>
        <button
          type="button"
          onClick={dismissSaveError}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg px-2 py-1 text-ink-400 hover:text-ink-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/**
 * What the finished workout earned. Rendered above the tabs so it survives the
 * workout screen unmounting the moment the session closes.
 */
export function ProgressionSheet() {
  const bumps = useApp((s) => s.pendingBumps)
  const dismissBumps = useApp((s) => s.dismissBumps)
  const weight = useWeight()

  return (
    <Sheet open={bumps !== null} onClose={dismissBumps} title="Accessories moved up">
      <p className="text-sm text-ink-300">
        You cleared the top of the rep range on every set, so these go up next time.
      </p>
      <ul className="mt-3 space-y-1.5">
        {(bumps ?? []).map((bump) => (
          <li
            key={bump.planId}
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-600/40 bg-brand-500/10 px-3 py-2.5"
          >
            <span className="truncate text-sm font-medium">{getExercise(bump.exerciseId).name}</span>
            <span className="tabular shrink-0 text-sm">
              <span className="text-ink-400">{weight.text(bump.fromKg)}</span>
              <span className="text-ink-400"> → </span>
              <span className="font-bold text-brand-400">{weight.full(bump.toKg)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-400">
        Edit any of these under Plan, or turn this off in Settings.
      </p>
    </Sheet>
  )
}
