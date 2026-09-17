import { useMemo, useState } from 'react'
import { ExerciseSwap } from '../components/ExerciseSwap'
import { useToast, useWakeLock, useWeight } from '../components/hooks'
import { RestTimerBar, useRestTimer, formatClock } from '../components/RestTimer'
import { Button, Card, Empty, Input, NumberField, SectionTitle, Sheet, Toast, cx } from '../components/ui'
import { contextFor, liftFor, mainExerciseId, prescriptionFor } from '../lib/cycle'
import { getExercise } from '../lib/exercises'
import { bestAmrap, findLastAccessory, suggestAccessory } from '../lib/progression'
import { sessionToText, shareText } from '../lib/share'
import type { Cycle, LoggedAccessory, LoggedSet, Profile, Session } from '../lib/types'
import { describePlates, platesFor } from '../lib/units'
import { useApp } from '../state/useApp'

function NumberCell({
  value,
  onChange,
  suffix,
  placeholder,
  emphasis,
  ariaLabel,
}: {
  value: number | null
  onChange: (next: number | null) => void
  suffix?: string
  placeholder?: string
  emphasis?: boolean
  ariaLabel: string
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <NumberField
        ariaLabel={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        // Two decimals is plenty for a half-pound plate, and only applies once
        // the field loses focus.
        format={(n) => Math.round(n * 100) / 100}
        className={cx(
          'tabular w-[5ch] rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-right outline-none transition',
          'focus:border-brand-500 focus:bg-ink-900 focus:ring-2 focus:ring-brand-500/25',
          emphasis ? 'text-2xl font-bold' : 'text-base font-semibold',
        )}
      />
      {suffix ? <span className="text-xs text-ink-400">{suffix}</span> : null}
    </span>
  )
}

function SetRow({
  set,
  label,
  restSeconds,
  perHand,
  showPlates,
  barWeight,
  onPatch,
  onDone,
}: {
  set: LoggedSet
  label: string
  restSeconds: number
  perHand: boolean
  showPlates: boolean
  barWeight: number
  onPatch: (patch: Partial<LoggedSet>) => void
  onDone: (rest: number) => void
}) {
  const weight = useWeight()
  const display = weight.show(set.actualWeightKg)
  const isWarmup = set.kind === 'warmup'

  const toggle = () => {
    const next = !set.done
    onPatch({
      done: next,
      actualReps: next ? set.actualReps ?? set.targetReps : set.actualReps,
    })
    if (next) onDone(restSeconds)
  }

  const plates =
    showPlates && !perHand && display !== null && display > barWeight
      ? describePlates(platesFor(display, weight.unit, barWeight))
      : null

  return (
    <div
      className={cx(
        'rounded-xl border px-3 py-2.5 transition',
        set.done
          ? 'border-brand-600/50 bg-brand-500/10'
          : set.amrap
            ? 'border-flame-500/50 bg-flame-500/5'
            : 'border-ink-700 bg-ink-800/50',
      )}
    >
      <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={set.done ? `Mark ${label} not done` : `Mark ${label} done`}
        aria-pressed={set.done}
        className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-lg font-bold transition',
          set.done ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-600 text-transparent hover:border-ink-400',
        )}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          {display === null ? (
            <span className="text-xl font-bold">Bodyweight</span>
          ) : (
            <NumberCell
              ariaLabel={`${label} weight`}
              value={Math.round(display * 100) / 100}
              onChange={(next) => onPatch({ actualWeightKg: next === null ? null : weight.toKg(next) })}
              suffix={perHand ? `${weight.unit}/hand` : weight.unit}
              emphasis={!isWarmup}
            />
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-400">
          <span className="font-medium uppercase tracking-wide">{label}</span>
          <span>{Math.round(set.pct * 100)}%</span>
        </div>
      </div>

      <div className="flex shrink-0 items-baseline gap-1">
        <span className="text-ink-400">×</span>
        <NumberCell
          ariaLabel={`${label} reps`}
          value={set.actualReps}
          placeholder={String(set.targetReps)}
          onChange={(next) => onPatch({ actualReps: next })}
          emphasis={set.amrap}
        />
        <span className={cx('text-xs', set.amrap ? 'font-bold text-flame-400' : 'text-ink-400')}>
          /{set.targetReps}
          {set.amrap ? '+' : ''}
        </span>
      </div>
      </div>

      {plates ? (
        <div className="tabular mt-1.5 pl-[52px] text-[11px] text-ink-400">{plates}</div>
      ) : null}
    </div>
  )
}

function AccessoryCard({
  accessory,
  sessionKey,
  cycles,
  profile,
  onRest,
}: {
  accessory: LoggedAccessory
  sessionKey: string
  cycles: Cycle[]
  profile: Profile
  onRest: (seconds: number) => void
}) {
  const weight = useWeight()
  const patchAccessorySet = useApp((s) => s.patchAccessorySet)
  const setAccessorySkipped = useApp((s) => s.setAccessorySkipped)
  const swapAccessoryExercise = useApp((s) => s.swapAccessoryExercise)
  const [swapping, setSwapping] = useState(false)

  const exercise = getExercise(accessory.exerciseId, profile.customExercises)
  const plan = profile.accessoryPlan[
    (Object.keys(profile.accessoryPlan) as (keyof typeof profile.accessoryPlan)[]).find((slot) =>
      profile.accessoryPlan[slot].some((a) => a.id === accessory.planId),
    ) ?? 'A'
  ]?.find((a) => a.id === accessory.planId)

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
                  if (next) onRest(restSeconds)
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
                  placeholder={accessory.targetReps}
                  onChange={(next) => patchAccessorySet(sessionKey, accessory.planId, index, { reps: next })}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <ExerciseSwap
        open={swapping}
        onClose={() => setSwapping(false)}
        exerciseId={accessory.exerciseId}
        currentWeightKg={accessory.targetWeightKg}
        onPick={(id, converted) => swapAccessoryExercise(sessionKey, accessory.planId, id, converted)}
      />
    </Card>
  )
}

