import { useState } from 'react'
import StatsTool from './components/StatsTool'
import SolutionTool from './components/SolutionTool'
import ResultsView from './components/ResultsView'
import Calculator from './components/Calculator'
import OcrImporter from './components/OcrImporter'

type Tab = 'stats' | 'solution' | 'calc' | 'import'

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('science-stats-tab') as string | null
      if (saved === 'results') return 'stats' // migrated: results is no longer a tab
      return saved === 'stats' || saved === 'solution' || saved === 'calc' || saved === 'import' ? (saved as Tab) : 'stats'
    } catch { return 'stats' }
  })
  const [showResults, setShowResults] = useState(false)

  function switchTab(t: Tab) {
    setTab(t)
    try { localStorage.setItem('science-stats-tab', t) } catch {}
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'stats', label: 'Statistics', icon: 'σ' },
    { key: 'solution', label: 'Solution Prep', icon: '⚗' },
    { key: 'calc', label: 'Calculator', icon: '⊞' },
    { key: 'import', label: 'Data Import', icon: '↥' },
  ]

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold tracking-tight">Science Stats Lab</h1>
            <button
              onClick={() => setShowResults(true)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                showResults
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-border)] bg-white hover:bg-gray-50 text-[var(--color-text)]'
              }`}
            >
              <span className="font-mono">◆</span>
              Results
            </button>
          </div>
          {/* Tab bar - hidden when Results is open */}
          {!showResults && (
            <div className="flex gap-1 -mb-4">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => switchTab(t.key)}
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
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {showResults ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowResults(false)}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              ← Back
            </button>
            <ResultsView />
          </div>
        ) : (
          <>
            {tab === 'stats' && <StatsTool />}
            {tab === 'solution' && <SolutionTool />}
            {tab === 'calc' && <Calculator />}
            {tab === 'import' && <OcrImporter />}
          </>
        )}
      </main>
    </div>
  )
}
