import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Button, fmt } from './ui'
import {
  type ExperimentEntry, type GroupStat,
  loadResults, saveResults,
} from '../lib/experiment'

interface Reagent {
  id: string
  name: string
  concentration: string
  volML: string
}

interface DilState {
  id: string
  reagentId: string
  c1: string
  v1: string
  c2: string
  v2: string
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
  const [reagents, setReagents] = useState<Reagent[]>(loadReagents)
  const [totalInput, setTotalInput] = useState(loadTotalInput)
  const [digits, setDigits] = useState(loadSolDigits)

  const [fracDraft, setFracDraft] = useState<Record<string, string>>({})
  const [fracFocused, setFracFocused] = useState<string | null>(null)
  const [ulDraft, setUlDraft] = useState<Record<string, string>>({})
  const [ulFocused, setUlFocused] = useState<string | null>(null)

  const [results, setResults] = useState<ExperimentEntry[]>(loadResults)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saveLabel, setSaveLabel] = useState('')
  const [saved, setSaved] = useState(false)

  // Dilution rows (shown below Total Volume)
  const [dilRows, setDilRows] = useState<DilState[]>([])
  // Pending confirm for reagent
  const [pendingDilReagent, setPendingDilReagent] = useState<string | null>(null)

  const [concUnit, setConcUnit] = useState(() => { try { return localStorage.getItem('science-solution-conc-unit') || 'mol/L' } catch { return 'mol/L' } })

  useEffect(() => { localStorage.setItem('science-solution-reagents', JSON.stringify(reagents)) }, [reagents])
  useEffect(() => { localStorage.setItem('science-solution-total', totalInput) }, [totalInput])
  useEffect(() => { localStorage.setItem('science-solution-digits', JSON.stringify(digits)) }, [digits])
  useEffect(() => { localStorage.setItem('science-solution-conc-unit', concUnit) }, [concUnit])

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
  function removeReagent(id: string) {
    setReagents((prev) => prev.filter((r) => r.id !== id))
    // Also remove associated dilution rows
    setDilRows((prev) => prev.filter((d) => d.reagentId !== id))
  }
  function resetToPresets() {
    setReagents(makePresets())
    setTotalInput('')
    setFracDraft({})
    setUlDraft({})
    setDilRows([])
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

  // ── Dilution handlers ────────────────────────────

  function clickDilArrow(reagentId: string) {
    // Check if this reagent already has a dilution row
    const existing = dilRows.find((d) => d.reagentId === reagentId)
    if (existing) {
      // Toggle: remove it
      setDilRows((prev) => prev.filter((d) => d.id !== existing.id))
    } else {
      // Show confirm dialog
      setPendingDilReagent(reagentId)
    }
  }

  function confirmAddDil() {
    if (!pendingDilReagent) return
    const r = reagents.find((x) => x.id === pendingDilReagent)
    if (!r) { setPendingDilReagent(null); return }
    const newDil: DilState = {
      id: `dil-${Date.now()}`,
      reagentId: r.id,
      c1: '',
      v1: r.volML || '',
      c2: r.concentration || '',
      v2: '',
    }
    setDilRows((prev) => [...prev, newDil])
    setPendingDilReagent(null)
  }

  function cancelAddDil() { setPendingDilReagent(null) }

  function removeDilRow(dilId: string) {
    setDilRows((prev) => prev.filter((d) => d.id !== dilId))
  }

  function updateDilField(dilId: string, field: keyof Omit<DilState, 'id' | 'reagentId'>, value: string) {
    if (value !== '' && !NUMERIC_RE.test(value)) return
    setDilRows((prev) => prev.map((d) => d.id === dilId ? { ...d, [field]: value } : d))
  }

  function calcDilution(dilId: string) {
    const ds = dilRows.find((d) => d.id === dilId)
    if (!ds) return
    const c1n = parseFloat(ds.c1), v1n = parseFloat(ds.v1), c2n = parseFloat(ds.c2), v2n = parseFloat(ds.v2)
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
    setDilRows((prev) => prev.map((d) => d.id === dilId ? { ...d, [missing]: formatted } : d))

    // Sync results back to reagent
    const finalC2 = missing === 'c2' ? formatted : ds.c2
    const finalV1 = missing === 'v1' ? formatted : ds.v1

    setReagents((prev) => prev.map((r) => {
      if (r.id !== ds.reagentId) return r
      return {
        ...r,
        concentration: finalC2 || r.concentration,
        volML: finalV1 || r.volML,
      }
    }))
    if (finalV1) setTotalInput('')
  }

  // ── Save to Results ──────────────────────────────

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

  // ── Render ───────────────────────────────────────

  return (
    <div className="space-y-6">
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <p className="text-sm text-[var(--color-text)]">
          Edit any field and the rest update automatically. Click ▶ next to a reagent to add a dilution calculator (C1V1=C2V2).
        </p>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <label className="text-xs text-[var(--color-muted)]">Decimals</label>
        <select
          value={digits}
          onChange={(e) => setDigits(Number(e.target.value))}
          className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        >
          {[1, 2, 3, 4].map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <label className="text-xs text-[var(--color-muted)] ml-3">Conc unit</label>
        <input
          type="text"
          value={concUnit}
          onChange={(e) => setConcUnit(e.target.value)}
          className="text-xs font-mono w-20 border border-[var(--color-border)] rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        />
      </div>

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
              const hasDil = dilRows.some((d) => d.reagentId === r.id)

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
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => clickDilArrow(r.id)}
                        className={`text-xs transition-all ${hasDil ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-accent)]'}`}
                        title={hasDil ? 'Remove dilution calculator' : 'Add dilution calculator'}
                      >{hasDil ? '▼' : '▶'}</button>
                      <input
                        value={r.name}
                        onChange={(e) => updateReagentName(r.id, e.target.value)}
                        data-row={i} data-col={0}
                        onKeyDown={(e) => onArrow(e, i, 0)}
                        className="font-medium bg-transparent border-none outline-none focus:bg-gray-50 rounded px-1.5 py-1 w-full min-w-[80px]"
                      />
                    </div>
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

        {/* Dilution calculator rows (below the table, after Total Volume) */}
        {dilRows.length > 0 && (
          <div className="mt-2 space-y-2">
            {dilRows.map((ds) => {
              const reagent = reagents.find((r) => r.id === ds.reagentId)
              return (
                <div key={ds.id} className="bg-[var(--color-accent-light)]/40 border border-[var(--color-accent)]/20 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">
                      {reagent?.name || 'Reagent'} Dilution
                    </span>
                    <span className="text-base font-mono font-bold text-[var(--color-accent)]">C₁V₁ = C₂V₂</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-muted)]">C₁</span>
                      <input
                        type="text"
                        value={ds.c1}
                        onChange={(e) => updateDilField(ds.id, 'c1', e.target.value)}
                        onBlur={() => calcDilution(ds.id)}
                        placeholder="stock"
                        inputMode="decimal"
                        className="w-16 text-sm font-mono text-center border border-[var(--color-border)] rounded-md px-1.5 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      />
                    </div>
                    <span className="text-xs text-[var(--color-muted)]">×</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-muted)]">V₁</span>
                      <input
                        type="text"
                        value={ds.v1}
                        onChange={(e) => updateDilField(ds.id, 'v1', e.target.value)}
                        onBlur={() => calcDilution(ds.id)}
                        placeholder="stock vol"
                        inputMode="decimal"
                        className="w-16 text-sm font-mono text-center border border-[var(--color-border)] rounded-md px-1.5 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      />
                    </div>
                    <span className="text-sm text-[var(--color-muted)]">=</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-muted)]">C₂</span>
                      <input
                        type="text"
                        value={ds.c2}
                        onChange={(e) => updateDilField(ds.id, 'c2', e.target.value)}
                        onBlur={() => calcDilution(ds.id)}
                        placeholder="final"
                        inputMode="decimal"
                        className="w-16 text-sm font-mono text-center border border-[var(--color-border)] rounded-md px-1.5 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      />
                    </div>
                    <span className="text-xs text-[var(--color-muted)]">×</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-muted)]">V₂</span>
                      <input
                        type="text"
                        value={ds.v2}
                        onChange={(e) => updateDilField(ds.id, 'v2', e.target.value)}
                        onBlur={() => calcDilution(ds.id)}
                        placeholder="final vol"
                        inputMode="decimal"
                        className="w-16 text-sm font-mono text-center border border-[var(--color-border)] rounded-md px-1.5 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      />
                    </div>
                    <span className="text-xs text-[var(--color-muted)]">{concUnit}</span>
                    <Button size="sm" variant="outline" onClick={() => calcDilution(ds.id)}>Solve</Button>
                    <button
                      onClick={() => removeDilRow(ds.id)}
                      className="text-[var(--color-muted)] hover:text-red-500 transition-all text-lg leading-none ml-auto"
                      title="Remove dilution calculator"
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Confirm dialog for adding dilution */}
        {pendingDilReagent && (
          <div className="mt-3 flex items-center gap-3 bg-[var(--color-accent-light)] border border-[var(--color-accent)]/30 rounded-lg px-4 py-3">
            <span className="text-sm">
              Add dilution calculator for <span className="font-bold">{reagents.find((r) => r.id === pendingDilReagent)?.name}?</span>
            </span>
            <Button size="sm" onClick={confirmAddDil}>Add</Button>
            <Button size="sm" variant="ghost" onClick={cancelAddDil}>Cancel</Button>
          </div>
        )}
      </Card>

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={addReagent}>+ Add Reagent</Button>
        <Button variant="ghost" onClick={resetToPresets}>Reset Presets</Button>
      </div>

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
    </div>
  )
}
