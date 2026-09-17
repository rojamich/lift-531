import { describe, expect, it } from 'vitest'
import type { EquipmentContext } from './engine'
import { createCycle, cycleMaxDrift, refreshCycle, hydrateSession, prescriptionFor } from './cycle'
import { DEFAULT_SETTINGS, createProfile } from './defaults'
import { progressAccessories, parseRepRange } from './progression'
import { findTemplate } from './templates'
import type { Lift, LoggedAccessory, PlannedAccessory } from './types'
import { fromKg, lbToKg, roundTo } from './units'

const LB: EquipmentContext = {
  unit: 'lb',
  barbellIncrement: 5,
  dumbbellIncrement: 5,
  machineIncrement: 5,
  maxDumbbell: null,
}

const plan = (over: Partial<PlannedAccessory> = {}): PlannedAccessory => ({
  id: 'p1',
  exerciseId: 'incline-db-bench',
  sets: 3,
  targetReps: '10-12',
  targetWeightKg: lbToKg(45),
  restSeconds: 90,
  notes: '',
  active: true,
  ...over,
})

const logged = (reps: (number | null)[], over: Partial<LoggedAccessory> = {}): LoggedAccessory => ({
  planId: 'p1',
  exerciseId: 'incline-db-bench',
  targetReps: '10-12',
  targetWeightKg: lbToKg(45),
  sets: reps.map((r) => ({ done: r !== null, weightKg: lbToKg(45), reps: r })),
  notes: '',
  skipped: false,
  ...over,
})

const inLb = (kg: number) => roundTo(fromKg(kg, 'lb'), 0.5)

/**
 * The four lifts and estimated maxes from the source spreadsheet. Declared here
 * rather than imported from the app's seed data: these are the parity fixtures
 * and must not drift when the example setup shipped to new users changes.
 */
const SHEET_LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(125), category: 'upper' },
  { slot: 'B', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(330), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(185), category: 'upper' },
  { slot: 'D', exerciseId: 'front-squat', label: 'Front Squat', est1RMKg: lbToKg(175), category: 'lower' },
]


describe('accessory auto-progression', () => {
  it('adds weight when every set clears the top of the range', () => {
    const { plan: next, bumps } = progressAccessories([plan()], [logged([12, 12, 12])], LB)
    expect(bumps).toHaveLength(1)
    expect(inLb(bumps[0].toKg)).toBe(50)
    expect(inLb(next[0].targetWeightKg as number)).toBe(50)
  })

  it('holds when one set falls short', () => {
    const { bumps } = progressAccessories([plan()], [logged([12, 12, 11])], LB)
    expect(bumps).toEqual([])
  })

  it('holds when a set was never done', () => {
    const { bumps } = progressAccessories([plan()], [logged([12, 12, null])], LB)
    expect(bumps).toEqual([])
  })

  it('holds when fewer sets were logged than planned', () => {
    const { bumps } = progressAccessories([plan({ sets: 4 })], [logged([12, 12, 12])], LB)
    expect(bumps).toEqual([])
  })

  it('treats a single rep target as its own ceiling', () => {
    const { bumps } = progressAccessories(
      [plan({ targetReps: '10' })],
      [logged([10, 10, 10], { targetReps: '10' })],
      LB,
    )
    expect(inLb(bumps[0].toKg)).toBe(50)
  })

  it('leaves AMRAP work alone — there the goal is reps', () => {
    const { bumps } = progressAccessories(
      [plan({ targetReps: 'AMRAP', exerciseId: 'chin-up', targetWeightKg: null })],
      [logged([20, 18, 15], { targetReps: 'AMRAP', exerciseId: 'chin-up' })],
      LB,
    )
    expect(bumps).toEqual([])
  })

  it('leaves bodyweight work alone', () => {
    const { bumps } = progressAccessories(
      [plan({ exerciseId: 'ab-wheel', targetWeightKg: null })],
      [logged([12, 12, 12], { exerciseId: 'ab-wheel' })],
      LB,
    )
    expect(bumps).toEqual([])
  })

  it('skips an accessory that was skipped', () => {
    const { bumps } = progressAccessories([plan()], [logged([12, 12, 12], { skipped: true })], LB)
    expect(bumps).toEqual([])
  })

  it('uses the machine increment for a machine exercise', () => {
    const { bumps } = progressAccessories(
      [plan({ exerciseId: 'leg-press', targetWeightKg: lbToKg(255), targetReps: '12' })],
      [logged([12, 12, 12], { exerciseId: 'leg-press', targetReps: '12' })],
      LB,
    )
    expect(inLb(bumps[0].toKg)).toBe(260)
  })

  it('reads the rep ranges the spreadsheet used', () => {
    expect(parseRepRange('10-12')).toMatchObject({ min: 10, max: 12 })
    expect(parseRepRange('8/leg')).toMatchObject({ min: 8, max: 8 })
    expect(parseRepRange('AMRAP').amrap).toBe(true)
    expect(parseRepRange('15')).toMatchObject({ min: 15, max: 15 })
  })
})

