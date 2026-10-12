import { acc, type AccessoryInput } from './defaults'
import { getExercise } from './exercises'
import { DAY_SLOTS, type DaySlot, type Lift, type Pattern, type PlannedAccessory } from './types'

/**
 * Named ways to arrange a week.
 *
 * A layout never changes *what* you lift — it decides which day each of your
 * main lifts lands on, by movement pattern, and what accessory work sits beside
 * it. Your exercises, estimated maxes and training maxes come through untouched,
 * which is the whole point: a push/pull week is the same four lifts on a
 * different timetable, not a different program.
 *
 * Accessories carry over too wherever the exercise is one you already plan, so
 * the weight you have worked up to and its logged history stay with it.
 */
export interface LayoutDay {
  /** Shown beside the day letter: "Push", "Pull", "Legs". */
  name: string
  /**
   * Movement patterns this day claims. A main lift goes to the first day that
   * wants its pattern, so a front squat follows the squat and a sumo deadlift
   * the hinge without either being named here.
   */
  roles: Pattern[]
  accessories: AccessoryInput[]
}

export interface DayLayout {
  id: string
  name: string
  summary: string
  days: LayoutDay[]
}

const PRESS: Pattern[] = ['vertical-press', 'horizontal-press']
const PULL: Pattern[] = ['hinge', 'horizontal-pull', 'vertical-pull']
const LEGS: Pattern[] = ['squat', 'lunge']

/*
 * Starting weights below are the same conservative numbers as the built-in
 * plans — a place to start that the per-exercise progression then moves. They
 * are only used for an exercise you do not already have planned.
 */
const PUSH_WORK: AccessoryInput[] = [
  { exerciseId: 'incline-db-bench', sets: 3, reps: '10-12', lb: 40 },
  { exerciseId: 'dip', sets: 3, reps: 'AMRAP', lb: null, rest: 90 },
  { exerciseId: 'db-lateral-raise', sets: 3, reps: '12-15', lb: 15, rest: 60 },
  { exerciseId: 'rope-pushdown', sets: 3, reps: '10-12', lb: 40, rest: 60 },
]

const PULL_WORK: AccessoryInput[] = [
  { exerciseId: 'barbell-row', sets: 3, reps: '8-10', lb: 115 },
  { exerciseId: 'lat-pulldown', sets: 3, reps: '10', lb: 70 },
  { exerciseId: 'cable-face-pull', sets: 3, reps: '15', lb: 30, rest: 60 },
  { exerciseId: 'db-curl', sets: 3, reps: '10-12', lb: 20, rest: 60 },
]

const LEG_WORK: AccessoryInput[] = [
  { exerciseId: 'rdl', sets: 3, reps: '8-10', lb: 135 },
  { exerciseId: 'leg-press', sets: 3, reps: '12', lb: 200 },
  { exerciseId: 'reverse-lunge', sets: 3, reps: '8', lb: 30 },
  { exerciseId: 'seated-calf-raise', sets: 3, reps: '12-15', lb: 60, rest: 60 },
]

export const LAYOUTS: DayLayout[] = [
  {
    id: 'push-pull-legs',
    name: 'Push / Pull / Legs',
    summary:
      'Three days. Both presses share the push day; the deadlift headlines the pull; the squat gets the legs day to itself.',
    days: [
      { name: 'Push', roles: PRESS, accessories: PUSH_WORK },
      { name: 'Pull', roles: PULL, accessories: PULL_WORK },
      { name: 'Legs', roles: LEGS, accessories: [...LEG_WORK, { exerciseId: 'ab-wheel', sets: 3, reps: '10-15', lb: null, rest: 60 }] },
    ],
  },
  {
    id: 'push-pull',
    name: 'Push / Pull',
    summary:
      'Two days. All the pressing on one, the hinge and the squat on the other — the least you can train and still cover every lift.',
    days: [
      {
        name: 'Push',
        roles: PRESS,
        accessories: [...PUSH_WORK, { exerciseId: 'cable-face-pull', sets: 3, reps: '15', lb: 30, rest: 60 }],
      },
      {
        name: 'Pull',
        roles: [...PULL, ...LEGS],
        accessories: [
          { exerciseId: 'barbell-row', sets: 3, reps: '8-10', lb: 115 },
          { exerciseId: 'lat-pulldown', sets: 3, reps: '10', lb: 70 },
          { exerciseId: 'leg-press', sets: 3, reps: '12', lb: 200 },
          { exerciseId: 'seated-calf-raise', sets: 3, reps: '12-15', lb: 60, rest: 60 },
          { exerciseId: 'db-curl', sets: 3, reps: '10-12', lb: 20, rest: 60 },
        ],
      },
    ],
  },
  {
    id: 'push-pull-four',
    name: 'Push / Pull · four day',
    summary:
      'Four days, one main lift each, alternating push and pull: bench, deadlift, overhead press, squat. The accessory work follows the day rather than being mixed.',
    days: [
      { name: 'Push', roles: ['horizontal-press'], accessories: PUSH_WORK },
      { name: 'Pull', roles: PULL, accessories: PULL_WORK },
      {
        name: 'Push',
        roles: ['vertical-press'],
        accessories: [
          { exerciseId: 'db-shoulder-press', sets: 3, reps: '10-12', lb: 35 },
          { exerciseId: 'db-lateral-raise', sets: 3, reps: '12-15', lb: 15, rest: 60 },
          { exerciseId: 'db-rear-delt-fly', sets: 3, reps: '12-15', lb: 15, rest: 60 },
          { exerciseId: 'db-skull-crusher', sets: 3, reps: '10-12', lb: 20, rest: 60 },
        ],
      },
      { name: 'Legs', roles: LEGS, accessories: LEG_WORK },
    ],
  },
]

