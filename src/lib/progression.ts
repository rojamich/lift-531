import { estimateOneRepMax, incrementFor, type EquipmentContext } from './engine'
import { getExercise } from './exercises'
import type {
  Cycle,
  CycleLift,
  DaySlot,
  LoggedAccessory,
  LoggedSet,
  PlannedAccessory,
  Session,
  Settings,
  WeekNumber,
} from './types'
import { fromKg, roundTo, toKg } from './units'

export type ProgressionVerdict = 'increase' | 'hold' | 'reset'

export interface AmrapResult {
  week: WeekNumber
  weightKg: number
  reps: number
  targetReps: number
  /** Reps past the prescribed minimum. Negative means the set was missed. */
  surplus: number
}

export interface LiftReview {
  slot: DaySlot
  exerciseId: string
  label: string
  currentTrainingMaxKg: number
  best: AmrapResult | null
  /** Epley estimate off the best AMRAP — the number the spreadsheet showed. */
  estimatedOneRepMaxKg: number | null
  /** Training max implied by that estimate. */
  amrapTrainingMaxKg: number | null
  /** Training max from Wendler's flat increment: +5 lb upper, +10 lb lower. */
  incrementTrainingMaxKg: number
  verdict: ProgressionVerdict
  rationale: string
}

const unitPair = (pair: { lb: number; kg: number }, unit: 'lb' | 'kg') => (unit === 'kg' ? pair.kg : pair.lb)

/** The heaviest AMRAP set logged for a lift across the cycle. */
export function bestAmrap(cycle: Cycle, slot: DaySlot): AmrapResult | null {
  let best: AmrapResult | null = null
  for (const week of [1, 2, 3] as WeekNumber[]) {
    const session = cycle.sessions[`w${week}${slot}`]
    if (!session || session.status !== 'complete') continue
    for (const set of session.mainSets) {
      if (!set.amrap || !set.done) continue
      if (set.actualWeightKg === null || set.actualReps === null) continue
      const candidate: AmrapResult = {
        week,
        weightKg: set.actualWeightKg,
        reps: set.actualReps,
        targetReps: set.targetReps,
        surplus: set.actualReps - set.targetReps,
      }
      const score = estimateOneRepMax(candidate.weightKg, candidate.reps)
      if (!best || score > estimateOneRepMax(best.weightKg, best.reps)) best = candidate
    }
  }
  return best
}

/** Did the lifter miss the prescribed reps on any completed AMRAP set? */
function missedAnyAmrap(cycle: Cycle, slot: DaySlot): boolean {
  for (const week of [1, 2, 3] as WeekNumber[]) {
    const session = cycle.sessions[`w${week}${slot}`]
    if (!session || session.status !== 'complete') continue
    for (const set of session.mainSets) {
      if (set.amrap && set.done && set.actualReps !== null && set.actualReps < set.targetReps) return true
    }
  }
  return false
}

