import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker lifecycle, surfaced to the UI.
 *
 * An installed PWA keeps serving whatever it precached until a new worker is
 * both downloaded and activated, so without this you can be a week behind and
 * have no way to tell. The registration is polled in the background, and the new
 * build is applied only when asked — never mid-set.
 */
export interface UpdateState {
  /** A newer build is downloaded and waiting to take over. */
  needRefresh: boolean
  offlineReady: boolean
  checking: boolean
  lastCheckedAt: string | null
  /** False when no service worker is running at all, e.g. in dev. */
  supported: boolean
}

let state: UpdateState = {
  needRefresh: false,
  offlineReady: false,
  checking: false,
  lastCheckedAt: null,
  supported: false,
}

const listeners = new Set<() => void>()
let registration: ServiceWorkerRegistration | undefined
let applyUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeToUpdates(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getUpdateState = () => state

/** Every half hour, and whenever the app comes back to the foreground. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

export function startUpdateWatch() {
  if (applyUpdateFn) return

  applyUpdateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      set({ needRefresh: true })
    },
    onOfflineReady() {
      set({ offlineReady: true })
    },
    onRegisteredSW(_swUrl, reg) {
      registration = reg
      set({ supported: Boolean(reg), lastCheckedAt: new Date().toISOString() })
      if (!reg) return

      const poll = () => {
        if (document.visibilityState !== 'visible') return
        void reg.update().catch(() => {})
      }
      setInterval(poll, CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', poll)
    },
    onRegisterError(error) {
      console.warn('service worker registration failed', error)
    },
  })
}

/** Manual check, for the button in Settings. */
export async function checkForUpdates(): Promise<'update-found' | 'up-to-date' | 'unsupported'> {
  if (!registration) return 'unsupported'
  set({ checking: true })
  try {
    await registration.update()
    // onNeedRefresh fires asynchronously once the new worker finishes installing.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return state.needRefresh ? 'update-found' : 'up-to-date'
  } catch {
    return 'unsupported'
  } finally {
    set({ checking: false, lastCheckedAt: new Date().toISOString() })
  }
}

/** Activate the waiting build and reload onto it. */
export async function applyUpdate() {
  if (!applyUpdateFn) {
    window.location.reload()
    return
  }
  await applyUpdateFn(true)
}
