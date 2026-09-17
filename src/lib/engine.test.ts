import { describe, expect, it } from 'vitest'
import { applyCap, buildPrescription, trainingMaxFromEstimate, type EquipmentContext } from './engine'
import { getExercise } from './exercises'
import { findTemplate } from './templates'
import { createCycle, prescriptionFor, substituteTrainingMaxKg } from './cycle'
import { DEFAULT_SETTINGS } from './defaults'
import { describePlates, fromKg, lbToKg, platesFor, roundTo } from './units'
import type { Lift, WeekNumber } from './types'

/**
 * These expectations are lifted straight from the spreadsheet this app replaced.
 * If the engine ever stops reproducing them, the port silently changed someone's
 * training, which is the one bug that actually matters here.
 */

const LB: EquipmentContext = {
  unit: 'lb',
  barbellIncrement: 5,
  dumbbellIncrement: 5,
  machineIncrement: 5,
  maxDumbbell: null,
}

const fsl = findTemplate('fsl-5x5')

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

function weights(est1RM: number, exerciseId: string, week: WeekNumber, ctx = LB) {
  const tmKg = trainingMaxFromEstimate(lbToKg(est1RM), 0.85, getExercise(exerciseId).equipment, ctx)
  const p = buildPrescription({
    trainingMaxKg: tmKg,
    exercise: getExercise(exerciseId),
    template: fsl,
    week,
    ctx,
  })
  return {
    tm: p.trainingMax,
    warmups: p.warmups.map((s) => s.weight),
    main: p.main.map((s) => s.weight),
    mainReps: p.main.map((s) => s.reps),
    fsl: p.supplemental.map((s) => s.weight),
  }
}

describe('training max matches the spreadsheet', () => {
  it.each([
    ['ohp', 125, 105],
    ['deadlift', 330, 280],
    ['bench', 185, 155],
    ['front-squat', 175, 150],
    ['db-shoulder-press', 70, 60],
    ['db-rdl', 80, 70],
    ['db-bench', 88, 75],
    ['goblet-squat', 80, 70],
  ])('%s: %i lb est 1RM gives a %i lb TM', (id, est, expected) => {
    const tmKg = trainingMaxFromEstimate(lbToKg(est), 0.85, getExercise(id).equipment, LB)
    expect(roundTo(fromKg(tmKg, 'lb'), 5)).toBe(expected)
  })
})

describe('week 1 — 5/5/5+', () => {
  it('overhead press off a 105 lb training max', () => {
    const w = weights(125, 'ohp', 1)
    expect(w.warmups).toEqual([40, 55])
    expect(w.main).toEqual([70, 80, 90])
    expect(w.mainReps).toEqual([5, 5, 5])
    expect(w.fsl).toEqual([70, 70, 70, 70, 70])
  })

  it('deadlift off a 280 lb training max', () => {
    const w = weights(330, 'deadlift', 1)
    expect(w.warmups).toEqual([110, 140])
    expect(w.main).toEqual([180, 210, 240])
  })

  it('bench press off a 155 lb training max', () => {
    const w = weights(185, 'bench', 1)
    expect(w.warmups).toEqual([60, 80])
    expect(w.main).toEqual([100, 115, 130])
  })

  it('front squat off a 150 lb training max', () => {
    const w = weights(175, 'front-squat', 1)
    expect(w.warmups).toEqual([60, 75])
    expect(w.main).toEqual([100, 115, 130])
  })

  it('marks only the third set as AMRAP', () => {
    const p = buildPrescription({
      trainingMaxKg: lbToKg(105),
      exercise: getExercise('ohp'),
      template: fsl,
      week: 1,
      ctx: LB,
    })
    expect(p.main.map((s) => s.amrap)).toEqual([false, false, true])
  })
})

describe('week 2 — 3/3/3+', () => {
  it('overhead press climbs to 70/80/90 percent', () => {
    const w = weights(125, 'ohp', 2)
    expect(w.main).toEqual([75, 85, 95])
    expect(w.mainReps).toEqual([3, 3, 3])
    expect(w.fsl).toEqual([75, 75, 75, 75, 75])
  })
})

describe('week 3 — 5/3/1+', () => {
  it('overhead press tops out at 95 percent', () => {
    const w = weights(125, 'ohp', 3)
    expect(w.main).toEqual([80, 90, 100])
    expect(w.mainReps).toEqual([5, 3, 1])
    expect(w.fsl).toEqual([80, 80, 80, 80, 80])
  })
})