export function reviewLift(cycle: Cycle, lift: CycleLift, settings: Settings, ctx: EquipmentContext): LiftReview {
  const exercise = getExercise(lift.exerciseId)
  const increment = incrementFor(exercise.equipment, ctx)
  const label = lift.label ?? exercise.name
  const best = bestAmrap(cycle, lift.slot)
  const missed = missedAnyAmrap(cycle, lift.slot)

  const bumpDisplay = unitPair(
    lift.category === 'upper' ? settings.upperCycleIncrement : settings.lowerCycleIncrement,
    ctx.unit,
  )
  const currentDisplay = roundTo(fromKg(lift.trainingMaxKg, ctx.unit), increment)
  const incrementTrainingMaxKg = toKg(roundTo(currentDisplay + bumpDisplay, increment), ctx.unit)

  const estimatedOneRepMaxKg = best ? estimateOneRepMax(best.weightKg, best.reps) : null
  const amrapTrainingMaxKg =
    estimatedOneRepMaxKg === null
      ? null
      : toKg(roundTo(fromKg(estimatedOneRepMaxKg, ctx.unit) * cycle.tmPercent, increment), ctx.unit)

  let verdict: ProgressionVerdict = 'increase'
  let rationale = `Standard jump: +${bumpDisplay} ${ctx.unit} for ${lift.category === 'upper' ? 'an upper' : 'a lower'}-body lift.`

  if (missed) {
    verdict = 'reset'
    rationale = 'You missed the prescribed reps on a top set. Wendler resets the training max to 90% rather than pushing on.'
  } else if (!best) {
    verdict = 'increase'
    rationale = 'No rep record logged this cycle — taking the standard increase.'
  } else if (best.surplus <= 0) {
    verdict = 'hold'
    rationale = `You hit exactly ${best.reps} on the week ${best.week} top set with nothing spare. Holding the training max is the safer call.`
  } else if (best.surplus >= 5) {
    verdict = 'increase'
    rationale = `${best.reps} reps on the week ${best.week} top set — ${best.surplus} past target. The training max is conservative; consider the estimate-based jump.`
  } else {
    verdict = 'increase'
    rationale = `${best.reps} reps on the week ${best.week} top set, ${best.surplus} past target. Solid — take the standard increase.`
  }

  const resetTrainingMaxKg = toKg(roundTo(currentDisplay * 0.9, increment), ctx.unit)

  return {
    slot: lift.slot,
    exerciseId: lift.exerciseId,
    label,
    currentTrainingMaxKg: lift.trainingMaxKg,
    best,
    estimatedOneRepMaxKg,
    amrapTrainingMaxKg,
    incrementTrainingMaxKg: verdict === 'reset' ? resetTrainingMaxKg : verdict === 'hold' ? lift.trainingMaxKg : incrementTrainingMaxKg,
    verdict,
    rationale,
  }
}

export function reviewCycle(cycle: Cycle, settings: Settings, ctx: EquipmentContext): LiftReview[] {
  return cycle.lifts.map((lift) => reviewLift(cycle, lift, settings, ctx))
}

// ── Accessory progression ──────────────────────────────────────────────────

export interface RepRange {
  min: number
  max: number
  amrap: boolean
}

/** "10-12", "AMRAP", "8/leg", "15" — all of which appear in the spreadsheet. */
export function parseRepRange(target: string): RepRange {
  const trimmed = target.trim()
  if (/amrap/i.test(trimmed)) return { min: 1, max: Infinity, amrap: true }
  const range = trimmed.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) return { min: Number(range[1]), max: Number(range[2]), amrap: false }
  const single = trimmed.match(/(\d+)/)
  if (single) return { min: Number(single[1]), max: Number(single[1]), amrap: false }
  return { min: 0, max: Infinity, amrap: false }
}

export interface AccessorySuggestion {
  action: 'add-weight' | 'add-reps' | 'hold' | 'none'
  message: string
  suggestedWeightKg: number | null
}

/**
 * Look at the last time this accessory was logged and say what to do next.
 * Clearing the top of the rep range on every set earns weight; anything else
 * holds, because chasing weight through a missed range is how accessories stall.
 */
export function suggestAccessory(
  plan: PlannedAccessory,
  lastSets: { weightKg: number | null; reps: number | null; done: boolean }[],
  ctx: EquipmentContext,
): AccessorySuggestion {
  const done = lastSets.filter((s) => s.done && s.reps !== null)
  if (done.length === 0) {
    return { action: 'none', message: 'No history yet — log this one and the app will start suggesting.', suggestedWeightKg: null }
  }
  const range = parseRepRange(plan.targetReps)
  const reps = done.map((s) => s.reps as number)
  const lowest = Math.min(...reps)
  const exercise = getExercise(plan.exerciseId)
  const increment = incrementFor(exercise.equipment, ctx)

  if (range.amrap) {
    const total = reps.reduce((sum, r) => sum + r, 0)
    return { action: 'add-reps', message: `Last time: ${total} total reps across ${done.length} sets. Beat it.`, suggestedWeightKg: null }
  }

  if (lowest >= range.max && plan.targetWeightKg !== null) {
    const next = toKg(roundTo(fromKg(plan.targetWeightKg, ctx.unit) + increment, increment), ctx.unit)
    return {
      action: 'add-weight',
      message: `You cleared ${range.max} on every set. Add ${increment} ${ctx.unit} and work back up the range.`,
      suggestedWeightKg: next,
    }
  }
  if (lowest >= range.max) {
    return { action: 'add-reps', message: `Top of the range on every set — make it harder or add a set.`, suggestedWeightKg: null }
  }
  if (lowest >= range.min) {
    return { action: 'add-reps', message: `In range at ${lowest}+. Push toward ${range.max} before adding weight.`, suggestedWeightKg: null }
  }
  return { action: 'hold', message: `Last set dropped to ${lowest}, under the ${range.min} target. Hold the weight.`, suggestedWeightKg: null }
}

