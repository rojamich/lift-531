import { contextFor, liftFor, mainExerciseId, prescriptionFor } from './cycle'
import { incrementFor } from './engine'
import { getExercise } from './exercises'
import type { Cycle, Exercise, LoggedAccessory, LoggedSet, Session, Settings } from './types'
import { fromKg, roundTo } from './units'

/**
 * One resolution of "what to show for this day", shared by the text export and
 * the print view.
 *
 * Both need the same rule — the logged value wherever there is one, the plan for
 * anything still ahead — and while that rule lived inside the text formatter the
 * print view went on rendering the prescription, presenting a plan as though it
 * were a record of what happened.
 *
 * Weights come out in display units, already the right side of the kilogram
 * boundary, because every consumer is about to render them.
 */
export type SessionState = 'planned' | 'in-progress' | 'complete' | 'skipped'

export interface SetRow {
  label: string
  /** Display units; null for bodyweight. */
  weight: number | null
  /** Reps done, or the target when not done. */
  reps: number
  targetReps: number
  amrap: boolean
  done: boolean
  perHand: boolean
  capped: boolean
  /** An AMRAP set taken past its prescription. */
  beatTarget: boolean
}

export interface AccessoryRow {
  name: string
  perHand: boolean
  skipped: boolean
  /** True when at least one set was logged. */
  done: boolean
  plannedSets: number
  targetReps: string
  /** Logged weight when done, the planned target when not. Display units. */
  weight: number | null
  /** Reps per completed set, in order. Empty when nothing was logged. */
  reps: number[]
  /** Performed as something other than what the plan asked for. */
  swapped: boolean
}

export interface SessionView {
  week: number
  slot: string
  liftLabel: string
  weekLabel: string
  trainingMax: number
  state: SessionState
  completedDate: string | null
  /** Set when the day ran on a substitute movement. */
  swappedTo: string | null
  anythingLogged: boolean
  warmups: SetRow[]
  main: SetRow[]
  supplementalLabel: string
  supplemental: SetRow[]
  /** One line for the whole supplemental block, once it has been logged. */
  supplementalSummary: { weight: number | null; reps: number[]; of: number } | null
  accessories: AccessoryRow[]
  notes: string
}

export function buildSessionView(
  cycle: Cycle,
  session: Session,
  settings: Settings,
  custom: Exercise[] = [],
): SessionView {
  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session), custom)
  const p = prescriptionFor(cycle, session, settings)
  const weekSpec = cycle.template.weeks[session.week - 1]
  const unit = settings.unit
  const ctx = contextFor(settings)

  /** Logged weights keep the precision they were entered at. */
  const shownLogged = (kg: number | null) =>
    kg === null ? null : Math.round(fromKg(kg, unit) * 10) / 10
  /** Planned weights snap to what the implement can be loaded to. */
  const shownPlanned = (kg: number | null, ex: Exercise) =>
    kg === null ? null : roundTo(fromKg(kg, unit), incrementFor(ex.equipment, ctx))

  const anythingLogged =
    session.mainSets.some((set) => set.done) ||
    session.supplementalSets.some((set) => set.done) ||
    session.accessories.some((a) => a.sets.some((set) => set.done))

  const state: SessionState =
    session.status === 'complete'
      ? 'complete'
      : session.status === 'skipped'
        ? 'skipped'
        : anythingLogged
          ? 'in-progress'
          : 'planned'

  const byId = new Map<string, LoggedSet>(
    [...session.mainSets, ...session.supplementalSets].map((set) => [set.id, set]),
  )

  const toRow = (prescribed: (typeof p.main)[number]): SetRow => {
    const logged = byId.get(prescribed.id)
    const done = Boolean(logged?.done)
    const reps = done ? (logged?.actualReps ?? prescribed.reps) : prescribed.reps
    return {
      label: prescribed.label,
      // Prescribed weights are already in display units; logged ones are not.
      weight: done ? shownLogged(logged?.actualWeightKg ?? null) : prescribed.weight,
      reps,
      targetReps: prescribed.reps,
      amrap: prescribed.amrap,
      done,
      perHand: prescribed.perHand,
      capped: prescribed.capped,
      beatTarget: prescribed.amrap && done && reps > prescribed.reps,
    }
  }

  const planned = cycle.accessoryPlan[session.slot] ?? []
  const plannedIds = new Set(planned.map((item) => item.id))
  const loggedByPlanId = new Map<string, LoggedAccessory>(
    session.accessories.map((entry) => [entry.planId, entry]),
  )

  const accessories: AccessoryRow[] = []
  for (const item of planned) {
    if (!item.active) continue
    const entry = loggedByPlanId.get(item.id)
    const ex = getExercise(entry?.exerciseId ?? item.exerciseId, custom)
    const doneSets = entry?.sets.filter((set) => set.done) ?? []
    accessories.push({
      name: ex.name,
      perHand: Boolean(ex.perHand),
      skipped: Boolean(entry?.skipped),
      done: doneSets.length > 0,
      plannedSets: item.sets,
      targetReps: item.targetReps,
      weight:
        doneSets.length > 0
          ? shownLogged(doneSets[0].weightKg)
          : shownPlanned(item.targetWeightKg, ex),
      reps: doneSets.map((set) => set.reps ?? 0),
      swapped: Boolean(entry && entry.exerciseId !== item.exerciseId),
    })
  }
  // Rows the session carries that the plan no longer lists.
  for (const entry of session.accessories) {
    if (plannedIds.has(entry.planId)) continue
    const doneSets = entry.sets.filter((set) => set.done)
    if (doneSets.length === 0) continue
    const ex = getExercise(entry.exerciseId, custom)
    accessories.push({
      name: ex.name,
      perHand: Boolean(ex.perHand),
      skipped: false,
      done: true,
      plannedSets: entry.sets.length,
      targetReps: entry.targetReps,
      weight: shownLogged(doneSets[0].weightKg),
      reps: doneSets.map((set) => set.reps ?? 0),
      swapped: true,
    })
  }

  const doneSupplemental = session.supplementalSets.filter((set) => set.done)

  return {
    week: session.week,
    slot: session.slot,
    liftLabel: lift?.label ?? exercise.name,
    weekLabel: weekSpec.label,
    trainingMax: p.trainingMax,
    state,
    completedDate: session.completedDate ?? null,
    swappedTo:
      session.mainExerciseId && session.mainExerciseId !== lift?.exerciseId ? exercise.name : null,
    anythingLogged,
    warmups: p.warmups.map(toRow),
    main: p.main.map(toRow),
    supplementalLabel: p.supplementalLabel,
    supplemental: p.supplemental.map(toRow),
    supplementalSummary:
      doneSupplemental.length > 0
        ? {
            weight: shownLogged(doneSupplemental[0].actualWeightKg),
            reps: doneSupplemental.map((set) => set.actualReps ?? 0),
            of: p.supplemental.length,
          }
        : null,
    accessories,
    notes: session.notes,
  }
}

export const stateLabel = (view: SessionView): string => {
  switch (view.state) {
    case 'complete':
      return view.completedDate
        ? `Done ${new Date(view.completedDate).toLocaleDateString()}`
        : 'Done'
    case 'skipped':
      return 'Skipped'
    case 'in-progress':
      return 'In progress'
    default:
      return 'Planned'
  }
}
