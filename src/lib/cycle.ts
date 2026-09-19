import {
  buildPrescription,
  incrementFor,
  trainingMaxFromEstimate,
  type EquipmentContext,
  type PrescribedSet,
} from './engine'
import { convertLoad, getExercise } from './exercises'
import { cloneTemplate } from './templates'
import {
  DAY_SLOTS,
  sessionKey,
  WEEK_NUMBERS,
  type Cycle,
  type CycleLift,
  type DaySlot,
  type Exercise,
  type Lift,
  type LoggedAccessory,
  type LoggedSet,
  type PlannedAccessory,
  type Profile,
  type Session,
  type Settings,
  type Template,
  type WeekNumber,
} from './types'
import { fromKg, roundTo, toKg } from './units'

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

export const today = () => new Date().toISOString().slice(0, 10)

/** Equipment context assembled from a profile's settings. */
export function contextFor(settings: Settings): EquipmentContext {
  const unit = settings.unit
  const pick = (pair: { lb: number; kg: number }) => (unit === 'kg' ? pair.kg : pair.lb)
  return {
    unit,
    barbellIncrement: pick(settings.barbellIncrement),
    dumbbellIncrement: pick(settings.dumbbellIncrement),
    machineIncrement: pick(settings.machineIncrement),
    maxDumbbell:
      settings.maxDumbbellKg === null ? null : (unit === 'kg' ? settings.maxDumbbellKg : settings.maxDumbbellKg / 0.45359237),
  }
}

/** Every session key in the order they're trained: w1A..w1D, w2A..w4D. */
export function sessionOrder(): { week: WeekNumber; slot: DaySlot; key: string }[] {
  return WEEK_NUMBERS.flatMap((week) =>
    DAY_SLOTS.map((slot) => ({ week, slot, key: sessionKey(week, slot) })),
  )
}

function blankSession(week: WeekNumber, slot: DaySlot): Session {
  return {
    key: sessionKey(week, slot),
    week,
    slot,
    status: 'pending',
    mainSets: [],
    supplementalSets: [],
    accessories: [],
    notes: '',
  }
}

export interface CreateCycleArgs {
  number: number
  name?: string
  startDate?: string
  lifts: Lift[]
  accessoryPlan: Record<DaySlot, PlannedAccessory[]>
  template: Template
  settings: Settings
  /** Training maxes to freeze, keyed by slot. Derived from est 1RM when absent. */
  trainingMaxOverridesKg?: Partial<Record<DaySlot, number>>
}

