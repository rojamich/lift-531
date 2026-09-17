import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../state/useApp'
import { incrementFor, type EquipmentContext } from '../lib/engine'
import type { Equipment } from '../lib/types'
import { formatNumber, fromKg, roundTo, toKg, type Unit } from '../lib/units'

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2200)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { message, show }
}

/** Weight helpers bound to the profile's unit, so screens never convert by hand. */
export function useWeight() {
  const settings = useSettings()
  const unit: Unit = settings?.unit ?? 'lb'
  const pick = (pair: { lb: number; kg: number } | undefined, fallback: number) =>
    pair ? (unit === 'kg' ? pair.kg : pair.lb) : fallback
  const increment = pick(settings?.barbellIncrement, unit === 'kg' ? 2.5 : 5)
  const ctx: EquipmentContext = {
    unit,
    barbellIncrement: increment,
    dumbbellIncrement: pick(settings?.dumbbellIncrement, unit === 'kg' ? 2 : 5),
    machineIncrement: pick(settings?.machineIncrement, unit === 'kg' ? 2.5 : 5),
    maxDumbbell: null,
  }
  // One decimal for logged actuals. A 240 lb pull really is 108.9 kg, and
  // snapping that to 110 would claim a lift that never happened — only
  // *targets* get rounded to what a rack can actually be loaded to.
  const convert = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10

  return {
    unit,
    increment,
    /** kg -> display number */
    show: (kg: number | null | undefined) => (kg === null || kg === undefined ? null : fromKg(kg, unit)),
    /** kg -> "185" */
    text: (kg: number | null | undefined) => (kg === null || kg === undefined ? '—' : formatNumber(convert(kg))),
    /** kg -> "185 lb" */
    full: (kg: number | null | undefined) =>
      kg === null || kg === undefined ? '—' : `${formatNumber(convert(kg))} ${unit}`,
    /**
     * Same, but snapped to what that implement can actually be loaded to. A
     * 50 lb dumbbell is 22.68 kg, and nobody wants to read that in a hotel gym.
     * Display only — the stored value stays exact, so switching units is lossless.
     */
    forEquipment: (kg: number | null | undefined, equipment: Equipment) =>
      kg === null || kg === undefined ? null : roundTo(fromKg(kg, unit), incrementFor(equipment, ctx)),
    textFor: (kg: number | null | undefined, equipment: Equipment) =>
      kg === null || kg === undefined
        ? '—'
        : formatNumber(roundTo(fromKg(kg, unit), incrementFor(equipment, ctx))),
    fullFor: (kg: number | null | undefined, equipment: Equipment) =>
      kg === null || kg === undefined
        ? '—'
        : `${formatNumber(roundTo(fromKg(kg, unit), incrementFor(equipment, ctx)))} ${unit}`,
    /** display number -> kg */
    toKg: (value: number) => toKg(value, unit),
    round: (value: number, step = increment) => roundTo(value, step),
  }
}

/**
 * Keeps the screen awake for the length of a workout. Silently does nothing
 * where the API is unavailable, which includes desktop Safari.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    type WakeLock = { release: () => Promise<void> }
    let lock: WakeLock | null = null
    let cancelled = false
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } }

    const acquire = async () => {
      try {
        if (!nav.wakeLock) return
        const next = await nav.wakeLock.request('screen')
        if (cancelled) {
          await next.release()
          return
        }
        lock = next
      } catch {
        // Denied or unsupported — not worth surfacing.
      }
    }
    void acquire()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !lock) void acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void lock?.release().catch(() => {})
    }
  }, [active])
}
