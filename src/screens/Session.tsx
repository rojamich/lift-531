import { useMemo, useState } from 'react'
import { ExerciseSwap } from '../components/ExerciseSwap'
import { useToast, useWakeLock, useWeight } from '../components/hooks'
import { RestTimerBar, useRestTimer, formatClock } from '../components/RestTimer'
import { Button, Card, Empty, Input, SectionTitle, Sheet, Toast, cx } from '../components/ui'
import { contextFor, dayLabel, liftsFor, prescriptionsFor } from '../lib/cycle'
import { getExercise } from '../lib/exercises'
import { findLastAccessory, repGoal, suggestAccessory } from '../lib/progression'
import { sessionToText, shareText } from '../lib/share'
import type { Cycle, LoggedAccessory, PlannedAccessory, Profile, Session } from '../lib/types'
import { useApp } from '../state/useApp'
import { MainLiftBlock } from './MainLiftBlock'
import { NumberCell } from './SetRow'

function AccessoryCard({
  accessory,
  sessionKey,
  cycles,
  profile,
  plan,
  onRest,
  restsAfterThis = true,
  groupLabel,
}: {
  accessory: LoggedAccessory
  sessionKey: string
  cycles: Cycle[]
  profile: Profile
  plan: PlannedAccessory | undefined
  onRest: (seconds: number) => void
  /** False for all but the last exercise of a superset — no rest mid-round. */
  restsAfterThis?: boolean
  groupLabel?: string
}) {
  const weight = useWeight()
  const patchAccessorySet = useApp((s) => s.patchAccessorySet)
  const setAccessorySkipped = useApp((s) => s.setAccessorySkipped)
  const swapAccessoryExercise = useApp((s) => s.swapAccessoryExercise)
  const addAccessorySet = useApp((s) => s.addAccessorySet)
  const removeAccessorySet = useApp((s) => s.removeAccessorySet)
  const [swapping, setSwapping] = useState(false)

  const exercise = getExercise(accessory.exerciseId, profile.customExercises)

  const history = useMemo(
    () => findLastAccessory(cycles, accessory.planId, accessory.exerciseId),
    [cycles, accessory.planId, accessory.exerciseId],
  )

  const suggestion = useMemo(() => {
    if (!plan || !history) return null
    return suggestAccessory(plan, history.sets, contextFor(profile.settings))
  }, [plan, history, profile.settings])

  const restSeconds = plan?.restSeconds ?? 90

  return (
    <Card className={cx('overflow-hidden', accessory.skipped && 'opacity-50')}>
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          {groupLabel ? (
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-400">
              {groupLabel}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setSwapping(true)}
            className="text-left text-base font-semibold hover:text-brand-400"
          >
            {exercise.name}
            <span className="ml-1.5 text-xs font-normal text-ink-400">swap</span>
          </button>
          <div className="text-xs text-ink-400">
            {accessory.sets.length} × {accessory.targetReps}
            {accessory.targetWeightKg !== null
              ? ` @ ${weight.fullFor(accessory.targetWeightKg, exercise.equipment)}`
              : ' · bodyweight'}
            {exercise.perHand ? ' /hand' : ''} · rest {formatClock(restSeconds)}
          </div>
        </div>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => setAccessorySkipped(sessionKey, accessory.planId, !accessory.skipped)}
        >
          {accessory.skipped ? 'Undo' : 'Skip'}
        </Button>
      </div>

      {history ? (
        <div className="mx-3 mt-2 rounded-lg bg-ink-800/70 px-2.5 py-1.5 text-xs">
          <span className="text-ink-400">Last time: </span>
          <span className="tabular">
            {history.sets
              .filter((s) => s.done)
              .map((s) => `${s.reps ?? 0}`)
              .join(' / ')}
            {history.sets[0]?.weightKg !== null && history.sets[0]?.weightKg !== undefined
              ? ` @ ${weight.fullFor(history.sets[0].weightKg, exercise.equipment)}`
              : ''}
          </span>
          {suggestion && suggestion.action !== 'none' ? (
            <div className={cx('mt-0.5', suggestion.action === 'add-weight' ? 'text-brand-400' : 'text-ink-400')}>
              {suggestion.message}
            </div>
          ) : null}
        </div>
      ) : null}

      {!accessory.skipped ? (
        <div className="grid grid-cols-1 gap-1.5 p-3 pt-2">
          {accessory.sets.map((set, index) => (
            <div
              key={index}
              className={cx(
                'flex items-center gap-2 rounded-lg border px-2.5 py-2',
                set.done ? 'border-brand-600/50 bg-brand-500/10' : 'border-ink-700 bg-ink-800/40',
              )}
            >
              <button
                type="button"
                aria-label={`Set ${index + 1} ${set.done ? 'done' : 'not done'}`}
                aria-pressed={set.done}
                onClick={() => {
                  const next = !set.done
                  patchAccessorySet(sessionKey, accessory.planId, index, {
                    done: next,
                    reps: next ? set.reps ?? null : set.reps,
                  })
                  if (next && restsAfterThis) onRest(restSeconds)
                }}
                className={cx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold transition',
                  set.done ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-600 text-transparent',
                )}
              >
                ✓
              </button>
              <span className="w-10 shrink-0 text-xs text-ink-400">Set {index + 1}</span>
              <div className="flex flex-1 items-baseline justify-end gap-1">
                <NumberCell
                  ariaLabel={`Set ${index + 1} weight`}
                  value={weight.show(set.weightKg)}
                  placeholder="BW"
                  onChange={(next) =>
                    patchAccessorySet(sessionKey, accessory.planId, index, {
                      weightKg: next === null ? null : weight.toKg(next),
                    })
                  }
                  suffix={weight.unit}
                />
                <span className="px-1 text-ink-400">×</span>
                <NumberCell
                  ariaLabel={`Set ${index + 1} reps`}
                  value={set.reps}
                  placeholder={repGoal(accessory.targetReps)}
                  onChange={(next) => patchAccessorySet(sessionKey, accessory.planId, index, { reps: next })}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-0.5">
            <Button
              size="sm"
              variant="quiet"
              className="flex-1"
              onClick={() => addAccessorySet(sessionKey, accessory.planId)}
            >
              + set
            </Button>
            {accessory.sets.length > 1 ? (
              <Button
                size="sm"
                variant="quiet"
                className="flex-1"
                onClick={() => removeAccessorySet(sessionKey, accessory.planId)}
              >
                − set
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ExerciseSwap
        open={swapping}
        onClose={() => setSwapping(false)}
        exerciseId={accessory.exerciseId}
        plannedExerciseId={plan?.exerciseId}
        currentWeightKg={accessory.targetWeightKg}
        onPick={(id, converted) => swapAccessoryExercise(sessionKey, accessory.planId, id, converted)}
      />
    </Card>
  )
}

export function SessionScreen({ cycle, session }: { cycle: Cycle; session: Session }) {
  const profile = useApp((s) => s.profile)
  const cycles = useApp((s) => s.cycles)
  const completeSession = useApp((s) => s.completeSession)
  const skipSession = useApp((s) => s.skipSession)
  const setSessionNotes = useApp((s) => s.setSessionNotes)
  const swapMainExercise = useApp((s) => s.swapMainExercise)
  const closeSession = useApp((s) => s.closeSession)
  const undo = useApp((s) => s.undo)
  const canUndo = useApp((s) => s.undoStack.length > 0)

  const weight = useWeight()
  const toast = useToast()
  /*
   * Which of the day's main lifts has its swap sheet open. One sheet serves
   * every block, so a combined day can't somehow have two open at once.
   */
  const [swapOrdinal, setSwapOrdinal] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)

  const timer = useRestTimer(profile?.settings.restTimerEnabled ?? true)
  useWakeLock(session.status === 'in-progress')

  const blocks = useMemo(
    () => (profile ? prescriptionsFor(cycle, session, profile.settings) : []),
    [cycle, session, profile],
  )

  if (!profile || blocks.length === 0) return null

  const lifts = liftsFor(cycle, session.slot)
  /* A day can pair lifts — press with deadlift, say — so nothing here assumes one. */
  const combined = blocks.length > 1
  const weekSpec = cycle.template.weeks[session.week - 1]

  const allSets = [...session.mainSets, ...session.supplementalSets]
  const doneCount = allSets.filter((s) => s.done).length
  const accessorySets = session.accessories.filter((a) => !a.skipped).flatMap((a) => a.sets)
  const totalCount = allSets.length + accessorySets.length
  const doneTotal = doneCount + accessorySets.filter((s) => s.done).length
  const anyCapped = blocks.some((block) =>
    [...block.prescription.main, ...block.prescription.supplemental].some((s) => s.capped),
  )

  const swapBlock = swapOrdinal === null ? null : blocks[swapOrdinal]

  const planItems = cycle.accessoryPlan[session.slot] ?? []
  const planById = new Map(planItems.map((item) => [item.id, item]))
  /*
   * Consecutive accessories sharing a supersetId are performed as one round.
   * Grouping only adjacent entries keeps the order you set in the plan
   * meaningful, rather than pulling exercises together from across the day.
   */
  const accessoryGroups: { id: string; items: typeof session.accessories }[] = []
  for (const accessory of session.accessories) {
    const supersetId = planById.get(accessory.planId)?.supersetId
    const last = accessoryGroups[accessoryGroups.length - 1]
    if (supersetId && last && last.id === supersetId) last.items.push(accessory)
    else accessoryGroups.push({ id: supersetId ?? accessory.planId, items: [accessory] })
  }

  const onRest = (seconds: number) => {
    if (profile.settings.autoStartRest) timer.start(seconds)
  }

  const share = async () => {
    const result = await shareText(
      `${cycle.name} · Week ${session.week} ${dayLabel(cycle, session.slot)}`,
      sessionToText(cycle, session, profile.settings),
    )
    if (result === 'copied') toast.show('Workout copied to clipboard')
    if (result === 'failed') toast.show('Could not share — try again')
  }

  const title = combined
    ? blocks.map((block, index) => lifts[index]?.label ?? block.exercise.name).join(' + ')
    : (lifts[0]?.label ?? blocks[0].exercise.name)
  const swappedName =
    !combined && blocks[0].lift && blocks[0].exercise.id !== blocks[0].lift.exerciseId
      ? blocks[0].exercise.name
      : null

  return (
    <div className="pb-40">
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-ink-700/70 bg-ink-950/90 px-4 pb-3 pt-3 backdrop-blur print-hide">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <button type="button" onClick={closeSession} className="hover:text-ink-100">
                ← {cycle.name}
              </button>
              <span>·</span>
              <span>
                Week {session.week} · {dayLabel(cycle, session.slot)}
              </span>
            </div>
            {/* On a combined day each lift carries its own swap, so the day's
                name is a label rather than a control. */}
            {combined ? (
              <h1 className="mt-0.5 text-2xl font-bold leading-tight">{title}</h1>
            ) : (
              <button
                type="button"
                onClick={() => setSwapOrdinal(0)}
                className="mt-0.5 block truncate text-2xl font-bold leading-tight hover:text-brand-400"
              >
                {title}
                {swappedName ? (
                  <span className="ml-2 align-middle text-xs font-medium text-flame-400">
                    → {swappedName}
                  </span>
                ) : null}
              </button>
            )}
            <div className="text-sm text-ink-400">
              {weekSpec.label}
              {combined ? null : (
                <>
                  {' '}
                  · TM{' '}
                  <span className="tabular text-ink-300">
                    {blocks[0].prescription.trainingMax} {weight.unit}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canUndo ? (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  const label = undo()
                  if (label) toast.show(`Undid ${label}`)
                }}
              >
                ↩ Undo
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={share}>
              Share
            </Button>
          </div>
        </div>

        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${totalCount ? (doneTotal / totalCount) * 100 : 0}%` }}
          />
        </div>
      </header>

      {anyCapped ? (
        <div className="mb-4 rounded-xl border border-flame-500/40 bg-flame-500/10 px-3 py-2.5 text-sm">
          <span className="font-semibold text-flame-400">Capped at your heaviest dumbbell.</span>{' '}
          <span className="text-ink-300">
            Rep targets were raised to match the load you're missing.
          </span>
        </div>
      ) : null}

      {blocks.map((block) => (
        <MainLiftBlock
          key={block.ordinal}
          block={block}
          combined={combined}
          session={session}
          cycle={cycle}
          cycles={cycles}
          profile={profile}
          weekLabel={weekSpec.label}
          onRest={onRest}
          onRequestSwap={() => setSwapOrdinal(block.ordinal)}
        />
      ))}

      <section className="mb-5">
        <SectionTitle>Accessories</SectionTitle>
        {session.accessories.length === 0 ? (
          <Empty title="No accessories for this day">
            Add them under Plan and they'll show up here every cycle.
          </Empty>
        ) : (
          <div className="space-y-2.5">
            {accessoryGroups.map((group) => {
              const single = group.items.length === 1
              const body = group.items.map((accessory, index) => (
                <AccessoryCard
                  key={accessory.planId}
                  accessory={accessory}
                  sessionKey={session.key}
                  cycles={cycles}
                  profile={profile}
                  plan={planById.get(accessory.planId)}
                  onRest={onRest}
                  // In a superset you move straight to the next exercise; the
                  // rest belongs at the end of the round.
                  restsAfterThis={index === group.items.length - 1}
                  groupLabel={single ? undefined : `Superset ${String.fromCharCode(65 + index)}`}
                />
              ))
              if (single) return body
              return (
                <div
                  key={group.id}
                  className="space-y-2 rounded-2xl border border-brand-600/30 bg-brand-500/[0.04] p-2"
                >
                  <div className="px-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-400">
                    Superset · back to back, rest after the round
                  </div>
                  {body}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mb-5">
        <SectionTitle>Notes</SectionTitle>
        <Input
          value={session.notes}
          placeholder="How it felt, what to change next time…"
          onChange={(e) => setSessionNotes(session.key, e.target.value)}
        />
      </section>

      {/* Rest and finish stack, so a running timer never hides the way out. */}
      <div className="fixed inset-x-0 bottom-[72px] z-40 space-y-2 px-3 print-hide">
        <div className="mx-auto max-w-lg">
          <RestTimerBar timer={timer} />
        </div>
        <div className="mx-auto max-w-lg">
          <Button variant="primary" size="lg" className="w-full" onClick={() => setFinishing(true)}>
            Finish workout · {doneTotal}/{totalCount} sets
          </Button>
        </div>
      </div>

      <ExerciseSwap
        open={swapBlock !== null}
        onClose={() => setSwapOrdinal(null)}
        exerciseId={swapBlock?.exercise.id ?? blocks[0].exercise.id}
        currentWeightKg={swapBlock?.lift?.trainingMaxKg ?? null}
        title={`Swap ${swapBlock?.lift?.label ?? swapBlock?.exercise.name ?? 'lift'}`}
        plannedExerciseId={swapBlock?.lift?.exerciseId}
        onPick={(id) => swapMainExercise(session.key, id, swapBlock?.ordinal ?? 0)}
      />

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Finish workout">
        <p className="text-sm text-ink-300">
          {doneTotal} of {totalCount} sets logged.
          {doneTotal < totalCount
            ? ' Anything unchecked is recorded as not done.'
            : ' Everything done — nice.'}
        </p>
        <div className="mt-4 space-y-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              completeSession(session.key)
              setFinishing(false)
            }}
          >
            Complete and move to the next day
          </Button>
          <Button
            size="lg"
            className="w-full"
            onClick={async () => {
              await share()
              setFinishing(false)
            }}
          >
            Share this workout
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              skipSession(session.key)
              setFinishing(false)
            }}
          >
            Skip this day entirely
          </Button>
        </div>
      </Sheet>

      <Toast message={toast.message} />
    </div>
  )
}
