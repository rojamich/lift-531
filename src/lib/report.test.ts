import { describe, expect, it } from 'vitest'
import { applyAccessoryPlan, createCycle, hydrateSession } from './cycle'
import { DEFAULT_SETTINGS } from './defaults'
import { repGoal } from './progression'
import { buildCycleReport } from './report'
import { findTemplate } from './templates'
import type { Cycle, DaySlot, Lift, PlannedAccessory } from './types'
import { fromKg, lbToKg, roundTo } from './units'

const settings = { ...DEFAULT_SETTINGS }

const LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(125), category: 'upper' },
  { slot: 'B', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(330), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(185), category: 'upper' },
  { slot: 'D', exerciseId: 'front-squat', label: 'Front Squat', est1RMKg: lbToKg(175), category: 'lower' },
]

const accessory = (over: Partial<PlannedAccessory> & { id: string }): PlannedAccessory => ({
  exerciseId: 'db-row',
  sets: 3,
  targetReps: '10-12',
  targetWeightKg: lbToKg(50),
  restSeconds: 90,
  notes: '',
  active: true,
  ...over,
})

const plan = (items: PlannedAccessory[]): Record<DaySlot, PlannedAccessory[]> => ({
  A: [],
  B: items,
  C: [],
  D: [],
})

const build = (items: PlannedAccessory[] = [accessory({ id: 'p1' })]) =>
  createCycle({
    number: 1,
    lifts: LIFTS,
    accessoryPlan: plan(items),
    template: findTemplate('fsl-5x5'),
    settings,
  })

/** Log a day fully: every main set at target, every accessory set at `reps`. */
function complete(cycle: Cycle, key: string, reps: number, date: string): Cycle {
  const hydrated = hydrateSession(cycle, cycle.sessions[key], settings)
  const session = {
    ...hydrated,
    status: 'complete' as const,
    completedDate: date,
    mainSets: hydrated.mainSets.map((s) => ({ ...s, done: true, actualReps: s.targetReps })),
    supplementalSets: hydrated.supplementalSets.map((s) => ({ ...s, done: true, actualReps: s.targetReps })),
    accessories: hydrated.accessories.map((a) => ({
      ...a,
      sets: a.sets.map((s) => ({ ...s, done: true, reps })),
    })),
  }
  return { ...cycle, sessions: { ...cycle.sessions, [key]: session } }
}

describe('editing the plan mid-cycle', () => {
  it('reaches days that have not been trained yet', () => {
    let cycle = build()
    cycle = complete(cycle, 'w1B', 12, '2026-09-01T10:00:00.000Z')
    // Open week 2 so it has materialised accessory rows, as the app does.
    cycle = {
      ...cycle,
      sessions: { ...cycle.sessions, w2B: hydrateSession(cycle, cycle.sessions.w2B, settings) },
    }
    expect(cycle.sessions.w2B.accessories[0].exerciseId).toBe('db-row')

    const swapped = [accessory({ id: 'p1', exerciseId: 'seated-cable-row', targetWeightKg: lbToKg(110) })]
    cycle = applyAccessoryPlan(cycle, 'B', swapped, settings)

    expect(cycle.accessoryPlan.B[0].exerciseId).toBe('seated-cable-row')
    expect(cycle.sessions.w2B.accessories[0].exerciseId).toBe('seated-cable-row')
    expect(roundTo(fromKg(cycle.sessions.w2B.accessories[0].targetWeightKg as number, 'lb'), 1)).toBe(110)
  })

  it('leaves a day that is already logged exactly as it was', () => {
    let cycle = build()
    cycle = complete(cycle, 'w1B', 12, '2026-09-01T10:00:00.000Z')
    const before = cycle.sessions.w1B

    cycle = applyAccessoryPlan(cycle, 'B', [accessory({ id: 'p1', exerciseId: 'seated-cable-row' })], settings)
    expect(cycle.sessions.w1B).toEqual(before)
    expect(cycle.sessions.w1B.accessories[0].exerciseId).toBe('db-row')
  })

  it('does not swap a row the lifter has already started logging', () => {
    let cycle = build()
    const started = hydrateSession(cycle, cycle.sessions.w1B, settings)
    started.accessories[0].sets[0] = { ...started.accessories[0].sets[0], done: true, reps: 11 }
    cycle = { ...cycle, sessions: { ...cycle.sessions, w1B: { ...started, status: 'in-progress' } } }

    cycle = applyAccessoryPlan(cycle, 'B', [accessory({ id: 'p1', exerciseId: 'seated-cable-row' })], settings)
    expect(cycle.sessions.w1B.accessories[0].exerciseId).toBe('db-row')
    expect(cycle.sessions.w1B.accessories[0].sets[0].reps).toBe(11)
  })
})

