import { useState } from 'react'
import { Button, Card, Field, Input, cx } from '../components/ui'
import { signInWithGoogle } from '../data/auth'
import { firebaseEnabled } from '../data/firebase'
import { localProfiles } from '../data/store'
import type { SeedKind } from '../lib/defaults'
import { useApp } from '../state/useApp'

function Wordmark() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-xl font-black tracking-tight text-ink-950">
        531
      </div>
      <h1 className="text-2xl font-bold">Lift</h1>
      <p className="mt-1 text-sm text-ink-400">Wendler 5/3/1, built for two people and a lot of hotel gyms.</p>
    </div>
  )
}

export function SignIn() {
  const setLocalUser = useApp((s) => s.setLocalUser)
  // localStorage is synchronous, so this needs no effect.
  const [profiles] = useState<{ id: string; displayName: string }[]>(() =>
    firebaseEnabled ? [] : localProfiles(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const google = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Wordmark />

      {firebaseEnabled ? (
        <>
          <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={google}>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </Button>
          <p className="mt-3 text-center text-xs text-ink-400">
            You and your partner each sign in with your own account. Your logs stay separate.
          </p>
          {error ? <p className="mt-3 text-center text-xs text-red-300">{error}</p> : null}
        </>
      ) : (
        <>
          {profiles.length > 0 ? (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
                Profiles on this device
              </div>
              {profiles.map((profile) => (
                <Button
                  key={profile.id}
                  size="lg"
                  className="w-full justify-start"
                  onClick={() => setLocalUser(profile.id, profile.displayName)}
                >
                  {profile.displayName}
                </Button>
              ))}
            </div>
          ) : null}
          <NewProfileForm />
          <p className="mt-4 text-center text-xs text-ink-400">
            Running in local mode — everything saves in this browser. Add Firebase keys to sync across phones.
          </p>
        </>
      )}
    </div>
  )
}

function NewProfileForm() {
  const bootstrapProfile = useApp((s) => s.bootstrapProfile)
  const user = useApp((s) => s.user)
  const [name, setName] = useState(user?.displayName ?? '')
  const [seed, setSeed] = useState<SeedKind>('fresh')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    await bootstrapProfile(name.trim(), seed)
    setBusy(false)
  }

  return (
    <Card className="p-4">
      <Field label="Your name">
        <Input
          value={name}
          placeholder="Your name"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </Field>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Start from</div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSeed('example')}
            className={cx(
              'w-full rounded-xl border px-3 py-2.5 text-left transition',
              seed === 'example' ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-800/60',
            )}
          >
            <div className="text-sm font-semibold">A worked example</div>
            <div className="text-xs text-ink-400">
              Placeholder maxes, FSL 5×5, a 55 lb dumbbell cap and a full accessory plan on every day. Change
              the numbers under Lifts once you're in.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSeed('fresh')}
            className={cx(
              'w-full rounded-xl border px-3 py-2.5 text-left transition',
              seed === 'fresh' ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-800/60',
            )}
          >
            <div className="text-sm font-semibold">A clean slate</div>
            <div className="text-xs text-ink-400">
              Standard four lifts and a balanced accessory plan you can edit. Put your own maxes in next.
            </div>
          </button>
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="mt-4 w-full"
        disabled={busy || !name.trim()}
        onClick={submit}
      >
        {busy ? 'Setting up…' : 'Create profile'}
      </Button>
    </Card>
  )
}

export function Setup() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Wordmark />
      <NewProfileForm />
    </div>
  )
}
