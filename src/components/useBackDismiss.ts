import { useEffect, useRef } from 'react'

/**
 * Makes the system back button close the topmost layer instead of leaving the
 * app. Sheets, the open workout and any non-default tab register a dismisser.
 *
 * A single "guard" history entry exists whenever at least one layer is open,
 * rather than one entry per layer. Per-layer entries looked tidier but raced:
 * finishing a workout unmounts the finish sheet and the workout screen while
 * mounting the summary sheet, so two `history.back()` calls and one
 * `pushState` landed in the same tick and cancelled each other out. The app was
 * then parked on its first history entry with a layer still registered, and the
 * next back press left the app with the sheet still on screen.
 *
 * Reconciling once per tick, against the layer *count*, removes the race: a
 * layer replacing another touches history not at all.
 */
interface Layer {
  id: number
  close: () => void
}

const layers: Layer[] = []
let nextId = 1
/** True when our guard entry is the current history entry. */
let guarded = false
/** Pops we caused ourselves, which must not close a layer. */
let suppress = 0
let listening = false
let scheduled = false

function reconcile() {
  if (typeof window === 'undefined') return
  if (layers.length > 0 && !guarded) {
    guarded = true
    window.history.pushState({ liftGuard: true }, '')
  } else if (layers.length === 0 && guarded) {
    guarded = false
    suppress += 1
    window.history.back()
  }
}

/** Batch to a microtask so a whole React commit settles before touching history. */
function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    reconcile()
  })
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', () => {
    if (suppress > 0) {
      suppress -= 1
      return
    }
    if (!guarded) return // Not our entry; let the browser navigate.
    guarded = false // The guard was just consumed by this pop.
    const top = layers.pop()
    if (top) top.close()
    // Re-arm for whatever is still open underneath.
    reconcile()
  })
}

export function useBackDismiss(active: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    ensureListener()

    const id = nextId++
    layers.push({ id, close: () => closeRef.current() })
    schedule()

    return () => {
      const index = layers.findIndex((layer) => layer.id === id)
      // Already gone means a popstate handled it.
      if (index !== -1) layers.splice(index, 1)
      schedule()
    }
  }, [active])
}
