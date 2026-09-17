import type { Equipment, Exercise, Pattern } from './types'

/**
 * `loadFactor` is only ever compared *within* a pattern. The most common loaded
 * version of each pattern is pinned at 1.0 and everything else is expressed
 * relative to it, so swapping a lift can carry the load across. It's an
 * approximation and the UI says so — it exists to keep a cycle moving in a
 * hotel gym, not to be exact.
 */
const ex = (
  id: string,
  name: string,
  equipment: Equipment,
  pattern: Pattern,
  opts: Partial<Exercise> = {},
): Exercise => ({ id, name, equipment, pattern, ...opts })

export const EXERCISES: Exercise[] = [
  // Vertical press
  ex('ohp', 'Overhead Press', 'barbell', 'vertical-press', { loadFactor: 1, canBeMain: true }),
  ex('push-press', 'Push Press', 'barbell', 'vertical-press', { loadFactor: 1.2, canBeMain: true }),
  ex('db-shoulder-press', 'DB Shoulder Press', 'dumbbell', 'vertical-press', { loadFactor: 0.4, perHand: true, canBeMain: true }),
  ex('arnold-press', 'Arnold Press', 'dumbbell', 'vertical-press', { loadFactor: 0.35, perHand: true }),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'machine', 'vertical-press', { loadFactor: 0.85, canBeMain: true }),
  ex('smith-shoulder-press', 'Smith Shoulder Press', 'smith', 'vertical-press', { loadFactor: 0.95, canBeMain: true }),
  ex('landmine-press', 'Landmine Press', 'barbell', 'vertical-press', { loadFactor: 0.5, perHand: true }),
  ex('pike-push-up', 'Pike Push Up', 'bodyweight', 'vertical-press'),
  ex('band-overhead-press', 'Band Overhead Press', 'band', 'vertical-press'),

  // Horizontal press
  ex('bench', 'Bench Press', 'barbell', 'horizontal-press', { loadFactor: 1, canBeMain: true }),
  ex('incline-bench', 'Incline Bench Press', 'barbell', 'horizontal-press', { loadFactor: 0.85, canBeMain: true }),
  ex('close-grip-bench', 'Close Grip Bench Press', 'barbell', 'horizontal-press', { loadFactor: 0.9 }),
  ex('db-bench', 'DB Bench Press', 'dumbbell', 'horizontal-press', { loadFactor: 0.4, perHand: true, canBeMain: true }),
  ex('incline-db-bench', 'Incline DB Bench Press', 'dumbbell', 'horizontal-press', { loadFactor: 0.35, perHand: true }),
  ex('machine-chest-press', 'Machine Chest Press', 'machine', 'horizontal-press', { loadFactor: 0.85, canBeMain: true }),
  ex('smith-bench', 'Smith Bench Press', 'smith', 'horizontal-press', { loadFactor: 0.95, canBeMain: true }),
  ex('pec-dec', 'Pec Deck', 'machine', 'horizontal-press', { loadFactor: 0.45 }),
  ex('cable-fly', 'Cable Chest Fly', 'cable', 'horizontal-press', { loadFactor: 0.3 }),
  ex('push-up', 'Push Up', 'bodyweight', 'horizontal-press'),
  ex('diamond-push-up', 'Diamond Push Up', 'bodyweight', 'horizontal-press'),
  ex('dip', 'Dip', 'bodyweight', 'horizontal-press'),

  // Squat
  ex('back-squat', 'Back Squat', 'barbell', 'squat', { loadFactor: 1, canBeMain: true }),
  ex('front-squat', 'Front Squat', 'barbell', 'squat', { loadFactor: 0.85, canBeMain: true }),
  ex('smith-squat', 'Smith Squat', 'smith', 'squat', { loadFactor: 0.95, canBeMain: true }),
  ex('hack-squat', 'Hack Squat', 'machine', 'squat', { loadFactor: 1.1, canBeMain: true }),
  ex('leg-press', 'Leg Press', 'machine', 'squat', { loadFactor: 1.8, canBeMain: true }),
  ex('goblet-squat', 'Goblet Squat', 'dumbbell', 'squat', { loadFactor: 0.35, canBeMain: true }),
  ex('db-front-squat', 'DB Front Squat', 'dumbbell', 'squat', { loadFactor: 0.25, perHand: true }),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'dumbbell', 'squat', { loadFactor: 0.22, perHand: true }),
  ex('leg-extension', 'Leg Extension', 'machine', 'squat', { loadFactor: 0.4 }),
  ex('bodyweight-squat', 'Bodyweight Squat', 'bodyweight', 'squat'),
  ex('pistol-squat', 'Pistol Squat', 'bodyweight', 'squat'),
  ex('wall-sit', 'Wall Sit', 'bodyweight', 'squat'),

  // Hinge
  ex('deadlift', 'Deadlift', 'barbell', 'hinge', { loadFactor: 1, canBeMain: true }),
  ex('sumo-deadlift', 'Sumo Deadlift', 'barbell', 'hinge', { loadFactor: 1, canBeMain: true }),
  ex('trap-bar-deadlift', 'Trap Bar Deadlift', 'barbell', 'hinge', { loadFactor: 1.05, canBeMain: true }),
  ex('rdl', 'Romanian Deadlift', 'barbell', 'hinge', { loadFactor: 0.7, canBeMain: true }),
  ex('good-morning', 'Good Morning', 'barbell', 'hinge', { loadFactor: 0.45 }),
  ex('hip-thrust', 'Hip Thrust', 'barbell', 'hinge', { loadFactor: 0.85, canBeMain: true }),
  ex('db-rdl', 'DB Romanian Deadlift', 'dumbbell', 'hinge', { loadFactor: 0.3, perHand: true, canBeMain: true }),
  ex('single-leg-rdl', 'Single Leg RDL', 'dumbbell', 'hinge', { loadFactor: 0.18, perHand: true }),
  ex('kb-swing', 'Kettlebell Swing', 'kettlebell', 'hinge', { loadFactor: 0.25 }),
  ex('back-extension', 'Back Extension', 'bodyweight', 'hinge'),
  ex('seated-leg-curl', 'Seated Leg Curl', 'machine', 'hinge', { loadFactor: 0.3 }),
  ex('lying-leg-curl', 'Lying Leg Curl', 'machine', 'hinge', { loadFactor: 0.28 }),
  ex('nordic-curl', 'Nordic Curl', 'bodyweight', 'hinge'),
  ex('glute-bridge', 'Glute Bridge', 'bodyweight', 'hinge'),

  // Lunge
  ex('reverse-lunge', 'Reverse DB Lunge', 'dumbbell', 'lunge', { loadFactor: 1, perHand: true }),
  ex('walking-lunge', 'Walking DB Lunge', 'dumbbell', 'lunge', { loadFactor: 0.9, perHand: true }),
  ex('step-up', 'Step Up', 'dumbbell', 'lunge', { loadFactor: 0.85, perHand: true }),
  ex('barbell-lunge', 'Barbell Lunge', 'barbell', 'lunge', { loadFactor: 2.2 }),
  ex('bodyweight-lunge', 'Bodyweight Lunge', 'bodyweight', 'lunge'),

  // Vertical pull
  ex('lat-pulldown', 'Lat Pulldown', 'machine', 'vertical-pull', { loadFactor: 1 }),
  ex('cable-pullover', 'Cable Pullover', 'cable', 'vertical-pull', { loadFactor: 0.45 }),
  ex('pull-up', 'Pull Up', 'bodyweight', 'vertical-pull'),
  ex('chin-up', 'Chin Up', 'bodyweight', 'vertical-pull'),
  ex('band-pulldown', 'Band Pulldown', 'band', 'vertical-pull'),
  ex('inverted-row', 'Inverted Row', 'bodyweight', 'vertical-pull'),

  // Horizontal pull
  ex('barbell-row', 'Barbell Row', 'barbell', 'horizontal-pull', { loadFactor: 1, canBeMain: true }),
  ex('pendlay-row', 'Pendlay Row', 'barbell', 'horizontal-pull', { loadFactor: 0.95 }),
  ex('db-row', 'DB Row', 'dumbbell', 'horizontal-pull', { loadFactor: 0.4, perHand: true }),
  ex('chest-supported-row', 'Chest Supported Row', 'machine', 'horizontal-pull', { loadFactor: 0.5 }),
  ex('seated-cable-row', 'Seated Cable Row', 'cable', 'horizontal-pull', { loadFactor: 0.85 }),
  ex('t-bar-row', 'T-Bar Row', 'machine', 'horizontal-pull', { loadFactor: 0.9 }),
  ex('band-row', 'Band Row', 'band', 'horizontal-pull'),

  // Delts
  ex('db-lateral-raise', 'DB Lateral Raise', 'dumbbell', 'delts', { loadFactor: 1, perHand: true }),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'cable', 'delts', { loadFactor: 1 }),
  ex('db-rear-delt-fly', 'DB Rear Delt Fly', 'dumbbell', 'delts', { loadFactor: 1.3, perHand: true }),
  ex('cable-face-pull', 'Cable Face Pull', 'cable', 'delts', { loadFactor: 3 }),
  ex('rear-delt-cable-fly', 'Rear Delt Cable Fly', 'cable', 'delts', { loadFactor: 1.4 }),
  ex('db-front-raise', 'DB Front Raise', 'dumbbell', 'delts', { loadFactor: 1.1, perHand: true }),
  ex('band-pull-apart', 'Band Pull-Apart', 'band', 'delts'),

  // Arms
  ex('db-curl', 'DB Curl', 'dumbbell', 'biceps', { loadFactor: 1, perHand: true }),
  ex('hammer-curl', 'Hammer Curl', 'dumbbell', 'biceps', { loadFactor: 1.05, perHand: true }),
  ex('barbell-curl', 'Barbell Curl', 'barbell', 'biceps', { loadFactor: 2.2 }),
  ex('cable-curl', 'Cable Curl', 'cable', 'biceps', { loadFactor: 2.1 }),
  ex('band-curl', 'Band Curl', 'band', 'biceps'),
  ex('db-skull-crusher', 'DB Skull Crusher', 'dumbbell', 'triceps', { loadFactor: 1, perHand: true }),
  ex('skull-crusher', 'Skull Crusher (EZ bar)', 'barbell', 'triceps', { loadFactor: 2.2 }),
  ex('db-overhead-extension', 'DB Tricep Overhead Extension', 'dumbbell', 'triceps', { loadFactor: 1.6 }),
  ex('rope-pushdown', 'Rope Pushdown', 'cable', 'triceps', { loadFactor: 2.4 }),
  ex('bench-dip', 'Bench Dip', 'bodyweight', 'triceps'),

  // Calves
  ex('seated-calf-raise', 'Seated Calf Raise', 'machine', 'calf', { loadFactor: 1 }),
  ex('standing-calf-raise', 'Standing Calf Raise', 'machine', 'calf', { loadFactor: 1.5 }),
  ex('db-calf-raise', 'Calf Raise (DB)', 'dumbbell', 'calf', { loadFactor: 0.5, perHand: true }),
  ex('bw-calf-raise', 'Calf Raise (Bodyweight)', 'bodyweight', 'calf'),

  // Core
  ex('ab-wheel', 'Ab Wheel', 'bodyweight', 'core'),
  ex('plank', 'Plank', 'bodyweight', 'core'),
  ex('dead-bug', 'Dead Bug', 'bodyweight', 'core'),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'bodyweight', 'core'),
  ex('cable-crunch', 'Cable Crunch', 'cable', 'core', { loadFactor: 1 }),
  ex('russian-twist', 'Russian Twist', 'dumbbell', 'core', { loadFactor: 0.4 }),
]

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))

