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
  resolveSwapWeightKg,
  substituteTrainingMaxKg,
  today,
} from '../lib/cycle'
import { progressAccessories, type AccessoryBump } from '../lib/progression'
import { createProfile, DEFAULT_SETTINGS, type SeedKind } from '../lib/defaults'
import { getExercise } from '../lib/exercises'
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
  /** Day the pending proposals belong to. */
  pendingBumpsSlot: DaySlot | null
  /** Snapshots of the active cycle taken before each reversible edit. */
  undoStack: { label: string; cycleId: string; cycle: Cycle }[]

  init: () => void
  setLocalUser: (uid: string, displayName: string) => Promise<void>
  bootstrapProfile: (displayName: string, seed: SeedKind) => Promise<void>
  signOut: () => Promise<void>
  dismissSaveError: () => void
  dismissBumps: () => void
  /** Reverts the last edit and returns its label, or null if there was none. */
  undo: () => string | null
  addAccessorySet: (key: string, planId: string) => void
  removeAccessorySet: (key: string, planId: string) => void
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
  /** Returns proposed accessory increases for confirmation; nothing is written yet. */
  completeSession: (key: string) => AccessoryBump[]
  /** Commits the increases the lifter accepted, at whatever weight they chose. */
  applyBumps: (accepted: AccessoryBump[]) => void
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

  const UNDO_LIMIT = 25
  /**
   * Snapshot before a reversible edit. `coalesceKey` collapses a run of edits to
   * the same field — typing a weight should be one undo, not one per keystroke.
   */
  let lastCoalesce: { key: string; at: number } | null = null
  const pushUndo = (label: string, coalesceKey?: string) => {
    const cycle = activeCycleOf(get())
    if (!cycle) return
    const now = Date.now()
    if (coalesceKey) {
      if (lastCoalesce && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < 5000) {
        lastCoalesce = { key: coalesceKey, at: now }
        return
      }
      lastCoalesce = { key: coalesceKey, at: now }
    } else {
      lastCoalesce = null
    }
    const stack = [...get().undoStack, { label, cycleId: cycle.id, cycle: structuredClone(cycle) }]
    set({ undoStack: stack.slice(-UNDO_LIMIT) })
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
    pendingBumpsSlot: null,
    undoStack: [],

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
      set({ pendingBumps: null, pendingBumpsSlot: null })
    },

    undo() {
      const state = get()
      const entry = state.undoStack[state.undoStack.length - 1]
      if (!entry) return null
      lastCoalesce = null
      const restored = { ...entry.cycle, updatedAt: new Date().toISOString() }
      set({
        cycles: state.cycles.map((c) => (c.id === restored.id ? restored : c)),
        undoStack: state.undoStack.slice(0, -1),
      })
      persistCycle(restored)
      return entry.label
    },

    addAccessorySet(key, planId) {
      pushUndo('added a set')
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) =>
          a.planId === planId
            ? {
                ...a,
                sets: [
                  ...a.sets,
                  { done: false, weightKg: a.sets[a.sets.length - 1]?.weightKg ?? a.targetWeightKg, reps: null },
                ],
              }
            : a,
        ),
      }))
    },

    removeAccessorySet(key, planId) {
      pushUndo('removed a set')
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) =>
          a.planId === planId && a.sets.length > 1 ? { ...a, sets: a.sets.slice(0, -1) } : a,
        ),
      }))
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
      pushUndo('set edit', `set:${key}:${setId}:${Object.keys(patch).join(',')}`)
      mutateSession(key, (session) => ({
        ...session,
        mainSets: session.mainSets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
        supplementalSets: session.supplementalSets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    },

    patchAccessorySet(key, planId, index, patch) {
      pushUndo('set edit', `acc:${key}:${planId}:${index}:${Object.keys(patch).join(',')}`)
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
      pushUndo(skipped ? 'skipped an exercise' : 'un-skipped an exercise')
      mutateSession(key, (session) => ({
        ...session,
        accessories: session.accessories.map((a) => (a.planId === planId ? { ...a, skipped } : a)),
      }))
    },

    swapAccessoryExercise(key, planId, exerciseId, weightKg) {
      const state = get()
      const cycle = activeCycleOf(state)
      const session = cycle?.sessions[key]
      if (!cycle || !session) return
      const planned = (cycle.accessoryPlan[session.slot] ?? []).find((p) => p.id === planId)
      const target = getExercise(exerciseId, state.profile?.customExercises ?? [])

      /*
       * Never lose a weight on a swap. Converting between, say, a cable row and
       * a plank has no sensible answer, and the old behaviour wrote null — which
       * read as "bodyweight" and could not be swapped back, because there was no
       * longer a weight to convert from.
       */
      pushUndo(`swapped to ${target.name}`)
      mutateSession(key, (current) => ({
        ...current,
        accessories: current.accessories.map((a) => {
          if (a.planId !== planId) return a
          const next = resolveSwapWeightKg({
            planned,
            toExerciseId: exerciseId,
            currentKg: a.targetWeightKg,
            convertedKg: weightKg,
            custom: state.profile?.customExercises ?? [],
          })
          return {
            ...a,
            exerciseId,
            targetWeightKg: next,
            sets: a.sets.map((set) => (set.done ? set : { ...set, weightKg: next })),
          }
        }),
      }))
    },

    swapMainExercise(key, exerciseId) {
      const state = get()
      const profile = state.profile
      const cycle = activeCycleOf(state)
      if (!profile || !cycle) return
      pushUndo(`swapped to ${getExercise(exerciseId, profile.customExercises).name}`)
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

      pushUndo('finished the workout')
      mutateSession(key, (target) => ({
        ...target,
        status: 'complete',
        completedDate: target.completedDate ?? new Date().toISOString(),
      }))

      /*
       * Increases are proposed, not applied. The app can tell you cleared the
       * range; it cannot tell whether the last rep was clean or whether your
       * shoulder is complaining, so the decision stays with the lifter.
       */
      const proposed = profile.settings.autoProgressAccessories
        ? progressAccessories(
            cycle.accessoryPlan[session.slot] ?? [],
            session.accessories,
            contextFor(profile.settings),
          ).bumps
        : []

      set({
        openSessionKey: null,
        pendingBumps: proposed.length > 0 ? proposed : null,
        pendingBumpsSlot: proposed.length > 0 ? session.slot : null,
      })
      return proposed
    },

    applyBumps(accepted) {
      const state = get()
      const slot = state.pendingBumpsSlot
      if (!slot || accepted.length === 0) {
        set({ pendingBumps: null, pendingBumpsSlot: null })
        return
      }
      pushUndo('accepted new accessory weights')
      const byId = new Map(accepted.map((bump) => [bump.planId, bump.toKg]))
      const bump = <T extends { id: string; targetWeightKg: number | null }>(item: T): T =>
        byId.has(item.id) ? { ...item, targetWeightKg: byId.get(item.id) as number } : item

      mutateCycle((current) => ({
        ...current,
        accessoryPlan: {
          ...current.accessoryPlan,
          [slot]: (current.accessoryPlan[slot] ?? []).map(bump),
        },
      }))
      // Carry it into the profile too, so the next cycle starts from the new weight.
      mutateProfile((current) => ({
        ...current,
        accessoryPlan: {
          ...current.accessoryPlan,
          [slot]: (current.accessoryPlan[slot] ?? []).map(bump),
        },
      }))
      set({ pendingBumps: null, pendingBumpsSlot: null })
    },

    refreshFromMaxes() {
      pushUndo('updated training maxes')
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
      pushUndo('skipped the day')
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
