import { useMemo, useState } from 'react'
import { useToast, useWeight } from '../components/hooks'
import { Button, Card, SectionTitle, Toast, cx } from '../components/ui'
import { shareText } from '../lib/share'
import { buildCycleReport, type CycleReport } from '../lib/report'
import type { Cycle, Profile } from '../lib/types'
import { formatNumber, fromKg, type Unit } from '../lib/units'

/** Big round numbers read better than exact ones in a summary. */
function volumeLabel(kg: number, unit: Unit): string {
  const value = fromKg(kg, unit)
  if (value >= 10000) return `${formatNumber(Math.round(value / 100) / 10)}k`
  return formatNumber(Math.round(value))
}

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function Headline({ report, unit }: { report: CycleReport; unit: Unit }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Days trained</div>
        <div className="tabular mt-0.5 text-2xl font-bold">
          {report.sessionsCompleted}
          <span className="text-base font-normal text-ink-400">/{report.sessionsTotal}</span>
        </div>
        {report.sessionsSkipped > 0 ? (
          <div className="text-[11px] text-ink-400">{report.sessionsSkipped} skipped</div>
        ) : null}
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Total load</div>
        <div className="tabular mt-0.5 text-2xl font-bold text-brand-400">
          {volumeLabel(report.totalVolumeKg, unit)}
          <span className="ml-1 text-base font-normal text-ink-400">{unit}</span>
        </div>
        <div className="text-[11px] text-ink-400">weight × reps, everything</div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Sets · reps</div>
        <div className="tabular mt-0.5 text-2xl font-bold">
          {report.totalSets}
          <span className="text-base font-normal text-ink-400"> · {report.totalReps}</span>
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Reps past target</div>
        <div className="tabular mt-0.5 text-2xl font-bold text-flame-400">+{report.repsPastTarget}</div>
        <div className="text-[11px] text-ink-400">on your rep records</div>
      </Card>
    </div>
  )
}

