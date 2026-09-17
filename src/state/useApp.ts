import { create } from 'zustand'
import { rememberLocalUser, rememberedLocalUser, signOutUser, watchAuth, type AppUser } from '../data/auth'
import { describeFirebaseError, type FriendlyError } from '../data/errors'
import { firebaseEnabled } from '../data/firebase'
import { localStore, store } from '../data/store'
import {
  contextFor,
  createCycle,
  hydrateSession,
  isCycleComplete,
  newId,
  nextCycleFrom,
  nextSession,
  refreshCycle,
  substituteTrainingMaxKg,
  today,
} from '../lib/cycle'
import { progressAccessories, type AccessoryBump } from '../lib/progression'
import { createProfile, DEFAULT_SETTINGS, type SeedKind } from '../lib/defaults'
import { findTemplate } from '../lib/templates'
import type {
  Cycle,
  DaySlot,
  Lift,
  LoggedAccessorySet,
  LoggedSet,
  PlannedAccessory,
  Profile,
  Session,
  Settings,
  Template,
} from '../lib/types'

type Status = 'loading' | 'signed-out' | 'needs-setup' | 'ready' | 'error'

interface AppState {
  status: Status
  user: AppUser | null
  profile: Profile | null
  cycles: Cycle[]
  error: FriendlyError | null
  /**
   * Set when a background save fails. Logging keeps working against local state,
   * but the person needs to know their sets are not reaching the server.
   */
  saveError: FriendlyError | null
  /** Session the user is currently looking at, by key. */
  openSessionKey: string | null
  /**
   * Accessory targets earned by the workout just finished. Held here rather than
   * in the session screen, which unmounts the moment the workout closes.
   */
  pendingBumps: AccessoryBump[] | null

  init: () => void
  setLocalUser: (uid: string, displayName: string) => Promise<void>
  bootstrapProfile: (displayName: string, seed: SeedKind) => Promise<void>
  signOut: () => Promise<void>
  dismissSaveError: () => void
  dismissBumps: () => void
  retryLoad: () => void

  updateSettings: (patch: Partial<Settings>) => void
  updateProfile: (patch: Partial<Pick<Profile, 'displayName' | 'lifts' | 'accessoryPlan' | 'customTemplates'>>) => void
  setLifts: (lifts: Lift[]) => void
  setAccessoryPlan: (slot: DaySlot, items: PlannedAccessory[]) => void
  saveCustomTemplate: (template: Template) => void

  startCycle: (options?: { template?: Template; startDate?: string }) => void
  openSession: (key: string) => void
  closeSession: () => void
  patchSet: (key: string, setId: string, patch: Partial<LoggedSet>) => void
  patchAccessorySet: (key: string, planId: string, index: number, patch: Partial<LoggedAccessorySet>) => void
  setAccessorySkipped: (key: string, planId: string, skipped: boolean) => void
  swapAccessoryExercise: (key: string, planId: string, exerciseId: string, weightKg: number | null) => void
  swapMainExercise: (key: string, exerciseId: string) => void
  setSessionNotes: (key: string, notes: string) => void
  /** Returns any accessory targets that went up, for the post-workout summary. */
  completeSession: (key: string) => AccessoryBump[]
  refreshFromMaxes: () => void
  reopenSession: (key: string) => void
  skipSession: (key: string) => void
  scheduleSession: (key: string, date: string | undefined) => void
  finishCycle: (trainingMaxesKg: Partial<Record<DaySlot, number>>, options?: { template?: Template; accessoryPlan?: Record<DaySlot, PlannedAccessory[]> }) => void
}

const activeCycleOf = (state: { profile: Profile | null; cycles: Cycle[] }): Cycle | null => {
  if (!state.profile) return null
  return (
    state.cycles.find((c) => c.id === state.profile?.activeCycleId) ??
    state.cycles.find((c) => c.status === 'active') ??
    null
  )
}

