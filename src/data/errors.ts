export interface FriendlyError {
  title: string
  detail: string
  /** What the person can actually do about it, when there is something. */
  fix?: string
  code: string
}

const codeOf = (error: unknown): string => {
  const raw = (error as { code?: unknown }).code
  if (typeof raw !== 'string') return ''
  // Firestore reports "permission-denied"; Auth reports "auth/popup-blocked".
  return raw.replace(/^[a-z]+\//, '')
}

/**
 * Turn a Firebase error into something worth showing a person. The two that
 * actually happen in practice are unpublished security rules and a browser
 * extension blocking the Firestore endpoint, and neither is guessable from the
 * raw message.
 */
export function describeFirebaseError(error: unknown): FriendlyError {
  const code = codeOf(error)
  const message = error instanceof Error ? error.message : String(error)

  switch (code) {
    case 'permission-denied':
      return {
        code,
        title: 'Firestore is refusing to read or write',
        detail:
          'The database is reachable but its security rules are rejecting this account. Almost always this means the rules in firestore.rules were never published, so the default production rules are still denying everything.',
        fix: 'Publish the rules: paste firestore.rules into the Rules tab in the Firebase console, or run npx firebase-tools deploy --only firestore:rules',
      }
    case 'unavailable':
    case 'deadline-exceeded':
      return {
        code,
        title: "Can't reach Firestore",
        detail:
          'The request never arrived. An ad or tracker blocker blocking firestore.googleapis.com is the usual cause; a dropped connection is the other.',
        fix: 'Allow firestore.googleapis.com for this site in your blocker, then reload. Your work is saved on this device meanwhile.',
      }
    case 'unauthenticated':
      return {
        code,
        title: 'Signed out',
        detail: 'Firebase no longer recognises this session.',
        fix: 'Sign in again.',
      }
    case 'failed-precondition':
      return {
        code,
        title: 'Firestore needs setting up',
        detail:
          'The project has no Firestore database yet, or it was created in a mode this app cannot use.',
        fix: 'Create the database under Build → Firestore Database in the Firebase console.',
      }
    case 'popup-blocked':
    case 'popup-closed-by-user':
      return {
        code,
        title: 'Sign-in window did not open',
        detail: 'The browser blocked the Google sign-in popup.',
        fix: 'Allow popups for this site and try again.',
      }
    case 'unauthorized-domain':
      return {
        code,
        title: 'This domain is not authorised',
        detail: 'Firebase Auth only accepts sign-in from domains you have listed.',
        fix: 'Add this domain under Authentication → Settings → Authorized domains.',
      }
    default:
      return { code: code || 'unknown', title: 'Something went wrong', detail: message }
  }
}

/** True for errors where retrying later is likely to work on its own. */
export const isTransient = (error: unknown) =>
  ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted'].includes(codeOf(error))
