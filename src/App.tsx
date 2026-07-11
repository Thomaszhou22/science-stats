import { useState } from 'react'
import StatsTool from './components/StatsTool'
import SolutionTool from './components/SolutionTool'

type Tab = 'stats' | 'solution'

export default function App() {
  const [tab, setTab] = useState<Tab>('stats')

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'stats', label: 'Statistics', icon: 'σ' },
    { key: 'solution', label: 'Solution Prep', icon: '⚗' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold tracking-tight">Science Stats Lab</h1>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1 -mb-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                  tab === t.key
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-light)]/50'
                    : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-gray-50'
                }`}
              >
                <span className="font-mono">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === 'stats' && <StatsTool />}
        {tab === 'solution' && <SolutionTool />}
      </main>
    </div>
  )
}
