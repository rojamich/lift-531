import { estimateOneRepMax, incrementFor, type EquipmentContext } from './engine'
import { getExercise } from './exercises'
import type {
  Cycle,
  CycleLift,
  DaySlot,
  LoggedAccessory,
  LoggedAccessorySet,
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

export type AccessoryChangeKind = 'cleared-range' | 'matches-logged'

export interface AccessoryBump {
  planId: string
  exerciseId: string
  /** Null when the plan called for bodyweight. */
  fromKg: number | null
  toKg: number
  kind: AccessoryChangeKind
  /** One line saying why this is being offered. */
  reason: string
  /** Display increment, for the message shown after a workout. */
  stepInUnit: number
}

/**
 * The weight an accessory was actually worked at.
 *
 * The most common weight across the sets you completed, with ties going to the
 * one you finished on — so warming up at 20 and then doing 24, 24, 24 reads as
 * 24, not as an average of the two.
 */
export function workingWeightKg(sets: LoggedAccessorySet[]): number | null {
  const done = sets.filter((set) => set.done && set.weightKg !== null && (set.reps ?? 0) > 0)
  if (done.length === 0) return null

  const tally = new Map<number, { count: number; last: number }>()
  done.forEach((set, index) => {
    const kg = set.weightKg as number
    const current = tally.get(kg) ?? { count: 0, last: -1 }
    tally.set(kg, { count: current.count + 1, last: index })
  })

  let best: { kg: number; count: number; last: number } | null = null
  for (const [kg, value] of tally) {
    const better =
      !best || value.count > best.count || (value.count === best.count && value.last > best.last)
    if (better) best = { kg, count: value.count, last: value.last }
  }
  return best?.kg ?? null
}

/**
 * Make the plan match what was actually lifted, in either direction.
 *
 * Separate from the rep-range rule on purpose: dropping from 30 to 24 because 30
 * was too much is information about the right working weight, and so is jumping
 * from 9 to 17 because 9 was nothing. Neither has anything to do with clearing a
 * rep range, and both otherwise have to be re-entered every single session.
 */
function matchLoggedProposal(
  item: PlannedAccessory,
  entry: LoggedAccessory,
  ctx: EquipmentContext,
): AccessoryBump | null {
  const actualKg = workingWeightKg(entry.sets)
  /*
   * A blank weight is not evidence of a bodyweight set — far more often it just
   * was not filled in — so only an explicit number proposes a change. Going the
   * other way, bodyweight in the plan and a number logged, is explicit and does.
   */
  if (actualKg === null) return null

  const increment = incrementFor(getExercise(item.exerciseId).equipment, ctx)
  /*
   * Compare at the implement's step so a conversion artefact — 30 kg against a
   * logged 30.4 — is not read as a decision. Report the numbers unrounded
   * though, because those are what the lifter typed and what the editable field
   * below the sentence shows; snapping only one of the two made the sheet say
   * "17.5" above a box containing 17.
   */
  const atStep = (kg: number | null) => (kg === null ? null : roundTo(fromKg(kg, ctx.unit), increment))
  if (atStep(item.targetWeightKg) === atStep(actualKg)) return null

  const shown = (kg: number) => Math.round(fromKg(kg, ctx.unit) * 10) / 10
  const actual = shown(actualKg)

  return {
    planId: item.id,
    exerciseId: item.exerciseId,
    fromKg: item.targetWeightKg,
    toKg: actualKg,
    kind: 'matches-logged',
    reason:
      item.targetWeightKg === null
        ? `You used ${actual} ${ctx.unit} where the plan said bodyweight.`
        : `You worked at ${actual} ${ctx.unit}, not the planned ${shown(item.targetWeightKg)}.`,
    stepInUnit: increment,
  }
}

/**
 * Earn weight by clearing the range. When every set of an accessory hits the top
 * of its rep target, the target weight goes up one increment for next time —
 * the rule people apply by hand and forget to.
 */
function clearedRangeProposal(
  item: PlannedAccessory,
  entry: LoggedAccessory,
  ctx: EquipmentContext,
): AccessoryBump | null {
  if (item.targetWeightKg === null) return null

  const range = parseRepRange(item.targetReps)
  if (range.amrap || !Number.isFinite(range.max)) return null

  const done = entry.sets.filter((set) => set.done && set.reps !== null)
  // Every planned set has to be there; three good sets out of four is not a
  // completed prescription.
  if (done.length < item.sets) return null
  if (!done.every((set) => (set.reps as number) >= range.max)) return null

  const increment = incrementFor(getExercise(item.exerciseId).equipment, ctx)
  const nextKg = toKg(roundTo(fromKg(item.targetWeightKg, ctx.unit) + increment, increment), ctx.unit)
  return {
    planId: item.id,
    exerciseId: item.exerciseId,
    fromKg: item.targetWeightKg,
    toKg: nextKg,
    kind: 'cleared-range',
    reason: `You cleared ${range.max} reps on every set.`,
    stepInUnit: increment,
  }
}

/**
 * Everything worth offering to change after a workout, at most one per exercise.
 */
export function proposeAccessoryChanges(
  plan: PlannedAccessory[],
  logged: LoggedAccessory[],
  ctx: EquipmentContext,
): AccessoryBump[] {
  const byPlanId = new Map(logged.map((entry) => [entry.planId, entry]))
  const proposals: AccessoryBump[] = []

  for (const item of plan) {
    const entry = byPlanId.get(item.id)
    if (!entry || entry.skipped) continue

    /*
     * Matching what was lifted wins. Adding an increment to a weight you did not
     * use would compound the mismatch rather than correct it — clearing the
     * range at 24 when the plan said 30 argues for 24, not for 32.
     */
    const matched = matchLoggedProposal(item, entry, ctx)
    if (matched) {
      proposals.push(matched)
      continue
    }
    const cleared = clearedRangeProposal(item, entry, ctx)
    if (cleared) proposals.push(cleared)
  }

  return proposals
}

/**
 * The single number to beat, for the cramped placeholder in a set row.
 * "10-12" reads as "12": the top of the range is the goal, and the full range
 * is already on the card header above. A range does not fit in the field and
 * was being clipped to "10-1", which looks like a target of one rep.
 */
export function repGoal(targetReps: string): string {
  const range = parseRepRange(targetReps)
  if (range.amrap) return 'max'
  if (!Number.isFinite(range.max)) return targetReps.trim()
  return String(range.max)
}
