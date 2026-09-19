import { useMemo, useState } from 'react'
import { ExerciseSwap } from '../components/ExerciseSwap'
import { useToast, useWeight } from '../components/hooks'
import { Button, Card, Empty, Field, Input, NumberField, Pill, SectionTitle, Select, Sheet, Toggle, Toast, cx } from '../components/ui'
import { newId } from '../lib/cycle'
import { supplementalPct } from '../lib/engine'
import { getExercise } from '../lib/exercises'
import { BUILT_IN_TEMPLATES, cloneTemplate, findTemplate } from '../lib/templates'
import {
  DAY_SLOTS,
  WEEK_NUMBERS,
  type DaySlot,
  type PlannedAccessory,
  type SupplementalSource,
  type Template,
} from '../lib/types'
import { useApp } from '../state/useApp'

function TemplateEditor({ base, onClose }: { base: Template; onClose: () => void }) {
  const saveCustomTemplate = useApp((s) => s.saveCustomTemplate)
  const [draft, setDraft] = useState<Template>(() =>
    cloneTemplate(base, {
      id: base.builtIn ? `custom-${newId().slice(0, 8)}` : base.id,
      name: base.builtIn ? `${base.name} (mine)` : base.name,
      builtIn: false,
      derivedFrom: base.derivedFrom ?? base.id,
    }),
  )

  const patchWeek = (index: number, fn: (week: Template['weeks'][number]) => Template['weeks'][number]) =>
    setDraft((d) => ({ ...d, weeks: d.weeks.map((w, i) => (i === index ? fn(w) : w)) }))

  const patchSupp = (patch: Partial<Template['supplemental']>) =>
    setDraft((d) => ({ ...d, supplemental: { ...d.supplemental, ...patch } }))

  const pctInput = (value: number, onChange: (next: number) => void, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-ink-400">{label}</span>
      <NumberField
        ariaLabel={label}
        className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        value={Math.round(value * 1000) / 10}
        onChange={(next) => onChange((next ?? 0) / 100)}
      />
    </label>
  )

  return (
    <div className="space-y-5">
      <Field label="Name">
        <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
      </Field>

      <section>
        <SectionTitle>Warm-ups</SectionTitle>
        <div className="space-y-2">
          {draft.warmups.map((set, index) => (
            <div key={index} className="flex items-end gap-2">
              {pctInput(
                set.pct,
                (pct) =>
                  setDraft((d) => ({
                    ...d,
                    warmups: d.warmups.map((w, i) => (i === index ? { ...w, pct } : w)),
                  })),
                '% of TM',
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-ink-400">Reps</span>
                <NumberField
                  ariaLabel={`Warm-up ${index + 1} reps`}
                  className="tabular w-20 rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                  value={set.reps}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      warmups: d.warmups.map((w, i) => (i === index ? { ...w, reps: next ?? 0 } : w)),
                    }))
                  }
                />
              </label>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setDraft((d) => ({ ...d, warmups: d.warmups.filter((_, i) => i !== index) }))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            onClick={() => setDraft((d) => ({ ...d, warmups: [...d.warmups, { pct: 0.6, reps: 3 }] }))}
          >
            Add warm-up set
          </Button>
        </div>
      </section>

      <section>
        <SectionTitle>Weeks</SectionTitle>
        <div className="space-y-3">
          {draft.weeks.map((week, weekIndex) => (
            <Card key={weekIndex} className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Input
                  className="max-w-[10rem] px-2 py-1 text-sm font-semibold"
                  value={week.label}
                  onChange={(e) => patchWeek(weekIndex, (w) => ({ ...w, label: e.target.value }))}
                />
                <span className="text-xs text-ink-400">Week {weekIndex + 1}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {week.main.map((set, setIndex) => (
                  <div key={setIndex} className="flex items-end gap-1">
                    {pctInput(
                      set.pct,
                      (pct) =>
                        patchWeek(weekIndex, (w) => ({
                          ...w,
                          main: w.main.map((s, i) => (i === setIndex ? { ...s, pct } : s)),
                        })),
                      `Set ${setIndex + 1}`,
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-ink-400">Reps</span>
                      <NumberField
                        ariaLabel={`Week ${weekIndex + 1} set ${setIndex + 1} reps`}
                        className="tabular w-16 rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                        value={set.reps}
                        onChange={(next) =>
                          patchWeek(weekIndex, (w) => ({
                            ...w,
                            main: w.main.map((s, i) => (i === setIndex ? { ...s, reps: next ?? 0 } : s)),
                          }))
                        }
                      />
                    </label>
                    <Pill
                      active={Boolean(set.amrap)}
                      onClick={() =>
                        patchWeek(weekIndex, (w) => ({
                          ...w,
                          main: w.main.map((s, i) => (i === setIndex ? { ...s, amrap: !s.amrap } : s)),
                        }))
                      }
                      className="mb-1.5"
                    >
                      AMRAP
                    </Pill>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill
                  active={week.includeSupplemental}
                  onClick={() => patchWeek(weekIndex, (w) => ({ ...w, includeSupplemental: !w.includeSupplemental }))}
                >
                  Supplemental
                </Pill>
                <Pill
                  active={week.includeWarmups}
                  onClick={() => patchWeek(weekIndex, (w) => ({ ...w, includeWarmups: !w.includeWarmups }))}
                >
                  Warm-ups
                </Pill>
                <Pill active={week.isDeload} onClick={() => patchWeek(weekIndex, (w) => ({ ...w, isDeload: !w.isDeload }))}>
                  Deload
                </Pill>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    patchWeek(weekIndex, (w) => ({ ...w, main: [...w.main, { pct: 0.7, reps: 5 }] }))
                  }
                >
                  + set
                </Button>
                {week.main.length > 1 ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => patchWeek(weekIndex, (w) => ({ ...w, main: w.main.slice(0, -1) }))}
                  >
                    − set
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Supplemental</SectionTitle>
        <Card className="space-y-3 p-3">
          <Toggle
            checked={draft.supplemental.enabled}
            onChange={(enabled) => patchSupp({ enabled })}
            label="Run supplemental work"
            hint="Turn off for main sets only"
          />
          {draft.supplemental.enabled ? (
            <>
              <Field label="Label">
                <Input value={draft.supplemental.label} onChange={(e) => patchSupp({ label: e.target.value })} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Sets">
                  <NumberField
                    ariaLabel="Supplemental sets"
                    className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                    value={draft.supplemental.sets}
                    onChange={(next) => patchSupp({ sets: Math.max(0, next ?? 0) })}
                  />
                </Field>
                <Field label="Reps">
                  <NumberField
                    ariaLabel="Supplemental reps"
                    className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                    value={draft.supplemental.reps}
                    onChange={(next) => patchSupp({ reps: Math.max(1, next ?? 1) })}
                  />
                </Field>
                <Field label="Rest (s)">
                  <NumberField
                    ariaLabel="Supplemental rest (s)"
                    className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                    value={draft.supplemental.restSeconds}
                    onChange={(next) => patchSupp({ restSeconds: Math.max(0, next ?? 0) })}
                  />
                </Field>
              </div>
              <Field label="Weight taken from">
                <Select
                  value={draft.supplemental.source}
                  onChange={(e) => patchSupp({ source: e.target.value as SupplementalSource })}
                >
                  <option value="first-set">First working set (FSL)</option>
                  <option value="second-set">Second working set (SSL)</option>
                  <option value="fixed">A fixed percentage per week (BBB)</option>
                </Select>
              </Field>
              {draft.supplemental.source === 'fixed' ? (
                <div className="grid grid-cols-4 gap-2">
                  {WEEK_NUMBERS.map((week) =>
                    pctInput(
                      draft.supplemental.fixedPctByWeek[week - 1] ?? 0.5,
                      (pct) =>
                        patchSupp({
                          fixedPctByWeek: draft.supplemental.fixedPctByWeek.map((p, i) =>
                            i === week - 1 ? pct : p,
                          ),
                        }),
                      `W${week}`,
                    ),
                  )}
                </div>
              ) : null}
              <Toggle
                checked={draft.supplemental.amrapLastSet}
                onChange={(amrapLastSet) => patchSupp({ amrapLastSet })}
                label="Last set to failure"
              />
            </>
          ) : null}
        </Card>
      </section>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => {
          saveCustomTemplate(draft)
          onClose()
        }}
      >
        Save template
      </Button>
    </div>
  )
}

function AccessoryEditor({ slot }: { slot: DaySlot }) {
  const profile = useApp((s) => s.profile)!
  const setAccessoryPlan = useApp((s) => s.setAccessoryPlan)
  const weight = useWeight()
  const [swapFor, setSwapFor] = useState<string | null>(null)

  const items = profile.accessoryPlan[slot] ?? []
  const update = (next: PlannedAccessory[]) => setAccessoryPlan(slot, next)
  const patch = (id: string, changes: Partial<PlannedAccessory>) =>
    update(items.map((item) => (item.id === id ? { ...item, ...changes } : item)))

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    update(next)
  }

  return (
    <div className="space-y-2.5">
      {items.length === 0 ? (
        <Empty title={`No accessories on day ${slot}`}>Add one below.</Empty>
      ) : null}

      {items.map((item, index) => {
        const exercise = getExercise(item.exerciseId, profile.customExercises)
        return (
          <Card key={item.id} className={cx('p-3', !item.active && 'opacity-50')}>
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setSwapFor(item.id)}
                className="min-w-0 text-left text-base font-semibold hover:text-brand-400"
              >
                <span className="truncate">{exercise.name}</span>
                <span className="ml-1.5 text-xs font-normal text-ink-400">change</span>
              </button>
              <div className="flex shrink-0 gap-0.5">
                <Button size="sm" variant="quiet" onClick={() => move(index, -1)} aria-label="Move up">
                  ↑
                </Button>
                <Button size="sm" variant="quiet" onClick={() => move(index, 1)} aria-label="Move down">
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => update(items.filter((i) => i.id !== item.id))}
                  aria-label="Remove"
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2">
              <Field label="Sets">
                <NumberField
                  ariaLabel="Sets"
                  className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                  value={item.sets}
                  onChange={(next) => patch(item.id, { sets: Math.max(1, next ?? 1) })}
                />
              </Field>
              <Field label="Reps">
                <Input
                  className="px-1 py-1.5 text-center text-sm"
                  value={item.targetReps}
                  placeholder="10-12"
                  onChange={(e) => patch(item.id, { targetReps: e.target.value })}
                />
              </Field>
              <Field label={weight.unit}>
                <NumberField
                  ariaLabel="Target weight"
                  className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                  placeholder="BW"
                  value={weight.show(item.targetWeightKg)}
                  format={(n) => Math.round(n * 100) / 100}
                  onChange={(next) =>
                    patch(item.id, { targetWeightKg: next === null ? null : weight.toKg(next) })
                  }
                />
              </Field>
              <Field label="Rest s">
                <NumberField
                  ariaLabel="Rest seconds"
                  className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-2 py-1.5 text-center outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
                  value={item.restSeconds}
                  onChange={(next) => patch(item.id, { restSeconds: Math.max(0, next ?? 0) })}
                />
              </Field>
            </div>

            <Input
              className="mt-2 px-2 py-1.5 text-sm"
              placeholder="Notes — cues, progression rule…"
              value={item.notes}
              onChange={(e) => patch(item.id, { notes: e.target.value })}
            />

            <div className="mt-1">
              <Toggle
                checked={item.active}
                onChange={(active) => patch(item.id, { active })}
                label={item.active ? 'In the plan' : 'Paused'}
              />
              {index < items.length - 1 ? (
                <Toggle
                  checked={Boolean(item.supersetId) && item.supersetId === items[index + 1]?.supersetId}
                  onChange={(on) => {
                    const next = items[index + 1]
                    if (!next) return
                    if (on) {
                      // Join the run this item already belongs to, so three or
                      // more in a row form one superset rather than pairs.
                      const id = item.supersetId ?? newId()
                      update(
                        items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, supersetId: id }
                            : entry.id === next.id
                              ? { ...entry, supersetId: id }
                              : entry,
                        ),
                      )
                    } else {
                      update(
                        items.map((entry) =>
                          entry.id === next.id ? { ...entry, supersetId: undefined } : entry,
                        ),
                      )
                    }
                  }}
                  label={`Superset with ${getExercise(items[index + 1].exerciseId, profile.customExercises).name}`}
                  hint="No rest between them; one rest after the round"
                />
              ) : null}
            </div>

            <ExerciseSwap
              open={swapFor === item.id}
              onClose={() => setSwapFor(null)}
              exerciseId={item.exerciseId}
              currentWeightKg={item.targetWeightKg}
              onPick={(id, converted) => patch(item.id, { exerciseId: id, targetWeightKg: converted })}
            />
          </Card>
        )
      })}

      <Button
        className="w-full"
        onClick={() =>
          update([
            ...items,
            {
              id: newId(),
              exerciseId: 'db-row',
              sets: 3,
              targetReps: '10-12',
              targetWeightKg: null,
              restSeconds: 90,
              notes: '',
              active: true,
            },
          ])
        }
      >
        + Add accessory
      </Button>
    </div>
  )
}

export function PlanScreen() {
  const profile = useApp((s) => s.profile)
  const updateSettings = useApp((s) => s.updateSettings)
  const toast = useToast()
  const [slot, setSlot] = useState<DaySlot>('A')
  const [editing, setEditing] = useState(false)
  const [pickingTemplate, setPickingTemplate] = useState(false)

  const templates = useMemo(
    () => [...BUILT_IN_TEMPLATES, ...(profile?.customTemplates ?? [])],
    [profile?.customTemplates],
  )
  if (!profile) return null

  const active = findTemplate(profile.settings.templateId, profile.customTemplates)

  return (
    <div className="pb-24">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="text-sm text-ink-400">The template and accessories the next cycle will be built from.</p>
      </header>

      <SectionTitle
        action={
          <Button size="sm" variant="quiet" onClick={() => setPickingTemplate(true)}>
            Change
          </Button>
        }
      >
        Template
      </SectionTitle>
      <Card className="mb-5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{active.name}</h3>
            <p className="mt-0.5 text-sm text-ink-400">{active.summary}</p>
          </div>
          {!active.builtIn ? (
            <span className="shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              custom
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {active.weeks.map((week, index) => (
            <div key={index} className="rounded-lg border border-ink-700 bg-ink-800/60 px-1 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-ink-400">Week {index + 1}</div>
              <div className="tabular text-xs font-semibold">{week.label}</div>
              <div className="tabular text-[10px] text-ink-400">
                {week.main.map((s) => Math.round(s.pct * 100)).join('/')}
              </div>
            </div>
          ))}
        </div>

        {active.supplemental.enabled ? (
          <p className="mt-2 text-xs text-ink-300">
            {active.supplemental.label} · {active.supplemental.sets}×{active.supplemental.reps} at{' '}
            {WEEK_NUMBERS.filter((w) => active.weeks[w - 1].includeSupplemental)
              .map((w) => `${Math.round(supplementalPct(active, w) * 100)}%`)
              .join(' / ')}
            {active.weeks.some((w) => !w.includeSupplemental) ? ', none on deload' : ''}
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-400">No supplemental work.</p>
        )}

        <Button size="sm" className="mt-3 w-full" onClick={() => setEditing(true)}>
          {active.builtIn ? 'Customize this template' : 'Edit template'}
        </Button>
      </Card>

      <SectionTitle>Accessories</SectionTitle>
      <div className="mb-3 flex gap-1.5">
        {DAY_SLOTS.map((s) => {
          const lift = profile.lifts.find((l) => l.slot === s)
          return (
            <Pill key={s} active={slot === s} onClick={() => setSlot(s)}>
              {s} · {(lift?.label ?? '').split(' ')[0] || s}
            </Pill>
          )
        })}
      </div>
      <AccessoryEditor slot={slot} />
      <p className="mt-3 text-xs text-ink-400">
        Changes apply to the current cycle for any day you haven't logged yet, and to every cycle after it.
      </p>

      <Sheet open={pickingTemplate} onClose={() => setPickingTemplate(false)} title="Choose a template">
        <ul className="space-y-2">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => {
                  updateSettings({ templateId: template.id })
                  setPickingTemplate(false)
                  toast.show(`${template.name} selected — applies to the next cycle`)
                }}
                className={cx(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition',
                  template.id === active.id
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-ink-700 bg-ink-800/60 hover:border-ink-400',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{template.name}</span>
                  {!template.builtIn ? (
                    <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase">custom</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-400">{template.summary}</p>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-400">
          A new template takes effect when you start your next cycle, so a cycle in progress is never rewritten.
        </p>
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit template">
        <TemplateEditor base={active} onClose={() => { setEditing(false); toast.show('Template saved') }} />
      </Sheet>

      <Toast message={toast.message} />
    </div>
  )
}
