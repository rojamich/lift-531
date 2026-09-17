import { useEffect, useRef, useState } from 'react'
import { Button, cx } from './ui'

export const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Short double buzz at zero. Vibration is ignored on iOS, which is fine. */
function alertDone() {
  try {
    navigator.vibrate?.([120, 60, 120])
  } catch {
    /* no-op */
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.42)
    setTimeout(() => void ctx.close().catch(() => {}), 600)
  } catch {
    /* audio blocked until first interaction — nothing to do */
  }
}

export interface RestTimerHandle {
  secondsLeft: number | null
  running: boolean
  start: (seconds: number) => void
  stop: () => void
  add: (seconds: number) => void
}

/**
 * Counts down from a wall-clock deadline rather than decrementing a counter, so
 * backgrounding the phone mid-rest doesn't pause the timer.
 */
export function useRestTimer(enabled: boolean): RestTimerHandle {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const firedFor = useRef<number | null>(null)

  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])

  useEffect(() => {
    if (deadline === null) return
    if (now >= deadline && firedFor.current !== deadline) {
      firedFor.current = deadline
      alertDone()
    }
  }, [now, deadline])

  const secondsLeft = deadline === null ? null : Math.max(0, (deadline - now) / 1000)

  return {
    secondsLeft,
    running: deadline !== null && (secondsLeft ?? 0) > 0,
    start: (seconds) => {
      if (!enabled) return
      firedFor.current = null
      setNow(Date.now())
      setDeadline(Date.now() + seconds * 1000)
    },
    stop: () => {
      firedFor.current = null
      setDeadline(null)
    },
    add: (seconds) => setDeadline((d) => (d === null ? null : d + seconds * 1000)),
  }
}

export function RestTimerBar({ timer }: { timer: RestTimerHandle }) {
  if (timer.secondsLeft === null) return null
  const done = timer.secondsLeft <= 0

  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur',
        done ? 'border-brand-500 bg-brand-500/15' : 'border-ink-600 bg-ink-850/95',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          {done ? 'Rest complete' : 'Resting'}
        </div>
        <div className={cx('tabular text-2xl font-bold leading-tight', done && 'text-brand-400')}>
          {formatClock(timer.secondsLeft)}
        </div>
      </div>
      <Button size="sm" onClick={() => timer.add(30)}>
        +30s
      </Button>
      <Button size="sm" variant={done ? 'primary' : 'quiet'} onClick={timer.stop}>
        {done ? 'Go' : 'Skip'}
      </Button>
    </div>
  )
}