describe('week 4 — deload', () => {
  it('drops to a single set at 60 percent with no supplemental work', () => {
    const ohp = weights(125, 'ohp', 4)
    expect(ohp.main).toEqual([65])
    expect(ohp.fsl).toEqual([])
    expect(weights(330, 'deadlift', 4).main).toEqual([170])
  })
})

describe('dumbbell ceiling', () => {
  const capped: EquipmentContext = { ...LB, maxDumbbell: 55 }

  it('leaves the prescription alone when it fits under the cap', () => {
    const w = weights(70, 'db-shoulder-press', 1, capped)
    expect(w.main).toEqual([40, 45, 50])
    expect(w.mainReps).toEqual([5, 5, 5])
  })

  it('holds at the cap and buys the lost load back in reps', () => {
    // 75 lb TM, week 1: 65/75/85% is 50/55/65 lb, so only the top set overruns.
    const w = weights(88, 'db-bench', 1, capped)
    expect(w.main).toEqual([50, 55, 55])
    expect(w.mainReps).toEqual([5, 5, 11])
  })

  it('reports which sets were capped so the UI can say so', () => {
    const p = buildPrescription({
      trainingMaxKg: lbToKg(75),
      exercise: getExercise('db-bench'),
      template: fsl,
      week: 1,
      ctx: capped,
    })
    expect(p.main.map((s) => s.capped)).toEqual([false, false, true])
    expect(p.main[2].uncappedWeight).toBe(65)
  })

  it('never lets the rep compensation run away', () => {
    expect(applyCap(500, 5, 20, 30)).toMatchObject({ weight: 20, reps: 30, capped: true })
    expect(applyCap(100, 5, 100, 30)).toMatchObject({ weight: 100, reps: 5, capped: false })
  })

  it('uses the week`s own rep target when compensating, as the sheet did', () => {
    // Week 2 prescribes triples, so the conversion starts from three reps.
    const fiveRep = applyCap(65, 5, 55, 30)
    const threeRep = applyCap(65, 3, 55, 30)
    expect(fiveRep.reps).toBe(11)
    expect(threeRep.reps).toBe(9)
  })

  it('leaves barbell lifts uncapped', () => {
    expect(weights(330, 'deadlift', 1, capped).main).toEqual([180, 210, 240])
  })
})

describe('metric', () => {
  const KG: EquipmentContext = {
    unit: 'kg',
    barbellIncrement: 2.5,
    dumbbellIncrement: 2,
    machineIncrement: 2.5,
    maxDumbbell: null,
  }

  it('rounds in the unit you actually load, not by converting a rounded pound value', () => {
    const tmKg = trainingMaxFromEstimate(lbToKg(330), 0.85, 'barbell', KG)
    expect(fromKg(tmKg, 'kg')).toBeCloseTo(127.5, 5)
  })

  it('gives whole plate-friendly numbers across a week', () => {
    const tmKg = trainingMaxFromEstimate(lbToKg(330), 0.85, 'barbell', KG)
    const p = buildPrescription({
      trainingMaxKg: tmKg,
      exercise: getExercise('deadlift'),
      template: fsl,
      week: 1,
      ctx: KG,
    })
    expect(p.main.map((s) => s.weight)).toEqual([82.5, 95, 107.5])
  })
})

describe('other 5/3/1 templates', () => {
  const tmKg = lbToKg(155)
  const build = (id: string, week: WeekNumber = 1) =>
    buildPrescription({
      trainingMaxKg: tmKg,
      exercise: getExercise('bench'),
      template: findTemplate(id),
      week,
      ctx: LB,
    })

  it('BBB runs five tens at a flat half of training max', () => {
    const p = build('bbb-50')
    expect(p.supplemental).toHaveLength(5)
    expect(p.supplemental.every((s) => s.weight === 80 && s.reps === 10)).toBe(true)
  })

  it('BBB ramp climbs week to week', () => {
    expect(build('bbb-ramp', 1).supplemental[0].weight).toBe(80)
    expect(build('bbb-ramp', 2).supplemental[0].weight).toBe(95)
    expect(build('bbb-ramp', 3).supplemental[0].weight).toBe(110)
  })

  it('SSL takes the second working set, not the first', () => {
    expect(build('ssl-5x5').supplemental[0].weight).toBe(115)
  })

  it('BBS runs ten sets of five', () => {
    const p = build('bbs-10x5')
    expect(p.supplemental).toHaveLength(10)
    expect(p.supplemental[0].reps).toBe(5)
  })

  it('widowmaker is one long set', () => {
    const p = build('widowmaker')
    expect(p.supplemental).toHaveLength(1)
    expect(p.supplemental[0]).toMatchObject({ reps: 20, amrap: true, weight: 100 })
  })

  it("5's PRO strips the AMRAP but keeps the weights", () => {
    const p = buildPrescription({
      trainingMaxKg: tmKg,
      exercise: getExercise('bench'),
      template: findTemplate('fives-pro-fsl'),
      week: 3,
      ctx: LB,
    })
    expect(p.main.map((s) => s.reps)).toEqual([5, 5, 5])
    expect(p.main.some((s) => s.amrap)).toBe(false)
    expect(p.main.map((s) => s.weight)).toEqual([115, 130, 145])
  })

  it('main-only skips supplemental work entirely', () => {
    expect(build('main-only').supplemental).toEqual([])
  })
})

