import { contextFor, prescriptionFor, liftFor, mainExerciseId } from './cycle'
import { incrementFor } from './engine'
import { getExercise } from './exercises'
import type {
  Cycle,
  Equipment,
  LoggedAccessory,
  LoggedSet,
  PrescribedSetLike,
  Session,
  Settings,
  WeekNumber,
} from './types'
import { formatNumber, fromKg, roundTo, type Unit } from './units'

/** Snap a stored kilogram value to what the implement can actually be loaded to. */
const loadable = (kg: number, equipment: Equipment, settings: Settings) =>
  formatNumber(roundTo(fromKg(kg, settings.unit), incrementFor(equipment, contextFor(settings))))

const pad = (text: string, width: number) => text.padEnd(width, ' ')

function weightLabel(weight: number | null, unit: string, perHand: boolean): string {
  if (weight === null) return 'bodyweight'
  return `${formatNumber(weight)} ${unit}${perHand ? '/hand' : ''}`
}

/** Logged weight, shown at the precision it was entered rather than snapped. */
const loggedWeight = (kg: number | null, unit: Unit, perHand: boolean) =>
  kg === null ? 'bodyweight' : `${formatNumber(Math.round(fromKg(kg, unit) * 10) / 10)} ${unit}${perHand ? '/hand' : ''}`

export interface SessionTextOptions {
  /** Prefix each day with its week and slot. Used when several are in one message. */
  heading?: boolean
}

/**
 * A day as text.
 *
 * Reports what was actually done wherever it was logged, and the plan for
 * anything still ahead — so a finished day shares as a record, an upcoming day
 * shares as a plan, and a half-finished one shares honestly as both. Sharing the
 * prescription for a day you already trained says nothing about how it went.
 */
