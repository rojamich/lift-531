import { useWeight } from '../components/hooks'
import { cx } from '../components/ui'
import { cycleSlots } from '../lib/cycle'
import {
  buildSessionView,
  stateLabel,
  type AccessoryRow,
  type LiftView,
  type SetRow,
  type SessionView,
} from '../lib/sessionView'
import { WEEK_NUMBERS, type Cycle, type Profile } from '../lib/types'
import { formatNumber } from '../lib/units'

/**
 * The printable record of a cycle.
 *
 * Built on the same resolver as the text export, so it reports what was actually
 * done rather than the prescription — it previously rendered the plan for every
 * week, which read as a record of four identical weeks that never happened.
 *
 * Carries no meaning in colour. A sheet of paper, or a photo of one, has to say
 * what was done in glyphs and weight: ✓ for a completed set, ★ for a rep record
 * beaten, and an explicit "planned" for anything not trained.
 */
const num = (value: number | null, unit: string, perHand: boolean) =>
  value === null ? 'BW' : `${formatNumber(value)} ${unit}${perHand ? '/hand' : ''}`

function SetLine({ row, unit }: { row: SetRow; unit: string }) {
  return (
    <tr className={cx(!row.done && 'text-ink-400')}>
      <td className="py-0.5 pr-2 align-top text-[11px] uppercase tracking-wide">{row.label}</td>
      <td className="tabular py-0.5 pr-2 text-right align-top font-semibold">
        {num(row.weight, unit, row.perHand)}
      </td>
      <td className="tabular py-0.5 pr-2 text-right align-top">
        {row.reps}
        {!row.done && row.amrap ? '+' : ''}
        {row.done && row.targetReps !== row.reps ? (
          <span className="text-ink-400"> /{row.targetReps}</span>
        ) : null}
      </td>
      <td className="py-0.5 align-top text-[11px]">
        {row.done ? (row.beatTarget ? '✓ ★' : '✓') : 'planned'}
      </td>
    </tr>
  )
}

function AccessoryLine({ row, unit }: { row: AccessoryRow; unit: string }) {
  return (
    <tr className={cx(!row.done && 'text-ink-400')}>
      <td className="py-0.5 pr-2 align-top">
        {row.name}
        {row.swapped ? <span className="text-[11px] text-ink-400"> (swapped)</span> : null}
      </td>
      <td className="tabular py-0.5 pr-2 text-right align-top font-semibold">
        {row.skipped ? '—' : num(row.weight, unit, row.perHand)}
      </td>
      <td className="tabular py-0.5 pr-2 text-right align-top">
        {row.skipped ? '' : row.done ? row.reps.join(' / ') : `${row.plannedSets} × ${row.targetReps}`}
      </td>
      <td className="py-0.5 align-top text-[11px]">
        {row.skipped ? 'skipped' : row.done ? '✓' : 'planned'}
      </td>
    </tr>
  )
}

function LiftLines({ lift, named, unit }: { lift: LiftView; named: boolean; unit: string }) {
  return (
    <div className="mt-1">
      {/* On a combined day each lift needs its own name and training max. */}
      {named ? (
        <p className="tabular text-xs font-semibold">
          {lift.label}
          {lift.swappedTo ? <span className="font-normal"> as {lift.swappedTo}</span> : null}
          <span className="font-normal text-ink-400">
            {' '}
            · TM {formatNumber(lift.trainingMax)} {unit}
          </span>
        </p>
      ) : null}

      <table className="w-full text-xs">
        <tbody>
          {[...lift.warmups, ...lift.main].map((row) => (
            <SetLine key={row.label} row={row} unit={unit} />
          ))}
        </tbody>
      </table>

      {lift.supplemental.length > 0 ? (
        <p className="tabular mt-1 text-xs">
          <span className="font-semibold">{lift.supplementalLabel.split('·')[0].trim()}:</span>{' '}
          {lift.supplementalSummary
            ? `${num(lift.supplementalSummary.weight, unit, lift.supplemental[0].perHand)} × ${lift.supplementalSummary.reps.join(' / ')}` +
              (lift.supplementalSummary.reps.length < lift.supplementalSummary.of
                ? ` (${lift.supplementalSummary.reps.length} of ${lift.supplementalSummary.of})`
                : ' ✓')
            : `${num(lift.supplemental[0].weight, unit, lift.supplemental[0].perHand)} × ${lift.supplemental[0].reps} × ${lift.supplemental.length} sets — planned`}
        </p>
      ) : null}
    </div>
  )
}