describe('refreshing a cycle after a max changes', () => {
  const base = createProfile('u1', 'Lifter', 'example')
  const profile = { ...base, lifts: SHEET_LIFTS }
  const settings = { ...DEFAULT_SETTINGS, maxDumbbellKg: lbToKg(55) }
  const build = () =>
    createCycle({
      number: 1,
      lifts: SHEET_LIFTS,
      accessoryPlan: profile.accessoryPlan,
      template: findTemplate('fsl-5x5'),
      settings,
    })

  it('reports nothing when the cycle already matches', () => {
    expect(cycleMaxDrift(build(), { ...profile, settings })).toEqual([])
  })

  it('spots a changed max', () => {
    const cycle = build()
    const edited = {
      ...profile,
      settings,
      lifts: profile.lifts.map((l) => (l.slot === 'C' ? { ...l, est1RMKg: lbToKg(225) } : l)),
    }
    const drift = cycleMaxDrift(cycle, edited)
    expect(drift).toHaveLength(1)
    expect(drift[0].slot).toBe('C')
    expect(inLb(drift[0].fromKg)).toBe(155)
    expect(inLb(drift[0].toKg)).toBe(190)
  })

  it('spots a changed training max percentage', () => {
    const edited = { ...profile, settings: { ...settings, tmPercent: 0.9 } }
    expect(cycleMaxDrift(build(), edited).length).toBe(4)
  })

  it('rebuilds untouched days against the new max', () => {
    const cycle = build()
    const edited = {
      ...profile,
      settings,
      lifts: profile.lifts.map((l) => (l.slot === 'C' ? { ...l, est1RMKg: lbToKg(225) } : l)),
    }
    const refreshed = refreshCycle(cycle, edited)
    const p = prescriptionFor(refreshed, refreshed.sessions.w1C, settings)
    // 225 lb estimate -> 190 lb training max -> 65/75/85% of that.
    expect(p.trainingMax).toBe(190)
    expect(p.main.map((s) => s.weight)).toEqual([125, 145, 160])
  })

  it('leaves a completed day exactly as it was logged', () => {
    const cycle = build()
    const hydrated = hydrateSession(cycle, cycle.sessions.w1C, settings)
    const done = {
      ...hydrated,
      status: 'complete' as const,
      completedDate: '2026-09-15T18:00:00.000Z',
      mainSets: hydrated.mainSets.map((s) => ({ ...s, done: true, actualReps: s.targetReps })),
    }
    const withHistory = { ...cycle, sessions: { ...cycle.sessions, w1C: done } }
    const edited = {
      ...profile,
      settings,
      lifts: profile.lifts.map((l) => (l.slot === 'C' ? { ...l, est1RMKg: lbToKg(225) } : l)),
    }
    const refreshed = refreshCycle(withHistory, edited)
    expect(refreshed.sessions.w1C).toEqual(done)
    // The next day still picks up the new number.
    expect(prescriptionFor(refreshed, refreshed.sessions.w2C, settings).trainingMax).toBe(190)
  })
})