/** The most recent completed logging of a given accessory, newest cycle first. */
export function findLastAccessory(
  cycles: Cycle[],
  planId: string,
  exerciseId: string,
): { session: Session; sets: { weightKg: number | null; reps: number | null; done: boolean }[] } | null {
  const sessions = cycles
    .flatMap((c) => Object.values(c.sessions))
    .filter((s) => s.status === 'complete')
    .sort((a, b) => (b.completedDate ?? '').localeCompare(a.completedDate ?? ''))
  for (const session of sessions) {
    const logged = session.accessories.find(
      (a) => (a.planId === planId || a.exerciseId === exerciseId) && !a.skipped && a.sets.some((s) => s.done),
    )
    if (logged) return { session, sets: logged.sets }
  }
  return null
}

/** Personal best for a lift across everything logged, by Epley estimate. */
export function personalBest(cycles: Cycle[], exerciseId: string): { weightKg: number; reps: number; date: string } | null {
  let best: { weightKg: number; reps: number; date: string } | null = null
  const consider = (weightKg: number | null, reps: number | null, date: string) => {
    if (weightKg === null || reps === null || reps <= 0) return
    if (!best || estimateOneRepMax(weightKg, reps) > estimateOneRepMax(best.weightKg, best.reps)) {
      best = { weightKg, reps, date }
    }
  }
  for (const cycle of cycles) {
    for (const session of Object.values(cycle.sessions)) {
      if (session.status !== 'complete') continue
      const date = session.completedDate ?? cycle.startDate
      const mainId = session.mainExerciseId ?? cycle.lifts.find((l) => l.slot === session.slot)?.exerciseId
      if (mainId === exerciseId) {
        const all: LoggedSet[] = [...session.mainSets, ...session.supplementalSets]
        for (const set of all) if (set.done) consider(set.actualWeightKg, set.actualReps, date)
      }
      for (const accessory of session.accessories) {
        if (accessory.exerciseId !== exerciseId || accessory.skipped) continue
        for (const set of accessory.sets) if (set.done) consider(set.weightKg, set.reps, date)
      }
    }
  }
  return best
}

// ── Automatic accessory progression ────────────────────────────────────────

export interface AccessoryBump {
  planId: string
  exerciseId: string
  fromKg: number
  toKg: number
  /** Display increment, for the message shown after a workout. */
  stepInUnit: number
}

/**
 * Earn weight by clearing the range. When every set of an accessory hits the
 * top of its rep target, the plan's target weight goes up one increment for
 * next time — which is the rule people apply by hand and forget to.
 *
 * Bodyweight and AMRAP entries are left alone: there is no weight to add, and
 * the goal there is beating the rep count.
 */
export function progressAccessories(
  plan: PlannedAccessory[],
  logged: LoggedAccessory[],
  ctx: EquipmentContext,
): { plan: PlannedAccessory[]; bumps: AccessoryBump[] } {
  const bumps: AccessoryBump[] = []
  const byPlanId = new Map(logged.map((entry) => [entry.planId, entry]))

  const next = plan.map((item) => {
    const entry = byPlanId.get(item.id)
    if (!entry || entry.skipped || item.targetWeightKg === null) return item

    const range = parseRepRange(item.targetReps)
    if (range.amrap || !Number.isFinite(range.max)) return item

    const done = entry.sets.filter((set) => set.done && set.reps !== null)
    // Every planned set has to be there; three good sets out of four is not a
    // completed prescription.
    if (done.length < item.sets) return item
    if (!done.every((set) => (set.reps as number) >= range.max)) return item

    const increment = incrementFor(getExercise(item.exerciseId).equipment, ctx)
    const nextKg = toKg(roundTo(fromKg(item.targetWeightKg, ctx.unit) + increment, increment), ctx.unit)
    bumps.push({
      planId: item.id,
      exerciseId: item.exerciseId,
      fromKg: item.targetWeightKg,
      toKg: nextKg,
      stepInUnit: increment,
    })
    return { ...item, targetWeightKg: nextKg }
  })

  return { plan: next, bumps }
}