export function createCycle(args: CreateCycleArgs): Cycle {
  const ctx = contextFor(args.settings)
  const stamp = new Date().toISOString()
  const cycleLifts: CycleLift[] = args.lifts.map((lift) => ({
    ...lift,
    trainingMaxKg:
      args.trainingMaxOverridesKg?.[lift.slot] ??
      trainingMaxFromEstimate(lift.est1RMKg, args.settings.tmPercent, getExercise(lift.exerciseId).equipment, ctx),
  }))

  const sessions: Record<string, Session> = {}
  for (const { week, slot, key } of sessionOrder()) sessions[key] = blankSession(week, slot)

  return {
    id: newId(),
    number: args.number,
    name: args.name ?? `Cycle ${args.number}`,
    startDate: args.startDate ?? today(),
    status: 'active',
    unit: args.settings.unit,
    tmPercent: args.settings.tmPercent,
    template: cloneTemplate(args.template),
    lifts: cycleLifts,
    accessoryPlan: structuredClone(args.accessoryPlan),
    sessions,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export const liftFor = (cycle: Cycle, slot: DaySlot): CycleLift | undefined =>
  cycle.lifts.find((l) => l.slot === slot)

/**
 * Move a training max onto a substitute movement. Returns undefined when the
 * day is being put back on its planned lift, and when the two movements have no
 * comparable loading — a press swapped for push-ups is matched by reps, not load.
 */
export function substituteTrainingMaxKg(
  cycle: Cycle,
  slot: DaySlot,
  exerciseId: string,
  settings: Settings,
): number | undefined {
  const lift = liftFor(cycle, slot)
  if (!lift || exerciseId === lift.exerciseId) return undefined
  const converted = convertLoad(lift.exerciseId, exerciseId, lift.trainingMaxKg)
  if (converted === null) return undefined
  const ctx = contextFor(settings)
  const increment = incrementFor(getExercise(exerciseId).equipment, ctx)
  return toKg(roundTo(fromKg(converted, ctx.unit), increment), ctx.unit)
}

/** The exercise actually being trained — the swap if there is one, else the plan. */
export function mainExerciseId(cycle: Cycle, session: Session): string {
  return session.mainExerciseId ?? liftFor(cycle, session.slot)?.exerciseId ?? 'bench'
}

export function prescriptionFor(cycle: Cycle, session: Session, settings: Settings) {
  const lift = liftFor(cycle, session.slot)
  const ctx = contextFor(settings)
  const exerciseId = mainExerciseId(cycle, session)
  return buildPrescription({
    trainingMaxKg: session.mainTrainingMaxKg ?? lift?.trainingMaxKg ?? 0,
    exercise: getExercise(exerciseId),
    template: cycle.template,
    week: session.week,
    ctx,
  })
}

const toLogged = (set: PrescribedSet, unit: 'lb' | 'kg'): LoggedSet => ({
  id: set.id,
  kind: set.kind,
  pct: set.pct,
  targetReps: set.reps,
  amrap: set.amrap,
  done: false,
  actualWeightKg: set.weight === null ? null : toKg(set.weight, unit),
  actualReps: null,
})

/**
 * Fill in a session's log rows from the prescription, preserving anything
 * already logged. Called when a session is opened, and again after a swap.
 */
export function hydrateSession(cycle: Cycle, session: Session, settings: Settings): Session {
  const p = prescriptionFor(cycle, session, settings)
  const unit = settings.unit
  const existing = new Map(
    [...session.mainSets, ...session.supplementalSets].map((s) => [s.id, s]),
  )

  const merge = (prescribed: PrescribedSet[]): LoggedSet[] =>
    prescribed.map((set) => {
      const prior = existing.get(set.id)
      const fresh = toLogged(set, unit)
      if (!prior) return fresh
      return {
        ...fresh,
        done: prior.done,
        // A logged weight the lifter touched wins; an untouched one tracks the plan.
        actualWeightKg: prior.done || prior.actualReps !== null ? prior.actualWeightKg : fresh.actualWeightKg,
        actualReps: prior.actualReps,
      }
    })

  const plan = cycle.accessoryPlan[session.slot] ?? []
  const loggedByPlan = new Map(session.accessories.map((a) => [a.planId, a]))
  const accessories: LoggedAccessory[] = plan
    .filter((item) => item.active)
    .map((item) => {
      const prior = loggedByPlan.get(item.id)
      if (prior) {
        const sets = Array.from({ length: item.sets }, (_, i) => prior.sets[i] ?? { done: false, weightKg: item.targetWeightKg, reps: null })
        return { ...prior, targetReps: item.targetReps, targetWeightKg: item.targetWeightKg, sets }
      }
      return {
        planId: item.id,
        exerciseId: item.exerciseId,
        targetReps: item.targetReps,
        targetWeightKg: item.targetWeightKg,
        sets: Array.from({ length: item.sets }, () => ({ done: false, weightKg: item.targetWeightKg, reps: null })),
        notes: '',
        skipped: false,
      }
    })

  return {
    ...session,
    mainSets: merge([...p.warmups, ...p.main]),
    supplementalSets: merge(p.supplemental),
    accessories,
  }
}

export interface CycleProgress {
  completed: number
  total: number
  percent: number
}

export function cycleProgress(cycle: Cycle): CycleProgress {
  const all = Object.values(cycle.sessions)
  const completed = all.filter((s) => s.status === 'complete' || s.status === 'skipped').length
  return { completed, total: all.length, percent: all.length ? completed / all.length : 0 }
}

/**
 * Where you left off: an in-progress session if there is one, otherwise the
 * first session not yet done. Null once the cycle is finished.
 */
export function nextSession(cycle: Cycle): Session | null {
  const ordered = sessionOrder().map(({ key }) => cycle.sessions[key]).filter(Boolean)
  return (
    ordered.find((s) => s.status === 'in-progress') ??
    ordered.find((s) => s.status === 'pending') ??
    null
  )
}

export const isCycleComplete = (cycle: Cycle) =>
  Object.values(cycle.sessions).every((s) => s.status === 'complete' || s.status === 'skipped')

/** Carry the plan forward into a fresh cycle, with new training maxes applied. */
export function nextCycleFrom(
  previous: Cycle,
  profile: Profile,
  trainingMaxesKg: Partial<Record<DaySlot, number>>,
  overrides: { template?: Template; accessoryPlan?: Record<DaySlot, PlannedAccessory[]>; startDate?: string } = {},
): Cycle {
  return createCycle({
    number: previous.number + 1,
    startDate: overrides.startDate,
    lifts: previous.lifts.map((lift) => ({
      slot: lift.slot,
      exerciseId: lift.exerciseId,
      label: lift.label,
      category: lift.category,
      // Keep the estimate in step with the new training max so the two never drift.
      est1RMKg: (trainingMaxesKg[lift.slot] ?? lift.trainingMaxKg) / profile.settings.tmPercent,
    })),
    accessoryPlan: overrides.accessoryPlan ?? previous.accessoryPlan,
    template: overrides.template ?? previous.template,
    settings: profile.settings,
    trainingMaxOverridesKg: trainingMaxesKg,
  })
}

// ── Keeping a running cycle in step with edited maxes ──────────────────────

export interface MaxDrift {
  slot: DaySlot
  label: string
  fromKg: number
  toKg: number
}

/**
 * Training maxes are frozen when a cycle starts so a week's weights never move
 * under you mid-workout. The cost is that editing a max afterwards appears to do
 * nothing, which is worth saying out loud rather than leaving someone to work it
 * out at the gym. This reports the gap so the UI can offer to close it.
 */
export function cycleMaxDrift(cycle: Cycle, profile: Profile): MaxDrift[] {
  const ctx = contextFor(profile.settings)
  const drift: MaxDrift[] = []
  for (const lift of cycle.lifts) {
    const planned = profile.lifts.find((l) => l.slot === lift.slot)
    if (!planned) continue
    const expected = trainingMaxFromEstimate(
      planned.est1RMKg,
      profile.settings.tmPercent,
      getExercise(planned.exerciseId).equipment,
      ctx,
    )
    // Compare in the display unit: sub-gram differences are rounding noise.
    const from = roundTo(fromKg(lift.trainingMaxKg, ctx.unit), 0.01)
    const to = roundTo(fromKg(expected, ctx.unit), 0.01)
    if (from !== to || planned.exerciseId !== lift.exerciseId) {
      drift.push({ slot: lift.slot, label: planned.label ?? getExercise(planned.exerciseId).name, fromKg: lift.trainingMaxKg, toKg: expected })
    }
  }
  return drift
}

/**
 * Rebuild the untouched part of a cycle from the profile's current maxes.
 * Days already logged keep exactly what was done; pending and in-progress days
 * pick up the new numbers.
 */
export function refreshCycle(cycle: Cycle, profile: Profile): Cycle {
  const ctx = contextFor(profile.settings)
  const lifts: CycleLift[] = cycle.lifts.map((lift) => {
    const planned = profile.lifts.find((l) => l.slot === lift.slot)
    if (!planned) return lift
    return {
      ...lift,
      exerciseId: planned.exerciseId,
      label: planned.label,
      category: planned.category,
      est1RMKg: planned.est1RMKg,
      trainingMaxKg: trainingMaxFromEstimate(
        planned.est1RMKg,
        profile.settings.tmPercent,
        getExercise(planned.exerciseId).equipment,
        ctx,
      ),
    }
  })

  const refreshed: Cycle = {
    ...cycle,
    lifts,
    unit: profile.settings.unit,
    tmPercent: profile.settings.tmPercent,
    updatedAt: new Date().toISOString(),
  }

  const sessions: Record<string, Session> = {}
  for (const [key, session] of Object.entries(cycle.sessions)) {
    const settled = session.status === 'complete' || session.status === 'skipped'
    if (settled || session.mainSets.length === 0) {
      sessions[key] = session
      continue
    }
    // An in-progress day is rebuilt against the new max, but anything already
    // ticked stays ticked — hydrateSession preserves logged sets.
    sessions[key] = hydrateSession(refreshed, session, profile.settings)
  }

  return { ...refreshed, sessions }
}

/**
 * What an accessory should weigh after being swapped.
 *
 * The rule exists because the naive answer loses data: converting between, say,
 * a cable row and a plank has no sensible number, and writing null there reads
 * as "bodyweight" and cannot be swapped back — there is no longer a weight to
 * convert from. So a missing conversion keeps what was there unless the new
 * movement genuinely has no load, and returning to the planned exercise
 * restores the planned weight exactly rather than round-tripping an estimate.
 */
export function resolveSwapWeightKg(args: {
  planned: PlannedAccessory | undefined
  toExerciseId: string
  currentKg: number | null
  convertedKg: number | null
  custom?: Exercise[]
}): number | null {
  const { planned, toExerciseId, currentKg, convertedKg, custom = [] } = args
  if (planned && toExerciseId === planned.exerciseId) return planned.targetWeightKg
  if (convertedKg !== null) return convertedKg
  return getExercise(toExerciseId, custom).equipment === 'bodyweight' ? null : currentKg
}
