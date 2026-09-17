import { useMemo, useState } from 'react'
import { useToast, useWeight } from '../components/hooks'
import { Button, Card, Empty, Pill, SectionTitle, Sheet, Toast, cx } from '../components/ui'
import { cycleProgress, isCycleComplete, liftFor, mainExerciseId, prescriptionFor } from '../lib/cycle'
import { getExercise } from '../lib/exercises'
import { cycleToText, shareText, weekToText } from '../lib/share'
import { DAY_SLOTS, WEEK_NUMBERS, type Cycle, type Session, type Settings, type WeekNumber } from '../lib/types'
import { useActiveCycle, useApp } from '../state/useApp'

const STATUS_STYLE: Record<Session['status'], string> = {
  pending: 'border-ink-700 bg-ink-800/40 text-ink-300',
  'in-progress': 'border-flame-500 bg-flame-500/15 text-flame-400',
  complete: 'border-brand-600/60 bg-brand-500/15 text-brand-400',
  skipped: 'border-ink-700 bg-ink-900 text-ink-400 line-through',
}

function DayCell({
  cycle,
  session,
  settings,
  onOpen,
}: {
  cycle: Cycle
  session: Session
  settings: Settings
  onOpen: () => void
}) {
  const weight = useWeight()
  const p = useMemo(() => prescriptionFor(cycle, session, settings), [cycle, session, settings])
  const top = p.main[p.main.length - 1]

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition hover:border-ink-400',
        STATUS_STYLE[session.status],
      )}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide">{session.slot}</span>
      <span className="tabular text-sm font-bold leading-none">{top?.weight ?? '—'}</span>
      <span className="text-[9px] uppercase tracking-wide opacity-70">
        {top ? `×${top.reps}${top.amrap ? '+' : ''}` : weight.unit}
      </span>
    </button>
  )
}

