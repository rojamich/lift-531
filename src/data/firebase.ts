import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

/**
 * The app is fully usable before Firebase exists — it just keeps everything in
 * this browser. Filling in .env.local flips it over to a synced account without
 * touching any other code.
 */
export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

function ensureApp(): FirebaseApp {
  if (!app) app = initializeApp(config as Required<typeof config>)
  return app
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp())
  return authInstance
}

export function getDb(): Firestore {
  if (!dbInstance) {
    // Persistent cache is what makes this work in a basement gym with no signal:
    // reads and writes hit IndexedDB first and reconcile when the phone reconnects.
    dbInstance = initializeFirestore(ensureApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  }
  return dbInstance
}
