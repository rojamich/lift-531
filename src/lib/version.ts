/**
 * Build identity, so "am I running the latest?" is answerable from the phone
 * rather than by guessing at what the service worker has cached.
 */
export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__
export const GIT_SHA = __GIT_SHA__

export function buildDate(): string {
  const date = new Date(BUILD_TIME)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function buildStamp(): string {
  return `v${APP_VERSION} · ${buildDate()} · ${GIT_SHA}`
}
