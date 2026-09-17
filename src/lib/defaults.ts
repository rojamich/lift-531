import { newId, today } from './cycle'
import { DEFAULT_TEMPLATE_ID } from './templates'
import type { DaySlot, Lift, PlannedAccessory, Profile, Settings } from './types'
import { lbToKg } from './units'

export const DEFAULT_SETTINGS: Settings = {
  unit: 'lb',
  tmPercent: 0.85,
  templateId: DEFAULT_TEMPLATE_ID,
  barbellIncrement: { lb: 5, kg: 2.5 },
  dumbbellIncrement: { lb: 5, kg: 2 },
  machineIncrement: { lb: 5, kg: 2.5 },
  barWeight: { lb: 45, kg: 20 },
  upperCycleIncrement: { lb: 5, kg: 2.5 },
  lowerCycleIncrement: { lb: 10, kg: 5 },
  maxDumbbellKg: null,
  availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'smith'],
  autoProgressAccessories: true,
  restTimerEnabled: true,
  autoStartRest: true,
  showPlateMath: true,
}

export const DEFAULT_LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(100), category: 'upper' },
  { slot: 'B', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(225), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(155), category: 'upper' },
  { slot: 'D', exerciseId: 'back-squat', label: 'Back Squat', est1RMKg: lbToKg(200), category: 'lower' },
]

interface AccessoryInput {
  exerciseId: string
  sets: number
  reps: string
  /** Pounds, because every source number here came off an imperial spreadsheet. */
  lb?: number | null
  rest?: number
  notes?: string
}

const acc = (input: AccessoryInput): PlannedAccessory => ({
  id: newId(),
  exerciseId: input.exerciseId,
  sets: input.sets,
  targetReps: input.reps,
  targetWeightKg: input.lb === undefined || input.lb === null ? null : lbToKg(input.lb),
  restSeconds: input.rest ?? 90,
  notes: input.notes ?? '',
  active: true,
})

const plan = (
  a: AccessoryInput[],
  b: AccessoryInput[],
  c: AccessoryInput[],
  d: AccessoryInput[],
): Record<DaySlot, PlannedAccessory[]> => ({
  A: a.map(acc),
  B: b.map(acc),
  C: c.map(acc),
  D: d.map(acc),
})

/** A balanced starting point for someone setting up fresh. */
export const defaultAccessoryPlan = (): Record<DaySlot, PlannedAccessory[]> =>
  plan(
    [
      { exerciseId: 'chin-up', sets: 3, reps: 'AMRAP', lb: null, rest: 90 },
      { exerciseId: 'incline-db-bench', sets: 3, reps: '10-12', lb: 40 },
      { exerciseId: 'db-lateral-raise', sets: 3, reps: '12-15', lb: 15, rest: 60 },
      { exerciseId: 'cable-face-pull', sets: 3, reps: '15', lb: 30, rest: 60 },
    ],
    [
      { exerciseId: 'db-row', sets: 3, reps: '10-12', lb: 50 },
      { exerciseId: 'lat-pulldown', sets: 3, reps: '10', lb: 70 },
      { exerciseId: 'ab-wheel', sets: 3, reps: '10-15', lb: null, rest: 75 },
      { exerciseId: 'standing-calf-raise', sets: 3, reps: '12-15', lb: 60, rest: 60 },
    ],
    [
      { exerciseId: 'barbell-row', sets: 3, reps: '8-10', lb: 115 },
      { exerciseId: 'incline-db-bench', sets: 3, reps: '10-12', lb: 40 },
      { exerciseId: 'db-skull-crusher', sets: 3, reps: '10-12', lb: 20, rest: 60 },
      { exerciseId: 'db-curl', sets: 3, reps: '10-12', lb: 20, rest: 60 },
    ],
    [
      { exerciseId: 'rdl', sets: 3, reps: '8-10', lb: 135 },
      { exerciseId: 'leg-press', sets: 3, reps: '12', lb: 200 },
      { exerciseId: 'bulgarian-split-squat', sets: 3, reps: '8', lb: 30 },
      { exerciseId: 'glute-bridge', sets: 3, reps: '15', lb: null, rest: 60 },
    ],
  )

