import { describe, expect, it } from 'vitest'
import {
  contextFor,
  createCycle,
  cycleMaxDrift,
  cycleSlots,
  hydrateSession,
  liftsFor,
  mainExerciseIdAt,
  nextCycleFrom,
  ordinalOfSet,
  prescriptionsFor,
  refreshCycle,
  setBelongsTo,
} from './cycle'
import { DEFAULT_SETTINGS } from './defaults'
import { bestAmrap, reviewCycle } from './progression'
import { buildCycleReport } from './report'
import { buildSessionView } from './sessionView'
import { sessionToText } from './share'
import { findTemplate } from './templates'
import type { Cycle, DaySlot, Lift, PlannedAccessory, Session } from './types'
import { lbToKg } from './units'

const settings = { ...DEFAULT_SETTINGS }

/**
 * A three-day layout of the shape the user asked for: squat and deadlift keep
 * days of their own, the two presses share one.
 */
const LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(330), category: 'lower' },
  { slot: 'B', exerciseId: 'back-squat', label: 'Back Squat', est1RMKg: lbToKg(275), category: 'lower' },
  { slot: 'C', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(125), category: 'upper' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(185), category: 'upper' },
]

const emptyPlan = (): Record<DaySlot, PlannedAccessory[]> => ({
  A: [],
  B: [],
  C: [],
  D: [],
  E: [],
  F: [],
})

const build = () =>
  createCycle({
    number: 1,
    lifts: LIFTS,
    accessoryPlan: emptyPlan(),
    template: findTemplate('fsl-5x5'),
    settings,
  })

const hydrate = (cycle: Cycle, key: string) =>
  hydrateSession(cycle, cycle.sessions[key], settings)

/** Logs every set of one lift of a day at its prescription, AMRAP included. */
function logLift(session: Session, ordinal: number, amrapReps: number): Session {
  const mark = (set: Session['mainSets'][number]) =>
    setBelongsTo(set.id, ordinal)
      ? {
          // hydrateSession pre-fills the prescribed weight, so logging a set as
          // done at the plan's load only means ticking it off.
          ...set,
          done: true,
          actualReps: set.amrap ? amrapReps : set.targetReps,
        }
      : set
  return {
    ...session,
    status: 'complete' as const,
    completedDate: '2026-03-02',
    mainSets: session.mainSets.map(mark),
    supplementalSets: session.supplementalSets.map(mark),
  }
}

describe('days logged before combined days existed', () => {
  /** The one-lift-per-day shape: unprefixed set ids and the old swap fields. */
  const legacy = () =>
    createCycle({
      number: 1,
      lifts: LIFTS.slice(0, 2),
      accessoryPlan: emptyPlan(),
      template: findTemplate('fsl-5x5'),
      settings,
    })

  it('still merge against their prescription', () => {
    const cycle = legacy()
    const session = hydrate(cycle, 'w1A')
    expect(session.mainSets.every((set) => !/^L\d+:/.test(set.id))).toBe(true)

    const logged = logLift(session, 0, 11)
    const merged = hydrateSession(cycle, logged, settings)
    // Re-hydrating must not discard what was logged against the old ids.
    expect(merged.mainSets.filter((set) => set.done)).toHaveLength(
      logged.mainSets.filter((set) => set.done).length,
    )
    expect(bestAmrap({ ...cycle, sessions: { ...cycle.sessions, w1A: logged } }, 'A')?.reps).toBe(11)
  })

  it('keep a swap stored in the old fields', () => {
    const cycle = legacy()
    const swapped: Session = { ...cycle.sessions.w1A, mainExerciseId: 'trap-bar-deadlift' }
    const view = buildSessionView(cycle, swapped, settings)
    expect(view.lifts[0].swappedTo).toBe('Trap Bar Deadlift')
    expect(mainExerciseIdAt(cycle, swapped, 0)).toBe('trap-bar-deadlift')
  })
})

