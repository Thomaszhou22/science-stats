import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Button, fmt } from './ui'
import {
  type ExperimentEntry, type GroupStat,
  loadResults, saveResults,
} from '../lib/experiment'

// ── Types ────────────────────────────────────────

interface Reagent {
  id: string
  name: string
  concentration: string
  volML: string
}

type Mode = 'ratio' | 'dilution'

// ── localStorage helpers ─────────────────────────

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
function loadMode(): Mode {
  try {
    const raw = localStorage.getItem('science-solution-mode')
    return raw === 'dilution' ? 'dilution' : 'ratio'
  } catch { return 'ratio' }
}

const NUMERIC_RE = /^[0-9.]*$/

function useArrowNav() {
  return useCallback((e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const key = e.key
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return
    e.preventDefault()
    let nr = row, nc = col
    if (key === 'ArrowDown') nr++
    else if (key === 'ArrowUp') nr = Math.max(0, row - 1)
    else if (key === 'ArrowRight') nc++
    else if (key === 'ArrowLeft') nc = Math.max(0, col - 1)
    const target = document.querySelector(`input[data-row="${nr}"][data-col="${nc}"]`) as HTMLInputElement | null
    if (target) {
      target.focus()
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      requestAnimationFrame(() => target.select())
    }
  }, [])
}