/**
 * Writes are queued per key and flushed on a short delay: logging a set fires
 * this on every tap, and a workout is a few hundred taps.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>()
function debounce(key: string, fn: () => void, ms = 400) {
  const existing = pending.get(key)
  if (existing) clearTimeout(existing)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      fn()
    }, ms),
  )
}

export const useApp = create<AppState>((set, get) => {
  const onSaved = () => {
    if (get().saveError) set({ saveError: null })
  }
  const onSaveFailed = (error: unknown) => {
    console.warn('save failed', error)
    set({ saveError: describeFirebaseError(error) })
  }

  const storeFor = () => (get().user?.local ? localStore : store)

  const persistProfile = (profile: Profile) => {
    debounce('profile', () => {
      storeFor().saveProfile(profile).then(onSaved, onSaveFailed)
    })
  }
  const persistCycle = (cycle: Cycle) => {
    const uid = get().user?.uid
    if (!uid) return
    debounce(`cycle:${cycle.id}`, () => {
      storeFor().saveCycle(uid, cycle).then(onSaved, onSaveFailed)
    })
  }

  const mutateProfile = (fn: (profile: Profile) => Profile) => {
    const current = get().profile
    if (!current) return
    const updated = { ...fn(current), updatedAt: new Date().toISOString() }
    set({ profile: updated })
    persistProfile(updated)
  }

  const mutateCycle = (fn: (cycle: Cycle) => Cycle) => {
    const state = get()
    const active = activeCycleOf(state)
    if (!active) return
    const updated = { ...fn(active), updatedAt: new Date().toISOString() }
    set({ cycles: state.cycles.map((c) => (c.id === updated.id ? updated : c)) })
    persistCycle(updated)
  }

  const mutateSession = (key: string, fn: (session: Session) => Session) => {
    mutateCycle((cycle) => {
      const session = cycle.sessions[key]
      if (!session) return cycle
      return { ...cycle, sessions: { ...cycle.sessions, [key]: fn(session) } }
    })
  }

  /**
   * Fill in settings added after a profile was written. Without this, a stored
   * profile silently opts out of every new feature because the flag reads
   * undefined.
   */
  const migrate = (profile: Profile): Profile => ({
    ...profile,
    settings: { ...DEFAULT_SETTINGS, ...profile.settings },
    customTemplates: profile.customTemplates ?? [],
    customExercises: profile.customExercises ?? [],
  })

  const loadFor = async (user: AppUser) => {
    const source = user.local ? localStore : store
    try {
      const stored = await source.loadProfile(user.uid)
      if (!stored) {
        set({ status: 'needs-setup', user, profile: null, cycles: [] })
        return
      }
      const profile = migrate(stored)
      const cycles = await source.listCycles(user.uid)
      set({ status: 'ready', user, profile, cycles, error: null, saveError: null })
    } catch (error) {
      console.error(error)
      // A failed *read* is not the same as a new account. Sending someone to the
      // setup form here would have them type a profile that cannot be saved.
      set({ status: 'error', user, profile: null, cycles: [], error: describeFirebaseError(error) })
    }
  }

  return {
    status: 'loading',
    user: null,
    profile: null,
    cycles: [],
    error: null,
    saveError: null,
    openSessionKey: null,
    pendingBumps: null,

    init() {
      if (!firebaseEnabled) {
        const uid = rememberedLocalUser()
        if (!uid) {
          set({ status: 'signed-out' })
          return
        }
        localStore
          .loadProfile(uid)
          .then((profile) => {
            if (!profile) {
              set({ status: 'signed-out' })
              return
            }
            loadFor({ uid, displayName: profile.displayName, local: true })
          })
          .catch(() => set({ status: 'signed-out' }))
        return
      }
      watchAuth((user) => {
        if (!user) {
          set({ status: 'signed-out', user: null, profile: null, cycles: [] })
          return
        }
        set({ status: 'loading', user })
        loadFor(user)
      })
    },

    async setLocalUser(uid, displayName) {
      rememberLocalUser(uid)
      await loadFor({ uid, displayName, local: true })
    },

    async bootstrapProfile(displayName, seed) {
      const existing = get().user
      const uid = existing?.uid ?? `local-${newId().slice(0, 8)}`
      const isLocal = existing?.local ?? !firebaseEnabled
      const profile = createProfile(uid, displayName, seed, existing?.email)
      const target = isLocal ? localStore : store
      try {
        await target.saveProfile(profile)
      } catch (error) {
        console.error(error)
        set({ status: 'error', error: describeFirebaseError(error) })
        return
      }
      if (isLocal) rememberLocalUser(uid)
      set({
        status: 'ready',
        user: { uid, displayName, email: existing?.email, local: isLocal },
        profile,
        cycles: [],
        error: null,
        saveError: null,
      })
      get().startCycle()
    },

    async signOut() {
      await signOutUser()
      set({
        status: 'signed-out',
        user: null,
        profile: null,
        cycles: [],
        openSessionKey: null,
        error: null,
        saveError: null,
      })
    },

    dismissSaveError() {
      set({ saveError: null })
    },

    dismissBumps() {
      set({ pendingBumps: null })
    },

    retryLoad() {
      const user = get().user
      if (!user) {
        set({ status: 'signed-out', error: null })
        return
      }
      set({ status: 'loading', error: null })
      void loadFor(user)
    },

    updateSettings(patch) {
      mutateProfile((profile) => ({ ...profile, settings: { ...profile.settings, ...patch } }))
    },

    updateProfile(patch) {
      mutateProfile((profile) => ({ ...profile, ...patch }))
    },

    setLifts(lifts) {
      mutateProfile((profile) => ({ ...profile, lifts }))
    },

    setAccessoryPlan(slot, items) {
      mutateProfile((profile) => ({
        ...profile,
        accessoryPlan: { ...profile.accessoryPlan, [slot]: items },
      }))
      // Keep the running cycle in step, but never disturb a day already logged.
      mutateCycle((cycle) => {
        const session = Object.values(cycle.sessions).find(
          (s) => s.slot === slot && (s.status === 'complete' || s.status === 'skipped'),
        )
        if (session) return cycle
        return { ...cycle, accessoryPlan: { ...cycle.accessoryPlan, [slot]: items } }
      })
    },

    saveCustomTemplate(template) {
      mutateProfile((profile) => ({
        ...profile,
        customTemplates: [...profile.customTemplates.filter((t) => t.id !== template.id), template],
        settings: { ...profile.settings, templateId: template.id },
      }))
    },

    startCycle(options) {
      const state = get()
      const profile = state.profile
      if (!profile) return
      const template = options?.template ?? findTemplate(profile.settings.templateId, profile.customTemplates)
      const number = state.cycles.reduce((max, c) => Math.max(max, c.number), 0) + 1
      const cycle = createCycle({
        number,
        startDate: options?.startDate ?? today(),
        lifts: profile.lifts,
        accessoryPlan: profile.accessoryPlan,
        template,
        settings: profile.settings,
      })
      const cycles = [...state.cycles.map((c) => ({ ...c, status: 'complete' as const })), cycle]
      const updatedProfile = { ...profile, activeCycleId: cycle.id, updatedAt: new Date().toISOString() }
      set({ cycles, profile: updatedProfile })
      persistProfile(updatedProfile)
      persistCycle(cycle)
      for (const c of cycles) if (c.id !== cycle.id && c.status === 'complete') persistCycle(c)
    },

    openSession(key) {
      const state = get()
      const profile = state.profile
      const cycle = activeCycleOf(state)
      if (!profile || !cycle) return
      mutateSession(key, (session) => {
        const hydrated = hydrateSession(cycle, session, profile.settings)
        return {
          ...hydrated,
          status: hydrated.status === 'pending' ? 'in-progress' : hydrated.status,
        }
      })
      set({ openSessionKey: key })
    },

    closeSession() {
      set({ openSessionKey: null })
    },

    patchSet(key, setId, patch) {
      mutateSession(key, (session) => ({
        ...session,
        mainSets: session.mainSets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        supplementalSets: session.supplementalSets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    },

    patchAccessorySet(key, planId, index, patch) {
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) =>
          a.planId === planId
            ? { ...a, sets: a.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
            : a,
        ),
      }))
    },

    setAccessorySkipped(key, planId, skipped) {
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) => (a.planId === planId ? { ...a, skipped } : a)),
      }))
    },

    swapAccessoryExercise(key, planId, exerciseId, weightKg) {
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) =>
          a.planId === planId
            ? {
                ...a,
                exerciseId,
                targetWeightKg: weightKg,
                sets: a.sets.map((s) => (s.done ? s : { ...s, weightKg })),
              }
            : a,
        ),
      }))
    },

    swapMainExercise(key, exerciseId) {
      const state = get()
      const profile = state.profile
      const cycle = activeCycleOf(state)
      if (!profile || !cycle) return
      mutateSession(key, (session) => {
        const planned = cycle.lifts.find((l) => l.slot === session.slot)?.exerciseId
        const trainingMaxKg = substituteTrainingMaxKg(cycle, session.slot, exerciseId, profile.settings)
        const next: Session = {
          ...session,
          mainExerciseId: exerciseId === planned ? undefined : exerciseId,
          mainTrainingMaxKg: trainingMaxKg,
          // The old sets were built against the old weight; start them over.
          mainSets: [],
          supplementalSets: [],
        }
        return hydrateSession(cycle, next, profile.settings)
      })
    },

    setSessionNotes(key, notes) {
      mutateSession(key, (session) => ({ ...session, notes }))
    },

    completeSession(key) {
      const state = get()
      const profile = state.profile
      const cycle = activeCycleOf(state)
      const session = cycle?.sessions[key]
      if (!profile || !cycle || !session) return []

      const bumps: AccessoryBump[] = []
      mutateCycle((current) => {
        const target = current.sessions[key]
        if (!target) return current
        const done: Session = {
          ...target,
          status: 'complete',
          completedDate: target.completedDate ?? new Date().toISOString(),
        }

        if (!profile.settings.autoProgressAccessories) {
          return { ...current, sessions: { ...current.sessions, [key]: done } }
        }

        const result = progressAccessories(
          current.accessoryPlan[target.slot] ?? [],
          target.accessories,
          contextFor(profile.settings),
        )
        bumps.push(...result.bumps)
        return {
          ...current,
          accessoryPlan: { ...current.accessoryPlan, [target.slot]: result.plan },
          sessions: { ...current.sessions, [key]: done },
        }
      })

      // Carry the earned weight into the profile so the next cycle starts there.
      if (bumps.length > 0) {
        const byId = new Map(bumps.map((bump) => [bump.planId, bump.toKg]))
        mutateProfile((current) => ({
          ...current,
          accessoryPlan: {
            ...current.accessoryPlan,
            [session.slot]: (current.accessoryPlan[session.slot] ?? []).map((item) =>
              byId.has(item.id) ? { ...item, targetWeightKg: byId.get(item.id) as number } : item,
            ),
          },
        }))
      }

      set({ openSessionKey: null, pendingBumps: bumps.length > 0 ? bumps : null })
      return bumps
    },

    refreshFromMaxes() {
      const state = get()
      const profile = state.profile
      const cycle = activeCycleOf(state)
      if (!profile || !cycle) return
      const refreshed = refreshCycle(cycle, profile)
      set({ cycles: state.cycles.map((c) => (c.id === refreshed.id ? refreshed : c)) })
      persistCycle(refreshed)
    },

    reopenSession(key) {
      mutateSession(key, (session) => ({ ...session, status: 'in-progress' }))
    },

    skipSession(key) {
      mutateSession(key, (session) => ({ ...session, status: 'skipped' }))
      set({ openSessionKey: null })
    },

    scheduleSession(key, date) {
      mutateSession(key, (session) => ({ ...session, scheduledDate: date }))
    },

    finishCycle(trainingMaxesKg, options) {
      const state = get()
      const profile = state.profile
      const previous = activeCycleOf(state)
      if (!profile || !previous) return

      const closed: Cycle = {
        ...previous,
        status: 'complete',
        completedDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const next = nextCycleFrom(closed, profile, trainingMaxesKg, {
        template: options?.template,
        accessoryPlan: options?.accessoryPlan,
      })
      // The new maxes become the profile's baseline for any cycle started later.
      const updatedProfile: Profile = {
        ...profile,
        activeCycleId: next.id,
        lifts: next.lifts.map((l) => ({
          slot: l.slot,
          exerciseId: l.exerciseId,
          label: l.label,
          category: l.category,
          est1RMKg: l.est1RMKg,
        })),
        accessoryPlan: options?.accessoryPlan ?? profile.accessoryPlan,
        updatedAt: new Date().toISOString(),
      }
      set({
        cycles: [...state.cycles.map((c) => (c.id === closed.id ? closed : c)), next],
        profile: updatedProfile,
        openSessionKey: null,
      })
      persistProfile(updatedProfile)
      persistCycle(closed)
      persistCycle(next)
    },
  }
})

export const useActiveCycle = () => useApp((s) => activeCycleOf(s))

export function useSettings(): Settings | null {
  return useApp((s) => s.profile?.settings ?? null)
}

export function useEquipmentContext() {
  const settings = useSettings()
  return settings ? contextFor(settings) : null
}

export { activeCycleOf, isCycleComplete, nextSession }