describe('rep goal shown in a set row', () => {
  it.each([
    ['10-12', '12'],
    ['8', '8'],
    ['15', '15'],
    ['AMRAP', 'max'],
    ['8/leg', '8'],
  ])('%s reads as %s', (target, expected) => {
    expect(repGoal(target)).toBe(expected)
  })
})

describe('cycle report', () => {
  const trained = () => {
    let cycle = build()
    cycle = complete(cycle, 'w1B', 12, '2026-09-01T10:00:00.000Z')
    cycle = complete(cycle, 'w2B', 12, '2026-09-08T10:00:00.000Z')
    return cycle
  }

  it('counts only the days actually trained', () => {
    const report = buildCycleReport(trained())
    expect(report.sessionsCompleted).toBe(2)
    expect(report.sessionsTotal).toBe(16)
    expect(report.dates).toHaveLength(2)
    expect(report.endDate).toBe('2026-09-08T10:00:00.000Z')
  })

  it('totals sets across main, supplemental and accessory work', () => {
    const report = buildCycleReport(trained())
    // Per day: 2 warm-ups + 3 main + 5 FSL + 3 accessory sets = 13, twice.
    expect(report.totalSets).toBe(26)
    expect(report.totalReps).toBeGreaterThan(0)
    expect(report.totalVolumeKg).toBeGreaterThan(0)
  })

  it('counts a dumbbell set as both hands', () => {
    let cycle = build([accessory({ id: 'p1', exerciseId: 'db-row', targetWeightKg: 10, sets: 1 })])
    cycle = complete(cycle, 'w1B', 10, '2026-09-01T10:00:00.000Z')
    const row = buildCycleReport(cycle).exercises.find((e) => e.exerciseId === 'db-row')
    // 10 kg per hand, 10 reps, two hands.
    expect(row?.volumeKg).toBeCloseTo(200, 5)
  })

  it('credits bodyweight work with reps but no volume', () => {
    let cycle = build([accessory({ id: 'p1', exerciseId: 'ab-wheel', targetWeightKg: null, sets: 2 })])
    cycle = complete(cycle, 'w1B', 10, '2026-09-01T10:00:00.000Z')
    const abs = buildCycleReport(cycle).exercises.find((e) => e.exerciseId === 'ab-wheel')
    expect(abs?.reps).toBe(20)
    expect(abs?.volumeKg).toBe(0)
  })

  it('reports the rep record for each main lift', () => {
    const report = buildCycleReport(trained())
    const deadlift = report.lifts.find((l) => l.slot === 'B')
    expect(deadlift?.best).not.toBeNull()
    expect(deadlift?.estimatedOneRepMaxKg).toBeGreaterThan(0)
    // Untrained days have no rep record to show.
    expect(report.lifts.find((l) => l.slot === 'A')?.best).toBeNull()
  })

  it('splits volume by muscle group, heaviest first', () => {
    const report = buildCycleReport(trained())
    expect(report.muscles.length).toBeGreaterThan(0)
    const first = report.muscles[0].volumeKg
    const last = report.muscles[report.muscles.length - 1].volumeKg
    expect(first).toBeGreaterThanOrEqual(last)
    expect(report.muscles.reduce((sum, m) => sum + m.share, 0)).toBeCloseTo(1, 5)
    expect(report.muscles.map((m) => m.muscle)).toContain('Posterior chain')
  })

  it('is empty but valid for a cycle with nothing logged', () => {
    const report = buildCycleReport(build())
    expect(report.sessionsCompleted).toBe(0)
    expect(report.totalSets).toBe(0)
    expect(report.exercises).toEqual([])
    expect(report.muscles).toEqual([])
    expect(report.endDate).toBeNull()
  })
})

describe('report date range', () => {
  it('never reads back to front when sessions predate the cycle record', () => {
    let cycle = build()
    cycle = { ...cycle, startDate: '2026-12-01' }
    cycle = complete(cycle, 'w1B', 12, '2026-09-01T10:00:00.000Z')
    const report = buildCycleReport(cycle)
    expect(report.startDate <= (report.endDate as string)).toBe(true)
  })
})
