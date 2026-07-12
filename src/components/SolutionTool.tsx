import { useState, useRef, useEffect } from 'react'
import { Card, Button, fmt } from './ui'

interface Reagent {
  id: string
  name: string
  concentration: string
  volML: string
}

// ── localStorage helpers ─────────────────────────

interface SavedSolutionEntry {
  id: string
  label: string
  data: { name: string; concentration: string; volML: string; volUL: string; fraction: string }[]
  total: string
  ts: number
}

function loadSolutionEntries(): SavedSolutionEntry[] {
  try {
    const raw = localStorage.getItem('science-solution-saved')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveSolutionEntries(entries: SavedSolutionEntry[]) {
  localStorage.setItem('science-solution-saved', JSON.stringify(entries))
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
  { name: 'F88DMA', concentration: '' },
  { name: 'APS', concentration: '' },
  { name: 'TEMED', concentration: '' },
]

function makePresets(): Reagent[] {
  reagentCounter = 0
  return PRESETS.map((p) => ({ ...p, id: `r-rst-${++reagentCounter}`, volML: '' }))
}

function loadReagents(): Reagent[] {
  try {
    const raw = localStorage.getItem('science-solution-reagents')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return makePresets()
}
function loadTotalInput(): string {
  try { return localStorage.getItem('science-solution-total') || '' } catch { return '' }
}
function loadSolDigits(): number {
  try {
    const raw = localStorage.getItem('science-solution-digits')
    return raw ? JSON.parse(raw) : 2
  } catch { return 2 }
}

export default function SolutionTool() {
  const [reagents, setReagents] = useState<Reagent[]>(loadReagents)
  const [totalInput, setTotalInput] = useState(loadTotalInput)
  const [digits, setDigits] = useState(loadSolDigits)

  const [fracDraft, setFracDraft] = useState<Record<string, string>>({})
  const [fracFocused, setFracFocused] = useState<string | null>(null)
  const [ulDraft, setUlDraft] = useState<Record<string, string>>({})
  const [ulFocused, setUlFocused] = useState<string | null>(null)

  const [savedEntries, setSavedEntries] = useState<SavedSolutionEntry[]>(loadSolutionEntries)
  const [saveLabel, setSaveLabel] = useState('')

  useEffect(() => {
    localStorage.setItem('science-solution-reagents', JSON.stringify(reagents))
  }, [reagents])
  useEffect(() => {
    localStorage.setItem('science-solution-total', totalInput)
  }, [totalInput])
  useEffect(() => {
    localStorage.setItem('science-solution-digits', JSON.stringify(digits))
  }, [digits])

  const lastEdit = useRef<'vol' | 'total' | 'fraction' | null>(null)

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
    setTotalInput('')
  }

  function editReagentUL(id: string, ulVal: string) {
    setUlDraft((prev) => ({ ...prev, [id]: ulVal }))
    const ul = parseFloat(ulVal)
    const mlVal = isNaN(ul) ? '' : (ul / 1000).toString()
    editReagentVol(id, mlVal)
  }

  function editTotal(val: string) {
    lastEdit.current = 'total'
    const newTotal = parseFloat(val)
    setTotalInput(val)
    if (isNaN(newTotal) || newTotal <= 0 || sumVol === 0) return
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
    setFracDraft((prev) => ({ ...prev, [id]: pctStr }))
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
    setFracDraft({})
    setUlDraft({})
  }

  function updateReagentName(id: string, name: string) {
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
  }
  function updateReagentConc(id: string, concentration: string) {
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, concentration } : r)))
  }

  // ── Save / Load ─────────────────────────────────

  function handleSave() {
    const data = reagents
      .filter((r) => parseFloat(r.volML) > 0)
      .map((r) => {
        const v = parseFloat(r.volML)
        const pct = totalNum > 0 ? (v / totalNum) * 100 : 0
        return {
          name: r.name,
          concentration: r.concentration,
          volML: fmt(v, digits),
          volUL: fmt(v * 1000, digits),
          fraction: fmt(pct, digits),
        }
      })
    if (data.length === 0) return
    const entry: SavedSolutionEntry = {
      id: `sv-${Date.now()}`,
      label: saveLabel.trim() || `Saved ${new Date().toLocaleString()}`,
      data,
      total: fmt(totalNum, digits),
      ts: Date.now(),
    }
    const next = [entry, ...savedEntries]
    setSavedEntries(next)
    saveSolutionEntries(next)
    setSaveLabel('')
  }

  function deleteEntry(id: string) {
    const next = savedEntries.filter((e) => e.id !== id)
    setSavedEntries(next)
    saveSolutionEntries(next)
  }

  function clearEntries() {
    setSavedEntries([])
    saveSolutionEntries([])
  }

  return (
    <div className="space-y-6">
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <p className="text-sm text-[var(--color-text)]">
          Edit any field and the rest update automatically. Enter individual volumes, total volume, or fractions, they all sync. mL and µL are interconvertible.
        </p>
      </Card>

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
              const computedUL = vols[i] > 0 ? fmt(vols[i] * 1000, digits) : ''
              const ulDisplay = ulFocused === r.id ? (ulDraft[r.id] ?? '') : computedUL
              const fracDisplay = fracFocused === r.id ? (fracDraft[r.id] ?? '') : (vols[i] > 0 ? fmt(pct, digits) : '')

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
                      value={ulDisplay}
                      onChange={(e) => editReagentUL(r.id, e.target.value)}
                      onFocus={() => setUlFocused(r.id)}
                      onBlur={() => { setUlFocused(null); setUlDraft((prev) => { const next = { ...prev }; delete next[r.id]; return next }) }}
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
                        value={fracDisplay}
                        onChange={(e) => editFraction(r.id, e.target.value)}
                        onFocus={() => setFracFocused(r.id)}
                        onBlur={() => { setFracFocused(null); setFracDraft((prev) => { const next = { ...prev }; delete next[r.id]; return next }) }}
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

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={addReagent}>+ Add Reagent</Button>
        <Button variant="ghost" onClick={resetToPresets}>Reset Presets</Button>
      </div>

      {/* Save bar */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 min-w-[160px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <Button onClick={handleSave}>Save Recipe</Button>
        </div>
      </Card>

      {/* Saved entries */}
      {savedEntries.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Saved Recipes</h2>
            <button
              onClick={clearEntries}
              className="text-xs text-red-400 hover:text-red-600"
            >Clear all</button>
          </div>
          <div className="space-y-4">
            {savedEntries.map((e) => (
              <div key={e.id} className="border border-[var(--color-border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{e.label} <span className="text-[var(--color-muted)] font-normal">· Total {e.total} mL</span></span>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="text-xs text-[var(--color-muted)] hover:text-red-500"
                  >Delete</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                        <th className="text-left py-1.5 pr-3">Reagent</th>
                        <th className="text-left py-1.5 px-2">Conc</th>
                        <th className="text-right py-1.5 px-2">mL</th>
                        <th className="text-right py-1.5 px-2">µL</th>
                        <th className="text-right py-1.5 px-2">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.data.map((d, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-1.5 pr-3 font-medium">{d.name}</td>
                          <td className="py-1.5 px-2 font-mono text-[var(--color-muted)]">{d.concentration || '—'}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.volML}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.volUL}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.fraction}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
