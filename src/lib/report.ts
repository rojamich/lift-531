import { estimateOneRepMax } from './engine'
import { getExercise } from './exercises'
import { mainExerciseId } from './cycle'
import { bestAmrap } from './progression'
import type {
  Cycle,
  DaySlot,
  Exercise,
  LoggedAccessorySet,
  LoggedSet,
  Pattern,
  Session,
} from './types'

/**
 * Muscle groups for the report's split. Coarser than the movement patterns the
 * engine uses, because "where did the work go" is a question about the body,
 * not about the bar path.
 */
export const MUSCLE_BY_PATTERN: Record<Pattern, string> = {
  'vertical-press': 'Shoulders',
  'horizontal-press': 'Chest',
  'vertical-pull': 'Back',
  'horizontal-pull': 'Back',
  squat: 'Quads',
  hinge: 'Posterior chain',
  lunge: 'Quads',
  calf: 'Calves',
  core: 'Core',
  biceps: 'Biceps',
  triceps: 'Triceps',
  delts: 'Shoulders',
}

export interface ExerciseTotals {
  exerciseId: string
  name: string
  muscle: string
  sets: number
  reps: number
  /** Sum of weight × reps, in kilograms. Bodyweight work contributes none. */
  volumeKg: number
  /** Heaviest single set by estimated one-rep max. */
  bestSet: { weightKg: number | null; reps: number } | null
}

export interface LiftHighlight {
  slot: DaySlot
  label: string
  trainingMaxKg: number
  best: { weightKg: number; reps: number; week: number; targetReps: number } | null
  estimatedOneRepMaxKg: number | null
  /** Reps past the prescription on the best top set. */
  surplus: number | null
  volumeKg: number
}

export interface CycleReport {
  cycleName: string
  cycleNumber: number
  templateName: string
  startDate: string
  endDate: string | null
  /** Days actually trained, out of the sixteen in a cycle. */
  sessionsCompleted: number
  sessionsSkipped: number
  sessionsTotal: number
  totalSets: number
  totalReps: number
  totalVolumeKg: number
  /** Every set the lifter took past its prescribed reps. */
  repsPastTarget: number
  lifts: LiftHighlight[]
  exercises: ExerciseTotals[]
  muscles: { muscle: string; volumeKg: number; sets: number; share: number }[]
  /** Days trained, oldest first, for a simple streak view. */
  dates: string[]
}

/** Main and supplemental sets record `actualReps`; accessory sets record `reps`. */
const mainLogged = (set: LoggedSet) => set.done && (set.actualReps ?? 0) > 0
const accessoryLogged = (set: LoggedAccessorySet) => set.done && (set.reps ?? 0) > 0

function accumulate(
  totals: Map<string, ExerciseTotals>,
  exercise: Exercise,
  weightKg: number | null,
  reps: number,
) {
  const key = exercise.id
  const entry = totals.get(key) ?? {
    exerciseId: exercise.id,
    name: exercise.name,
    muscle: MUSCLE_BY_PATTERN[exercise.pattern] ?? 'Other',
    sets: 0,
    reps: 0,
    volumeKg: 0,
    bestSet: null,
  }
  entry.sets += 1
  entry.reps += reps
  // Dumbbells are logged per hand, so the work done is twice the number shown.
  const perSet = weightKg === null ? 0 : weightKg * reps * (exercise.perHand ? 2 : 1)
  entry.volumeKg += perSet
  const better =
    entry.bestSet === null ||
    estimateOneRepMax(weightKg ?? 0, reps) > estimateOneRepMax(entry.bestSet.weightKg ?? 0, entry.bestSet.reps)
  if (better) entry.bestSet = { weightKg, reps }
  totals.set(key, entry)
}