export const findLayout = (id: string): DayLayout | undefined =>
  LAYOUTS.find((layout) => layout.id === id)

/** Which day of a layout each lift belongs on, by its exercise's pattern. */
function assign(layout: DayLayout, lifts: Lift[]): Lift[][] {
  const days: Lift[][] = layout.days.map(() => [])
  const placed = new Set<Lift>()

  layout.days.forEach((day, index) => {
    for (const lift of lifts) {
      if (placed.has(lift)) continue
      if (!day.roles.includes(getExercise(lift.exerciseId).pattern)) continue
      days[index].push(lift)
      placed.add(lift)
    }
  })

  // A main lift on a pattern no day asked for — a row, say — still needs a home.
  for (const lift of lifts) {
    if (placed.has(lift)) continue
    let target = 0
    for (let i = 1; i < days.length; i += 1) if (days[i].length < days[target].length) target = i
    days[target].push(lift)
    placed.add(lift)
  }

  return days
}

export interface AppliedLayout {
  lifts: Lift[]
  accessoryPlan: Record<DaySlot, PlannedAccessory[]>
  dayNames: Partial<Record<DaySlot, string>>
}

/**
 * Arrange existing lifts and accessories into a layout.
 *
 * Every accessory gets a fresh plan id, because the same exercise can appear on
 * two days of a layout and a logged set is keyed by plan id. Where the exercise
 * is one you already plan, its target weight and notes come across — the number
 * you have worked up to is yours, the sets and reps belong to the layout. Logged
 * history follows the exercise regardless of the id.
 */
export function applyLayout(
  layout: DayLayout,
  lifts: Lift[],
  currentPlan: Record<DaySlot, PlannedAccessory[]>,
): AppliedLayout {
  const assigned = assign(layout, lifts)

  const known = new Map<string, PlannedAccessory>()
  for (const slot of DAY_SLOTS) {
    for (const item of currentPlan[slot] ?? []) {
      if (!known.has(item.exerciseId)) known.set(item.exerciseId, item)
    }
  }

  const accessoryPlan = Object.fromEntries(
    DAY_SLOTS.map((slot) => [slot, [] as PlannedAccessory[]]),
  ) as Record<DaySlot, PlannedAccessory[]>
  const dayNames: Partial<Record<DaySlot, string>> = {}

  layout.days.forEach((day, index) => {
    const slot = DAY_SLOTS[index]
    dayNames[slot] = day.name

    const seen = new Set<string>()
    const items: PlannedAccessory[] = []
    for (const item of day.accessories) {
      if (seen.has(item.exerciseId)) continue
      seen.add(item.exerciseId)
      const existing = known.get(item.exerciseId)
      const fresh = acc(item)
      items.push(
        existing
          ? {
              ...fresh,
              targetWeightKg: existing.targetWeightKg,
              notes: existing.notes,
            }
          : fresh,
      )
    }
    accessoryPlan[slot] = items
  })

  return {
    lifts: assigned.flatMap((group, index) =>
      group.map((lift) => ({ ...lift, slot: DAY_SLOTS[index] })),
    ),
    accessoryPlan,
    dayNames,
  }
}
