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

/**
 * Every session key in the order they're trained: w1A..w1C, w2A..w4C for a
 * three-day cycle. Defaults to four days for callers without a cycle to hand.
 */
export function sessionOrder(slots: DaySlot[] = DAY_SLOTS.slice(0, 4)): {
  week: WeekNumber
  slot: DaySlot
  key: string
}[] {
  return WEEK_NUMBERS.flatMap((week) => slots.map((slot) => ({ week, slot, key: sessionKey(week, slot) })))
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
  /**
   * Training maxes to freeze, keyed by `liftKey`. Keyed by lift rather than by
   * day because a day can hold two of them, and by slot one would overwrite the
   * other's max.
   */
  trainingMaxOverridesKg?: Record<string, number>
}

/** Identifies one main lift of a cycle: its day, and its position within it. */
export const liftKey = (slot: DaySlot, ordinal: number) => `${slot}:${ordinal}`

/** Positions of a lift list within their own days, in list order. */
const ordinals = (lifts: Pick<Lift, 'slot'>[]): number[] => {
  const seen = new Map<DaySlot, number>()
  return lifts.map((lift) => {
    const next = seen.get(lift.slot) ?? 0
    seen.set(lift.slot, next + 1)
    return next
  })
}

export function createCycle(args: CreateCycleArgs): Cycle {
  const ctx = contextFor(args.settings)
  const stamp = new Date().toISOString()
  const order = ordinals(args.lifts)
  const cycleLifts: CycleLift[] = args.lifts.map((lift, index) => ({
    ...lift,
    trainingMaxKg:
      args.trainingMaxOverridesKg?.[liftKey(lift.slot, order[index])] ??
      trainingMaxFromEstimate(lift.est1RMKg, args.settings.tmPercent, getExercise(lift.exerciseId).equipment, ctx),
  }))

  const sessions: Record<string, Session> = {}
  for (const { week, slot, key } of sessionOrder(cycleSlots({ lifts: cycleLifts })))
    sessions[key] = blankSession(week, slot)

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
  ordinal = 0,
): number | undefined {
  const lift = cycle.lifts.filter((l) => l.slot === slot)[ordinal]
  if (!lift || exerciseId === lift.exerciseId) return undefined
  const converted = convertLoad(lift.exerciseId, exerciseId, lift.trainingMaxKg)
  if (converted === null) return undefined
  const ctx = contextFor(settings)
  const increment = incrementFor(getExercise(exerciseId).equipment, ctx)
  return toKg(roundTo(fromKg(converted, ctx.unit), increment), ctx.unit)
}

/** Every main lift on a day, in plan order. A combined day has more than one. */
export const liftsFor = (cycle: Cycle, slot: DaySlot): CycleLift[] =>
  cycle.lifts.filter((lift) => lift.slot === slot)

/** The substitution for one of a day's main lifts, legacy fields included. */
export function swapFor(
  session: Session,
  ordinal: number,
): { exerciseId: string; trainingMaxKg?: number } | undefined {
  const current = session.mainSwaps?.[ordinal]
  if (current) return current
  // Sessions written before a day could hold two lifts swapped only the first.
  if (ordinal === 0 && session.mainExerciseId) {
    return { exerciseId: session.mainExerciseId, trainingMaxKg: session.mainTrainingMaxKg }
  }
  return undefined
}

/** The exercise actually being trained in one of a day's main slots. */
export function mainExerciseIdAt(cycle: Cycle, session: Session, ordinal: number): string {
  return (
    swapFor(session, ordinal)?.exerciseId ??
    liftsFor(cycle, session.slot)[ordinal]?.exerciseId ??
    'bench'
  )
}

/** The first main lift's exercise. Kept for callers that show one name. */
export function mainExerciseId(cycle: Cycle, session: Session): string {
  return mainExerciseIdAt(cycle, session, 0)
}

/**
 * Set ids must be unique across a day's lifts, but the first lift keeps the
 * original unprefixed ids so every session logged before combined days existed
 * still merges against its prescription.
 */
export const setIdPrefix = (ordinal: number) => (ordinal === 0 ? '' : `L${ordinal}:`)

/** Which of a day's main lifts a logged set belongs to. */
export const setBelongsTo = (setId: string, ordinal: number) =>
  ordinal === 0 ? !/^L\d+:/.test(setId) : setId.startsWith(setIdPrefix(ordinal))

/** The lift a logged set belongs to, read back off its id. */
export const ordinalOfSet = (setId: string) => Number(/^L(\d+):/.exec(setId)?.[1] ?? 0)

/** A lift's position within its own day. */
export const liftOrdinal = (cycle: Cycle, lift: Pick<CycleLift, 'slot' | 'exerciseId'>) =>
  Math.max(
    0,
    liftsFor(cycle, lift.slot).findIndex((candidate) => candidate.exerciseId === lift.exerciseId),
  )

export interface MainBlock {
  ordinal: number
  lift: CycleLift | undefined
  exercise: Exercise
  prescription: ReturnType<typeof buildPrescription>
}

