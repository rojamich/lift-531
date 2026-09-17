import { useMemo, useState } from 'react'
import { useWeight } from '../components/hooks'
import { Button, Card, Empty, SectionTitle, Stat, cx } from '../components/ui'
import {
  cycleMaxDrift,
  cycleProgress,
  isCycleComplete,
  liftFor,
  mainExerciseId,
  nextSession,
  prescriptionFor,
} from '../lib/cycle'
import { getExercise } from '../lib/exercises'
import type { Cycle, Session } from '../lib/types'
import { useActiveCycle, useApp } from '../state/useApp'
import { SessionScreen } from './Session'

/**
 * Frozen training maxes mean an edited max does nothing until the next cycle,
 * which is invisible right up until you are standing at the bar with the wrong
 * number. Say so, and offer the one-tap fix.
 */
function StaleMaxBanner({ cycle }: { cycle: Cycle }) {
  const profile = useApp((s) => s.profile)!
  const refreshFromMaxes = useApp((s) => s.refreshFromMaxes)
  const weight = useWeight()
  const [done, setDone] = useState(false)

  const drift = useMemo(() => cycleMaxDrift(cycle, profile), [cycle, profile])
  if (drift.length === 0 || done) return null

  return (
    <Card className="mb-3 border-flame-500/50 bg-flame-500/10 p-3">
      <p className="text-sm font-semibold text-flame-400">This cycle is using older training maxes</p>
      <p className="mt-1 text-xs text-ink-300">
        A cycle keeps the maxes it started with so weights never shift mid-week. You've changed{' '}
        {drift.length === 1 ? 'a max' : `${drift.length} maxes`} since then.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {drift.map((item) => (
          <li key={item.slot} className="flex justify-between gap-2">
            <span className="truncate text-ink-300">{item.label}</span>
            <span className="tabular shrink-0">
              <span className="text-ink-400">{weight.text(item.fromKg)}</span>
              <span className="text-ink-400"> → </span>
              <span className="font-semibold text-flame-400">{weight.full(item.toKg)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={() => {
            refreshFromMaxes()
            setDone(true)
          }}
        >
          Update remaining days
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setDone(true)}>
          Keep as is
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        Days you've already logged are left exactly as they were.
      </p>
    </Card>
  )
}

function UpNext({ cycle, session }: { cycle: Cycle; session: Session }) {
  const profile = useApp((s) => s.profile)!
  const openSession = useApp((s) => s.openSession)
  const weight = useWeight()

  const prescription = useMemo(
    () => prescriptionFor(cycle, session, profile.settings),
    [cycle, session, profile.settings],
  )
  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session), profile.customExercises)
  const weekSpec = cycle.template.weeks[session.week - 1]
  const accessories = (cycle.accessoryPlan[session.slot] ?? []).filter((a) => a.active)

  return (
    <Card className="overflow-hidden border-brand-600/40">
      <div className="bg-brand-500/10 px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
          {session.status === 'in-progress' ? 'Pick up where you left off' : 'Up next'}
        </div>
        <h2 className="mt-0.5 text-2xl font-bold leading-tight">{lift?.label ?? exercise.name}</h2>
        <p className="text-sm text-ink-300">
          Week {session.week} · Day {session.slot} · {weekSpec.label}
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {prescription.main.map((set) => (
            <span
              key={set.id}
              className={cx(
                'tabular rounded-lg px-2.5 py-1.5 text-sm font-semibold',
                set.amrap ? 'bg-flame-500/15 text-flame-400' : 'bg-ink-800 text-ink-100',
              )}
            >
              {set.weight ?? 'BW'}
              <span className="text-xs font-normal text-ink-400">
                {set.weight !== null ? ` ${weight.unit}` : ''} ×
              </span>
              {set.reps}
              {set.amrap ? '+' : ''}
            </span>
          ))}
        </div>

        {prescription.supplemental.length > 0 ? (
          <p className="mt-2 text-xs text-ink-400">
            then {prescription.supplementalLabel} —{' '}
            <span className="tabular text-ink-300">
              {prescription.supplemental[0].weight ?? 'BW'} {weight.unit}
            </span>
          </p>
        ) : null}

        {accessories.length > 0 ? (
          <p className="mt-1 truncate text-xs text-ink-400">
            plus {accessories.map((a) => getExercise(a.exerciseId).name).join(', ')}
          </p>
        ) : null}

        <Button variant="primary" size="lg" className="mt-3 w-full" onClick={() => openSession(session.key)}>
          {session.status === 'in-progress' ? 'Continue workout' : 'Start workout'}
        </Button>
      </div>
    </Card>
  )
}

export function HomeScreen() {
  const profile = useApp((s) => s.profile)
  const cycles = useApp((s) => s.cycles)
  const cycle = useActiveCycle()
  const openKey = useApp((s) => s.openSessionKey)
  const openSession = useApp((s) => s.openSession)
  const startCycle = useApp((s) => s.startCycle)
  const weight = useWeight()

  const open = cycle && openKey ? cycle.sessions[openKey] : null
  const next = cycle ? nextSession(cycle) : null

  if (cycle && open) return <SessionScreen cycle={cycle} session={open} />
  if (!profile) return null

  if (!cycle) {
    return (
      <div className="pt-6">
        <Empty title="No cycle running">
          Set your maxes under Lifts, then start a cycle.
          <div className="mt-3">
            <Button variant="primary" onClick={() => startCycle()}>
              Start cycle 1
            </Button>
          </div>
        </Empty>
      </div>
    )
  }

  const progress = cycleProgress(cycle)
  const complete = isCycleComplete(cycle)
  const recent = cycles
    .flatMap((c) => Object.values(c.sessions).map((s) => ({ cycle: c, session: s })))
    .filter((entry) => entry.session.status === 'complete')
    .sort((a, b) => (b.session.completedDate ?? '').localeCompare(a.session.completedDate ?? ''))
    .slice(0, 4)

  return (
    <div className="pb-24">
      <header className="mb-4">
        <p className="text-sm text-ink-400">
          {profile.displayName} · {cycle.name}
        </p>
        <h1 className="text-2xl font-bold">
          {complete ? 'Cycle done' : `Week ${next?.week ?? 1}`}
        </h1>
      </header>

      <StaleMaxBanner cycle={cycle} />

      {complete || !next ? (
        <Card className="border-brand-600/50 bg-brand-500/10 p-4">
          <h2 className="text-lg font-bold text-brand-400">All sixteen days logged.</h2>
          <p className="mt-1 text-sm text-ink-300">
            Open Lifts to review your rep records and roll into the next cycle.
          </p>
        </Card>
      ) : (
        <UpNext cycle={cycle} session={next} />
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Cycle" value={`${cycle.number}`} sub={cycle.template.name.split('+')[0].trim()} />
        <Stat label="Days done" value={`${progress.completed}/${progress.total}`} />
        <Stat label="Units" value={weight.unit} sub={`TM ${Math.round(cycle.tmPercent * 100)}%`} />
      </div>

      <SectionTitle>This week</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {(['A', 'B', 'C', 'D'] as const).map((slot) => {
          const week = next?.week ?? 4
          const session = cycle.sessions[`w${week}${slot}`]
          if (!session) return <span key={slot} />
          const lift = liftFor(cycle, slot)
          const isNext = session.key === next?.key
          return (
            <button
              key={slot}
              type="button"
              onClick={() => openSession(session.key)}
              className={cx(
                'rounded-xl border px-2 py-2.5 text-left transition',
                session.status === 'complete'
                  ? 'border-brand-600/50 bg-brand-500/10'
                  : isNext
                    ? 'border-brand-500 bg-ink-800'
                    : 'border-ink-700 bg-ink-800/40',
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Day {slot}</div>
              <div className="truncate text-xs font-semibold">
                {(lift?.label ?? '').split(' ').slice(0, 2).join(' ')}
              </div>
              <div className="mt-0.5 text-[10px] text-ink-400">
                {session.status === 'complete' ? 'done' : session.status === 'skipped' ? 'skipped' : 'to do'}
              </div>
            </button>
          )
        })}
      </div>

      {recent.length > 0 ? (
        <>
          <SectionTitle>Recent</SectionTitle>
          <Card className="divide-y divide-ink-700/60">
            {recent.map(({ cycle: c, session }) => {
              const lift = liftFor(c, session.slot)
              const top = session.mainSets.find((s) => s.amrap && s.done)
              return (
                <div key={`${c.id}-${session.key}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{lift?.label ?? `Day ${session.slot}`}</div>
                    <div className="text-xs text-ink-400">
                      {c.name} · week {session.week} ·{' '}
                      {session.completedDate ? new Date(session.completedDate).toLocaleDateString() : ''}
                    </div>
                  </div>
                  {top ? (
                    <div className="tabular shrink-0 text-right text-sm font-semibold">
                      {weight.text(top.actualWeightKg)} × {top.actualReps}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </Card>
        </>
      ) : null}
    </div>
  )
}
