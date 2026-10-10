import { describe, expect, it } from 'vitest'
import { createCycle, hydrateSession } from './cycle'
import { DEFAULT_SETTINGS } from './defaults'
import { cycleToText, sessionToText } from './share'
import { findTemplate } from './templates'
import type { Cycle, DaySlot, Lift, PlannedAccessory, Session } from './types'
import { lbToKg } from './units'

const settings = { ...DEFAULT_SETTINGS }

const LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(125), category: 'upper' },
  { slot: 'B', exerciseId: 'deadlift', label: 'Deadlift', est1RMKg: lbToKg(330), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(185), category: 'upper' },
  { slot: 'D', exerciseId: 'front-squat', label: 'Front Squat', est1RMKg: lbToKg(175), category: 'lower' },
]

const ACCESSORY: PlannedAccessory = {
  id: 'p1',
  exerciseId: 'db-row',
  sets: 3,
  targetReps: '10-12',
  targetWeightKg: lbToKg(50),
  restSeconds: 90,
  notes: '',
  active: true,
}

const plan: Record<DaySlot, PlannedAccessory[]> = { A: [], B: [ACCESSORY], C: [], D: [] }

const build = () =>
  createCycle({ number: 1, lifts: LIFTS, accessoryPlan: plan, template: findTemplate('fsl-5x5'), settings })

function open(cycle: Cycle, key = 'w1B'): Session {
  return hydrateSession(cycle, cycle.sessions[key], settings)
}

function put(cycle: Cycle, session: Session, key = 'w1B'): Cycle {
  return { ...cycle, sessions: { ...cycle.sessions, [key]: session } }
}

describe('sharing a day', () => {
  it('shares the plan when nothing has been logged', () => {
    const cycle = build()
    const text = sessionToText(cycle, open(cycle), settings)
    expect(text).toContain('Planned')
    expect(text).toContain('Deadlift')
    // The prescription for week 1 off a 280 lb training max.
    expect(text).toContain('240 lb')
    expect(text).not.toContain('not done')
  })

  it('reports what was actually lifted once a day is done', () => {
    const cycle = build()
    const session = open(cycle)
    const done: Session = {
      ...session,
      status: 'complete',
      completedDate: '2026-10-09T18:00:00.000Z',
      // Worked lighter than prescribed, and beat the rep target.
      mainSets: session.mainSets.map((set) => ({
        ...set,
        done: true,
        actualWeightKg: lbToKg(225),
        actualReps: set.amrap ? 14 : set.targetReps,
      })),
      accessories: session.accessories.map((a) => ({
        ...a,
        sets: a.sets.map((s) => ({ ...s, done: true, weightKg: lbToKg(55), reps: 11 })),
      })),
    }
    const text = sessionToText(put(cycle, done), done, settings)

    expect(text).toContain('Done')
    expect(text).toContain('225 lb')
    expect(text).toContain('× 14')
    // The prescribed 240 is not what happened, so it should not be reported.
    expect(text).not.toContain('240 lb')
    expect(text).toContain('DB Row')
    expect(text).toContain('55 lb/hand × 11/11/11')
  })

  it('stars a rep record that beat its target', () => {
    const cycle = build()
    const session = open(cycle)
    const done: Session = {
      ...session,
      status: 'complete',
      mainSets: session.mainSets.map((set) => ({
        ...set,
        done: true,
        actualWeightKg: set.actualWeightKg,
        actualReps: set.amrap ? 12 : set.targetReps,
      })),
    }
    expect(sessionToText(put(cycle, done), done, settings)).toContain('★')
  })

  it('shows both halves of a half-finished day', () => {
    const cycle = build()
    const session = open(cycle)
    const partial: Session = {
      ...session,
      status: 'in-progress',
      mainSets: session.mainSets.map((set, index) =>
        index === 0 ? { ...set, done: true, actualWeightKg: lbToKg(110), actualReps: 5 } : set,
      ),
    }
    const text = sessionToText(put(cycle, partial), partial, settings)
    expect(text).toContain('In progress')
    expect(text).toContain('110 lb')
    // Everything still ahead is marked rather than passed off as done.
    expect(text).toContain('(not done)')
  })

  it('says so when a day was skipped', () => {
    const cycle = build()
    const session = { ...open(cycle), status: 'skipped' as const }
    const text = sessionToText(put(cycle, session), session, settings)
    expect(text).toContain('Skipped')
    expect(text).toContain('(not trained)')
  })

  it('names an accessory that was skipped rather than dropping it', () => {
    const cycle = build()
    const session = open(cycle)
    const done: Session = {
      ...session,
      status: 'complete',
      accessories: session.accessories.map((a) => ({ ...a, skipped: true })),
    }
    expect(sessionToText(put(cycle, done), done, settings)).toContain('DB Row                     skipped')
  })

  it('reports the exercise actually performed after a swap', () => {
    const cycle = build()
    const session = open(cycle)
    const swapped: Session = {
      ...session,
      status: 'complete',
      accessories: session.accessories.map((a) => ({
        ...a,
        exerciseId: 'seated-cable-row',
        sets: a.sets.map((s) => ({ ...s, done: true, weightKg: lbToKg(80), reps: 10 })),
      })),
    }
    const text = sessionToText(put(cycle, swapped), swapped, settings)
    expect(text).toContain('Seated Cable Row')
    expect(text).not.toContain('DB Row')
  })

  it('reports supplemental sets as the reps actually hit', () => {
    const cycle = build()
    const session = open(cycle)
    const done: Session = {
      ...session,
      status: 'complete',
      supplementalSets: session.supplementalSets.map((set, index) => ({
        ...set,
        done: true,
        actualWeightKg: lbToKg(180),
        actualReps: index === 4 ? 3 : 5,
      })),
    }
    expect(sessionToText(put(cycle, done), done, settings)).toContain('180 lb')
    expect(sessionToText(put(cycle, done), done, settings)).toContain('× 5/5/5/5/3')
  })
})

describe('sharing a cycle', () => {
  it('leads with how much of it was actually trained', () => {
    const cycle = build()
    const session = { ...open(cycle), status: 'complete' as const }
    const text = cycleToText(put(cycle, session), settings)
    expect(text).toContain('1 of 16 days trained')
  })

  it('mixes finished days and days still to come', () => {
    const cycle = build()
    const session = open(cycle)
    const done: Session = {
      ...session,
      status: 'complete',
      mainSets: session.mainSets.map((set) => ({
        ...set,
        done: true,
        actualWeightKg: lbToKg(225),
        actualReps: set.targetReps,
      })),
    }
    const text = cycleToText(put(cycle, done), settings)
    expect(text).toContain('Done')
    expect(text).toContain('Planned')
    expect(text).toContain('225 lb')
  })
})