function MuscleSplit({ report, unit }: { report: CycleReport; unit: Unit }) {
  if (report.muscles.length === 0) return null
  const top = report.muscles[0].volumeKg || 1
  return (
    <Card className="space-y-2 p-3">
      {report.muscles.map((muscle) => (
        <div key={muscle.muscle}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">{muscle.muscle}</span>
            <span className="tabular text-ink-400">
              {muscle.sets} sets · {volumeLabel(muscle.volumeKg, unit)} {unit}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(2, (muscle.volumeKg / top) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-ink-400">
        Share of total load. Bodyweight work counts toward sets but carries no load.
      </p>
    </Card>
  )
}

export function CycleReportView({
  cycle,
  profile,
  onClose,
}: {
  cycle: Cycle
  profile: Profile
  onClose: () => void
}) {
  const weight = useWeight()
  const toast = useToast()
  const [printing, setPrinting] = useState(false)
  const report = useMemo(
    () => buildCycleReport(cycle, profile.customExercises),
    [cycle, profile.customExercises],
  )
  const unit = weight.unit

  const asText = () => {
    const lines: string[] = []
    lines.push(`${report.cycleName} — ${report.templateName}`)
    if (report.endDate) {
      lines.push(`${dayLabel(report.startDate)} to ${dayLabel(report.endDate)}`)
    }
    lines.push('')
    lines.push(`${report.sessionsCompleted}/${report.sessionsTotal} days trained`)
    lines.push(`${report.totalSets} sets · ${report.totalReps} reps`)
    lines.push(`${volumeLabel(report.totalVolumeKg, unit)} ${unit} total load`)
    if (report.repsPastTarget > 0) lines.push(`${report.repsPastTarget} reps past target on rep records`)

    const withRecords = report.lifts.filter((lift) => lift.best)
    if (withRecords.length > 0) {
      lines.push('')
      lines.push('Rep records')
      for (const lift of withRecords) {
        const best = lift.best!
        lines.push(
          `  ${lift.label.padEnd(18)} ${weight.text(best.weightKg)} ${unit} × ${best.reps}` +
            `  (week ${best.week}, est. ${weight.text(lift.estimatedOneRepMaxKg ?? 0)} ${unit} max)`,
        )
      }
    }

    if (report.exercises.length > 0) {
      lines.push('')
      lines.push('By exercise')
      for (const entry of report.exercises) {
        lines.push(
          `  ${entry.name.padEnd(26)} ${String(entry.sets).padStart(3)} sets  ${String(entry.reps).padStart(4)} reps  ` +
            `${volumeLabel(entry.volumeKg, unit)} ${unit}`,
        )
      }
    }

    if (report.muscles.length > 0) {
      lines.push('')
      lines.push('By muscle')
      for (const muscle of report.muscles) {
        lines.push(
          `  ${muscle.muscle.padEnd(18)} ${String(Math.round(muscle.share * 100)).padStart(3)}%  ${muscle.sets} sets`,
        )
      }
    }
    return lines.join('\n')
  }

  const share = async () => {
    const result = await shareText(`${report.cycleName} report`, asText())
    if (result === 'copied') toast.show('Report copied to clipboard')
    if (result === 'failed') toast.show('Could not share — try again')
  }

  return (
    <div className="pb-24">
      <header className="mb-4 flex items-start justify-between gap-3 print-hide">
        <div className="min-w-0">
          <button type="button" onClick={onClose} className="text-xs text-ink-400 hover:text-ink-100">
            ← Back
          </button>
          <h1 className="truncate text-2xl font-bold">{report.cycleName} report</h1>
          <p className="text-sm text-ink-400">
            {report.templateName}
            {report.endDate ? ` · ${dayLabel(report.startDate)} – ${dayLabel(report.endDate)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="quiet" onClick={() => { setPrinting(true); setTimeout(() => window.print(), 50) }}>
            Print
          </Button>
          <Button size="sm" onClick={share}>
            Share
          </Button>
        </div>
      </header>

      {printing ? (
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-bold">{report.cycleName} report</h1>
          <p className="text-sm">{report.templateName}</p>
        </div>
      ) : null}

      {report.sessionsCompleted === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-semibold text-ink-300">Nothing logged in this cycle yet.</p>
          <p className="mt-1 text-sm text-ink-400">Finish a day and the numbers will show up here.</p>
        </Card>
      ) : (
        <>
          <Headline report={report} unit={unit} />

          <SectionTitle>Rep records</SectionTitle>
          <Card className="divide-y divide-ink-700/60">
            {report.lifts.map((lift) => (
              <div key={lift.slot} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{lift.label}</div>
                  <div className="text-xs text-ink-400">
                    {lift.best
                      ? `Week ${lift.best.week} · ${
                          (lift.surplus ?? 0) > 0 ? `${lift.surplus} past target` : 'on target'
                        }`
                      : 'not trained this cycle'}
                  </div>
                </div>
                {lift.best ? (
                  <div className="tabular shrink-0 text-right">
                    <div className="font-bold">
                      {weight.text(lift.best.weightKg)} × {lift.best.reps}
                    </div>
                    <div className="text-xs text-ink-400">
                      ≈ {weight.full(lift.estimatedOneRepMaxKg ?? 0)} max
                    </div>
                  </div>
                ) : (
                  <span className="shrink-0 text-ink-400">—</span>
                )}
              </div>
            ))}
          </Card>

          <SectionTitle>Where the work went</SectionTitle>
          <MuscleSplit report={report} unit={unit} />

          <SectionTitle>Every exercise</SectionTitle>
          <Card className="divide-y divide-ink-700/60">
            {report.exercises.map((entry) => (
              <div key={entry.exerciseId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{entry.name}</div>
                  <div className="text-xs text-ink-400">
                    {entry.muscle}
                    {entry.bestSet
                      ? ` · best ${entry.bestSet.weightKg === null ? 'BW' : weight.text(entry.bestSet.weightKg)} × ${entry.bestSet.reps}`
                      : ''}
                  </div>
                </div>
                <div className="tabular shrink-0 text-right text-sm">
                  <div className="font-semibold">
                    {entry.sets} × {entry.reps}
                    <span className="text-xs font-normal text-ink-400"> reps</span>
                  </div>
                  <div className={cx('text-xs', entry.volumeKg > 0 ? 'text-ink-400' : 'text-ink-600')}>
                    {entry.volumeKg > 0 ? `${volumeLabel(entry.volumeKg, unit)} ${unit}` : 'bodyweight'}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          {report.dates.length > 0 ? (
            <p className="mt-4 text-center text-xs text-ink-400">
              Trained {report.dates.map(dayLabel).join(' · ')}
            </p>
          ) : null}
        </>
      )}

      <Toast message={toast.message} />
    </div>
  )
}
