import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { firebaseEnabled, getFirebaseAuth } from './firebase'

export interface AppUser {
  uid: string
  displayName: string
  email?: string
  photoURL?: string
  /** True when this identity only exists in this browser. */
  local: boolean
}

const LOCAL_KEY = 'lift:active-local-uid'

export const rememberLocalUser = (uid: string) => localStorage.setItem(LOCAL_KEY, uid)
export const forgetLocalUser = () => localStorage.removeItem(LOCAL_KEY)
export const rememberedLocalUser = () => localStorage.getItem(LOCAL_KEY)

const toAppUser = (user: User): AppUser => ({
  uid: user.uid,
  displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Lifter',
  email: user.email ?? undefined,
  photoURL: user.photoURL ?? undefined,
  local: false,
})

export function watchAuth(onChange: (user: AppUser | null) => void): () => void {
  if (!firebaseEnabled) {
    onChange(null)
    return () => {}
  }
  return onAuthStateChanged(getFirebaseAuth(), (user) => onChange(user ? toAppUser(user) : null))
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(getFirebaseAuth(), provider)
  } catch (error) {
    const code = (error as { code?: string }).code
    // Installed to the home screen, the popup has nowhere to open — fall back.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(getFirebaseAuth(), provider)
      return
    }
    throw error
  }
}

export async function signOutUser(): Promise<void> {
  forgetLocalUser()
  if (firebaseEnabled) await signOut(getFirebaseAuth())
}
