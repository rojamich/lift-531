import { useState } from 'react'
import { EquipmentQuickToggle } from '../components/ExerciseSwap'
import { useToast, useWeight } from '../components/hooks'
import { Button, Card, Field, Input, NumberField, Pill, SectionTitle, Sheet, Toggle, Toast } from '../components/ui'
import { useUpdateState } from '../components/UpdateBanner'
import { firebaseEnabled } from '../data/firebase'
import { applyUpdate, checkForUpdates } from '../data/updates'
import { buildStamp } from '../lib/version'
import { DEFAULT_INCREMENTS, fromKg, lbToKg, toKg, type Unit } from '../lib/units'
import type { UnitPair } from '../lib/types'
import { useApp } from '../state/useApp'

function PairField({
  label,
  hint,
  pair,
  unit,
  onChange,
}: {
  label: string
  hint?: string
  pair: UnitPair
  unit: Unit
  onChange: (next: UnitPair) => void
}) {
  return (
    <Field label={`${label} (${unit})`} hint={hint}>
      <NumberField
        ariaLabel={`${label} in ${unit}`}
        className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        value={unit === 'kg' ? pair.kg : pair.lb}
        onChange={(next) => {
          const value = next ?? 0
          onChange(unit === 'kg' ? { ...pair, kg: value } : { ...pair, lb: value })
        }}
      />
    </Field>
  )
}