function DayBlock({ view, unit }: { view: SessionView; unit: string }) {
  const combined = view.lifts.length > 1
  return (
    <section className="print-page mb-3 break-inside-avoid border-t border-ink-700 pt-2">
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">
        <span>
          {view.dayLabel} — {view.liftLabel}
        </span>
        {!combined && view.lifts[0].swappedTo ? (
          <span className="text-xs font-normal">as {view.lifts[0].swappedTo}</span>
        ) : null}
        <span className="tabular text-xs font-normal text-ink-400">
          {combined ? '' : `TM ${formatNumber(view.lifts[0].trainingMax)} ${unit} · `}
          {stateLabel(view)}
        </span>
      </h3>

      {view.state === 'skipped' ? (
        <p className="mt-1 text-xs text-ink-400">Not trained.</p>
      ) : (
        <>
          {view.lifts.map((lift) => (
            <LiftLines key={lift.ordinal} lift={lift} named={combined} unit={unit} />
          ))}

          {view.accessories.length > 0 ? (
            <table className="mt-1.5 w-full text-xs">
              <tbody>
                {view.accessories.map((row, index) => (
                  <AccessoryLine key={`${row.name}-${index}`} row={row} unit={unit} />
                ))}
              </tbody>
            </table>
          ) : null}

          {view.notes.trim() ? (
            <p className="mt-1 text-xs italic text-ink-300">{view.notes.trim()}</p>
          ) : null}
        </>
      )}
    </section>
  )
}

export function CyclePrint({ cycle, profile }: { cycle: Cycle; profile: Profile }) {
  const weight = useWeight()
  const unit = weight.unit
  const slots = cycleSlots(cycle)
  const sessions = Object.values(cycle.sessions)
  const trained = sessions.filter((s) => s.status === 'complete')
  const dates = trained
    .map((s) => s.completedDate)
    .filter((d): d is string => Boolean(d))
    .sort()
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <div>
      <header className="mb-3 border-b-2 border-ink-600 pb-2">
        <h1 className="text-xl font-bold">{cycle.name}</h1>
        <p className="text-xs text-ink-400">
          {cycle.template.name} · training max {Math.round(cycle.tmPercent * 100)}% ·{' '}
          {trained.length} of {sessions.length} days trained
          {dates.length > 0 ? ` · ${day(dates[0])} – ${day(dates[dates.length - 1])}` : ''}
        </p>
        <p className="tabular mt-1 flex flex-wrap gap-x-3 text-xs">
          {cycle.lifts.map((lift) => (
            <span key={`${lift.slot}-${lift.exerciseId}`}>
              <span className="text-ink-400">
                {lift.slot}
                {cycle.dayNames?.[lift.slot] ? ` ${cycle.dayNames[lift.slot]}` : ''}
              </span>{' '}
              {lift.label ?? lift.exerciseId}{' '}
              <span className="font-semibold">{weight.full(lift.trainingMaxKg)}</span>
            </span>
          ))}
        </p>
        <p className="mt-1 text-[11px] text-ink-400">
          ✓ completed · ★ rep record beaten · “planned” means not trained
        </p>
      </header>

      {WEEK_NUMBERS.map((week) => (
        <div key={week} className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
            Week {week} — {cycle.template.weeks[week - 1].label}
          </h2>
          {slots.map((slot) => {
            const session = cycle.sessions[`w${week}${slot}`]
            if (!session) return null
            return (
              <DayBlock
                key={slot}
                view={buildSessionView(cycle, session, profile.settings, profile.customExercises)}
                unit={unit}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
