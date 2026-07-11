import { useState, useRef } from 'react'
import { Card, Button, StatBox, fmt } from './ui'

interface Reagent {
  id: string
  name: string
  concentration: string
  volML: string // canonical: user-typed string for mL
}

let reagentCounter = 0
function newReagent(): Reagent {
  reagentCounter++
  return {
    id: `r-${Date.now()}-${reagentCounter}`,
    name: `Reagent ${reagentCounter}`,
    concentration: '',
    volML: '',
  }
}

const PRESETS = [
  { name: 'F88DMA', concentration: '10 w/v%' },
  { name: 'APS', concentration: '125mg / 0.5mL' },
  { name: 'TEMED', concentration: '4 w/v%' },
]

function makePresets(): Reagent[] {
  reagentCounter = 0
  return PRESETS.map((p) => ({ ...p, id: `r-rst-${++reagentCounter}`, volML: '' }))
}

export default function SolutionTool() {
  const [reagents, setReagents] = useState<Reagent[]>(makePresets())
  const [totalInput, setTotalInput] = useState('') // user-typed total volume in mL
  const [digits, setDigits] = useState(2)

  // Track who triggered the change to avoid loops
  const lastEdit = useRef<'vol' | 'total' | 'fraction' | null>(null)

  // Parse all volumes
  const vols = reagents.map((r) => {
    const v = parseFloat(r.volML)
    return isNaN(v) ? 0 : v
  })
  const sumVol = vols.reduce((a, b) => a + b, 0)
  const totalParsed = parseFloat(totalInput)
  const totalNum = !isNaN(totalParsed) && totalParsed > 0 ? totalParsed : sumVol

  // ── Handlers ─────────────────────────────────────

  function editReagentVol(id: string, val: string) {
    lastEdit.current = 'vol'
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, volML: val } : r)))
    // Total auto-recalculates: clear locked total so sum takes over
    setTotalInput('')
  }

  function editReagentUL(id: string, ulVal: string) {
    const ul = parseFloat(ulVal)
    const mlVal = isNaN(ul) ? '' : (ul / 1000).toString()
    editReagentVol(id, mlVal)
  }

  function editTotal(val: string) {
    lastEdit.current = 'total'
    const newTotal = parseFloat(val)
    setTotalInput(val)
    if (isNaN(newTotal) || newTotal <= 0 || sumVol === 0) return
    // Scale all volumes proportionally
    const ratio = newTotal / sumVol
    setReagents((prev) =>
      prev.map((r) => {
        const v = parseFloat(r.volML)
        if (isNaN(v) || v === 0) return r
        const scaled = v * ratio
        return { ...r, volML: fmt(scaled, 6).replace(/\.?0+$/, '') }
      })
    )
  }

  function editFraction(id: string, pctStr: string) {
    lastEdit.current = 'fraction'
    const pct = parseFloat(pctStr)
    if (isNaN(pct) || totalNum <= 0) return
    const targetVol = (pct / 100) * totalNum
    setReagents((prev) => prev.map((r) =>
      r.id === id
        ? { ...r, volML: fmt(targetVol, 6).replace(/\.?0+$/, '') }
        : r
    ))
  }

  function addReagent() {
    setReagents((prev) => [...prev, newReagent()])
  }
  function removeReagent(id: string) {
    setReagents((prev) => prev.filter((r) => r.id !== id))
  }
  function resetToPresets() {
    setReagents(makePresets())
    setTotalInput('')
  }

  function updateReagentName(id: string, name: string) {
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
  }
  function updateReagentConc(id: string, concentration: string) {
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, concentration } : r)))
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <p className="text-sm text-[var(--color-text)]">
          Edit any field and the rest update automatically. Enter individual volumes, total volume, or fractions, they all sync. mL and µL are interconvertible.
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
              <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)] text-xs">Vol (mL)</th>
              <th className="text-right py-2 px-2 font-medium text-[var(--color-muted)] text-xs">Vol (µL)</th>
              <th className="text-right py-2 px-3 font-medium text-[var(--color-muted)] text-xs">Fraction</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {reagents.map((r, i) => {
              const pct = totalNum > 0 && vols[i] > 0 ? (vols[i] / totalNum) * 100 : 0
              const ulVal = vols[i] > 0 ? fmt(vols[i] * 1000, digits) : ''
              return (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 group">
                  <td className="py-2.5 pr-3">
                    <input
                      value={r.name}
                      onChange={(e) => updateReagentName(r.id, e.target.value)}
                      className="font-medium bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[80px]"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      value={r.concentration}
                      onChange={(e) => updateReagentConc(r.id, e.target.value)}
                      placeholder="e.g. 10 w/v%"
                      className="text-xs text-[var(--color-muted)] font-mono bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[100px]"
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <input
                      type="number"
                      value={r.volML}
                      onChange={(e) => editReagentVol(r.id, e.target.value)}
                      placeholder="0"
                      step="any"
                      className="text-right font-mono text-sm w-20 border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all"
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <input
                      type="number"
                      value={ulVal}
                      onChange={(e) => editReagentUL(r.id, e.target.value)}
                      placeholder="0"
                      step="any"
                      className="text-right font-mono text-sm w-20 border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all"
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden lg:block w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <input
                        type="number"
                        value={vols[i] > 0 ? fmt(pct, digits) : ''}
                        onChange={(e) => editFraction(r.id, e.target.value)}
                        placeholder="0"
                        step="any"
                        className="text-right font-mono text-sm w-16 border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all"
                      />
                      <span className="text-xs text-[var(--color-muted)]">%</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() => removeReagent(r.id)}
                      className="text-[var(--color-muted)] hover:text-red-500 opacity-60 group-hover:opacity-100 transition-all text-lg leading-none"
                      title="Remove"
                    >×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50/50 font-bold">
              <td className="py-3 pr-3" colSpan={2}>Total Volume</td>
              <td className="py-3 px-1 text-right">
                <input
                  type="number"
                  value={totalInput || (sumVol > 0 ? fmt(sumVol, digits) : '')}
                  onChange={(e) => editTotal(e.target.value)}
                  placeholder="0"
                  step="any"
                  className="text-right font-mono text-base font-bold w-20 border border-[var(--color-accent)]/30 rounded-lg px-2 py-1.5 bg-[var(--color-accent-light)]/50 outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all text-[var(--color-accent)]"
                />
              </td>
              <td className="py-3 px-1 text-right font-mono">
                {sumVol > 0 ? `${fmt(sumVol * 1000, digits)} µL` : '—'}
              </td>
              <td className="py-3 px-3 text-right font-mono">100%</td>
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

      {/* Summary */}
      {sumVol > 0 && (
        <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
          <h2 className="text-sm font-bold mb-4">Solution Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Reagents" value={`${reagents.filter((r) => parseFloat(r.volML) > 0).length}`} />
            <StatBox label="Total Volume" value={`${fmt(totalNum, digits)} mL`} highlight />
            {reagents
              .filter((r) => parseFloat(r.volML) > 0)
              .slice(0, 2)
              .map((r) => {
                const v = parseFloat(r.volML)
                const pct = totalNum > 0 ? (v / totalNum) * 100 : 0
                return (
                  <StatBox
                    key={r.id}
                    label={r.name}
                    value={`${fmt(pct, digits)}%`}
                  />
                )
              })}
          </div>
        </Card>
      )}

      <footer className="text-center text-xs text-[var(--color-muted)] pt-4 pb-8">
        Solution Prep Calculator · Edit any cell, others auto-sync · mL ↔ µL conversion built in
      </footer>
    </div>
  )
}