export function getExercise(id: string, custom: Exercise[] = []): Exercise {
  return (
    custom.find((e) => e.id === id) ??
    BY_ID.get(id) ?? {
      id,
      name: id,
      equipment: 'barbell',
      pattern: 'horizontal-press',
    }
  )
}

export function allExercises(custom: Exercise[] = []): Exercise[] {
  return [...EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name))
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  kettlebell: 'Kettlebell',
  band: 'Band',
  bodyweight: 'Bodyweight',
  smith: 'Smith machine',
}

export const PATTERN_LABELS: Record<Pattern, string> = {
  'vertical-press': 'Overhead press',
  'horizontal-press': 'Chest press',
  'vertical-pull': 'Pull down',
  'horizontal-pull': 'Row',
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  calf: 'Calves',
  core: 'Core',
  biceps: 'Biceps',
  triceps: 'Triceps',
  delts: 'Delts',
}

/** Equipment you can assume exists anywhere, including a hotel room. */
export const ALWAYS_AVAILABLE: Equipment[] = ['bodyweight']

export interface AlternateSuggestion {
  exercise: Exercise
  /** Multiply the current prescription by this to keep the effort comparable. */
  loadRatio: number | null
  available: boolean
  reason: string
}

/**
 * Candidate stand-ins for an exercise, best first. Same movement pattern, then
 * ranked by whether you actually have the equipment and how close the load
 * conversion is to something meaningful.
 */