export default function SolutionTool() {
  const [mode, setMode] = useState<Mode>(loadMode)
  const [reagents, setReagents] = useState<Reagent[]>(loadReagents)
  const [totalInput, setTotalInput] = useState(loadTotalInput)
  const [digits, setDigits] = useState(loadSolDigits)

  const [fracDraft, setFracDraft] = useState<Record<string, string>>({})
  const [fracFocused, setFracFocused] = useState<string | null>(null)
  const [ulDraft, setUlDraft] = useState<Record<string, string>>({})
  const [ulFocused, setUlFocused] = useState<string | null>(null)

  // Save to Results state
  const [results, setResults] = useState<ExperimentEntry[]>(loadResults)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saveLabel, setSaveLabel] = useState('')
  const [saved, setSaved] = useState(false)

  // Dilution state
  const [c1, setC1] = useState(() => { try { return localStorage.getItem('science-dilution-c1') || '' } catch { return '' } })
  const [v1, setV1] = useState(() => { try { return localStorage.getItem('science-dilution-v1') || '' } catch { return '' } })
  const [c2, setC2] = useState(() => { try { return localStorage.getItem('science-dilution-c2') || '' } catch { return '' } })
  const [v2, setV2] = useState(() => { try { return localStorage.getItem('science-dilution-v2') || '' } catch { return '' } })
  const [dilUnit, setDilUnit] = useState(() => { try { return localStorage.getItem('science-dilution-unit') || 'mL' } catch { return 'mL' } })
  const [concUnit, setConcUnit] = useState(() => { try { return localStorage.getItem('science-dilution-conc-unit') || 'mol/L' } catch { return 'mol/L' } })
  const [dilSaved, setDilSaved] = useState(false)

  useEffect(() => { localStorage.setItem('science-solution-reagents', JSON.stringify(reagents)) }, [reagents])
  useEffect(() => { localStorage.setItem('science-solution-total', totalInput) }, [totalInput])
  useEffect(() => { localStorage.setItem('science-solution-digits', JSON.stringify(digits)) }, [digits])
  useEffect(() => { localStorage.setItem('science-solution-mode', mode) }, [mode])
  useEffect(() => { localStorage.setItem('science-dilution-c1', c1) }, [c1])
  useEffect(() => { localStorage.setItem('science-dilution-v1', v1) }, [v1])
  useEffect(() => { localStorage.setItem('science-dilution-c2', c2) }, [c2])
  useEffect(() => { localStorage.setItem('science-dilution-v2', v2) }, [v2])
  useEffect(() => { localStorage.setItem('science-dilution-unit', dilUnit) }, [dilUnit])
  useEffect(() => { localStorage.setItem('science-dilution-conc-unit', concUnit) }, [concUnit])

  const lastEdit = useRef<'vol' | 'total' | 'fraction' | null>(null)
  const onArrow = useArrowNav()

  const vols = reagents.map((r) => {
    const v = parseFloat(r.volML)
    return isNaN(v) ? 0 : v
  })
  const sumVol = vols.reduce((a, b) => a + b, 0)
  const totalParsed = parseFloat(totalInput)
  const totalNum = !isNaN(totalParsed) && totalParsed > 0 ? totalParsed : sumVol

  // ── Reagent handlers ─────────────────────────────

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

  function addReagent() { setReagents((prev) => [...prev, newReagent()]) }
  function removeReagent(id: string) { setReagents((prev) => prev.filter((r) => r.id !== id)) }
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
    if (!NUMERIC_RE.test(concentration)) return
    setReagents((prev) => prev.map((r) => (r.id === id ? { ...r, concentration } : r)))
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // ── Save to Results (Ratio mode) ─────────────────

  function saveSelectedToResults() {
    const selected = reagents.filter((r) => selectedIds.has(r.id) && parseFloat(r.volML) > 0)
    if (selected.length === 0) return
    const groups: GroupStat[] = selected.map((r) => {
      const v = parseFloat(r.volML)
      return { name: r.name, unit: 'mL', mean: parseFloat(fmt(v, digits)), std: 0, sem: 0, n: 1 }
    })
    const entry: ExperimentEntry = {
      id: `sol-${Date.now()}`,
      label: saveLabel.trim() || `Solution Prep (${selected.length} reagents, ${fmt(totalNum, digits)} mL total)`,
      groups,
      crossGroup: null,
      measurementUnit: 'mL',
      variables: [
        ...selected.filter((r) => r.concentration).map((r) => ({
          id: `v-${r.id}`, name: `${r.name} conc`, value: r.concentration, unit: concUnit, type: 'iv' as const,
        })),
        { id: `v-total-${Date.now()}`, name: 'Total Volume', value: fmt(totalNum, digits), unit: 'mL', type: 'dv' as const },
      ],
      ts: Date.now(),
      savedLabelId: null,
    }
    const next = [entry, ...results]
    setResults(next)
    saveResults(next)
    setSelectedIds(new Set())
    setSaveLabel('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  // ── Dilution calculator ──────────────────────────
  // C1V1 = C2V2 — solve for the missing one

  const c1n = parseFloat(c1), v1n = parseFloat(v1), c2n = parseFloat(c2), v2n = parseFloat(v2)
  const dilSolved = useRef<string>('')

  function calcDilution() {
    // We need exactly 3 of 4 values to solve for the 4th
    const vals = { c1: c1n, v1: v1n, c2: c2n, v2: v2n }
    const known = (['c1', 'v1', 'c2', 'v2'] as const).filter((k) => !isNaN(vals[k]))
    if (known.length !== 3) return
    const missing = (['c1', 'v1', 'c2', 'v2'] as const).find((k) => isNaN(vals[k]))
    if (!missing) return

    let result = 0
    if (missing === 'c1') result = (c2n * v2n) / v1n
    else if (missing === 'v1') result = (c2n * v2n) / c1n
    else if (missing === 'c2') result = (c1n * v1n) / v2n
    else if (missing === 'v2') result = (c1n * v1n) / c2n

    if (isNaN(result) || !isFinite(result)) return
    const formatted = fmt(result, digits)
    dilSolved.current = missing

    if (missing === 'c1') setC1(formatted)
    else if (missing === 'v1') setV1(formatted)
    else if (missing === 'c2') setC2(formatted)
    else if (missing === 'v2') setV2(formatted)
  }

  function handleDilChange(field: 'c1' | 'v1' | 'c2' | 'v2', value: string) {
    if (value !== '' && !NUMERIC_RE.test(value)) return
    if (field === 'c1') setC1(value)
    else if (field === 'v1') setV1(value)
    else if (field === 'c2') setC2(value)
    else if (field === 'v2') setV2(value)
  }

  function saveDilutionToResults() {
    // Save V1 and V2 as groups
    const groups: GroupStat[] = []
    if (!isNaN(v1n) && v1n > 0) groups.push({ name: 'V1 (stock)', unit: dilUnit, mean: parseFloat(fmt(v1n, digits)), std: 0, sem: 0, n: 1 })
    if (!isNaN(v2n) && v2n > 0) groups.push({ name: 'V2 (final)', unit: dilUnit, mean: parseFloat(fmt(v2n, digits)), std: 0, sem: 0, n: 1 })
    if (groups.length === 0) return
    const waterVol = (!isNaN(v2n) && !isNaN(v1n)) ? v2n - v1n : NaN
    const entry: ExperimentEntry = {
      id: `dil-${Date.now()}`,
      label: saveLabel.trim() || `Dilution: ${fmt(c1n, digits)} → ${fmt(c2n, digits)} ${concUnit}`,
      groups,
      crossGroup: null,
      measurementUnit: dilUnit,
      variables: [
        { id: `v-c1-${Date.now()}`, name: 'C1 (stock)', value: fmt(c1n, digits), unit: concUnit, type: 'iv' },
        { id: `v-c2-${Date.now()}`, name: 'C2 (final)', value: fmt(c2n, digits), unit: concUnit, type: 'iv' },
        ...(!isNaN(waterVol) && waterVol > 0 ? [{ id: `v-water-${Date.now()}`, name: 'Solvent needed', value: fmt(waterVol, digits), unit: dilUnit, type: 'dv' as const }] : []),
      ],
      ts: Date.now(),
      savedLabelId: null,
    }
    const next = [entry, ...results]
    setResults(next)
    saveResults(next)
    setDilSaved(true)
    setTimeout(() => setDilSaved(false), 1500)
  }

  // ── Render ───────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex justify-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-1">
          <button
            onClick={() => setMode('ratio')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'ratio' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >Ratio Mixing</button>
          <button
            onClick={() => setMode('dilution')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-all ${
              mode === 'dilution' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >C1V1 = C2V2</button>
        </div>
      </div>

      {/* Decimal places */}
      <div className="flex items-center justify-end gap-2">
        <label className="text-xs text-[var(--color-muted)]">Decimals</label>
        <select
          value={digits}
          onChange={(e) => setDigits(Number(e.target.value))}
          className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        >
          {[1, 2, 3, 4].map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
      </div>

      {mode === 'ratio' && (
        <>
          <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
            <p className="text-sm text-[var(--color-text)]">
              Edit any field and the rest update automatically. Enter individual volumes, total volume, or fractions, they all sync. mL and µL are interconvertible.
            </p>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 pr-3 font-medium text-[var(--color-muted)] text-xs w-8"></th>
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
                      <td className="py-2.5 pr-1 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          value={r.name}
                          onChange={(e) => updateReagentName(r.id, e.target.value)}
                          data-row={i} data-col={0}
                          onKeyDown={(e) => onArrow(e, i, 0)}
                          className="font-medium bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[80px]"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          value={r.concentration}
                          onChange={(e) => updateReagentConc(r.id, e.target.value)}
                          data-row={i} data-col={1}
                          onKeyDown={(e) => onArrow(e, i, 1)}
                          placeholder="e.g. 10.5"
                          inputMode="decimal"
                          className="text-xs text-[var(--color-muted)] font-mono bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[100px]"
                        />
                      </td>
                      <td className="py-2 px-1 text-right">
                        <input
                          type="number"
                          value={r.volML}
                          onChange={(e) => editReagentVol(r.id, e.target.value)}
                          data-row={i} data-col={2}
                          onKeyDown={(e) => onArrow(e, i, 2)}
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
                          data-row={i} data-col={3}
                          onKeyDown={(e) => onArrow(e, i, 3)}
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
                            data-row={i} data-col={4}
                            onKeyDown={(e) => onArrow(e, i, 4)}
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
                  <td></td>
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
              {selectedIds.size > 0 && (
                <span className="text-xs text-[var(--color-muted)]">{selectedIds.size} selected</span>
              )}
              <Button
                onClick={saveSelectedToResults}
                disabled={selectedIds.size === 0}
                className={selectedIds.size === 0 ? 'opacity-40 cursor-not-allowed' : saved ? '!bg-green-500' : ''}
              >
                {saved ? 'Saved ✓' : `Save to Results${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
              </Button>
            </div>
            {selectedIds.size === 0 && (
              <p className="text-xs text-[var(--color-muted)] mt-2">Check the box next to each reagent to select it for saving.</p>
            )}
          </Card>
        </>
      )}

      {mode === 'dilution' && (
        <>
          <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
            <p className="text-sm text-[var(--color-text)]">
              Enter any 3 of the 4 values. The missing one is calculated automatically.
            </p>
          </Card>

          <Card>
            <div className="text-center mb-6">
              <div className="text-3xl font-mono font-bold text-[var(--color-accent)]">C₁V₁ = C₂V₂</div>
            </div>

            <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
              {/* C1 */}
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">C₁ — Stock concentration</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={c1}
                    onChange={(e) => handleDilChange('c1', e.target.value)}
                    onBlur={() => calcDilution()}
                    placeholder="e.g. 10"
                    inputMode="decimal"
                    className={`flex-1 text-sm font-mono border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                      dilSolved.current === 'c1' ? 'border-green-400 bg-green-50' : 'border-[var(--color-border)]'
                    }`}
                  />
                  <input
                    type="text"
                    value={concUnit}
                    onChange={(e) => setConcUnit(e.target.value)}
                    className="text-xs font-mono w-20 border border-[var(--color-border)] rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    title="Concentration unit"
                  />
                </div>
              </div>

              {/* V1 */}
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">V₁ — Stock volume</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={v1}
                    onChange={(e) => handleDilChange('v1', e.target.value)}
                    onBlur={() => calcDilution()}
                    placeholder="e.g. 5"
                    inputMode="decimal"
                    className={`flex-1 text-sm font-mono border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                      dilSolved.current === 'v1' ? 'border-green-400 bg-green-50' : 'border-[var(--color-border)]'
                    }`}
                  />
                  <input
                    type="text"
                    value={dilUnit}
                    onChange={(e) => setDilUnit(e.target.value)}
                    className="text-xs font-mono w-20 border border-[var(--color-border)] rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    title="Volume unit"
                  />
                </div>
              </div>

              {/* C2 */}
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">C₂ — Final concentration</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={c2}
                    onChange={(e) => handleDilChange('c2', e.target.value)}
                    onBlur={() => calcDilution()}
                    placeholder="e.g. 2"
                    inputMode="decimal"
                    className={`flex-1 text-sm font-mono border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                      dilSolved.current === 'c2' ? 'border-green-400 bg-green-50' : 'border-[var(--color-border)]'
                    }`}
                  />
                  <span className="text-xs font-mono w-20 text-center py-2 text-[var(--color-muted)]">{concUnit}</span>
                </div>
              </div>

              {/* V2 */}
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">V₂ — Final volume</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={v2}
                    onChange={(e) => handleDilChange('v2', e.target.value)}
                    onBlur={() => calcDilution()}
                    placeholder="e.g. 25"
                    inputMode="decimal"
                    className={`flex-1 text-sm font-mono border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 ${
                      dilSolved.current === 'v2' ? 'border-green-400 bg-green-50' : 'border-[var(--color-border)]'
                    }`}
                  />
                  <span className="text-xs font-mono w-20 text-center py-2 text-[var(--color-muted)]">{dilUnit}</span>
                </div>
              </div>
            </div>

            {/* Solvent hint */}
            {!isNaN(v1n) && !isNaN(v2n) && v2n > v1n && (
              <div className="mt-6 text-center text-sm text-[var(--color-muted)]">
                Add <span className="font-bold text-[var(--color-accent)]">{fmt(v2n - v1n, digits)}</span> {dilUnit} of solvent to <span className="font-bold">{fmt(v1n, digits)}</span> {dilUnit} of stock
              </div>
            )}
          </Card>

          {/* Save bar */}
          <Card>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="Label (optional)"
                className="flex-1 min-w-[160px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              />
              <Button
                onClick={saveDilutionToResults}
                disabled={isNaN(v1n) && isNaN(v2n)}
                className={(isNaN(v1n) && isNaN(v2n)) ? 'opacity-40 cursor-not-allowed' : dilSaved ? '!bg-green-500' : ''}
              >
                {dilSaved ? 'Saved ✓' : 'Save to Results'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