/**
 * A fuller accessory plan in the shape a long-running 5/3/1 setup tends to take:
 * a couple of compounds per day, then isolation work. Offered on first run so
 * setup is a single tap rather than twenty minutes of typing.
 */
export const fullAccessoryPlan = (): Record<DaySlot, PlannedAccessory[]> =>
  plan(
    [
      { exerciseId: 'chin-up', sets: 4, reps: 'AMRAP', lb: null, rest: 90, notes: 'Track total reps across 4 sets' },
      { exerciseId: 'incline-db-bench', sets: 3, reps: '10', lb: 50, notes: 'Add 5 lbs when 3×12 easy' },
      { exerciseId: 'cable-lateral-raise', sets: 3, reps: '10-12', lb: 10, rest: 60, notes: 'Superset with face pull — no rest between' },
      { exerciseId: 'cable-face-pull', sets: 3, reps: '12-15', lb: 35, rest: 60, notes: 'Superset with lat raise — 60 sec after the round' },
      { exerciseId: 'db-rear-delt-fly', sets: 3, reps: '12-15', lb: 15, rest: 60, notes: 'Bent over, control the negative' },
    ],
    [
      { exerciseId: 'db-row', sets: 3, reps: '10-12', lb: 55, notes: 'Full ROM — chest to pad if possible' },
      { exerciseId: 'lat-pulldown', sets: 4, reps: '8-10', lb: 80, notes: 'Work up from 70; pull to upper chest' },
      { exerciseId: 'seated-calf-raise', sets: 4, reps: '10-12', lb: 65, rest: 60, notes: '2s pause at the bottom' },
      { exerciseId: 'ab-wheel', sets: 3, reps: '10-15', lb: null, rest: 75, notes: 'Kneel if needed — brace hard, progress reps' },
    ],
    [
      { exerciseId: 'barbell-row', sets: 3, reps: '8', lb: 135, notes: 'Overhand grip, chest toward the bar' },
      { exerciseId: 'incline-db-bench', sets: 3, reps: '10', lb: 45 },
      { exerciseId: 'chest-supported-row', sets: 3, reps: '10', lb: 35, notes: 'Add 5 lbs when 3×12 easy' },
      { exerciseId: 'db-skull-crusher', sets: 3, reps: '10-12', lb: 25, rest: 60, notes: 'Triceps = biggest bench limiter' },
      { exerciseId: 'db-curl', sets: 3, reps: '8-10', lb: 25, rest: 60, notes: 'Supinate at the top' },
    ],
    [
      { exerciseId: 'rdl', sets: 3, reps: '8', lb: 145, notes: 'Hinge hard at the hip' },
      { exerciseId: 'leg-press', sets: 3, reps: '12', lb: 255, notes: "Full ROM, don't lock the knees" },
      { exerciseId: 'reverse-lunge', sets: 3, reps: '7-8', lb: 35, notes: 'Easier on the knee than forward lunges' },
      { exerciseId: 'hip-thrust', sets: 3, reps: '10-12', lb: 135, notes: 'Squeeze glutes hard at the top' },
      { exerciseId: 'seated-calf-raise', sets: 4, reps: '10-12', lb: 70, rest: 60 },
    ],
  )

/** Placeholder numbers for the example setup — replace them with your own. */
export const EXAMPLE_LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(115), category: 'upper' },
  { slot: 'B', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(315), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(200), category: 'upper' },
  { slot: 'D', exerciseId: 'front-squat', label: 'Front Squat', est1RMKg: lbToKg(185), category: 'lower' },
]

export type SeedKind = 'example' | 'fresh'

export function createProfile(id: string, displayName: string, seed: SeedKind, email?: string): Profile {
  const stamp = new Date().toISOString()
  const example = seed === 'example'
  return {
    id,
    displayName,
    email,
    settings: {
      ...DEFAULT_SETTINGS,
      maxDumbbellKg: example ? lbToKg(55) : null,
    },
    lifts: example ? EXAMPLE_LIFTS : DEFAULT_LIFTS,
    accessoryPlan: example ? fullAccessoryPlan() : defaultAccessoryPlan(),
    customTemplates: [],
    customExercises: [],
    activeCycleId: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export const startOfToday = today