function WeekDetail({ cycle, week, settings }: { cycle: Cycle; week: WeekNumber; settings: Settings }) {
  const weight = useWeight()
  const weekSpec = cycle.template.weeks[week - 1]

  return (
    <div className="space-y-2">
      {DAY_SLOTS.map((slot) => {
        const session = cycle.sessions[`w${week}${slot}`]
        if (!session) return null
        const lift = liftFor(cycle, slot)
        const exercise = getExercise(mainExerciseId(cycle, session))
        const p = prescriptionFor(cycle, session, settings)
        const accessories = (cycle.accessoryPlan[slot] ?? []).filter((a) => a.active)

        return (
          <Card key={slot} className="print-page p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-semibold">
                <span className="text-ink-400">Day {slot} · </span>
                {lift?.label ?? exercise.name}
              </h4>
              <span className="text-xs text-ink-400">
                TM <span className="tabular">{p.trainingMax}</span> {weight.unit}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.main.map((set) => (
                <span
                  key={set.id}
                  className={cx(
                    'tabular rounded-lg px-2 py-1 text-sm',
                    set.amrap ? 'bg-flame-500/15 font-bold text-flame-400' : 'bg-ink-800',
                  )}
                >
                  {set.weight ?? 'BW'} × {set.reps}
                  {set.amrap ? '+' : ''}
                </span>
              ))}
            </div>

            {p.supplemental.length > 0 ? (
              <div className="mt-1.5 text-xs text-ink-300">
                <span className="text-ink-400">{cycle.template.supplemental.label}: </span>
                <span className="tabular">
                  {p.supplemental[0].weight ?? 'BW'} × {p.supplemental[0].reps}
                  {p.supplemental[0].amrap ? '+' : ''} × {p.supplemental.length} sets
                </span>
              </div>
            ) : null}

            {!weekSpec.isDeload && accessories.length > 0 ? (
              <ul className="mt-2 space-y-0.5 border-t border-ink-700/60 pt-2 text-xs text-ink-300">
                {accessories.map((item) => {
                  const ex = getExercise(item.exerciseId)
                  return (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="truncate">{ex.name}</span>
                      <span className="tabular shrink-0 text-ink-400">
                        {item.sets} × {item.targetReps}
                        {item.targetWeightKg !== null
                          ? ` @ ${weight.textFor(item.targetWeightKg, ex.equipment)}`
                          : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}

/** Full cycle on one page — for printing or screenshotting. */
function PrintView({ cycle, settings }: { cycle: Cycle; settings: Settings }) {
  const weight = useWeight()
  return (
    <div className="space-y-5">
      <div className="border-b border-ink-700 pb-3">
        <h1 className="text-xl font-bold">{cycle.name}</h1>
        <p className="text-sm text-ink-400">
          {cycle.template.name} · training max {Math.round(cycle.tmPercent * 100)}% · started{' '}
          {new Date(cycle.startDate).toLocaleDateString()}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {cycle.lifts.map((lift) => (
            <span key={lift.slot}>
              <span className="text-ink-400">{lift.slot}</span> {lift.label ?? getExercise(lift.exerciseId).name}{' '}
              <span className="tabular font-semibold">
                {weight.fullFor(lift.trainingMaxKg, getExercise(lift.exerciseId).equipment)}
              </span>
            </span>
          ))}
        </div>
      </div>
      {WEEK_NUMBERS.map((week) => (
        <section key={week} className="print-page">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-ink-400">
            Week {week} — {cycle.template.weeks[week - 1].label}
          </h2>
          <WeekDetail cycle={cycle} week={week} settings={settings} />
        </section>
      ))}
    </div>
  )
}

export function CycleScreen() {
  const cycle = useActiveCycle()
  const profile = useApp((s) => s.profile)
  const openSession = useApp((s) => s.openSession)
  const startCycle = useApp((s) => s.startCycle)
  const weight = useWeight()
  const toast = useToast()
  const [week, setWeek] = useState<WeekNumber>(1)
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)

  if (!cycle || !profile) {
    return (
      <div className="pt-6">
        <Empty title="No cycle yet">
          <Button variant="primary" className="mt-3" onClick={() => startCycle()}>
            Start your first cycle
          </Button>
        </Empty>
      </div>
    )
  }

  const settings = profile.settings
  const progress = cycleProgress(cycle)
  const complete = isCycleComplete(cycle)

  const doShare = async (text: string, label: string) => {
    const result = await shareText(cycle.name, text)
    if (result === 'copied') toast.show(`${label} copied to clipboard`)
    if (result === 'failed') toast.show('Could not share — try again')
    setSharing(false)
  }

  if (printing) {
    return (
      <div className="pb-24">
        <div className="mb-4 flex gap-2 print-hide">
          <Button onClick={() => setPrinting(false)}>← Back</Button>
          <Button variant="primary" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
        <PrintView cycle={cycle} settings={settings} />
      </div>
    )
  }

  return (
    <div className="pb-24">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{cycle.name}</h1>
          <p className="text-sm text-ink-400">
            {cycle.template.name} · {progress.completed}/{progress.total} days
          </p>
        </div>
        <Button size="sm" onClick={() => setSharing(true)}>
          Share
        </Button>
      </header>

      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress.percent * 100}%` }} />
      </div>

      <SectionTitle>The month</SectionTitle>
      <Card className="mb-5 p-3">
        <div className="mb-2 grid grid-cols-[2.5rem_repeat(4,1fr)] gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          <span />
          {DAY_SLOTS.map((slot) => {
            const lift = liftFor(cycle, slot)
            return (
              <span key={slot} className="truncate">
                {(lift?.label ?? getExercise(lift?.exerciseId ?? '').name).split(' ')[0]}
              </span>
            )
          })}
        </div>
        <div className="space-y-1.5">
          {WEEK_NUMBERS.map((w) => (
            <div key={w} className="grid grid-cols-[2.5rem_repeat(4,1fr)] items-stretch gap-1.5">
              <button
                type="button"
                onClick={() => setWeek(w)}
                className={cx(
                  'flex flex-col items-center justify-center rounded-lg text-[10px] font-bold uppercase',
                  week === w ? 'bg-ink-700 text-ink-100' : 'text-ink-400',
                )}
              >
                <span>W{w}</span>
                <span className="text-[8px] font-medium opacity-70">
                  {cycle.template.weeks[w - 1].isDeload ? 'deload' : cycle.template.weeks[w - 1].label}
                </span>
              </button>
              {DAY_SLOTS.map((slot) => {
                const session = cycle.sessions[`w${w}${slot}`]
                if (!session) return <span key={slot} />
                return (
                  <DayCell
                    key={slot}
                    cycle={cycle}
                    session={session}
                    settings={settings}
                    onOpen={() => openSession(session.key)}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-400">
          Top set shown · weights in {weight.unit} · tap any day to open it
        </p>
      </Card>

      <SectionTitle
        action={
          <Button size="sm" variant="quiet" onClick={() => setPrinting(true)}>
            Print view
          </Button>
        }
      >
        Week {week} detail
      </SectionTitle>
      <div className="mb-3 flex gap-1.5">
        {WEEK_NUMBERS.map((w) => (
          <Pill key={w} active={week === w} onClick={() => setWeek(w)}>
            Week {w}
          </Pill>
        ))}
      </div>
      <WeekDetail cycle={cycle} week={week} settings={settings} />

      {complete ? (
        <Card className="mt-5 border-brand-600/50 bg-brand-500/10 p-4 text-center">
          <p className="font-semibold text-brand-400">Cycle complete.</p>
          <p className="mt-1 text-sm text-ink-300">
            Head to Lifts to review your rep records and set next cycle's training maxes.
          </p>
        </Card>
      ) : null}

      <Sheet open={sharing} onClose={() => setSharing(false)} title="Share">
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => doShare(weekToText(cycle, week, settings), `Week ${week}`)}
          >
            Week {week} — all four days
          </Button>
          <Button size="lg" className="w-full" onClick={() => doShare(cycleToText(cycle, settings), 'Cycle')}>
            The whole cycle
          </Button>
          <Button
            size="lg"
            variant="primary"
            className="w-full"
            onClick={() => {
              setSharing(false)
              setPrinting(true)
            }}
          >
            Open print view
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Text shares paste cleanly into a message. The print view is better for a PDF or a screenshot.
        </p>
      </Sheet>

      <Toast message={toast.message} />
    </div>
  )
}