export function alternatesFor(
  exerciseId: string,
  availableEquipment: Equipment[],
  custom: Exercise[] = [],
): AlternateSuggestion[] {
  const source = getExercise(exerciseId, custom)
  const available = new Set([...availableEquipment, ...ALWAYS_AVAILABLE])
  return allExercises(custom)
    .filter((candidate) => candidate.id !== source.id && candidate.pattern === source.pattern)
    .map((candidate) => {
      const isAvailable = available.has(candidate.equipment)
      const ratio =
        source.loadFactor && candidate.loadFactor ? candidate.loadFactor / source.loadFactor : null
      return {
        exercise: candidate,
        loadRatio: ratio,
        available: isAvailable,
        reason: ratio
          ? `${EQUIPMENT_LABELS[candidate.equipment]} · about ${Math.round(ratio * 100)}% of the load`
          : `${EQUIPMENT_LABELS[candidate.equipment]} · match effort by reps`,
      }
    })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1
      const aRatio = a.loadRatio === null ? Infinity : Math.abs(Math.log(a.loadRatio))
      const bRatio = b.loadRatio === null ? Infinity : Math.abs(Math.log(b.loadRatio))
      return aRatio - bRatio
    })
}

/**
 * Carry a load across a swap. Returns null when the two movements have no
 * comparable loading (e.g. swapping a press for push-ups), in which case the
 * caller should fall back to rep-matching.
 */
export function convertLoad(
  fromId: string,
  toId: string,
  weight: number,
  custom: Exercise[] = [],
): number | null {
  const from = getExercise(fromId, custom)
  const to = getExercise(toId, custom)
  if (!from.loadFactor || !to.loadFactor) return null
  return weight * (to.loadFactor / from.loadFactor)
}
