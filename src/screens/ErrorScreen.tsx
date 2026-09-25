import { useEffect, useState } from 'react'
import { useWeight } from '../components/hooks'
import { Button, Card, NumberField, Sheet, cx } from '../components/ui'
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
 * Increases proposed by the workout just finished.
 *
 * Deliberately a decision rather than an announcement: each row can be accepted
 * or left alone, and the new weight itself is editable, because clearing a rep
 * range is evidence for adding weight rather than proof of it.
 */
export function ProgressionSheet() {
  const bumps = useApp((s) => s.pendingBumps)
  const applyBumps = useApp((s) => s.applyBumps)
  const dismissBumps = useApp((s) => s.dismissBumps)
  const weight = useWeight()

  const [declined, setDeclined] = useState<Set<string>>(new Set())
  const [edited, setEdited] = useState<Record<string, number>>({})

  // Start each proposal fresh whenever a new set of them arrives.
  useEffect(() => {
    setDeclined(new Set())
    setEdited({})
  }, [bumps])

  const accepted = (bumps ?? [])
    .filter((bump) => !declined.has(bump.planId))
    .map((bump) => ({ ...bump, toKg: edited[bump.planId] ?? bump.toKg }))

  const toggle = (planId: string) =>
    setDeclined((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })

  return (
    <Sheet open={bumps !== null} onClose={dismissBumps} title="Add weight next time?">
      <p className="text-sm text-ink-300">
        You cleared the top of the rep range on every set of these. Take the increase, adjust it, or leave any
        of them where they are.
      </p>

      <ul className="mt-3 space-y-1.5">
        {(bumps ?? []).map((bump) => {
          const isDeclined = declined.has(bump.planId)
          const value = edited[bump.planId] ?? bump.toKg
          return (
            <li
              key={bump.planId}
              className={cx(
                'rounded-xl border px-3 py-2.5 transition',
                isDeclined ? 'border-ink-700 bg-ink-800/40' : 'border-brand-600/40 bg-brand-500/10',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">
                  {getExercise(bump.exerciseId).name}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(bump.planId)}
                  className={cx(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                    isDeclined
                      ? 'border-ink-600 text-ink-400'
                      : 'border-brand-500 bg-brand-500/20 text-brand-400',
                  )}
                >
                  {isDeclined ? 'Keeping' : 'Adding'}
                </button>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-sm">
                <span className="tabular text-ink-400">
                  {weight.textFor(bump.fromKg, getExercise(bump.exerciseId).equipment)}
                </span>
                <span className="text-ink-400">&rarr;</span>
                {isDeclined ? (
                  <span className="tabular font-semibold text-ink-400">
                    {weight.fullFor(bump.fromKg, getExercise(bump.exerciseId).equipment)}{' '}
                    <span className="font-normal">(no change)</span>
                  </span>
                ) : (
                  <>
                    <NumberField
                      ariaLabel={`${getExercise(bump.exerciseId).name} new weight`}
                      value={weight.show(value)}
                      format={(n) => Math.round(n * 100) / 100}
                      onChange={(next) =>
                        setEdited((prev) => ({
                          ...prev,
                          [bump.planId]: weight.toKg(next ?? 0),
                        }))
                      }
                      className="tabular w-[7ch] rounded-lg border border-brand-600/50 bg-ink-900 px-2 py-1 text-right font-bold text-brand-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                    />
                    <span className="text-xs text-ink-400">{weight.unit}</span>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => applyBumps(accepted)}
          disabled={accepted.length === 0}
        >
          {accepted.length === 0
            ? 'Nothing selected'
            : `Add weight to ${accepted.length} ${accepted.length === 1 ? 'exercise' : 'exercises'}`}
        </Button>
        <Button size="lg" className="w-full" onClick={dismissBumps}>
          Keep everything where it is
        </Button>
      </div>

      <p className="mt-3 text-xs text-ink-400">
        Whatever you choose applies to the rest of this cycle and the next one. Change it any time under Plan,
        or turn these prompts off in Settings.
      </p>
    </Sheet>
  )
}