export function buildCycleReport(cycle: Cycle, custom: Exercise[] = []): CycleReport {
  const totals = new Map<string, ExerciseTotals>()
  let totalSets = 0
  let totalReps = 0
  let totalVolumeKg = 0
  let repsPastTarget = 0
  let sessionsCompleted = 0
  let sessionsSkipped = 0
  const dates: string[] = []
  const volumeBySlot = new Map<DaySlot, number>()

  const sessions = Object.values(cycle.sessions) as Session[]
  for (const session of sessions) {
    if (session.status === 'skipped') sessionsSkipped += 1
    if (session.status !== 'complete') continue
    sessionsCompleted += 1
    if (session.completedDate) dates.push(session.completedDate)

    const mainExercise = getExercise(mainExerciseId(cycle, session), custom)
    let slotVolume = 0

    for (const set of [...session.mainSets, ...session.supplementalSets]) {
      if (!mainLogged(set)) continue
      const reps = set.actualReps as number
      totalSets += 1
      totalReps += reps
      const volume =
        set.actualWeightKg === null ? 0 : set.actualWeightKg * reps * (mainExercise.perHand ? 2 : 1)
      totalVolumeKg += volume
      slotVolume += volume
      if (set.amrap) repsPastTarget += Math.max(0, reps - set.targetReps)
      accumulate(totals, mainExercise, set.actualWeightKg, reps)
    }

    for (const accessory of session.accessories) {
      if (accessory.skipped) continue
      const exercise = getExercise(accessory.exerciseId, custom)
      for (const set of accessory.sets) {
        if (!accessoryLogged(set)) continue
        const reps = set.reps as number
        totalSets += 1
        totalReps += reps
        const volume = set.weightKg === null ? 0 : set.weightKg * reps * (exercise.perHand ? 2 : 1)
        totalVolumeKg += volume
        accumulate(totals, exercise, set.weightKg, reps)
      }
    }

    volumeBySlot.set(session.slot, (volumeBySlot.get(session.slot) ?? 0) + slotVolume)
  }

  const lifts: LiftHighlight[] = cycle.lifts.map((lift) => {
    const best = bestAmrap(cycle, lift.slot)
    return {
      slot: lift.slot,
      label: lift.label ?? getExercise(lift.exerciseId, custom).name,
      trainingMaxKg: lift.trainingMaxKg,
      best: best ? { weightKg: best.weightKg, reps: best.reps, week: best.week, targetReps: best.targetReps } : null,
      estimatedOneRepMaxKg: best ? estimateOneRepMax(best.weightKg, best.reps) : null,
      surplus: best ? best.surplus : null,
      volumeKg: volumeBySlot.get(lift.slot) ?? 0,
    }
  })

  const exercises = [...totals.values()].sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)

  const byMuscle = new Map<string, { volumeKg: number; sets: number }>()
  for (const entry of exercises) {
    const current = byMuscle.get(entry.muscle) ?? { volumeKg: 0, sets: 0 }
    current.volumeKg += entry.volumeKg
    current.sets += entry.sets
    byMuscle.set(entry.muscle, current)
  }
  const muscleVolume = [...byMuscle.values()].reduce((sum, m) => sum + m.volumeKg, 0)
  const muscles = [...byMuscle.entries()]
    .map(([muscle, value]) => ({
      muscle,
      volumeKg: value.volumeKg,
      sets: value.sets,
      // Fall back to set share when nothing was loaded, so bodyweight days still chart.
      share: muscleVolume > 0 ? value.volumeKg / muscleVolume : 0,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets)

  dates.sort()

  return {
    cycleName: cycle.name,
    cycleNumber: cycle.number,
    templateName: cycle.template.name,
    // The first day actually trained, when that precedes the cycle's own start
    // date — a cycle created after the fact would otherwise read back to front.
    startDate: dates[0] && dates[0] < cycle.startDate ? dates[0] : cycle.startDate,
    endDate: dates[dates.length - 1] ?? null,
    sessionsCompleted,
    sessionsSkipped,
    sessionsTotal: sessions.length,
    totalSets,
    totalReps,
    totalVolumeKg,
    repsPastTarget,
    lifts,
    exercises,
    muscles,
    dates,
  }
}


