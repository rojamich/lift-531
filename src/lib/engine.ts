import type { Equipment, Exercise, SetKind, SetSpec, Template, WeekNumber } from './types'
import { fromKg, roundTo, toKg, type Unit } from './units'

/**
 * Everything the prescription needs to know about what you can actually load
 * today. Increments are in display units; `maxDumbbell` is per hand.
 */
export interface EquipmentContext {
  unit: Unit
  barbellIncrement: number
  dumbbellIncrement: number
  machineIncrement: number
  maxDumbbell: number | null
}

export interface PrescribedSet {
  id: string
  kind: SetKind
  label: string
  pct: number
  /** Display units. Null for bodyweight movements. */
  weight: number | null
  reps: number
  amrap: boolean
  /** True when equipment ran out and reps were raised to match the lost load. */
  capped: boolean
  uncappedWeight: number | null
  restSeconds: number
  perHand: boolean
}

export interface Prescription {
  trainingMax: number
  warmups: PrescribedSet[]
  main: PrescribedSet[]
  supplemental: PrescribedSet[]
  supplementalLabel: string
}

export function incrementFor(equipment: Equipment, ctx: EquipmentContext): number {
  switch (equipment) {
    case 'dumbbell':
    case 'kettlebell':
      return ctx.dumbbellIncrement
    case 'machine':
    case 'cable':
      return ctx.machineIncrement
    default:
      return ctx.barbellIncrement
  }
}

/**
 * Epley, the same estimator the spreadsheet used: a set of `reps` at `weight`
 * is worth about `weight * (1 + reps/30)` for a single.
 */
export const estimateOneRepMax = (weight: number, reps: number) => weight * (1 + reps / 30)

/** Inverse Epley — how many reps at `available` match one set of `reps` at `target`. */
export function repsAtReducedLoad(target: number, reps: number, available: number): number {
  if (available <= 0) return reps
  return (estimateOneRepMax(target, reps) / available - 1) * 30
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export interface CappedLoad {
  weight: number
  reps: number
  capped: boolean
  uncappedWeight: number | null
}

/**
 * Apply the dumbbell ceiling. When the prescription asks for more than the
 * heaviest bell on hand, hold the weight at the cap and buy the difference back
 * in reps — which is exactly what the Apartment tab of the spreadsheet did.
 */
export function applyCap(
  prescribed: number,
  reps: number,
  cap: number | null,
  maxReps: number,
): CappedLoad {
  if (cap === null || prescribed <= cap) {
    return { weight: prescribed, reps, capped: false, uncappedWeight: null }
  }
  const adjusted = clamp(Math.round(repsAtReducedLoad(prescribed, reps, cap)), 1, maxReps)
  return { weight: cap, reps: adjusted, capped: true, uncappedWeight: prescribed }
}

function restForMain(spec: SetSpec, isDeload: boolean, isLast: boolean): number {
  if (isDeload) return 120
  if (spec.amrap) return 300
  return isLast ? 240 : 210
}

interface BuildArgs {
  trainingMaxKg: number
  exercise: Exercise
  template: Template
  week: WeekNumber
  ctx: EquipmentContext
}

function buildSet(
  kind: SetKind,
  idSuffix: string,
  label: string,
  spec: SetSpec,
  trainingMax: number,
  exercise: Exercise,
  ctx: EquipmentContext,
  restSeconds: number,
  maxReps: number,
): PrescribedSet {
  const base = {
    id: `${kind}-${idSuffix}`,
    kind,
    label,
    pct: spec.pct,
    amrap: Boolean(spec.amrap),
    restSeconds,
    perHand: Boolean(exercise.perHand),
  }
  if (exercise.equipment === 'bodyweight') {
    return { ...base, weight: null, reps: spec.reps, capped: false, uncappedWeight: null }
  }
  const increment = incrementFor(exercise.equipment, ctx)
  const raw = roundTo(trainingMax * spec.pct, increment)
  const cap = exercise.perHand ? ctx.maxDumbbell : null
  const { weight, reps, capped, uncappedWeight } = applyCap(raw, spec.reps, cap, maxReps)
  return { ...base, weight, reps, capped, uncappedWeight }
}

/** The percentage the supplemental work is taken at, for a given week. */
export function supplementalPct(template: Template, week: WeekNumber): number {
  const spec = template.supplemental
  const weekSpec = template.weeks[week - 1]
  switch (spec.source) {
    case 'fixed':
      return spec.fixedPctByWeek[week - 1] ?? spec.fixedPctByWeek[0] ?? 0.5
    case 'second-set':
      return weekSpec.main[1]?.pct ?? weekSpec.main[0]?.pct ?? 0.5
    case 'first-set':
    default:
      return weekSpec.main[0]?.pct ?? 0.5
  }
}

export function buildPrescription({ trainingMaxKg, exercise, template, week, ctx }: BuildArgs): Prescription {
  const weekSpec = template.weeks[week - 1]
  const increment = incrementFor(exercise.equipment, ctx)
  const trainingMax = roundTo(fromKg(trainingMaxKg, ctx.unit), increment)

  const warmups = weekSpec.includeWarmups
    ? template.warmups.map((spec, index) =>
        buildSet(
          'warmup',
          String(index),
          `Warm-up ${index + 1}`,
          spec,
          trainingMax,
          exercise,
          ctx,
          60,
          30,
        ),
      )
    : []

  const main = weekSpec.main.map((spec, index) =>
    buildSet(
      'main',
      String(index),
      `Set ${index + 1}`,
      spec,
      trainingMax,
      exercise,
      ctx,
      restForMain(spec, weekSpec.isDeload, index === weekSpec.main.length - 1),
      30,
    ),
  )

  const supp = template.supplemental
  const runSupplemental = supp.enabled && weekSpec.includeSupplemental && supp.sets > 0
  const pct = supplementalPct(template, week)
  const supplemental = runSupplemental
    ? Array.from({ length: supp.sets }, (_, index) =>
        buildSet(
          'supplemental',
          String(index),
          `${supp.label.split('—')[0].trim()} ${index + 1}`,
          { pct, reps: supp.reps, amrap: supp.amrapLastSet && index === supp.sets - 1 },
          trainingMax,
          exercise,
          ctx,
          supp.restSeconds,
          20,
        ),
      )
    : []

  return {
    trainingMax,
    warmups,
    main,
    supplemental,
    supplementalLabel: runSupplemental
      ? `${supp.label} · ${supp.sets}×${supp.amrapLastSet ? `${supp.reps}+` : supp.reps} @ ${Math.round(pct * 100)}%`
      : '',
  }
}

/** Training max from an estimated single, rounded in the unit you'll load. */
export function trainingMaxFromEstimate(
  est1RMKg: number,
  tmPercent: number,
  equipment: Equipment,
  ctx: EquipmentContext,
): number {
  const increment = incrementFor(equipment, ctx)
  const display = roundTo(fromKg(est1RMKg, ctx.unit) * tmPercent, increment)
  return toKg(display, ctx.unit)
}
