/**
 * Weight is stored canonically in kilograms and rendered in the profile's unit.
 *
 * All *rounding* happens in the display unit, never in kg. That matters: a 330 lb
 * max rounds to a 280 lb training max in imperial, and to a 127.5 kg training max
 * in metric, and neither is a rounded version of the other. Rounding once, at the
 * end, in the unit you are actually loading onto the bar, is the only way both
 * come out to numbers that exist in a gym.
 */

export type Unit = 'lb' | 'kg'

export const KG_PER_LB = 0.45359237

export const lbToKg = (lb: number) => lb * KG_PER_LB
export const kgToLb = (kg: number) => kg / KG_PER_LB

/** Convert a canonical kg value into `unit`, unrounded. */
export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kgToLb(kg)
}

/** Convert a value the user typed in `unit` into canonical kg. */
export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : lbToKg(value)
}

export function roundTo(value: number, increment: number): number {
  if (increment <= 0) return value
  return Math.round(value / increment) * increment
}

/** Floor rather than round — used where going over would exceed what's loadable. */
export function floorTo(value: number, increment: number): number {
  if (increment <= 0) return value
  return Math.floor(value / increment) * increment
}

/**
 * The smallest jump you can actually make on a given implement, per unit.
 * Barbell: a pair of the smallest plates. Dumbbell: the rack's step.
 */
export interface Increments {
  barbell: number
  dumbbell: number
  machine: number
}

export const DEFAULT_INCREMENTS: Record<Unit, Increments> = {
  lb: { barbell: 5, dumbbell: 5, machine: 5 },
  kg: { barbell: 2.5, dumbbell: 2, machine: 2.5 },
}

export const DEFAULT_BAR_WEIGHT: Record<Unit, number> = { lb: 45, kg: 20 }

/** Plates available per side, heaviest first, in display units. */
export const DEFAULT_PLATES: Record<Unit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
}

export function formatWeight(value: number, unit: Unit): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${text} ${unit}`
}

/** Bare number, no unit suffix — for tight layouts where the unit is in the header. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

export interface PlateBreakdown {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[]
  /** What the bar actually weighs once loaded — may undershoot the target. */
  achievable: number
  leftover: number
  barWeight: number
}

/**
 * Greedy plate math for one side of the bar. Greedy is optimal here because
 * every standard plate set is such that each plate is at least the sum of
 * nothing smaller it can't already make — in practice it never misses.
 */
export function platesFor(
  target: number,
  unit: Unit,
  barWeight = DEFAULT_BAR_WEIGHT[unit],
  plates = DEFAULT_PLATES[unit],
): PlateBreakdown {
  const perSide: number[] = []
  if (target <= barWeight) {
    return { perSide, achievable: barWeight, leftover: Math.max(0, target - barWeight), barWeight }
  }
  let remainingPerSide = (target - barWeight) / 2
  const sorted = [...plates].sort((a, b) => b - a)
  const epsilon = 1e-6
  for (const plate of sorted) {
    while (remainingPerSide + epsilon >= plate) {
      perSide.push(plate)
      remainingPerSide -= plate
    }
  }
  const loaded = perSide.reduce((sum, p) => sum + p, 0)
  return {
    perSide,
    achievable: barWeight + loaded * 2,
    leftover: Math.round(remainingPerSide * 2 * 100) / 100,
    barWeight,
  }
}

/** "45 + 2×25 + 2×10" — how you'd actually describe loading the bar. */
export function describePlates(breakdown: PlateBreakdown): string {
  if (breakdown.perSide.length === 0) return `${formatNumber(breakdown.barWeight)} bar`
  const counts = new Map<number, number>()
  for (const plate of breakdown.perSide) counts.set(plate, (counts.get(plate) ?? 0) + 1)
  const parts = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([plate, count]) => `${count * 2}×${formatNumber(plate)}`)
  return `${formatNumber(breakdown.barWeight)} bar + ${parts.join(' + ')}`
}
