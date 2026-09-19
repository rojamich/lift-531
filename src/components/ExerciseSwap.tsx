import { useMemo, useState } from 'react'
import { useWeight } from './hooks'
import { Button, Input, Pill, Sheet, cx } from './ui'
import {
  allExercises,
  alternatesFor,
  convertLoad,
  EQUIPMENT_LABELS,
  getExercise,
  PATTERN_LABELS,
} from '../lib/exercises'
import type { Equipment, Exercise } from '../lib/types'
import { useApp } from '../state/useApp'

interface Props {
  open: boolean
  onClose: () => void
  exerciseId: string
  /** Current load, so the sheet can show what each alternate would become. */
  currentWeightKg?: number | null
  title?: string
  /** What the plan asked for, when the day is running on a substitute. */
  plannedExerciseId?: string
  onPick: (exerciseId: string, convertedWeightKg: number | null) => void
}

/** Stable empty list — a fresh `[]` each render would defeat the memo below. */
const NO_EQUIPMENT: Equipment[] = []

export function ExerciseSwap({
  open,
  onClose,
  exerciseId,
  currentWeightKg,
  title,
  plannedExerciseId,
  onPick,
}: Props) {
  const settings = useApp((s) => s.profile?.settings)
  const custom = useApp((s) => s.profile?.customExercises ?? [])
  const weight = useWeight()
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState(false)

  const source = getExercise(exerciseId, custom)
  const available = settings?.availableEquipment ?? NO_EQUIPMENT

  const suggestions = useMemo(
    () => alternatesFor(exerciseId, available, custom),
    [exerciseId, available, custom],
  )

  const library = useMemo(() => {
    const term = query.trim().toLowerCase()
    return allExercises(custom).filter(
      (e) =>
        e.id !== exerciseId &&
        (term === '' ||
          e.name.toLowerCase().includes(term) ||
          EQUIPMENT_LABELS[e.equipment].toLowerCase().includes(term) ||
          PATTERN_LABELS[e.pattern].toLowerCase().includes(term)),
    )
  }, [query, custom, exerciseId])

  const pick = (candidate: Exercise) => {
    const converted =
      currentWeightKg === null || currentWeightKg === undefined
        ? null
        : convertLoad(source.id, candidate.id, currentWeightKg, custom)
    onPick(candidate.id, converted === null ? null : weight.toKg(weight.round(weight.show(converted) ?? 0)))
    onClose()
  }

  const renderWeight = (candidate: Exercise) => {
    if (currentWeightKg === null || currentWeightKg === undefined) return null
    const converted = convertLoad(source.id, candidate.id, currentWeightKg, custom)
    if (converted === null) return <span className="text-ink-400">match by reps</span>
    const shown = weight.round(weight.show(converted) ?? 0)
    return (
      <span className="tabular font-semibold text-brand-400">
        {shown} {weight.unit}
        {candidate.perHand ? <span className="text-ink-400"> /hand</span> : null}
      </span>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={title ?? `Swap ${source.name}`}>
      <p className="mb-4 text-sm text-ink-400">
        Same movement, different equipment. Converted loads are an estimate to keep the cycle moving — adjust
        on the first set if it feels off.
      </p>

      {plannedExerciseId && plannedExerciseId !== exerciseId ? (
        <button
          type="button"
          onClick={() => {
            // Handled upstream: picking the planned exercise restores its exact
            // planned weight rather than converting back through an estimate.
            onPick(plannedExerciseId, null)
            onClose()
          }}
          className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl border border-brand-500 bg-brand-500/10 px-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-400">
              Back to {getExercise(plannedExerciseId, custom).name}
            </span>
            <span className="block text-xs text-ink-400">Restores the weight this day was planned with</span>
          </span>
          <span className="shrink-0 text-brand-400">↩</span>
        </button>
      ) : null}

      <div className="mb-3 flex gap-2">
        <Pill active={!browsing} onClick={() => setBrowsing(false)}>
          Alternates
        </Pill>
        <Pill active={browsing} onClick={() => setBrowsing(true)}>
          All exercises
        </Pill>
      </div>

      {browsing ? (
        <>
          <Input
            placeholder="Search exercises…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-3"
          />
          <ul className="space-y-1.5">
            {library.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => pick(candidate)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5 text-left hover:border-ink-400"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{candidate.name}</span>
                    <span className="block text-xs text-ink-400">
                      {EQUIPMENT_LABELS[candidate.equipment]} · {PATTERN_LABELS[candidate.pattern]}
                    </span>
                  </span>
                  {renderWeight(candidate)}
                </button>
              </li>
            ))}
            {library.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink-400">Nothing matches “{query}”.</li>
            ) : null}
          </ul>
        </>
      ) : (
        <ul className="space-y-1.5">
          {suggestions.map(({ exercise: candidate, available: has, reason }) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => pick(candidate)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                  has
                    ? 'border-ink-700 bg-ink-800/60 hover:border-brand-500'
                    : 'border-ink-800 bg-ink-900/60 opacity-60 hover:opacity-100',
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{candidate.name}</span>
                    {!has ? (
                      <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300">
                        not on hand
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-ink-400">{reason}</span>
                </span>
                {renderWeight(candidate)}
              </button>
            </li>
          ))}
          {suggestions.length === 0 ? (
            <li className="py-6 text-center text-sm text-ink-400">
              No same-pattern alternates yet — browse all exercises.
            </li>
          ) : null}
        </ul>
      )}

      <div className="mt-4 border-t border-ink-700/70 pt-3">
        <EquipmentQuickToggle />
      </div>
    </Sheet>
  )
}

const TOGGLEABLE: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'kettlebell', 'band']

/** Fastest way to tell the app "this hotel gym has dumbbells and nothing else". */
export function EquipmentQuickToggle() {
  const settings = useApp((s) => s.profile?.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  if (!settings) return null

  const toggle = (item: Equipment) => {
    const has = settings.availableEquipment.includes(item)
    updateSettings({
      availableEquipment: has
        ? settings.availableEquipment.filter((e) => e !== item)
        : [...settings.availableEquipment, item],
    })
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
        What's available today
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TOGGLEABLE.map((item) => (
          <Pill key={item} active={settings.availableEquipment.includes(item)} onClick={() => toggle(item)}>
            {EQUIPMENT_LABELS[item]}
          </Pill>
        ))}
      </div>
    </div>
  )
}

export function ExercisePickerButton({
  exerciseId,
  onPick,
  label,
}: {
  exerciseId: string
  onPick: (id: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const custom = useApp((s) => s.profile?.customExercises ?? [])
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="w-full justify-between">
        <span className="truncate">{getExercise(exerciseId, custom).name}</span>
        <span className="text-ink-400">change</span>
      </Button>
      <ExerciseSwap
        open={open}
        onClose={() => setOpen(false)}
        exerciseId={exerciseId}
        title={label ?? 'Choose exercise'}
        onPick={(id) => onPick(id)}
      />
    </>
  )
}