export function SettingsScreen() {
  const profile = useApp((s) => s.profile)
  const user = useApp((s) => s.user)
  const updateSettings = useApp((s) => s.updateSettings)
  const updateProfile = useApp((s) => s.updateProfile)
  const signOut = useApp((s) => s.signOut)
  const startCycle = useApp((s) => s.startCycle)
  const weight = useWeight()
  const toast = useToast()
  const [advanced, setAdvanced] = useState(false)
  const update = useUpdateState()

  if (!profile) return null
  const settings = profile.settings
  const unit = settings.unit

  const setUnit = (next: Unit) => {
    updateSettings({ unit: next })
    toast.show(next === 'kg' ? 'Switched to kilograms' : 'Switched to pounds')
  }

  return (
    <div className="pb-24">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-ink-400">
          {user?.local ? 'Saved in this browser only' : user?.email ?? 'Signed in'}
        </p>
      </header>

      <SectionTitle>Profile</SectionTitle>
      <Card className="mb-5 p-3">
        <Field label="Display name">
          <Input value={profile.displayName} onChange={(e) => updateProfile({ displayName: e.target.value })} />
        </Field>
      </Card>

      <SectionTitle>Units</SectionTitle>
      <Card className="mb-5 p-3">
        <div className="flex gap-2">
          <Pill active={unit === 'lb'} onClick={() => setUnit('lb')}>
            Pounds
          </Pill>
          <Pill active={unit === 'kg'} onClick={() => setUnit('kg')}>
            Kilograms
          </Pill>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Every weight is stored once and converted for display, so switching mid-cycle is safe — your history
          stays exactly as heavy as it was. Rounding happens in whichever unit you're loading.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PairField
            label="Barbell step"
            pair={settings.barbellIncrement}
            unit={unit}
            onChange={(barbellIncrement) => updateSettings({ barbellIncrement })}
          />
          <PairField
            label="Bar weight"
            pair={settings.barWeight}
            unit={unit}
            onChange={(barWeight) => updateSettings({ barWeight })}
          />
          <PairField
            label="Dumbbell step"
            pair={settings.dumbbellIncrement}
            unit={unit}
            onChange={(dumbbellIncrement) => updateSettings({ dumbbellIncrement })}
          />
          <PairField
            label="Machine step"
            pair={settings.machineIncrement}
            unit={unit}
            onChange={(machineIncrement) => updateSettings({ machineIncrement })}
          />
        </div>
        <Button
          size="sm"
          variant="quiet"
          className="mt-2"
          onClick={() =>
            updateSettings({
              barbellIncrement: { lb: DEFAULT_INCREMENTS.lb.barbell, kg: DEFAULT_INCREMENTS.kg.barbell },
              dumbbellIncrement: { lb: DEFAULT_INCREMENTS.lb.dumbbell, kg: DEFAULT_INCREMENTS.kg.dumbbell },
              machineIncrement: { lb: DEFAULT_INCREMENTS.lb.machine, kg: DEFAULT_INCREMENTS.kg.machine },
              barWeight: { lb: 45, kg: 20 },
            })
          }
        >
          Reset to standard gym values
        </Button>
      </Card>

      <SectionTitle>Programming</SectionTitle>
      <Card className="mb-5 space-y-3 p-3">
        <Field
          label="Training max percentage"
          hint="85% is the usual starting point. Lower it if top sets are grinding."
        >
          <div className="flex items-center gap-2">
            <NumberField
              ariaLabel="Training max percentage"
              className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 text-lg font-bold"
              value={Math.round(settings.tmPercent * 1000) / 10}
              onChange={(next) =>
                updateSettings({ tmPercent: Math.min(1, Math.max(0.5, (next ?? 85) / 100)) })
              }
            />
            <span className="text-ink-400">%</span>
          </div>
        </Field>
        <div className="flex gap-1.5">
          {[0.8, 0.85, 0.9].map((value) => (
            <Pill key={value} active={Math.abs(settings.tmPercent - value) < 0.001} onClick={() => updateSettings({ tmPercent: value })}>
              {Math.round(value * 100)}%
            </Pill>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PairField
            label="Upper jump / cycle"
            pair={settings.upperCycleIncrement}
            unit={unit}
            onChange={(upperCycleIncrement) => updateSettings({ upperCycleIncrement })}
          />
          <PairField
            label="Lower jump / cycle"
            pair={settings.lowerCycleIncrement}
            unit={unit}
            onChange={(lowerCycleIncrement) => updateSettings({ lowerCycleIncrement })}
          />
        </div>
        <p className="text-xs text-ink-400">
          Changing the training max percentage applies to the next cycle you start, not the one you're running.
        </p>
      </Card>

      <SectionTitle>Equipment</SectionTitle>
      <Card className="mb-5 space-y-3 p-3">
        <EquipmentQuickToggle />
        <Field
          label={`Heaviest dumbbell (${unit}, per hand)`}
          hint="Leave blank if you're never limited. When a prescription goes over this, the weight holds and the rep target rises to match."
        >
          <NumberField
            ariaLabel="Heaviest dumbbell"
            className="tabular w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            placeholder="no limit"
            value={settings.maxDumbbellKg === null ? null : fromKg(settings.maxDumbbellKg, unit)}
            format={(n) => Math.round(n * 100) / 100}
            onChange={(next) => updateSettings({ maxDumbbellKg: next === null ? null : toKg(next, unit) })}
          />
        </Field>
        <div className="flex gap-1.5">
          <Pill onClick={() => updateSettings({ maxDumbbellKg: null })}>No limit</Pill>
          <Pill onClick={() => updateSettings({ maxDumbbellKg: lbToKg(50) })}>50 lb</Pill>
          <Pill onClick={() => updateSettings({ maxDumbbellKg: lbToKg(55) })}>55 lb</Pill>
          <Pill onClick={() => updateSettings({ maxDumbbellKg: toKg(24, 'kg') })}>24 kg</Pill>
        </div>
      </Card>

      <SectionTitle>During a workout</SectionTitle>
      <Card className="mb-5 space-y-1 p-3">
        <Toggle
          checked={settings.autoProgressAccessories}
          onChange={(autoProgressAccessories) => updateSettings({ autoProgressAccessories })}
          label="Progress accessories automatically"
          hint="Clear the top of the rep range on every set and the target weight goes up next time"
        />
        <Toggle
          checked={settings.restTimerEnabled}
          onChange={(restTimerEnabled) => updateSettings({ restTimerEnabled })}
          label="Rest timer"
          hint="Counts down and buzzes when you're ready"
        />
        <Toggle
          checked={settings.autoStartRest}
          onChange={(autoStartRest) => updateSettings({ autoStartRest })}
          label="Start rest automatically"
          hint="Begins the moment you tick a set"
        />
        <Toggle
          checked={settings.showPlateMath}
          onChange={(showPlateMath) => updateSettings({ showPlateMath })}
          label="Show plate math"
          hint={`What to load on a ${unit === 'kg' ? settings.barWeight.kg : settings.barWeight.lb} ${unit} bar`}
        />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card className="mb-5 space-y-2 p-3">
        {!firebaseEnabled ? (
          <p className="rounded-lg border border-flame-500/40 bg-flame-500/10 px-3 py-2 text-xs text-ink-300">
            <span className="font-semibold text-flame-400">Local mode.</span> Everything is saved in this browser
            only. Add your Firebase keys to <code className="tabular">.env.local</code> to sync between phones —
            see the README.
          </p>
        ) : null}
        <Button variant="quiet" className="w-full justify-start" onClick={() => setAdvanced(true)}>
          Danger zone
        </Button>
        <Button variant="ghost" className="w-full" onClick={signOut}>
          {user?.local ? 'Switch profile' : 'Sign out'}
        </Button>
      </Card>

      <SectionTitle>Version</SectionTitle>
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular text-sm font-semibold">{buildStamp()}</div>
            <div className="text-xs text-ink-400">
              {update.needRefresh
                ? 'A newer version is downloaded and waiting.'
                : update.supported
                  ? 'This is the build currently installed on this device.'
                  : 'Running from the dev server — no installed copy to update.'}
            </div>
          </div>
          {update.needRefresh ? (
            <Button variant="primary" size="sm" className="shrink-0" onClick={() => void applyUpdate()}>
              Update
            </Button>
          ) : (
            <Button
              size="sm"
              className="shrink-0"
              disabled={update.checking || !update.supported}
              onClick={async () => {
                const result = await checkForUpdates()
                toast.show(
                  result === 'update-found'
                    ? 'New version found — tap Update'
                    : result === 'up-to-date'
                      ? "You're on the latest version"
                      : 'Cannot check from here',
                )
              }}
            >
              {update.checking ? 'Checking…' : 'Check'}
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Compare the commit against the latest on GitHub if you're unsure.
        </p>
      </Card>

      <Sheet open={advanced} onClose={() => setAdvanced(false)} title="Danger zone">
        <p className="text-sm text-ink-300">
          Starting a fresh cycle closes the one you're running and rebuilds every day from your current maxes and
          template. Your history is kept.
        </p>
        <Button
          variant="danger"
          size="lg"
          className="mt-4 w-full"
          onClick={() => {
            startCycle()
            setAdvanced(false)
            toast.show('New cycle started')
          }}
        >
          Start a fresh cycle now
        </Button>
        <p className="mt-4 text-xs text-ink-400">
          Weights shown in {weight.unit}. Training max {Math.round(settings.tmPercent * 100)}%.
        </p>
      </Sheet>

      <Toast message={toast.message} />
    </div>
  )
}
