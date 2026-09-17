import type { SetSpec, SupplementalSpec, Template, WeekSpec } from './types'

/** Two ramp-up sets before the working sets. Editable per template. */
export const DEFAULT_WARMUPS: SetSpec[] = [
  { pct: 0.4, reps: 5 },
  { pct: 0.5, reps: 5 },
]

const deloadWeek = (): WeekSpec => ({
  label: 'Deload',
  isDeload: true,
  includeWarmups: true,
  includeSupplemental: false,
  main: [{ pct: 0.6, reps: 5 }],
})

/** Classic 5/3/1: the third set of each week is taken to a rep record. */
function standardWeeks(): WeekSpec[] {
  return [
    {
      label: '5/5/5+',
      isDeload: false,
      includeWarmups: true,
      includeSupplemental: true,
      main: [
        { pct: 0.65, reps: 5 },
        { pct: 0.75, reps: 5 },
        { pct: 0.85, reps: 5, amrap: true },
      ],
    },
    {
      label: '3/3/3+',
      isDeload: false,
      includeWarmups: true,
      includeSupplemental: true,
      main: [
        { pct: 0.7, reps: 3 },
        { pct: 0.8, reps: 3 },
        { pct: 0.9, reps: 3, amrap: true },
      ],
    },
    {
      label: '5/3/1+',
      isDeload: false,
      includeWarmups: true,
      includeSupplemental: true,
      main: [
        { pct: 0.75, reps: 5 },
        { pct: 0.85, reps: 3 },
        { pct: 0.95, reps: 1, amrap: true },
      ],
    },
    deloadWeek(),
  ]
}

/**
 * 5's PRO: same weights, every set stopped at five. Trades the weekly rep record
 * for recovery, which is why it pairs with the higher-volume supplementals.
 */
function fivesProWeeks(): WeekSpec[] {
  return standardWeeks().map((week) =>
    week.isDeload
      ? week
      : { ...week, label: `5s PRO ${week.label.replace(/\+$/, '')}`, main: week.main.map((set) => ({ pct: set.pct, reps: 5 })) },
  )
}

const supplemental = (spec: Partial<SupplementalSpec> & Pick<SupplementalSpec, 'kind' | 'label'>): SupplementalSpec => ({
  enabled: true,
  sets: 5,
  reps: 5,
  amrapLastSet: false,
  source: 'first-set',
  fixedPctByWeek: [0.5, 0.5, 0.5, 0.5],
  restSeconds: 75,
  ...spec,
})

const NO_SUPPLEMENTAL: SupplementalSpec = supplemental({
  kind: 'none',
  label: 'None',
  enabled: false,
  sets: 0,
  reps: 0,
})

function template(
  id: string,
  name: string,
  summary: string,
  weeks: WeekSpec[],
  supp: SupplementalSpec,
): Template {
  return { id, name, summary, warmups: DEFAULT_WARMUPS, weeks, supplemental: supp, builtIn: true }
}

export const BUILT_IN_TEMPLATES: Template[] = [
  template(
    'fsl-5x5',
    '5/3/1 + FSL 5×5',
    'Five sets of five at the first working weight. Volume without grinding — what the spreadsheet ran.',
    standardWeeks(),
    supplemental({ kind: 'fsl', label: 'FSL — First Set Last', sets: 5, reps: 5, source: 'first-set' }),
  ),
  template(
    'fsl-amrap',
    '5/3/1 + FSL AMRAP',
    'One all-out set at the first working weight. Quickest session here.',
    standardWeeks(),
    supplemental({
      kind: 'fsl-amrap',
      label: 'FSL — AMRAP',
      sets: 1,
      reps: 8,
      amrapLastSet: true,
      source: 'first-set',
      restSeconds: 180,
    }),
  ),
  template(
    'ssl-5x5',
    '5/3/1 + SSL 5×5',
    'Second Set Last — same shape as FSL but heavier, once FSL stops being hard.',
    standardWeeks(),
    supplemental({ kind: 'ssl', label: 'SSL — Second Set Last', sets: 5, reps: 5, source: 'second-set' }),
  ),
  template(
    'bbb-50',
    '5/3/1 + BBB 5×10',
    'Boring But Big: five sets of ten at a flat 50% of training max. The size template.',
    standardWeeks(),
    supplemental({
      kind: 'bbb',
      label: 'BBB — Boring But Big',
      sets: 5,
      reps: 10,
      source: 'fixed',
      fixedPctByWeek: [0.5, 0.5, 0.5, 0.5],
      restSeconds: 90,
    }),
  ),
  template(
    'bbb-ramp',
    '5/3/1 + BBB Ramp',
    'Boring But Big climbing 50% → 60% → 70% across the cycle. Brutal by week three.',
    standardWeeks(),
    supplemental({
      kind: 'bbb-ramp',
      label: 'BBB — Ramping',
      sets: 5,
      reps: 10,
      source: 'fixed',
      fixedPctByWeek: [0.5, 0.6, 0.7, 0.5],
      restSeconds: 90,
    }),
  ),
  template(
    'bbs-10x5',
    '5/3/1 + BBS 10×5',
    'Boring But Strong: ten sets of five at the first working weight, short rests.',
    standardWeeks(),
    supplemental({ kind: 'bbs', label: 'BBS — Boring But Strong', sets: 10, reps: 5, source: 'first-set', restSeconds: 60 }),
  ),
  template(
    'widowmaker',
    '5/3/1 + Widowmaker',
    'A single set of twenty at the first working weight. Short, and genuinely unpleasant.',
    standardWeeks(),
    supplemental({
      kind: 'widowmaker',
      label: 'Widowmaker',
      sets: 1,
      reps: 20,
      amrapLastSet: true,
      source: 'first-set',
      restSeconds: 240,
    }),
  ),
  template(
    'fives-pro-fsl',
    "5's PRO + FSL 5×5",
    'Every main set stopped at five, then FSL. Leaves far more in the tank week to week.',
    fivesProWeeks(),
    supplemental({ kind: 'fsl', label: 'FSL — First Set Last', sets: 5, reps: 5, source: 'first-set' }),
  ),
  template(
    'fives-pro-bbb',
    "5's PRO + BBB 5×10",
    'The standard hypertrophy pairing — no rep records, all the volume.',
    fivesProWeeks(),
    supplemental({
      kind: 'bbb',
      label: 'BBB — Boring But Big',
      sets: 5,
      reps: 10,
      source: 'fixed',
      fixedPctByWeek: [0.5, 0.5, 0.5, 0.5],
      restSeconds: 90,
    }),
  ),
  template(
    'main-only',
    '5/3/1 — Main work only',
    'Just the three working sets. For travel weeks, or when time is the constraint.',
    standardWeeks(),
    NO_SUPPLEMENTAL,
  ),
]

export const DEFAULT_TEMPLATE_ID = 'fsl-5x5'

export function findTemplate(id: string, custom: Template[] = []): Template {
  return (
    custom.find((t) => t.id === id) ??
    BUILT_IN_TEMPLATES.find((t) => t.id === id) ??
    BUILT_IN_TEMPLATES[0]
  )
}

/** Deep copy so a cycle's frozen template can never alias a live preset. */
export function cloneTemplate(source: Template, overrides: Partial<Template> = {}): Template {
  return {
    ...structuredClone(source),
    ...overrides,
  }
}