describe('a day that holds two main lifts', () => {
  it('is still a three-day cycle', () => {
    const cycle = build()
    expect(cycleSlots(cycle)).toEqual(['A', 'B', 'C'])
    expect(Object.keys(cycle.sessions)).toHaveLength(12)
    expect(liftsFor(cycle, 'C').map((lift) => lift.exerciseId)).toEqual(['ohp', 'bench'])
  })

  it('prescribes both lifts off their own training maxes', () => {
    const cycle = build()
    const blocks = prescriptionsFor(cycle, cycle.sessions.w1C, settings)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].exercise.id).toBe('ohp')
    expect(blocks[1].exercise.id).toBe('bench')
    // The bench max is the heavier of the two, so its sets must be heavier.
    expect(blocks[1].prescription.trainingMax).toBeGreaterThan(blocks[0].prescription.trainingMax)
    const top = (i: number) =>
      blocks[i].prescription.main[blocks[i].prescription.main.length - 1].weight ?? 0
    expect(top(1)).toBeGreaterThan(top(0))
  })

  it('keeps the first lift on unprefixed set ids so old logs still merge', () => {
    const session = hydrate(build(), 'w1C')
    const ids = session.mainSets.map((set) => set.id)
    expect(ids).toContain('main-0')
    expect(ids).toContain('L1:main-0')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ordinalOfSet('main-0')).toBe(0)
    expect(ordinalOfSet('L1:main-0')).toBe(1)
  })

  it('tracks a rep record per lift, not per day', () => {
    const cycle = build()
    const logged = logLift(logLift(hydrate(cycle, 'w1C'), 0, 9), 1, 6)
    const withSession: Cycle = { ...cycle, sessions: { ...cycle.sessions, w1C: logged } }

    const press = bestAmrap(withSession, 'C', 0)
    const bench = bestAmrap(withSession, 'C', 1)
    expect(press?.reps).toBe(9)
    expect(bench?.reps).toBe(6)
    // Each record is against its own lift's weight, not the day's first one.
    expect(bench?.weightKg).toBeGreaterThan(press?.weightKg ?? 0)
  })

  it('splits the day volume between its two lifts', () => {
    const cycle = build()
    const logged = logLift(logLift(hydrate(cycle, 'w1C'), 0, 9), 1, 6)
    const report = buildCycleReport({ ...cycle, sessions: { ...cycle.sessions, w1C: logged } })

    const press = report.lifts.find((lift) => lift.label === 'Overhead Press')
    const bench = report.lifts.find((lift) => lift.label === 'Bench Press')
    expect(press?.volumeKg).toBeGreaterThan(0)
    expect(bench?.volumeKg).toBeGreaterThan(0)
    // Counted once each, not the whole day credited to both.
    expect((press?.volumeKg ?? 0) + (bench?.volumeKg ?? 0)).toBeCloseTo(report.totalVolumeKg, 6)
    expect(press?.volumeKg).not.toBeCloseTo(bench?.volumeKg ?? 0, 6)
  })

  it('never compares one lift of a day against the other max', () => {
    const cycle = build()
    const profile = {
      id: 'p',
      displayName: 'Combo',
      settings,
      lifts: LIFTS,
      accessoryPlan: emptyPlan(),
      customTemplates: [],
      customExercises: [],
      activeCycleId: cycle.id,
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    }

    // Nothing has been edited, so a freshly built cycle cannot have drifted.
    expect(cycleMaxDrift(cycle, profile)).toEqual([])

    // Refreshing must leave each lift on its own max, not the day's first one.
    const refreshed = refreshCycle(cycle, profile)
    const tmOf = (id: string) => refreshed.lifts.find((l) => l.exerciseId === id)?.trainingMaxKg
    expect(tmOf('bench')).toBe(cycle.lifts.find((l) => l.exerciseId === 'bench')?.trainingMaxKg)
    expect(tmOf('ohp')).toBe(cycle.lifts.find((l) => l.exerciseId === 'ohp')?.trainingMaxKg)
    expect(tmOf('bench')).not.toBe(tmOf('ohp'))
  })

  it('carries a separate new max for each lift of a day into the next cycle', () => {
    const cycle = build()
    const profile = {
      id: 'p',
      displayName: 'Combo',
      settings,
      lifts: LIFTS,
      accessoryPlan: emptyPlan(),
      customTemplates: [],
      customExercises: [],
      activeCycleId: cycle.id,
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    }

    const reviews = reviewCycle(cycle, settings, contextFor(settings))
    const onDayC = reviews.filter((review) => review.slot === 'C')
    expect(onDayC).toHaveLength(2)
    expect(onDayC.map((review) => review.key)).toEqual(['C:0', 'C:1'])

    // Choose a different max for each of the day's two lifts.
    const chosen: Record<string, number> = {}
    for (const review of reviews) chosen[review.key] = review.incrementTrainingMaxKg
    const next = nextCycleFrom(cycle, profile, chosen)

    for (const review of reviews) {
      const lift = liftsFor(next, review.slot)[review.ordinal]
      expect(lift.exerciseId).toBe(review.exerciseId)
      expect(lift.trainingMaxKg).toBeCloseTo(chosen[review.key], 6)
    }
    // Both presses moved, and they did not end up on the same number.
    const presses = liftsFor(next, 'C')
    expect(presses[0].trainingMaxKg).not.toBeCloseTo(presses[1].trainingMaxKg, 6)
  })

  it('reports both lifts when the day is shared or printed', () => {
    const cycle = build()
    const logged = logLift(hydrate(cycle, 'w1C'), 0, 9)
    const withSession: Cycle = { ...cycle, sessions: { ...cycle.sessions, w1C: logged } }

    const view = buildSessionView(withSession, logged, settings)
    expect(view.liftLabel).toBe('Overhead Press + Bench Press')
    expect(view.lifts).toHaveLength(2)
    expect(view.lifts[0].main.every((row) => row.done)).toBe(true)
    expect(view.lifts[1].main.every((row) => row.done)).toBe(false)

    const text = sessionToText(withSession, logged, settings)
    expect(text).toContain('Overhead Press')
    expect(text).toContain('Bench Press')
    // The press was taken past its target, so it is marked as a record.
    expect(text).toContain('★')
  })
})
