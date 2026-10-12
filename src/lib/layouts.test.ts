import { describe, expect, it } from 'vitest'
import { createCycle, cycleSlots, dayLabel, prescriptionsFor } from './cycle'
import { acc, DEFAULT_SETTINGS, normalizeLiftDays, type AccessoryInput } from './defaults'
import { getExercise } from './exercises'
import { applyLayout, findLayout, LAYOUTS } from './layouts'
import { findTemplate } from './templates'
import { DAY_SLOTS, type DaySlot, type Lift, type PlannedAccessory } from './types'
import { fromKg, lbToKg } from './units'

const settings = { ...DEFAULT_SETTINGS }

/** Not the stock four: a front squat and a sumo pull, to prove nothing is swapped. */
const LIFTS: Lift[] = [
  { slot: 'A', exerciseId: 'ohp', label: 'Overhead Press', est1RMKg: lbToKg(125), category: 'upper' },
  { slot: 'B', exerciseId: 'sumo-deadlift', label: 'Sumo Deadlift', est1RMKg: lbToKg(330), category: 'lower' },
  { slot: 'C', exerciseId: 'bench', label: 'Bench Press', est1RMKg: lbToKg(185), category: 'upper' },
  { slot: 'D', exerciseId: 'front-squat', label: 'Front Squat', est1RMKg: lbToKg(175), category: 'lower' },
]

const planOf = (items: Partial<Record<DaySlot, AccessoryInput[]>>): Record<DaySlot, PlannedAccessory[]> =>
  Object.fromEntries(
    DAY_SLOTS.map((slot) => [slot, (items[slot] ?? []).map(acc)]),
  ) as Record<DaySlot, PlannedAccessory[]>

const emptyPlan = () => planOf({})

const dayOf = (lifts: Lift[], exerciseId: string) =>
  lifts.find((lift) => lift.exerciseId === exerciseId)?.slot

describe('every built-in layout', () => {
  it('names only exercises that exist', () => {
    for (const layout of LAYOUTS) {
      for (const day of layout.days) {
        for (const item of day.accessories) {
          // getExercise falls back to a placeholder, so compare the id back.
          expect(getExercise(item.exerciseId).id, `${layout.id}/${item.exerciseId}`).toBe(
            item.exerciseId,
          )
        }
      }
    }
  })

  it('gives every accessory its own plan id', () => {
    for (const layout of LAYOUTS) {
      const applied = applyLayout(layout, LIFTS, emptyPlan())
      const ids = DAY_SLOTS.flatMap((slot) => applied.accessoryPlan[slot].map((item) => item.id))
      expect(new Set(ids).size, layout.id).toBe(ids.length)
    }
  })

  it('places all four lifts, on contiguous days, and changes none of them', () => {
    for (const layout of LAYOUTS) {
      const applied = applyLayout(layout, LIFTS, emptyPlan())
      expect(applied.lifts, layout.id).toHaveLength(LIFTS.length)
      expect(normalizeLiftDays(applied.lifts).map((l) => l.slot)).toEqual(
        applied.lifts.map((l) => l.slot),
      )
      for (const original of LIFTS) {
        const moved = applied.lifts.find((lift) => lift.exerciseId === original.exerciseId)
        // Same movement, same label, same estimated max — only the day differs.
        expect(moved?.label, layout.id).toBe(original.label)
        expect(moved?.est1RMKg, layout.id).toBe(original.est1RMKg)
        expect(moved?.category, layout.id).toBe(original.category)
      }
    }
  })

  it('names every day it uses', () => {
    for (const layout of LAYOUTS) {
      const applied = applyLayout(layout, LIFTS, emptyPlan())
      for (const slot of new Set(applied.lifts.map((lift) => lift.slot))) {
        expect(applied.dayNames[slot], layout.id).toBeTruthy()
      }
    }
  })
})

