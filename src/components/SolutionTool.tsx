import { useState, useMemo } from 'react'
import { Card, Button, StatBox, fmt } from './ui'

interface Reagent {
  id: string
  name: string
  concentration: string
  volume: string
}

let reagentCounter = 0
function newReagent(): Reagent {
  reagentCounter++
  return {
    id: `r-${Date.now()}-${reagentCounter}`,
    name: `Reagent ${reagentCounter}`,
    concentration: '',
    volume: '',
  }
}

const PRESETS = [
  { name: 'F88DMA', concentration: '10 w/v%' },
  { name: 'APS', concentration: '125mg / 0.5mL' },
  { name: 'TEMED', concentration: '4 w/v%' },
]

export default function SolutionTool() {
  const [reagents, setReagents] = useState<Reagent[]>([
    { id: 'r-init-1', name: 'F88DMA', concentration: '10 w/v%', volume: '' },
    { id: 'r-init-2', name: 'APS', concentration: '125mg / 0.5mL', volume: '' },
    { id: 'r-init-3', name: 'TEMED', concentration: '4 w/v%', volume: '' },
  ])

  const [digits, setDigits] = useState(2)

  const parsed = useMemo(() => {
    return reagents.map((r) => {
      const vol = parseFloat(r.volume)
      return { ...r, volNum: isNaN(vol) ? 0 : vol }
    })
  }, [reagents])

  const totalVolume = parsed.reduce((sum, r) => sum + r.volNum, 0)

  function updateReagent(id: string, field: keyof Reagent, val: string) {
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)))
  }
  function addReagent() {
    setReagents((prev) => [...prev, newReagent()])
  }
  function removeReagent(id: string) {
    setReagents((prev) => prev.filter((r) => r.id !== id))
  }
  function resetToPresets() {
    reagentCounter = 0
    setReagents(PRESETS.map((p) => ({ ...p, id: `r-rst-${++reagentCounter}`, volume: '' })))
  }

  return (
    <div className="space-y-6">
      {/* Intro card */}
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <p className="text-sm text-[var(--color-text)]">
          Enter the volume of each reagent to automatically calculate total volume and composition ratios. Click + to add more reagents.
        </p>
      </Card>

      {/* Decimal selector */}
      <div className="flex items-center justify-end gap-2">
        <label className="text-xs text-[var(--color-muted)]">Decimals</label>
        <select
          value={digits}
          onChange={(e) => setDigits(Number(e.target.value))}
          className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        >
          {[1, 2, 3, 4].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Main table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2 pr-3 font-medium text-[var(--color-muted)] text-xs">Reagent</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--color-muted)] text-xs">Concentration</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)] text-xs">Volume (mL)</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)] text-xs">Fraction</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {parsed.map((r) => {
              const pct = totalVolume > 0 ? (r.volNum / totalVolume) * 100 : 0
              return (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 group">
                  <td className="py-2.5 pr-3">
                    <input
                      value={r.name}
                      onChange={(e) => updateReagent(r.id, 'name', e.target.value)}
                      className="font-medium bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[80px]"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      value={r.concentration}
                      onChange={(e) => updateReagent(r.id, 'concentration', e.target.value)}
                      placeholder="e.g. 10 w/v%"
                      className="text-xs text-[var(--color-muted)] font-mono bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[100px]"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      value={r.volume}
                      onChange={(e) => updateReagent(r.id, 'volume', e.target.value)}
                      placeholder="0"
                      step="any"
                      className="text-right font-mono text-sm w-24 border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {totalVolume > 0 && r.volNum > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden md:block w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--color-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-[var(--color-accent)] tabular-nums">
                          {fmt(pct, digits)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--color-muted)] text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() => removeReagent(r.id)}
                      className="text-[var(--color-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none"
                      title="Remove"
                    >×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50/50">
              <td className="py-3 pr-3 font-bold" colSpan={2}>
                Total Volume
              </td>
              <td className="py-3 px-3 text-right">
                <span className="font-mono text-lg font-bold text-[var(--color-accent)]">
                  {fmt(totalVolume, digits)}
                </span>
                <span className="text-xs text-[var(--color-muted)] ml-1">mL</span>
              </td>
              <td className="py-3 px-3 text-right font-mono font-bold">100%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={addReagent}>+ Add Reagent</Button>
        <Button variant="ghost" onClick={resetToPresets}>Reset Presets</Button>
      </div>

      {/* Summary cards */}
      {totalVolume > 0 && (
        <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
          <h2 className="text-sm font-bold mb-4">Solution Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Reagents" value={`${parsed.filter((r) => r.volNum > 0).length}`} />
            <StatBox label="Total Volume" value={`${fmt(totalVolume, digits)} mL`} highlight />
            {parsed
              .filter((r) => r.volNum > 0)
              .slice(0, 2)
              .map((r) => (
                <StatBox
                  key={r.id}
                  label={r.name}
                  value={`${fmt((r.volNum / totalVolume) * 100, digits)}%`}
                />
              ))}
          </div>
        </Card>
      )}

      <footer className="text-center text-xs text-[var(--color-muted)] pt-4 pb-8">
        Solution Prep Calculator · Volume unit: mL · Fraction = component volume / total volume
      </footer>
    </div>
  )
}
