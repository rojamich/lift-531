import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackDismiss } from './useBackDismiss'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-ink-700/70 bg-ink-850/80 backdrop-blur', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{children}</h2>
      {action}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'ghost', size = 'md', className, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none disabled:opacity-40 disabled:pointer-events-none'
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3.5 text-base',
  }
  const variants = {
    primary: 'bg-brand-500 text-ink-950 hover:bg-brand-400 active:bg-brand-600',
    ghost: 'border border-ink-600 bg-ink-800 text-ink-100 hover:border-ink-400 active:bg-ink-700',
    quiet: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800',
    danger: 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  }
  return <button className={cx(base, sizes[size], variants[variant], className)} {...rest} />
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 outline-none transition',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25',
        className,
      )}
      {...rest}
    />
  )
}

export function Select({
  className,
  children,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cx(
        'w-full appearance-none rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 outline-none transition',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-ink-400">{hint}</span> : null}
      </span>
      <span
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand-500' : 'bg-ink-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

export function Pill({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'border-brand-500 bg-brand-500/15 text-brand-400'
          : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-400',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // System back closes the sheet rather than leaving the app.
  useBackDismiss(open, onClose)

  /*
   * Held in a ref so the effect below can depend on `open` alone.
   * Callers pass an inline arrow, which is a new function every render, and
   * with `onClose` in the dependency list this effect re-ran on every render of
   * the parent — resetting the scroll position each time. With a rest timer
   * ticking four times a second that made the list impossible to scroll: it
   * sprang back to the top continuously.
   */
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Open at the top, however far the page behind was scrolled. Once only.
    scroller.current?.scrollTo({ top: 0 })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  /*
   * Portalled to the body on purpose. Sheets are rendered from inside cards, and
   * Card carries `backdrop-blur`; a backdrop-filter ancestor becomes the
   * containing block for position:fixed descendants, so `inset-0` would resolve
   * to the card's box rather than the viewport and the sheet would open
   * half off-screen, wherever that card happened to be scrolled to.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center print-hide">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl border border-ink-700 bg-ink-900 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-ink-700/70 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close">
            Done
          </Button>
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-700 px-6 py-10 text-center">
      <p className="font-semibold text-ink-300">{title}</p>
      {children ? <div className="mt-2 text-sm text-ink-400">{children}</div> : null}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-800/60 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</div>
      <div className="tabular mt-0.5 text-lg font-bold leading-tight">{value}</div>
      {sub ? <div className="text-[11px] text-ink-400">{sub}</div> : null}
    </div>
  )
}

/** Brief confirmation after a copy/share, so the tap has an outcome. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 print-hide">
      <div className="rounded-full border border-ink-600 bg-ink-800 px-4 py-2 text-sm shadow-lg">{message}</div>
    </div>
  )
}

/**
 * A number field you can actually type in.
 *
 * Controlled numeric inputs are a trap: reformatting the value on every
 * keystroke fights the person typing. Rounding "1" to the nearest 2 turns it
 * into "2" before the "8" arrives, and parsing "2." back to 2 eats the decimal
 * point so "2.5" can never be entered. So while the field has focus it holds a
 * raw string and reports the parsed value upward; formatting resumes on blur.
 */
export function NumberField({
  value,
  onChange,
  format,
  placeholder,
  ariaLabel,
  className,
  allowNegative = false,
}: {
  value: number | null | undefined
  onChange: (next: number | null) => void
  /** Display formatting, applied only when the field is not being edited. */
  format?: (value: number) => number | string
  placeholder?: string
  ariaLabel: string
  className?: string
  allowNegative?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display =
    value === null || value === undefined ? '' : String(format ? format(value) : value)
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/

  return (
    <input
      aria-label={ariaLabel}
      // Text rather than number: `type="number"` discards intermediate states
      // like "2." and silently refuses input the browser dislikes.
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? display}
      placeholder={placeholder}
      onChange={(event) => {
        const raw = event.target.value.trim()
        if (raw !== '' && !pattern.test(raw)) return
        setDraft(raw)
        if (raw === '' || raw === '.' || raw === '-') {
          onChange(null)
          return
        }
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      onFocus={(event) => {
        setDraft(display)
        event.currentTarget.select()
      }}
      onBlur={() => setDraft(null)}
      className={className}
    />
  )
}
