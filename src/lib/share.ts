import { cycleSlots } from './cycle'
import { getExercise } from './exercises'
import { buildSessionView, stateLabel } from './sessionView'
import type { Cycle, Session, Settings, WeekNumber } from './types'
import { formatNumber, fromKg } from './units'

const pad = (text: string, width: number) => text.padEnd(width, ' ')

function weightLabel(weight: number | null, unit: string, perHand: boolean): string {
  if (weight === null) return 'bodyweight'
  return `${formatNumber(weight)} ${unit}${perHand ? '/hand' : ''}`
}

export interface SessionTextOptions {
  /** Prefix the day with its week and slot. Used when several are in one message. */
  heading?: boolean
}

const repsLabel = (row: { reps: number; amrap: boolean; done: boolean }) =>
  row.done || !row.amrap ? String(row.reps) : `${row.reps}+`

/**
 * A day as text. Reports what was done wherever it was logged and the plan for
 * anything still ahead, via the shared resolver in sessionView.
 */
export function sessionToText(
  cycle: Cycle,
  session: Session,
  settings: Settings,
  options: SessionTextOptions = {},
): string {
  const view = buildSessionView(cycle, session, settings)
  const unit = settings.unit
  const lines: string[] = []

  if (options.heading !== false) {
    lines.push(`${cycle.name} · Week ${view.week} · Day ${view.slot} — ${view.liftLabel}`)
  }
  lines.push(`${view.weekLabel} · ${stateLabel(view)}`)
  lines.push('')

  if (view.state === 'skipped') {
    lines.push('  (not trained)')
    return lines.join('\n')
  }

  /* A day can pair two main lifts, so each gets its own block of lines. */
  for (const lift of view.lifts) {
    if (view.lifts.length > 1) lines.push(`${lift.label}`)
    lines.push(
      `${view.lifts.length > 1 ? '  ' : ''}TM ${formatNumber(lift.trainingMax)} ${unit}${lift.swappedTo ? ` · swapped to ${lift.swappedTo}` : ''}`,
    )

    for (const row of [...lift.warmups, ...lift.main]) {
      const star = row.beatTarget ? '  ★' : ''
      const capped = !row.done && row.capped ? '  (capped — extra reps)' : ''
      const pending = !row.done && view.anythingLogged ? '  (not done)' : ''
      lines.push(
        `${pad(row.label, 10)} ${pad(weightLabel(row.weight, unit, row.perHand), 16)} × ${repsLabel(row)}${star}${capped}${pending}`,
      )
    }

    if (lift.supplemental.length > 0) {
      lines.push('')
      lines.push(lift.supplementalLabel)
      if (lift.supplementalSummary) {
        const { weight, reps, of } = lift.supplementalSummary
        const partial = reps.length < of ? `  (${reps.length} of ${of} sets)` : ''
        lines.push(
          `${pad('', 10)} ${pad(weightLabel(weight, unit, lift.supplemental[0].perHand), 16)} × ${reps.join('/')}${partial}`,
        )
      } else {
        const first = lift.supplemental[0]
        lines.push(
          `${pad('', 10)} ${pad(weightLabel(first.weight, unit, first.perHand), 16)} × ${repsLabel(first)} × ${lift.supplemental.length} sets`,
        )
      }
    }
    lines.push('')
  }

  if (view.accessories.length > 0) {
    lines.push('Accessories')
    for (const row of view.accessories) {
      if (row.skipped) {
        lines.push(`• ${pad(row.name, 26)} skipped`)
        continue
      }
      if (row.done) {
        lines.push(`• ${pad(row.name, 26)} ${weightLabel(row.weight, unit, row.perHand)} × ${row.reps.join('/')}`)
        continue
      }
      lines.push(
        `• ${pad(row.name, 26)} ${row.plannedSets} × ${pad(row.targetReps, 7)} @ ${weightLabel(row.weight, unit, row.perHand)}${view.anythingLogged ? '  (not done)' : ''}`,
      )
    }
  }

  if (view.notes.trim()) {
    lines.push('')
    lines.push(`Notes: ${view.notes.trim()}`)
  }

  return lines.join('\n')
}

export function weekToText(cycle: Cycle, week: WeekNumber, settings: Settings): string {
  const parts: string[] = []
  for (const slot of cycleSlots(cycle)) {
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