export function SessionScreen({ cycle, session }: { cycle: Cycle; session: Session }) {
  const profile = useApp((s) => s.profile)
  const cycles = useApp((s) => s.cycles)
  const patchSet = useApp((s) => s.patchSet)
  const completeSession = useApp((s) => s.completeSession)
  const skipSession = useApp((s) => s.skipSession)
  const setSessionNotes = useApp((s) => s.setSessionNotes)
  const swapMainExercise = useApp((s) => s.swapMainExercise)
  const closeSession = useApp((s) => s.closeSession)

  const weight = useWeight()
  const toast = useToast()
  const [swapping, setSwapping] = useState(false)
  const [showWarmups, setShowWarmups] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const timer = useRestTimer(profile?.settings.restTimerEnabled ?? true)
  useWakeLock(session.status === 'in-progress')

  const prescription = useMemo(
    () => (profile ? prescriptionFor(cycle, session, profile.settings) : null),
    [cycle, session, profile],
  )

  const previousBest = useMemo(() => {
    const older = cycles.filter((c) => c.id !== cycle.id)
    for (const c of [...older].reverse()) {
      const best = bestAmrap(c, session.slot)
      if (best) return { best, cycle: c }
    }
    return null
  }, [cycles, cycle.id, session.slot])

  if (!profile || !prescription) return null

  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session), profile.customExercises)
  const weekSpec = cycle.template.weeks[session.week - 1]
  const restMap = new Map(
    [...prescription.warmups, ...prescription.main, ...prescription.supplemental].map((s) => [s.id, s.restSeconds]),
  )
  const cappedMap = new Map(
    [...prescription.warmups, ...prescription.main, ...prescription.supplemental].map((s) => [s.id, s]),
  )

  const warmups = session.mainSets.filter((s) => s.kind === 'warmup')
  const mainSets = session.mainSets.filter((s) => s.kind === 'main')
  const allSets = [...session.mainSets, ...session.supplementalSets]
  const doneCount = allSets.filter((s) => s.done).length
  const accessorySets = session.accessories.filter((a) => !a.skipped).flatMap((a) => a.sets)
  const totalCount = allSets.length + accessorySets.length
  const doneTotal = doneCount + accessorySets.filter((s) => s.done).length
  const anyCapped = [...prescription.main, ...prescription.supplemental].some((s) => s.capped)

  const onRest = (seconds: number) => {
    if (profile.settings.autoStartRest) timer.start(seconds)
  }

  const share = async () => {
    const result = await shareText(`${cycle.name} · Week ${session.week} Day ${session.slot}`, sessionToText(cycle, session, profile.settings))
    if (result === 'copied') toast.show('Workout copied to clipboard')
    if (result === 'failed') toast.show('Could not share — try again')
  }

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
                Week {session.week} · Day {session.slot}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSwapping(true)}
              className="mt-0.5 block truncate text-2xl font-bold leading-tight hover:text-brand-400"
            >
              {lift?.label ?? exercise.name}
              {session.mainExerciseId && session.mainExerciseId !== lift?.exerciseId ? (
                <span className="ml-2 align-middle text-xs font-medium text-flame-400">
                  → {exercise.name}
                </span>
              ) : null}
            </button>
            <div className="text-sm text-ink-400">
              {weekSpec.label} · TM{' '}
              <span className="tabular text-ink-300">
                {prescription.trainingMax} {weight.unit}
              </span>
            </div>
          </div>
          <Button size="sm" variant="quiet" onClick={share}>
            Share
          </Button>
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
          <span className="text-ink-300">Rep targets were raised to match the load you're missing.</span>
        </div>
      ) : null}

      {warmups.length > 0 ? (
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setShowWarmups((v) => !v)}
            className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-ink-400"
          >
            <span>Warm-up · {warmups.filter((s) => s.done).length}/{warmups.length}</span>
            <span>{showWarmups ? 'hide' : 'show'}</span>
          </button>
          {showWarmups ? (
            <div className="space-y-1.5">
              {warmups.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  label={cappedMap.get(set.id)?.label ?? 'Warm-up'}
                  perHand={Boolean(exercise.perHand)}
                  showPlates={profile.settings.showPlateMath}
                  barWeight={weight.unit === 'kg' ? profile.settings.barWeight.kg : profile.settings.barWeight.lb}
                  restSeconds={restMap.get(set.id) ?? 60}
                  onPatch={(patch) => patchSet(session.key, set.id, patch)}
                  onDone={onRest}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mb-5">
        <SectionTitle>Main work · {weekSpec.label}</SectionTitle>
        <div className="space-y-1.5">
          {mainSets.map((set) => (
            <div key={set.id}>
              <SetRow
                set={set}
                label={cappedMap.get(set.id)?.label ?? 'Set'}
                perHand={Boolean(exercise.perHand)}
                showPlates={profile.settings.showPlateMath}
                barWeight={weight.unit === 'kg' ? profile.settings.barWeight.kg : profile.settings.barWeight.lb}
                restSeconds={restMap.get(set.id) ?? 180}
                onPatch={(patch) => patchSet(session.key, set.id, patch)}
                onDone={onRest}
              />
              {set.amrap ? (
                <div className="mt-1 px-3 text-xs text-ink-400">
                  <span className="font-semibold text-flame-400">Rep record set</span> — go past {set.targetReps},
                  stop with one clean rep left.
                  {previousBest ? (
                    <span className="tabular ml-1 text-ink-300">
                      Best so far: {weight.full(previousBest.best.weightKg)} × {previousBest.best.reps}.
                    </span>
                  ) : null}
                </div>
              ) : null}
              {cappedMap.get(set.id)?.capped ? (
                <div className="mt-1 px-3 text-xs text-flame-400">
                  Prescribed {cappedMap.get(set.id)?.uncappedWeight} {weight.unit} — capped, so the target rose to{' '}
                  {set.targetReps} reps.
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {session.supplementalSets.length > 0 ? (
        <section className="mb-5">
          <SectionTitle>{prescription.supplementalLabel}</SectionTitle>
          <div className="space-y-1.5">
            {session.supplementalSets.map((set) => (
              <SetRow
                key={set.id}
                set={set}
                label={cappedMap.get(set.id)?.label ?? 'Set'}
                perHand={Boolean(exercise.perHand)}
                showPlates={profile.settings.showPlateMath}
                barWeight={weight.unit === 'kg' ? profile.settings.barWeight.kg : profile.settings.barWeight.lb}
                restSeconds={restMap.get(set.id) ?? 75}
                onPatch={(patch) => patchSet(session.key, set.id, patch)}
                onDone={onRest}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-5">
        <SectionTitle>Accessories</SectionTitle>
        {session.accessories.length === 0 ? (
          <Empty title="No accessories for this day">
            Add them under Plan and they'll show up here every cycle.
          </Empty>
        ) : (
          <div className="space-y-2.5">
            {session.accessories.map((accessory) => (
              <AccessoryCard
                key={accessory.planId}
                accessory={accessory}
                sessionKey={session.key}
                cycles={cycles}
                profile={profile}
                onRest={onRest}
              />
            ))}
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
        open={swapping}
        onClose={() => setSwapping(false)}
        exerciseId={exercise.id}
        currentWeightKg={lift?.trainingMaxKg ?? null}
        title={`Swap ${lift?.label ?? exercise.name}`}
        onPick={(id) => swapMainExercise(session.key, id)}
      />

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Finish workout">
        <p className="text-sm text-ink-300">
          {doneTotal} of {totalCount} sets logged.
          {doneTotal < totalCount ? ' Anything unchecked is recorded as not done.' : ' Everything done — nice.'}
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
