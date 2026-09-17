import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import type { Cycle, Profile } from '../lib/types'
import { firebaseEnabled, getDb } from './firebase'

export interface DataStore {
  loadProfile(uid: string): Promise<Profile | null>
  saveProfile(profile: Profile): Promise<void>
  listCycles(uid: string): Promise<Cycle[]>
  saveCycle(uid: string, cycle: Cycle): Promise<void>
  deleteCycle(uid: string, cycleId: string): Promise<void>
}

const KEY = (uid: string, part: string) => `lift:${uid}:${part}`

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn('Could not persist locally', error)
  }
}

/** Everything lives in this browser. Used until Firebase config is supplied. */
export const localStore: DataStore = {
  async loadProfile(uid) {
    return readJson<Profile>(KEY(uid, 'profile'))
  },
  async saveProfile(profile) {
    writeJson(KEY(profile.id, 'profile'), profile)
  },
  async listCycles(uid) {
    return readJson<Cycle[]>(KEY(uid, 'cycles')) ?? []
  },
  async saveCycle(uid, cycle) {
    const cycles = (readJson<Cycle[]>(KEY(uid, 'cycles')) ?? []).filter((c) => c.id !== cycle.id)
    cycles.push(cycle)
    cycles.sort((a, b) => a.number - b.number)
    writeJson(KEY(uid, 'cycles'), cycles)
  },
  async deleteCycle(uid, cycleId) {
    const cycles = (readJson<Cycle[]>(KEY(uid, 'cycles')) ?? []).filter((c) => c.id !== cycleId)
    writeJson(KEY(uid, 'cycles'), cycles)
  },
}

/**
 * Firestore, with offline persistence doing the heavy lifting. Writes resolve
 * against the local cache immediately, so logging a set never waits on a network.
 */
export const firestoreStore: DataStore = {
  async loadProfile(uid) {
    const snap = await getDoc(doc(getDb(), 'users', uid))
    return snap.exists() ? (snap.data() as Profile) : null
  },
  async saveProfile(profile) {
    await setDoc(doc(getDb(), 'users', profile.id), profile)
  },
  async listCycles(uid) {
    const snap = await getDocs(collection(getDb(), 'users', uid, 'cycles'))
    return snap.docs.map((d) => d.data() as Cycle).sort((a, b) => a.number - b.number)
  },
  async saveCycle(uid, cycle) {
    await setDoc(doc(getDb(), 'users', uid, 'cycles', cycle.id), cycle)
  },
  async deleteCycle(uid, cycleId) {
    await deleteDoc(doc(getDb(), 'users', uid, 'cycles', cycleId))
  },
}

export const store: DataStore = firebaseEnabled ? firestoreStore : localStore

/** Local profiles that exist in this browser, for the pre-Firebase picker. */
export function localProfiles(): { id: string; displayName: string }[] {
  const found: { id: string; displayName: string }[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    const match = key?.match(/^lift:(.+):profile$/)
    if (!match) continue
    const profile = readJson<Profile>(key as string)
    if (profile) found.push({ id: profile.id, displayName: profile.displayName })
  }
  return found.sort((a, b) => a.displayName.localeCompare(b.displayName))
}
