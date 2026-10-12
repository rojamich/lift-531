import { useWeight } from '../components/hooks'
import { NumberField, cx } from '../components/ui'
import type { LoggedSet } from '../lib/types'
import { describePlates, platesFor } from '../lib/units'

export function NumberCell({
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

export function SetRow({
  set,
  label,
  liftName,
  restSeconds,
  perHand,
  showPlates,
  barWeight,
  onPatch,
  onDone,
}: {
  set: LoggedSet
  label: string
  /**
   * Names the lift in the accessibility labels. Two lifts on one day both have a
   * "Set 1", so without it a screen reader cannot tell them apart.
   */
  liftName?: string
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

  /* "Set 1" alone is ambiguous on a day that holds two main lifts. */
  const spoken = liftName ? `${liftName} ${label}` : label

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
        aria-label={set.done ? `Mark ${spoken} not done` : `Mark ${spoken} done`}
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
              ariaLabel={`${spoken} weight`}
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
          ariaLabel={`${spoken} reps`}
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

