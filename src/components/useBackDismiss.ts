import { useEffect, useRef } from 'react'

/**
 * Makes the system back button close the topmost layer instead of leaving the
 * app. Installed once; every open sheet, workout or non-default tab registers
 * a dismisser and pushes a history entry to consume.
 *
 * Closing by tapping (rather than by going back) removes the entry it pushed,
 * so the history never fills with stale entries that make Back a no-op.
 */
interface Layer {
  id: number
  close: () => void
}

const layers: Layer[] = []
let nextId = 1
/** Pops we triggered ourselves, which must not close another layer. */
let selfInflicted = 0
let listening = false

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', () => {
    if (selfInflicted > 0) {
      selfInflicted -= 1
      return
    }
    const top = layers.pop()
    // With nothing registered the browser has already navigated away, which is
    // the correct behaviour at the root of the app.
    if (top) top.close()
  })
}

export function useBackDismiss(active: boolean, close: () => void) {
  // Kept current in an effect rather than during render, so the registered
  // layer always calls the latest handler without re-registering.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    ensureListener()

    const id = nextId++
    layers.push({ id, close: () => closeRef.current() })
    window.history.pushState({ liftLayer: id }, '')

    return () => {
      const index = layers.findIndex((layer) => layer.id === id)
      // Already gone means popstate handled it; the entry is spent.
      if (index === -1) return
      layers.splice(index, 1)
      selfInflicted += 1
      window.history.back()
    }
  }, [active])
}
