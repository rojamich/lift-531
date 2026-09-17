import { contextFor, prescriptionFor, liftFor, mainExerciseId } from './cycle'
import { incrementFor } from './engine'
import { getExercise } from './exercises'
import type { Cycle, Equipment, Session, Settings, WeekNumber } from './types'
import { formatNumber, fromKg, roundTo } from './units'

/** Snap a stored kilogram value to what the implement can actually be loaded to. */
const loadable = (kg: number, equipment: Equipment, settings: Settings) =>
  formatNumber(roundTo(fromKg(kg, settings.unit), incrementFor(equipment, contextFor(settings))))

const pad = (text: string, width: number) => text.padEnd(width, ' ')

function weightLabel(weight: number | null, unit: string, perHand: boolean): string {
  if (weight === null) return 'bodyweight'
  return `${formatNumber(weight)} ${unit}${perHand ? '/hand' : ''}`
}

/** A day, as you'd paste it into a message. */
export function sessionToText(cycle: Cycle, session: Session, settings: Settings): string {
  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session))
  const p = prescriptionFor(cycle, session, settings)
  const unit = settings.unit
  const weekSpec = cycle.template.weeks[session.week - 1]
  const lines: string[] = []

  lines.push(`${cycle.name} · Week ${session.week} · Day ${session.slot} — ${lift?.label ?? exercise.name}`)
  lines.push(`${weekSpec.label} · training max ${formatNumber(p.trainingMax)} ${unit}`)
  if (session.mainExerciseId && session.mainExerciseId !== lift?.exerciseId) {
    lines.push(`Swapped to ${exercise.name}`)
  }
  lines.push('')

  for (const set of [...p.warmups, ...p.main]) {
    const reps = set.amrap ? `${set.reps}+` : String(set.reps)
    const capped = set.capped ? '  (capped — extra reps)' : ''
    lines.push(`${pad(set.label, 10)} ${pad(weightLabel(set.weight, unit, set.perHand), 16)} × ${reps}${capped}`)
  }

  if (p.supplemental.length > 0) {
    const first = p.supplemental[0]
    lines.push('')
    lines.push(p.supplementalLabel)
    lines.push(
      `${pad('', 10)} ${pad(weightLabel(first.weight, unit, first.perHand), 16)} × ${first.amrap ? `${first.reps}+` : first.reps} × ${p.supplemental.length} sets`,
    )
  }

  const accessories = (cycle.accessoryPlan[session.slot] ?? []).filter((a) => a.active)
  if (accessories.length > 0) {
    lines.push('')
    lines.push('Accessories')
    for (const item of accessories) {
      const ex = getExercise(item.exerciseId)
      const weight =
        item.targetWeightKg === null
          ? 'bodyweight'
          : `${loadable(item.targetWeightKg, ex.equipment, settings)} ${unit}${ex.perHand ? '/hand' : ''}`
      lines.push(`• ${pad(ex.name, 26)} ${item.sets} × ${pad(item.targetReps, 7)} @ ${weight}`)
    }
  }

  if (session.notes.trim()) {
    lines.push('')
    lines.push(`Notes: ${session.notes.trim()}`)
  }

  return lines.join('\n')
}

/** What actually happened, for a finished day. */
export function sessionResultToText(cycle: Cycle, session: Session, settings: Settings): string {
  const lift = liftFor(cycle, session.slot)
  const exercise = getExercise(mainExerciseId(cycle, session))
  const unit = settings.unit
  const lines: string[] = []
  lines.push(`${cycle.name} · Week ${session.week} · Day ${session.slot} — ${lift?.label ?? exercise.name}`)
  if (session.completedDate) lines.push(new Date(session.completedDate).toLocaleDateString())
  lines.push('')

  const logged = session.mainSets.filter((s) => s.done && s.kind === 'main')
  for (const set of logged) {
    const weight = set.actualWeightKg === null ? 'BW' : `${formatNumber(fromKg(set.actualWeightKg, unit))} ${unit}`
    const star = set.amrap && set.actualReps !== null && set.actualReps > set.targetReps ? '  ★' : ''
    lines.push(`${pad(weight, 12)} × ${set.actualReps ?? '—'}${star}`)
  }

  const supp = session.supplementalSets.filter((s) => s.done)
  if (supp.length > 0) {
    const weight = supp[0].actualWeightKg === null ? 'BW' : `${formatNumber(fromKg(supp[0].actualWeightKg, unit))} ${unit}`
    lines.push('')
    lines.push(`${cycle.template.supplemental.label}: ${weight} × ${supp.map((s) => s.actualReps ?? 0).join('/')}`)
  }

  const accessories = session.accessories.filter((a) => !a.skipped && a.sets.some((s) => s.done))
  if (accessories.length > 0) {
    lines.push('')
    for (const item of accessories) {
      const ex = getExercise(item.exerciseId)
      const done = item.sets.filter((s) => s.done)
      const weight =
        done[0]?.weightKg === null || done[0]?.weightKg === undefined
          ? 'BW'
          : `${loadable(done[0].weightKg as number, ex.equipment, settings)} ${unit}`
      lines.push(`• ${pad(ex.name, 26)} ${weight} × ${done.map((s) => s.reps ?? 0).join('/')}`)
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
  const header = [
    `${cycle.name} — ${cycle.template.name}`,
    `Started ${new Date(cycle.startDate).toLocaleDateString()} · TM ${Math.round(cycle.tmPercent * 100)}% of estimated max`,
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
