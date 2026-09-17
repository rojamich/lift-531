import { useEffect, useState } from 'react'
import { cx } from './components/ui'
import { useBackDismiss } from './components/useBackDismiss'
import { CycleScreen } from './screens/CycleScreen'
import { ErrorScreen, ProgressionSheet, SaveErrorBanner } from './screens/ErrorScreen'
import { HomeScreen } from './screens/Home'
import { LiftsScreen } from './screens/Lifts'
import { PlanScreen } from './screens/Plan'
import { SettingsScreen } from './screens/SettingsScreen'
import { SignIn, Setup } from './screens/Welcome'
import { useApp } from './state/useApp'

type Tab = 'today' | 'cycle' | 'lifts' | 'plan' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '▶' },
  { id: 'cycle', label: 'Cycle', icon: '▦' },
  { id: 'lifts', label: 'Lifts', icon: '▲' },
  { id: 'plan', label: 'Plan', icon: '☰' },
  { id: 'settings', label: 'You', icon: '●' },
]

function TabBar({ tab, onChange }: { tab: Tab; onChange: (next: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/70 bg-ink-950/95 backdrop-blur print-hide">
      <div
        className="mx-auto grid max-w-lg grid-cols-5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition',
              tab === item.id ? 'text-brand-400' : 'text-ink-400 hover:text-ink-300',
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  const status = useApp((s) => s.status)
  const init = useApp((s) => s.init)
  const openSessionKey = useApp((s) => s.openSessionKey)
  const closeSession = useApp((s) => s.closeSession)
  const error = useApp((s) => s.error)
  const [tab, setTab] = useState<Tab>('today')

  useEffect(() => {
    init()
  }, [init])

  // Opening a day from any screen shows the workout, and closing it returns
  // you to the tab you came from. Derived, so there's no render-then-correct.
  const visible: Tab = openSessionKey ? 'today' : tab

  // Back closes the workout, then steps back to Today, and only leaves the app
  // from there — the behaviour people expect from anything installed.
  useBackDismiss(Boolean(openSessionKey), closeSession)
  useBackDismiss(!openSessionKey && tab !== 'today', () => setTab('today'))

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-400">
        <span className="animate-pulse">Loading…</span>
      </div>
    )
  }
  if (status === 'error' && error) return <ErrorScreen error={error} />
  if (status === 'signed-out') return <SignIn />
  if (status === 'needs-setup') return <Setup />

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-4">
      <SaveErrorBanner />
      {visible === 'today' ? <HomeScreen /> : null}
      {visible === 'cycle' ? <CycleScreen /> : null}
      {visible === 'lifts' ? <LiftsScreen /> : null}
      {visible === 'plan' ? <PlanScreen /> : null}
      {visible === 'settings' ? <SettingsScreen /> : null}
      <ProgressionSheet />
      <TabBar
        tab={visible}
        onChange={(next) => {
          if (next !== 'today' && openSessionKey) closeSession()
          setTab(next)
        }}
      />
    </div>
  )
}
