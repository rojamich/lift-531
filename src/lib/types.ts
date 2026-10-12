import type { Unit } from './units'

export type DaySlot = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

/**
 * Every slot the data model allows. A cycle uses only as many as it has main
 * lifts — see `cycleSlots` — so a three-day split simply has no D.
 * The plan is keyed on all of them regardless, with empty lists for the unused
 * ones, which keeps `Record<DaySlot, …>` total and avoids optional lookups
 * spreading through every screen.
 */
export const DAY_SLOTS: DaySlot[] = ['A', 'B', 'C', 'D', 'E', 'F']

/** How many training days a cycle can be built around. */
export const MIN_DAYS = 2
export const MAX_DAYS = 6

export const slotsForDayCount = (count: number): DaySlot[] =>
  DAY_SLOTS.slice(0, Math.min(MAX_DAYS, Math.max(MIN_DAYS, count)))

export type WeekNumber = 1 | 2 | 3 | 4
export const WEEK_NUMBERS: WeekNumber[] = [1, 2, 3, 4]

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'band'
  | 'bodyweight'
  | 'smith'

export type Pattern =
  | 'vertical-press'
  | 'horizontal-press'
  | 'vertical-pull'
  | 'horizontal-pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'calf'
  | 'core'
  | 'biceps'
  | 'triceps'
  | 'delts'

export interface Exercise {
  id: string
  name: string
  equipment: Equipment
  pattern: Pattern
  /** Loaded in each hand — the cap and the displayed weight are per hand. */
  perHand?: boolean
  /**
   * Load relative to the barbell reference for this pattern, used to convert a
   * prescription when you swap. A dumbbell bench at 0.4 means ~40% of your
   * barbell bench, in each hand. Undefined means the movement isn't loaded
   * comparably (bodyweight, core work) and a swap carries reps instead.
   */
  loadFactor?: number
  /** Can headline a training day, i.e. is worth running a training max on. */
  canBeMain?: boolean
  notes?: string
}

/** One prescribed set, as a fraction of training max. */
export interface SetSpec {
  pct: number
  reps: number
  amrap?: boolean
}

export interface WeekSpec {
  label: string
  isDeload: boolean
  includeWarmups: boolean
  includeSupplemental: boolean
  main: SetSpec[]
}

export type SupplementalSource = 'first-set' | 'second-set' | 'fixed'

export interface SupplementalSpec {
  kind: string
  label: string
  /** Blank disables supplemental work entirely. */
  enabled: boolean
  sets: number
  reps: number
  amrapLastSet: boolean
  source: SupplementalSource
  /** Used when source is 'fixed' — one training-max percentage per week (BBB ramps). */
  fixedPctByWeek: number[]
  restSeconds: number
}

export interface Template {
  id: string
  name: string
  summary: string
  warmups: SetSpec[]
  weeks: WeekSpec[]
  supplemental: SupplementalSpec
  builtIn: boolean
  derivedFrom?: string
}

export type LiftCategory = 'upper' | 'lower'

export interface Lift {
  slot: DaySlot
  exerciseId: string
  /** Overrides the exercise name in headings, e.g. "Press" for Overhead Press. */
  label?: string
  est1RMKg: number
  category: LiftCategory
}

/** Per-unit pairs, so switching units never silently rewrites a setting. */
export interface UnitPair {
  lb: number
  kg: number
}

export interface Settings {
  unit: Unit
  tmPercent: number
  templateId: string
  /** Rounding step for each implement, per unit. */
  barbellIncrement: UnitPair
  dumbbellIncrement: UnitPair
  machineIncrement: UnitPair
  barWeight: UnitPair
  upperCycleIncrement: UnitPair
  lowerCycleIncrement: UnitPair
  /** Heaviest single dumbbell on hand. Caps prescriptions; reps rise to compensate. */
  maxDumbbellKg: number | null
  availableEquipment: Equipment[]
  /** Raise an accessory's target weight when every set clears the rep range. */
  autoProgressAccessories: boolean
  restTimerEnabled: boolean
  autoStartRest: boolean
  showPlateMath: boolean
}

export interface PlannedAccessory {
  id: string
  exerciseId: string
  sets: number
  /** Free text so "10-12", "AMRAP" and "8/leg" all survive the round trip. */
  targetReps: string
  targetWeightKg: number | null
  restSeconds: number
  notes: string
  active: boolean
  /**
   * Accessories sharing an id are performed back to back as a superset: no rest
   * between them, one rest after the round.
   */
  supersetId?: string
}

export type SetKind = 'warmup' | 'main' | 'supplemental'

/**
 * The part of a prescribed set that rendering cares about. Declared here rather
 * than importing PrescribedSet so lib/share stays independent of the engine's
 * internals.
 */
export interface PrescribedSetLike {
  id: string
  label: string
  weight: number | null
  reps: number
  amrap: boolean
  capped: boolean
  perHand: boolean
}

export interface LoggedSet {
  id: string
  kind: SetKind
  pct: number
  targetReps: number
  amrap: boolean
  done: boolean
  actualWeightKg: number | null
  actualReps: number | null
}

export interface LoggedAccessorySet {
  done: boolean
  weightKg: number | null
  reps: number | null
}

export interface LoggedAccessory {
  planId: string
  exerciseId: string
  targetReps: string
  targetWeightKg: number | null
  sets: LoggedAccessorySet[]
  notes: string
  skipped: boolean
}

export type SessionStatus = 'pending' | 'in-progress' | 'complete' | 'skipped'

export interface Session {
  key: string
  week: WeekNumber
  slot: DaySlot
  status: SessionStatus
  scheduledDate?: string
  completedDate?: string
  /**
   * Substitutions for this day's main lifts, keyed by the lift's position within
   * the day. The training max is carried alongside, converted from the planned
   * lift's — without it a barbell max would be applied per hand to a pair of
   * dumbbells.
   */
  mainSwaps?: Record<number, { exerciseId: string; trainingMaxKg?: number }>
  /**
   * Pre-existing single-lift swap fields. Still read, so sessions logged before
   * a day could hold more than one main lift keep their substitution.
   * @deprecated use mainSwaps
   */
  mainExerciseId?: string
  /** @deprecated use mainSwaps */
  mainTrainingMaxKg?: number
  mainSets: LoggedSet[]
  supplementalSets: LoggedSet[]
  accessories: LoggedAccessory[]
  notes: string
}

export interface CycleLift extends Lift {
  /** Frozen at cycle start so mid-cycle max edits never move this week's numbers. */
  trainingMaxKg: number
}

export interface Cycle {
  id: string
  number: number
  name: string
  startDate: string
  status: 'active' | 'complete'
  unit: Unit
  tmPercent: number
  template: Template
  lifts: CycleLift[]
  accessoryPlan: Record<DaySlot, PlannedAccessory[]>
  sessions: Record<string, Session>
  createdAt: string
  updatedAt: string
  completedDate?: string
}

export interface Profile {
  id: string
  displayName: string
  email?: string
  settings: Settings
  lifts: Lift[]
  accessoryPlan: Record<DaySlot, PlannedAccessory[]>
  customTemplates: Template[]
  customExercises: Exercise[]
  activeCycleId: string | null
  createdAt: string
  updatedAt: string
}

export const sessionKey = (week: WeekNumber, slot: DaySlot) => `w${week}${slot}`