describe('push / pull / legs', () => {
  const layout = findLayout('push-pull-legs')!

  it('pairs the presses and leaves the pull and the squat their own days', () => {
    const { lifts, dayNames } = applyLayout(layout, LIFTS, emptyPlan())
    expect(dayOf(lifts, 'ohp')).toBe(dayOf(lifts, 'bench'))
    expect(dayNames[dayOf(lifts, 'bench')!]).toBe('Push')
    expect(dayNames[dayOf(lifts, 'sumo-deadlift')!]).toBe('Pull')
    expect(dayNames[dayOf(lifts, 'front-squat')!]).toBe('Legs')
    expect(dayOf(lifts, 'sumo-deadlift')).not.toBe(dayOf(lifts, 'front-squat'))
  })

  it('builds a three-day cycle that prescribes both presses off their own maxes', () => {
    const { lifts, accessoryPlan, dayNames } = applyLayout(layout, LIFTS, emptyPlan())
    const cycle = createCycle({
      number: 1,
      lifts,
      accessoryPlan,
      dayNames,
      template: findTemplate('fsl-5x5'),
      settings,
    })

    expect(cycleSlots(cycle)).toEqual(['A', 'B', 'C'])
    expect(Object.keys(cycle.sessions)).toHaveLength(12)
    expect(dayLabel(cycle, 'A')).toBe('Day A · Push')

    const push = prescriptionsFor(cycle, cycle.sessions.w1A, settings)
    expect(push).toHaveLength(2)
    // Bench is the heavier lift, and still is after the rearrangement.
    const byId = new Map(push.map((block) => [block.exercise.id, block.prescription.trainingMax]))
    expect(byId.get('bench')!).toBeGreaterThan(byId.get('ohp')!)
  })
})

describe('push / pull', () => {
  const layout = findLayout('push-pull')!

  it('puts the pressing on one day and the hinge and squat on the other', () => {
    const { lifts, dayNames } = applyLayout(layout, LIFTS, emptyPlan())
    expect(new Set(lifts.map((lift) => lift.slot))).toEqual(new Set(['A', 'B']))
    expect(dayOf(lifts, 'ohp')).toBe(dayOf(lifts, 'bench'))
    expect(dayOf(lifts, 'sumo-deadlift')).toBe(dayOf(lifts, 'front-squat'))
    expect(dayNames.A).toBe('Push')
    expect(dayNames.B).toBe('Pull')
  })
})

describe('push / pull four day', () => {
  const layout = findLayout('push-pull-four')!

  it('gives each lift its own day, alternating push and pull', () => {
    const { lifts, dayNames } = applyLayout(layout, LIFTS, emptyPlan())
    expect(lifts.map((lift) => lift.slot)).toEqual(['A', 'B', 'C', 'D'])
    expect(dayOf(lifts, 'bench')).toBe('A')
    expect(dayOf(lifts, 'sumo-deadlift')).toBe('B')
    expect(dayOf(lifts, 'ohp')).toBe('C')
    expect(dayOf(lifts, 'front-squat')).toBe('D')
    expect([dayNames.A, dayNames.B, dayNames.C, dayNames.D]).toEqual([
      'Push',
      'Pull',
      'Push',
      'Legs',
    ])
  })
})

describe('accessory weights already worked up to', () => {
  const layout = findLayout('push-pull-legs')!

  it('come across, while new exercises start on the layout default', () => {
    const current = planOf({
      // A tuned entry: heavier than the layout's own starting number.
      C: [{ exerciseId: 'incline-db-bench', sets: 4, reps: '6-8', lb: 70, rest: 120, notes: 'elbows tucked' }],
    })
    const mine = current.C[0]

    const { accessoryPlan } = applyLayout(layout, LIFTS, current)
    const push = accessoryPlan.A
    const incline = push.find((item) => item.exerciseId === 'incline-db-bench')!

    // The weight and the note are the lifter's; the sets and reps are the layout's.
    expect(incline.targetWeightKg).toBe(mine.targetWeightKg)
    expect(fromKg(incline.targetWeightKg!, 'lb')).toBeCloseTo(70, 6)
    expect(incline.notes).toBe('elbows tucked')
    expect(incline.sets).toBe(3)
    expect(incline.targetReps).toBe('10-12')
    // A fresh id, because the same exercise can appear on two days of a layout.
    expect(incline.id).not.toBe(mine.id)

    // Something never planned keeps the layout's conservative starting weight.
    const pushdown = push.find((item) => item.exerciseId === 'rope-pushdown')!
    expect(fromKg(pushdown.targetWeightKg!, 'lb')).toBeCloseTo(40, 6)
  })

  it('carry a bodyweight entry across as bodyweight', () => {
    const current = planOf({ A: [{ exerciseId: 'dip', sets: 3, reps: 'AMRAP', lb: null }] })
    const { accessoryPlan } = applyLayout(layout, LIFTS, current)
    const dip = accessoryPlan.A.find((item) => item.exerciseId === 'dip')!
    expect(dip.targetWeightKg).toBeNull()
  })
})
