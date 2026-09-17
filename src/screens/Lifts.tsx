import { useMemo, useState } from 'react'
import { ExerciseSwap } from '../components/ExerciseSwap'
import { useToast, useWeight } from '../components/hooks'
import { Button, Card, Empty, Field, NumberField, Pill, SectionTitle, Sheet, Stat, Toast, cx } from '../components/ui'
import { contextFor, isCycleComplete } from '../lib/cycle'
import { trainingMaxFromEstimate } from '../lib/engine'
import { getExercise } from '../lib/exercises'
import { personalBest, reviewCycle, type LiftReview } from '../lib/progression'
import type { DaySlot, Lift, LiftCategory } from '../lib/types'
import { useActiveCycle, useApp } from '../state/useApp'

function LiftEditor({ lift }: { lift: Lift }) {
  const profile = useApp((s) => s.profile)!
  const setLifts = useApp((s) => s.setLifts)
  const weight = useWeight()
  const [swapping, setSwapping] = useState(false)

  const exercise = getExercise(lift.exerciseId, profile.customExercises)
  const ctx = contextFor(profile.settings)
  const trainingMaxKg = trainingMaxFromEstimate(lift.est1RMKg, profile.settings.tmPercent, exercise.equipment, ctx)

  const patch = (next: Partial<Lift>) =>
    setLifts(profile.lifts.map((l) => (l.slot === lift.slot ? { ...l, ...next } : l)))

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Day {lift.slot}</div>
          <button
            type="button"
            onClick={() => setSwapping(true)}
            className="block truncate text-left text-lg font-semibold hover:text-brand-400"
          >
            {lift.label ?? exercise.name}
            <span className="ml-1.5 text-xs font-normal text-ink-400">change</span>
          </button>
        </div>
        <div className="flex gap-1">
          {(['upper', 'lower'] as LiftCategory[]).map((category) => (
            <Pill key={category} active={lift.category === category} onClick={() => patch({ category })}>
              {category}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label={`Estimated 1RM (${weight.unit})`}>
          <NumberField
            ariaLabel={`${lift.label ?? exercise.name} estimated one rep max`}
            value={weight.show(lift.est1RMKg)}
            format={(n) => Math.round(n * 100) / 100}
            onChange={(next) => patch({ est1RMKg: weight.toKg(next ?? 0) })}
            className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-lg font-bold outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </Field>
        <Stat
          label={`Training max · ${Math.round(profile.settings.tmPercent * 100)}%`}
          value={weight.fullFor(trainingMaxKg, exercise.equipment)}
          sub={exercise.perHand ? 'per hand' : undefined}
        />
      </div>

      <ExerciseSwap
        open={swapping}
        onClose={() => setSwapping(false)}
        exerciseId={lift.exerciseId}
        currentWeightKg={lift.est1RMKg}
        title={`Day ${lift.slot} main lift`}
        onPick={(id, converted) =>
          patch({
            exerciseId: id,
            label: getExercise(id, profile.customExercises).name,
            est1RMKg: converted ?? lift.est1RMKg,
          })
        }
      />
    </Card>
  )
}

type Choice = 'standard' | 'amrap' | 'keep' | 'manual'

function ReviewRow({
  review,
  choice,
  manualKg,
  onChoice,
  onManual,
}: {
  review: LiftReview
  choice: Choice
  manualKg: number
  onChoice: (choice: Choice) => void
  onManual: (kg: number) => void
}) {
  const weight = useWeight()
  const equipment = getExercise(review.exerciseId).equipment
  const verdictStyle =
    review.verdict === 'reset'
      ? 'text-red-300'
      : review.verdict === 'hold'
        ? 'text-flame-400'
        : 'text-brand-400'

  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold">
          <span className="text-ink-400">Day {review.slot} · </span>
          {review.label}
        </h4>
        <span className={cx('text-xs font-bold uppercase tracking-wide', verdictStyle)}>{review.verdict}</span>
      </div>

      <p className="mt-1 text-xs text-ink-400">{review.rationale}</p>

      {review.best ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat
            label="Best set"
            value={`${weight.text(review.best.weightKg)}×${review.best.reps}`}
            sub={`week ${review.best.week}`}
          />
          <Stat label="Est. 1RM" value={weight.text(review.estimatedOneRepMaxKg ?? 0)} sub={weight.unit} />
          <Stat label="Current TM" value={weight.textFor(review.currentTrainingMaxKg, equipment)} sub={weight.unit} />
        </div>
      ) : (
        <div className="mt-2">
          <Stat label="Current training max" value={weight.fullFor(review.currentTrainingMaxKg, equipment)} />
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
          Next cycle's training max
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={choice === 'standard'} onClick={() => onChoice('standard')}>
            {review.verdict === 'reset' ? 'Reset' : review.verdict === 'hold' ? 'Hold' : 'Standard'} ·{' '}
            {weight.textFor(review.incrementTrainingMaxKg, equipment)}
          </Pill>
          {review.amrapTrainingMaxKg !== null ? (
            <Pill active={choice === 'amrap'} onClick={() => onChoice('amrap')}>
              From AMRAP · {weight.textFor(review.amrapTrainingMaxKg, equipment)}
            </Pill>
          ) : null}
          <Pill active={choice === 'keep'} onClick={() => onChoice('keep')}>
            Keep · {weight.textFor(review.currentTrainingMaxKg, equipment)}
          </Pill>
          <Pill active={choice === 'manual'} onClick={() => onChoice('manual')}>
            Type it
          </Pill>
        </div>
        {choice === 'manual' ? (
          <NumberField
            ariaLabel={`${review.label} training max`}
            className="tabular mt-2 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-lg font-bold outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            value={weight.show(manualKg)}
            format={(n) => Math.round(n * 100) / 100}
            onChange={(next) => onManual(weight.toKg(next ?? 0))}
          />
        ) : null}
      </div>
    </Card>
  )
}

function CycleReview({ onClose }: { onClose: () => void }) {
  const cycle = useActiveCycle()!
  const profile = useApp((s) => s.profile)!
  const finishCycle = useApp((s) => s.finishCycle)
  const weight = useWeight()

  const reviews = useMemo(
    () => reviewCycle(cycle, profile.settings, contextFor(profile.settings)),
    [cycle, profile.settings],
  )

  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(reviews.map((r) => [r.slot, 'standard' as Choice])),
  )
  const [manual, setManual] = useState<Record<string, number>>(() =>
    Object.fromEntries(reviews.map((r) => [r.slot, r.incrementTrainingMaxKg])),
  )

  const resolve = (review: LiftReview): number => {
    switch (choices[review.slot]) {
      case 'amrap':
        return review.amrapTrainingMaxKg ?? review.incrementTrainingMaxKg
      case 'keep':
        return review.currentTrainingMaxKg
      case 'manual':
        return manual[review.slot]
      default:
        return review.incrementTrainingMaxKg
    }
  }

  const start = () => {
    const maxes: Partial<Record<DaySlot, number>> = {}
    for (const review of reviews) maxes[review.slot] = resolve(review)
    finishCycle(maxes)
    onClose()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-300">
        Pick a training max for each lift, then start the next cycle. Standard is Wendler's flat jump; From AMRAP
        is the estimate your spreadsheet used.
      </p>
      {reviews.map((review) => (
        <ReviewRow
          key={review.slot}
          review={review}
          choice={choices[review.slot] ?? 'standard'}
          manualKg={manual[review.slot] ?? review.incrementTrainingMaxKg}
          onChoice={(choice) => setChoices((prev) => ({ ...prev, [review.slot]: choice }))}
          onManual={(kg) => setManual((prev) => ({ ...prev, [review.slot]: kg }))}
        />
      ))}
      <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm">
        <div className="mb-1.5 font-semibold">Cycle {cycle.number + 1} starts with</div>
        <ul className="space-y-0.5 text-ink-300">
          {reviews.map((review) => (
            <li key={review.slot} className="flex justify-between">
              <span>{review.label}</span>
              <span className="tabular font-semibold">
                {weight.fullFor(resolve(review), getExercise(review.exerciseId).equipment)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={start}>
        Start cycle {cycle.number + 1}
      </Button>
      <p className="text-center text-xs text-ink-400">
        Your accessory plan carries over — edit it any time under Plan.
      </p>
    </div>
  )
}

export function LiftsScreen() {
  const profile = useApp((s) => s.profile)
  const cycles = useApp((s) => s.cycles)
  const cycle = useActiveCycle()
  const startCycle = useApp((s) => s.startCycle)
  const weight = useWeight()
  const toast = useToast()
  const [reviewing, setReviewing] = useState(false)

  if (!profile) return null

  const complete = cycle ? isCycleComplete(cycle) : false
  const history = profile.lifts.map((lift) => ({
    lift,
    best: personalBest(cycles, lift.exerciseId),
  }))

  return (
    <div className="pb-24">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Lifts</h1>
        <p className="text-sm text-ink-400">
          Training max is {Math.round(profile.settings.tmPercent * 100)}% of your estimated max — change that
          under Settings.
        </p>
      </header>

      {cycle ? (
        <Card
          className={cx(
            'mb-5 p-4',
            complete ? 'border-brand-600/50 bg-brand-500/10' : 'border-ink-700',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{complete ? 'Cycle complete' : cycle.name}</div>
              <div className="text-xs text-ink-400">
                {complete
                  ? 'Review your rep records and set the next training maxes.'
                  : 'Finish the cycle to get progression suggestions.'}
              </div>
            </div>
            <Button variant={complete ? 'primary' : 'ghost'} size="sm" onClick={() => setReviewing(true)}>
              Review
            </Button>
          </div>
        </Card>
      ) : (
        <Empty title="No cycle running">
          <Button variant="primary" className="mt-3" onClick={() => startCycle()}>
            Start a cycle
          </Button>
        </Empty>
      )}

      <SectionTitle>Main lifts</SectionTitle>
      <div className="space-y-2.5">
        {profile.lifts.map((lift) => (
          <LiftEditor key={lift.slot} lift={lift} />
        ))}
      </div>
      {cycle ? (
        <p className="mt-2 text-xs text-ink-400">
          Editing a max here affects the <em>next</em> cycle. The running cycle keeps the numbers it started with,
          so this week's weights never shift under you.
        </p>
      ) : null}

      <SectionTitle>Records</SectionTitle>
      <Card className="divide-y divide-ink-700/60">
        {history.map(({ lift, best }) => {
          const exercise = getExercise(lift.exerciseId, profile.customExercises)
          return (
            <div key={lift.slot} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{lift.label ?? exercise.name}</div>
                <div className="text-xs text-ink-400">
                  {best ? new Date(best.date).toLocaleDateString() : 'no logged sets yet'}
                </div>
              </div>
              <div className="tabular shrink-0 text-right">
                {best ? (
                  <>
                    <div className="font-bold">
                      {weight.text(best.weightKg)} × {best.reps}
                    </div>
                    <div className="text-xs text-ink-400">
                      ≈ {weight.full(best.weightKg * (1 + best.reps / 30))} max
                    </div>
                  </>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </div>
            </div>
          )
        })}
      </Card>

      <Sheet open={reviewing} onClose={() => setReviewing(false)} title={`Review ${cycle?.name ?? 'cycle'}`}>
        {cycle ? <CycleReview onClose={() => { setReviewing(false); toast.show('New cycle started') }} /> : null}
      </Sheet>

      <Toast message={toast.message} />
    </div>
  )
}
