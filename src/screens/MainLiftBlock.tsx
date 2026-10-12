import { useMemo, useState } from 'react'
import { useWeight } from '../components/hooks'
import { SectionTitle, cx } from '../components/ui'
import { setBelongsTo, type MainBlock } from '../lib/cycle'
import { bestAmrap } from '../lib/progression'
import type { Cycle, LoggedSet, Profile, Session } from '../lib/types'
import { useApp } from '../state/useApp'
import { SetRow } from './SetRow'

/**
 * One main lift: its warm-ups, working sets and supplemental work.
 *
 * A day can carry more than one — a two-day split pairs press with deadlift, and
 * a three-day one might leave squat and deadlift alone and combine the presses —
 * so each lift gets its own block, its own swap and its own rep-record history.
 * Every set still lives in one flat list on the session; the set ids say which
 * lift each belongs to, which is what lets sessions logged before combined days
 * existed keep merging against their prescription.
 */
export function MainLiftBlock({
  block,
  combined,
  session,
  cycle,
  cycles,
  profile,
  weekLabel,
  onRest,
  onRequestSwap,
}: {
  block: MainBlock
  combined: boolean
  session: Session
  cycle: Cycle
  cycles: Cycle[]
  profile: Profile
  weekLabel: string
  onRest: (seconds: number) => void
  /** The swap sheet lives on the screen, so one sheet serves every block. */
  onRequestSwap: () => void
}) {
  const weight = useWeight()
  const patchSet = useApp((s) => s.patchSet)
  const [showWarmups, setShowWarmups] = useState(false)

  const p = block.prescription
  const mine = (set: LoggedSet) => setBelongsTo(set.id, block.ordinal)
  const warmups = session.mainSets.filter((set) => set.kind === 'warmup' && mine(set))
  const mainSets = session.mainSets.filter((set) => set.kind === 'main' && mine(set))
  const supplemental = session.supplementalSets.filter(mine)

  const byId = new Map([...p.warmups, ...p.main, ...p.supplemental].map((set) => [set.id, set]))
  const barWeight = weight.unit === 'kg' ? profile.settings.barWeight.kg : profile.settings.barWeight.lb

  const previousBest = useMemo(() => {
    for (const older of [...cycles.filter((c) => c.id !== cycle.id)].reverse()) {
      const best = bestAmrap(older, session.slot, block.ordinal)
      if (best) return best
    }
    return null
  }, [cycles, cycle.id, session.slot, block.ordinal])

  const row = (set: LoggedSet, fallbackRest: number) => (
    <SetRow
      set={set}
      label={byId.get(set.id)?.label ?? 'Set'}
      liftName={combined ? (block.lift?.label ?? block.exercise.name) : undefined}
      perHand={Boolean(block.exercise.perHand)}
      showPlates={profile.settings.showPlateMath}
      barWeight={barWeight}
      restSeconds={byId.get(set.id)?.restSeconds ?? fallbackRest}
      onPatch={(patch) => patchSet(session.key, set.id, patch)}
      onDone={onRest}
    />
  )

  return (
    <>
      {/* With one lift the day's name is already in the header above. */}
      {combined ? (
        <div
          className={cx(
            'mb-2 flex items-baseline justify-between gap-2',
            // The day header already rules off the first block.
            block.ordinal > 0 && 'mt-1 border-t border-ink-700/60 pt-4',
          )}
        >
          <button
            type="button"
            onClick={onRequestSwap}
            className="min-w-0 text-left text-lg font-bold hover:text-brand-400"
          >
            <span className="truncate">{block.lift?.label ?? block.exercise.name}</span>
            {block.lift && block.exercise.id !== block.lift.exerciseId ? (
              <span className="ml-1.5 text-xs font-medium text-flame-400">→ {block.exercise.name}</span>
            ) : null}
          </button>
          <span className="tabular shrink-0 text-xs text-ink-400">
            TM {p.trainingMax} {weight.unit}
          </span>
        </div>
      ) : null}

      {warmups.length > 0 ? (
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setShowWarmups((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-ink-400"
          >
            <span>
              Warm-up · {warmups.filter((set) => set.done).length}/{warmups.length}
            </span>
            <span>{showWarmups ? 'hide' : 'show'}</span>
          </button>
          {showWarmups ? (
            <div className="space-y-1.5">
              {warmups.map((set) => (
                <div key={set.id}>{row(set, 60)}</div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mb-5">
        <SectionTitle>{combined ? 'Working sets' : `Main work · ${weekLabel}`}</SectionTitle>
        <div className="space-y-1.5">
          {mainSets.map((set) => (
            <div key={set.id}>
              {row(set, 180)}
              {set.amrap ? (
                <div className="mt-1 px-3 text-xs text-ink-400">
                  <span className="font-semibold text-flame-400">Rep record set</span> — go past{' '}
                  {set.targetReps}, stop with one clean rep left.
                  {previousBest ? (
                    <span className="tabular ml-1 text-ink-300">
                      Best so far: {weight.full(previousBest.weightKg)} × {previousBest.reps}.
                    </span>
                  ) : null}
                </div>
              ) : null}
              {byId.get(set.id)?.capped ? (
                <div className="mt-1 px-3 text-xs text-flame-400">
                  Prescribed {byId.get(set.id)?.uncappedWeight} {weight.unit} — capped, so the target rose to{' '}
                  {set.targetReps} reps.
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {supplemental.length > 0 ? (
        <section className="mb-5">
          <SectionTitle>{p.supplementalLabel}</SectionTitle>
          <div className="space-y-1.5">
            {supplemental.map((set) => (
              <div key={set.id}>{row(set, 75)}</div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