export function sessionToText(
  cycle: Cycle,
  session: Session,
  settings: Settings,
  options: SessionTextOptions = {},
): string {
  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session))
  const p = prescriptionFor(cycle, session, settings)
  const unit = settings.unit
  const weekSpec = cycle.template.weeks[session.week - 1]
  const lines: string[] = []

  const anythingLogged =
    session.mainSets.some((set) => set.done) ||
    session.supplementalSets.some((set) => set.done) ||
    session.accessories.some((a) => a.sets.some((set) => set.done))

  if (options.heading !== false) {
    lines.push(`${cycle.name} · Week ${session.week} · Day ${session.slot} — ${lift?.label ?? exercise.name}`)
  }

  const state =
    session.status === 'complete'
      ? session.completedDate
        ? `Done ${new Date(session.completedDate).toLocaleDateString()}`
        : 'Done'
      : session.status === 'skipped'
        ? 'Skipped'
        : anythingLogged
          ? 'In progress'
          : 'Planned'
  lines.push(`${weekSpec.label} · TM ${formatNumber(p.trainingMax)} ${unit} · ${state}`)

  if (session.mainExerciseId && session.mainExerciseId !== lift?.exerciseId) {
    lines.push(`Swapped to ${exercise.name}`)
  }
  lines.push('')

  if (session.status === 'skipped') {
    lines.push('  (not trained)')
    return lines.join('\n')
  }

  /** A logged set wins over its prescription; an untouched one shows the plan. */
  const byId = new Map<string, LoggedSet>(
    [...session.mainSets, ...session.supplementalSets].map((set) => [set.id, set]),
  )
  const renderSet = (prescribed: PrescribedSetLike, label: string) => {
    const logged = byId.get(prescribed.id)
    if (logged?.done) {
      const star =
        prescribed.amrap && (logged.actualReps ?? 0) > prescribed.reps ? '  ★' : ''
      return `${pad(label, 10)} ${pad(loggedWeight(logged.actualWeightKg, unit, prescribed.perHand), 16)} × ${logged.actualReps ?? '—'}${star}`
    }
    const reps = prescribed.amrap ? `${prescribed.reps}+` : String(prescribed.reps)
    const capped = prescribed.capped ? '  (capped — extra reps)' : ''
    const pending = anythingLogged ? '  (not done)' : ''
    return `${pad(label, 10)} ${pad(weightLabel(prescribed.weight, unit, prescribed.perHand), 16)} × ${reps}${capped}${pending}`
  }

  for (const set of [...p.warmups, ...p.main]) lines.push(renderSet(set, set.label))

  if (p.supplemental.length > 0) {
    lines.push('')
    lines.push(p.supplementalLabel)
    const doneSupplemental = session.supplementalSets.filter((set) => set.done)
    if (doneSupplemental.length > 0) {
      // One line for the lot: the reps are what vary, the weight rarely does.
      const first = doneSupplemental[0]
      const reps = doneSupplemental.map((set) => set.actualReps ?? 0).join('/')
      lines.push(
        `${pad('', 10)} ${pad(loggedWeight(first.actualWeightKg, unit, p.supplemental[0].perHand), 16)} × ${reps}` +
          (doneSupplemental.length < p.supplemental.length
            ? `  (${doneSupplemental.length} of ${p.supplemental.length} sets)`
            : ''),
      )
    } else {
      const first = p.supplemental[0]
      lines.push(
        `${pad('', 10)} ${pad(weightLabel(first.weight, unit, first.perHand), 16)} × ${first.amrap ? `${first.reps}+` : first.reps} × ${p.supplemental.length} sets`,
      )
    }
  }

  const planned = (cycle.accessoryPlan[session.slot] ?? []).filter((a) => a.active)
  const loggedByPlanId = new Map<string, LoggedAccessory>(
    session.accessories.map((entry) => [entry.planId, entry]),
  )
  // Rows the session carries but the plan no longer does, e.g. after a swap.
  const extras = session.accessories.filter((entry) => !planned.some((item) => item.id === entry.planId))

  if (planned.length > 0 || extras.length > 0) {
    lines.push('')
    lines.push('Accessories')

    for (const item of planned) {
      const entry = loggedByPlanId.get(item.id)
      const ex = getExercise(entry?.exerciseId ?? item.exerciseId)
      if (entry?.skipped) {
        lines.push(`• ${pad(ex.name, 26)} skipped`)
        continue
      }
      const done = entry?.sets.filter((set) => set.done) ?? []
      if (done.length > 0) {
        const reps = done.map((set) => set.reps ?? 0).join('/')
        lines.push(`• ${pad(ex.name, 26)} ${loggedWeight(done[0].weightKg, unit, Boolean(ex.perHand))} × ${reps}`)
        continue
      }
      const weight =
        item.targetWeightKg === null
          ? 'bodyweight'
          : `${loadable(item.targetWeightKg, ex.equipment, settings)} ${unit}${ex.perHand ? '/hand' : ''}`
      lines.push(
        `• ${pad(ex.name, 26)} ${item.sets} × ${pad(item.targetReps, 7)} @ ${weight}${anythingLogged ? '  (not done)' : ''}`,
      )
    }

    for (const entry of extras) {
      const ex = getExercise(entry.exerciseId)
      const done = entry.sets.filter((set) => set.done)
      if (done.length === 0) continue
      const reps = done.map((set) => set.reps ?? 0).join('/')
      lines.push(`• ${pad(ex.name, 26)} ${loggedWeight(done[0].weightKg, unit, Boolean(ex.perHand))} × ${reps}`)
    }
  }

  if (session.notes.trim()) {
    lines.push('')
    lines.push(`Notes: ${session.notes.trim()}`)
  }

  return lines.join('\n')
}

export function weekToText(cycle: Cycle, week: WeekNumber, settings: Settings): string {
  const parts: string[] = []
  for (const slot of ['A', 'B', 'C', 'D'] as const) {
    const session = cycle.sessions[`w${week}${slot}`]
    if (session) parts.push(sessionToText(cycle, session, settings))
  }
  return parts.join('\n\n───────────────\n\n')
}

export function cycleToText(cycle: Cycle, settings: Settings): string {
  const sessions = Object.values(cycle.sessions)
  const done = sessions.filter((s) => s.status === 'complete').length
  const header = [
    `${cycle.name} — ${cycle.template.name}`,
    `Started ${new Date(cycle.startDate).toLocaleDateString()} · TM ${Math.round(cycle.tmPercent * 100)}% of estimated max`,
    `${done} of ${sessions.length} days trained`,
    '',
    'Training maxes',
    ...cycle.lifts.map((lift) => {
      const ex = getExercise(lift.exerciseId)
      return `  Day ${lift.slot}  ${pad(lift.label ?? ex.name, 22)} ${formatNumber(fromKg(lift.trainingMaxKg, settings.unit))} ${settings.unit}`
    }),
  ].join('\n')

  const weeks = ([1, 2, 3, 4] as WeekNumber[]).map((week) => weekToText(cycle, week, settings))
  return [header, ...weeks].join('\n\n═══════════════\n\n')
}

/** Clipboard with a legacy fallback, because iOS Safari is picky about context. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title, text })
      return 'shared'
    } catch (error) {
      // A user dismissing the share sheet is not a failure worth reporting.
      if ((error as Error).name === 'AbortError') return 'shared'
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}