describe('plate math', () => {
  it('loads a 280 lb deadlift', () => {
    const b = platesFor(280, 'lb')
    expect(b.achievable).toBe(280)
    expect(describePlates(b)).toBe('45 bar + 4×45 + 2×25 + 2×2.5')
  })

  it('loads a 100 kg squat on a 20 kg bar', () => {
    expect(describePlates(platesFor(100, 'kg'))).toBe('20 bar + 2×25 + 2×15')
  })

  it('reports an empty bar rather than negative plates', () => {
    const b = platesFor(45, 'lb')
    expect(b.perSide).toEqual([])
    expect(describePlates(b)).toBe('45 bar')
  })

  it('flags weight it cannot make with the plates on hand', () => {
    expect(platesFor(46, 'lb').leftover).toBeCloseTo(1, 5)
  })
})

describe('swapping the main lift', () => {
  const settings = { ...DEFAULT_SETTINGS, maxDumbbellKg: lbToKg(55) }

  const cycle = createCycle({
    number: 1,
    lifts: SHEET_LIFTS,
    accessoryPlan: { A: [], B: [], C: [], D: [] },
    template: fsl,
    settings,
  })

  it('carries the training max across to the substitute', () => {
    // 105 lb overhead press max, dumbbell press at ~40% of a barbell press.
    const tm = substituteTrainingMaxKg(cycle, 'A', 'db-shoulder-press', settings)
    expect(roundTo(fromKg(tm as number, 'lb'), 5)).toBe(40)
  })

  it('prescribes off the converted max, not the barbell one', () => {
    const session = {
      ...cycle.sessions.w1A,
      mainExerciseId: 'db-shoulder-press',
      mainTrainingMaxKg: substituteTrainingMaxKg(cycle, 'A', 'db-shoulder-press', settings),
    }
    const p = prescriptionFor(cycle, session, settings)
    expect(p.trainingMax).toBe(40)
    expect(p.main.map((s) => s.weight)).toEqual([25, 30, 35])
    // Comfortably under the 55 lb cap, so rep targets stay where they belong.
    expect(p.main.map((s) => s.reps)).toEqual([5, 5, 5])
    expect(p.main.some((s) => s.capped)).toBe(false)
  })

  it('does not apply a barbell max per hand — the bug this guards', () => {
    const naive = prescriptionFor(cycle, { ...cycle.sessions.w1A, mainExerciseId: 'db-shoulder-press' }, settings)
    // Without a converted max the top set caps out and demands 30 reps.
    expect(naive.main[2].reps).toBeGreaterThan(20)
    const fixed = prescriptionFor(
      cycle,
      {
        ...cycle.sessions.w1A,
        mainExerciseId: 'db-shoulder-press',
        mainTrainingMaxKg: substituteTrainingMaxKg(cycle, 'A', 'db-shoulder-press', settings),
      },
      settings,
    )
    expect(fixed.main[2].reps).toBe(5)
  })

  it('falls back to rep matching when the movements cannot share a load', () => {
    expect(substituteTrainingMaxKg(cycle, 'A', 'pike-push-up', settings)).toBeUndefined()
  })

  it('clears the override when the day goes back on its planned lift', () => {
    expect(substituteTrainingMaxKg(cycle, 'A', 'ohp', settings)).toBeUndefined()
  })

  it('scales a barbell squat onto a leg press', () => {
    // Front squat 150 lb max; leg press is 1.8x a back squat and front squat 0.85x,
    // so 150 * (1.8 / 0.85) = 318, rounded to the nearest 5.
    const tm = substituteTrainingMaxKg(cycle, 'D', 'leg-press', settings)
    expect(roundTo(fromKg(tm as number, 'lb'), 5)).toBe(320)
  })
})