/** One prescription per main lift on the day. */
export function prescriptionsFor(cycle: Cycle, session: Session, settings: Settings): MainBlock[] {
  const ctx = contextFor(settings)
  const lifts = liftsFor(cycle, session.slot)
  const count = Math.max(1, lifts.length)

  return Array.from({ length: count }, (_, ordinal) => {
    const lift = lifts[ordinal]
    const swap = swapFor(session, ordinal)
    const exercise = getExercise(mainExerciseIdAt(cycle, session, ordinal))
    const prescription = buildPrescription({
      trainingMaxKg: swap?.trainingMaxKg ?? lift?.trainingMaxKg ?? 0,
      exercise,
      template: cycle.template,
      week: session.week,
      ctx,
    })
    const prefix = setIdPrefix(ordinal)
    return {
      ordinal,
      lift,
      exercise,
      prescription: prefix
        ? {
            ...prescription,
            warmups: prescription.warmups.map((set) => ({ ...set, id: prefix + set.id })),
            main: prescription.main.map((set) => ({ ...set, id: prefix + set.id })),
            supplemental: prescription.supplemental.map((set) => ({ ...set, id: prefix + set.id })),
          }
        : prescription,
    }
  })
}

/** The first main lift's prescription. Kept for callers that show one block. */
export function prescriptionFor(cycle: Cycle, session: Session, settings: Settings) {
  return prescriptionsFor(cycle, session, settings)[0].prescription
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
  const blocks = prescriptionsFor(cycle, session, settings)
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
    // Flattened across the day's lifts; the set ids carry which lift each
    // belongs to, so a combined day stays one list to log against.
    mainSets: merge(blocks.flatMap((b) => [...b.prescription.warmups, ...b.prescription.main])),
    supplementalSets: merge(blocks.flatMap((b) => b.prescription.supplemental)),
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
  const ordered = sessionOrder(cycleSlots(cycle))
    .map(({ key }) => cycle.sessions[key])
    .filter(Boolean)
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
  trainingMaxesKg: Record<string, number>,
  overrides: { template?: Template; accessoryPlan?: Record<DaySlot, PlannedAccessory[]>; startDate?: string } = {},
): Cycle {
  const order = ordinals(previous.lifts)
  return createCycle({
    number: previous.number + 1,
    startDate: overrides.startDate,
    lifts: previous.lifts.map((lift, index) => ({
      slot: lift.slot,
      exerciseId: lift.exerciseId,
      label: lift.label,
      category: lift.category,
      // Keep the estimate in step with the new training max so the two never drift.
      est1RMKg:
        (trainingMaxesKg[liftKey(lift.slot, order[index])] ?? lift.trainingMaxKg) /
        profile.settings.tmPercent,
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
/**
 * The profile lift a cycle lift came from.
 *
 * Matched on the movement first, then on position within the day, because a day
 * can hold two lifts: finding by slot alone would compare a day's second lift
 * against the first one's max and offer to overwrite it.
 */
function plannedLiftFor(cycle: Cycle, profile: Profile, lift: CycleLift): Lift | undefined {
  const sameDay = profile.lifts.filter((l) => l.slot === lift.slot)
  return (
    sameDay.find((l) => l.exerciseId === lift.exerciseId) ??
    sameDay[liftOrdinal(cycle, lift)]
  )
}

export function cycleMaxDrift(cycle: Cycle, profile: Profile): MaxDrift[] {
  const ctx = contextFor(profile.settings)
  const drift: MaxDrift[] = []
  for (const lift of cycle.lifts) {
    const planned = plannedLiftFor(cycle, profile, lift)
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
    const planned = plannedLiftFor(cycle, profile, lift)
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

/** True when nothing has been recorded against an accessory yet. */
const untouched = (logged: LoggedAccessory) =>
  !logged.skipped && logged.sets.every((set) => !set.done && set.reps === null)

/**
 * Push an edited accessory plan into the running cycle.
 *
 * Days already logged keep exactly what was done — their accessory rows are
 * materialised, so history is never rewritten. Days still to come pick the
 * change up, including a different exercise, as long as nothing has been
 * recorded against that row yet; a row you have already started is left alone
 * rather than swapped out from under you.
 */
export function applyAccessoryPlan(
  cycle: Cycle,
  slot: DaySlot,
  items: PlannedAccessory[],
  settings: Settings,
): Cycle {
  const withPlan: Cycle = {
    ...cycle,
    accessoryPlan: { ...cycle.accessoryPlan, [slot]: items },
    updatedAt: new Date().toISOString(),
  }

  const sessions: Record<string, Session> = { ...withPlan.sessions }
  for (const [key, session] of Object.entries(withPlan.sessions)) {
    if (session.slot !== slot) continue
    if (session.status === 'complete' || session.status === 'skipped') continue
    if (session.mainSets.length === 0) continue // Never opened; hydrates fresh anyway.
    sessions[key] = hydrateSession(
      withPlan,
      { ...session, accessories: session.accessories.filter((a) => !untouched(a)) },
      settings,
    )
  }
  return { ...withPlan, sessions }
}

/**
 * The slots a cycle actually trains, in order.
 *
 * Derived from its main lifts rather than stored, so there is no day count to
 * keep in sync with the lifts themselves: three lifts means a three-day cycle.
 */
export function cycleSlots(cycle: Pick<Cycle, 'lifts'>): DaySlot[] {
  const present = new Set(cycle.lifts.map((lift) => lift.slot))
  return DAY_SLOTS.filter((slot) => present.has(slot))
}

export const cycleDayCount = (cycle: Pick<Cycle, 'lifts'>) => cycleSlots(cycle).length
