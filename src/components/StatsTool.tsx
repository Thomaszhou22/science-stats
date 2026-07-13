import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Button, StatBox, fmt } from './ui'
import { UnitPicker } from './UnitPicker'
import {
  type ExperimentEntry, type GroupStat,
  loadResults, saveResults,
} from '../lib/experiment'

interface SampleGroup {
  id: string
  name: string
  unit: string
  values: string[]
}

let groupCounter = 0
function newGroup(): SampleGroup {
  groupCounter++
  return {
    id: `g-${Date.now()}-${groupCounter}`,
    name: `Group ${groupCounter}`,
    unit: 'mm',
    values: ['', '', '', '', ''],
  }
}

function calcStats(values: number[]) {
  const n = values.length
  if (n === 0) return null
  const mean = values.reduce((a, b) => a + b, 0) / n
  if (n === 1) return { mean, std: 0, sem: 0, n }
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
  const std = Math.sqrt(variance)
  const sem = std / Math.sqrt(n)
  return { mean, std, sem, n }
}

function useArrowNav() {
  return useCallback((e: React.KeyboardEvent<HTMLInputElement>, groupIdx: number, valIdx: number, groupCount: number) => {
    const key = e.key
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return
    e.preventDefault()
    let ng = groupIdx, nv = valIdx
    if (key === 'ArrowDown') ng = Math.min(groupIdx + 1, groupCount - 1)
    else if (key === 'ArrowUp') ng = Math.max(0, groupIdx - 1)
    else if (key === 'ArrowRight') nv++
    else if (key === 'ArrowLeft') nv = Math.max(0, valIdx - 1)
    const target = document.querySelector(`input[data-grp="${ng}"][data-vidx="${nv}"]`) as HTMLInputElement | null
    if (target) {
      target.focus()
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      requestAnimationFrame(() => target.select())
    }
  }, [])
}

function loadGroups(): SampleGroup[] {
  try {
    const raw = localStorage.getItem('science-stats-groups')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [
    { id: 'g-init-1', name: 'Group 1', unit: 'mm', values: ['', '', '', '', ''] },
    { id: 'g-init-2', name: 'Group 2', unit: 'mm', values: ['', '', '', '', ''] },
    { id: 'g-init-3', name: 'Group 3', unit: 'mm', values: ['', '', '', '', ''] },
  ]
}
function loadDigits(): number {
  try { const raw = localStorage.getItem('science-stats-digits'); return raw ? JSON.parse(raw) : 4 } catch { return 4 }
}

export default function StatsTool() {
  const [groups, setGroups] = useState<SampleGroup[]>(loadGroups)
  const [digits, setDigits] = useState(loadDigits)
  const [expLabel, setExpLabel] = useState(() => {
    try { return localStorage.getItem('science-stats-exp-label') || '' } catch { return '' }
  })

  const [results, setResults] = useState<ExperimentEntry[]>(loadResults)

  // Selected groups (for both cross-group analysis and saving)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())

  // Cross-group: manual calculation
  const [crossGroupResult, setCrossGroupResult] = useState<{ mean: number; std: number; sem: number; n: number } | null>(null)
  const [includeCrossGroup, setIncludeCrossGroup] = useState(false)
  const [saved, setSaved] = useState(false)

  const onArrow = useArrowNav()

  const computed = useMemo(() => {
    return groups.map((g) => {
      const nums = g.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v))
      return { ...g, stats: calcStats(nums) }
    })
  }, [groups])

  const validGroups = computed.filter((r) => r.stats)

  useEffect(() => { localStorage.setItem('science-stats-groups', JSON.stringify(groups)) }, [groups])
  useEffect(() => { localStorage.setItem('science-stats-digits', JSON.stringify(digits)) }, [digits])
  useEffect(() => { localStorage.setItem('science-stats-exp-label', expLabel) }, [expLabel])

  // ── Handlers ────────────────────────────────────

  function toggleSelectGroup(id: string) {
    setSelectedGroupIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
    // Reset cross-group result when selection changes
    setCrossGroupResult(null)
    setIncludeCrossGroup(false)
  }
  function selectAllGroups() {
    if (validGroups.length === 0) return
    const allSelected = validGroups.every((r) => selectedGroupIds.has(r.id))
    setSelectedGroupIds(allSelected ? new Set() : new Set(validGroups.map((r) => r.id)))
    setCrossGroupResult(null)
    setIncludeCrossGroup(false)
  }

  function calcCrossGroup() {
    const selected = computed.filter((r) => r.stats && selectedGroupIds.has(r.id))
    const means = selected.map((r) => r.stats!.mean)
    if (means.length < 2) return
    setCrossGroupResult(calcStats(means))
  }

  function updateValue(groupId: string, idx: number, val: string) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, values: g.values.map((v, i) => i === idx ? val : v) } : g))
  }
  function updateGroupName(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, name } : g))
  }
  function updateGroupUnit(groupId: string, unit: string) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, unit } : g))
  }
  function applyUnitToAll(unit: string) {
    setGroups((prev) => prev.map((g) => ({ ...g, unit })))
  }
  function addRow(groupId: string) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, values: [...g.values, ''] } : g))
  }
  function removeRow(groupId: string, idx: number) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, values: g.values.filter((_, i) => i !== idx) } : g))
  }
  function removeLastRow(groupId: string) {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, values: g.values.slice(0, -1) } : g))
  }
  function addGroup() { setGroups((prev) => [...prev, newGroup()]) }
  function removeGroup(groupId: string) { setGroups((prev) => prev.filter((g) => g.id !== groupId)) }
  function clearAll() {
    groupCounter = 0
    setGroups([
      { id: 'g-r1', name: 'Group 1', unit: 'mm', values: ['', '', '', '', ''] },
      { id: 'g-r2', name: 'Group 2', unit: 'mm', values: ['', '', '', '', ''] },
      { id: 'g-r3', name: 'Group 3', unit: 'mm', values: ['', '', '', '', ''] },
    ])
    setSelectedGroupIds(new Set())
    setCrossGroupResult(null)
    setIncludeCrossGroup(false)
  }

  function saveExperiment() {
    const selected = validGroups.filter((r) => selectedGroupIds.has(r.id))
    if (selected.length === 0) return
    const groupStats: GroupStat[] = selected.map((r) => ({
      name: r.name,
      unit: r.unit,
      mean: parseFloat(fmt(r.stats!.mean, digits)),
      std: parseFloat(fmt(r.stats!.std, digits)),
      sem: parseFloat(fmt(r.stats!.sem, digits)),
      n: r.stats!.n,
    }))
    const measurementUnit = selected[0]?.unit || 'mm'
    const entry: ExperimentEntry = {
      id: `exp-${Date.now()}`,
      label: expLabel.trim() || `Experiment ${new Date().toLocaleDateString()}`,
      groups: groupStats,
      crossGroup: includeCrossGroup && crossGroupResult ? crossGroupResult : null,
      measurementUnit,
      variables: [],
      ts: Date.now(),
      savedLabelId: null,
    }
    const next = [entry, ...results]
    setResults(next)
    saveResults(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="space-y-6">
      {/* Formula reference */}
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><span className="text-[var(--color-muted)]">Mean</span><span className="ml-2 font-mono">x̄ = (Σxᵢ) / N</span></div>
          <div><span className="text-[var(--color-muted)]">Std Dev</span><span className="ml-2 font-mono">σ = √[ Σ(xᵢ − x̄)² / (N−1) ]</span></div>
          <div><span className="text-[var(--color-muted)]">Std Error</span><span className="ml-2 font-mono">SEM = σ / √N</span></div>
        </div>
      </Card>

      {/* Top bar: label + decimals + save */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">Label</label>
            <input
              value={expLabel}
              onChange={(e) => setExpLabel(e.target.value)}
              placeholder="e.g. Swell Ratio Exp 1"
              className="flex-1 text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">Dec</label>
            <select
              value={digits}
              onChange={(e) => setDigits(Number(e.target.value))}
              className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            >
              {[2, 3, 4, 5, 6].map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          {selectedGroupIds.size > 0 && (
            <span className="text-xs text-[var(--color-muted)]">{selectedGroupIds.size} selected</span>
          )}
          <Button
            onClick={saveExperiment}
            disabled={selectedGroupIds.size === 0}
            className={selectedGroupIds.size === 0 ? 'opacity-40 cursor-not-allowed' : saved ? '!bg-green-500' : ''}
          >
            {saved ? 'Saved ✓' : `Save to Results${selectedGroupIds.size > 0 ? ` (${selectedGroupIds.size})` : ''}`}
          </Button>
        </div>
      </Card>

      {/* Group cards */}
      {computed.map((r, gi) => (
        <Card key={r.id} className={selectedGroupIds.has(r.id) ? 'ring-2 ring-[var(--color-accent)]/40' : ''}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="checkbox"
                checked={selectedGroupIds.has(r.id)}
                onChange={() => toggleSelectGroup(r.id)}
                disabled={!r.stats}
                className={`w-4 h-4 accent-[var(--color-accent)] cursor-pointer ${!r.stats ? 'opacity-30 cursor-not-allowed' : ''}`}
                title={r.stats ? 'Select for saving and cross-group analysis' : 'Enter data first'}
              />
              <input
                value={r.name}
                onChange={(e) => updateGroupName(r.id, e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none focus:bg-gray-50 rounded px-2 py-1"
              />
              <div className="flex items-center gap-1">
                <UnitPicker
                  value={r.unit}
                  onChange={(v) => updateGroupUnit(r.id, v)}
                  className="text-xs font-mono w-16 text-center border border-[var(--color-border)] rounded-md px-1.5 py-1 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                />
                <button
                  onClick={() => applyUnitToAll(r.unit)}
                  className="text-[10px] px-1.5 py-1 rounded-md border border-[var(--color-border)] bg-gray-50 hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent)]/30 hover:text-[var(--color-accent)] transition-all whitespace-nowrap"
                  title="Apply this unit to all rows"
                >Apply to all</button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => addRow(r.id)}>+ Data</Button>
              {r.values.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => removeLastRow(r.id)}>- Data</Button>
              )}
              <Button size="sm" variant="danger" onClick={() => removeGroup(r.id)}>Delete</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {r.values.map((val, idx) => (
              <div key={idx} className="relative group">
                <input
                  type="number"
                  value={val}
                  onChange={(e) => updateValue(r.id, idx, e.target.value)}
                  data-grp={gi} data-vidx={idx}
                  onKeyDown={(e) => onArrow(e, gi, idx, computed.length)}
                  placeholder={`#${idx + 1}`}
                  className="w-20 text-center text-sm font-mono border border-[var(--color-border)] rounded-lg px-2 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all"
                />
                {r.values.length > 1 && (
                  <button
                    onClick={() => removeRow(r.id, idx)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-400 text-white text-[10px] leading-none opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center"
                  >×</button>
                )}
              </div>
            ))}
          </div>

          {r.stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Count N" value={`${r.stats.n}`} />
              <StatBox label={`Mean x̄ (${r.unit})`} value={fmt(r.stats.mean, digits)} highlight />
              <StatBox label={`Std Dev σ (${r.unit})`} value={fmt(r.stats.std, digits)} />
              <StatBox label={`Std Err SEM (${r.unit})`} value={fmt(r.stats.sem, digits)} />
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Enter at least 1 data point</p>
          )}
        </Card>
      ))}

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={addGroup}>+ Add Sample Group</Button>
        <Button variant="ghost" onClick={clearAll}>Clear All</Button>
      </div>

      {/* Cross-Group Analysis */}
      <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold">Cross-Group Analysis</h2>
            <span className="text-xs text-[var(--color-muted)]">{selectedGroupIds.size} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAllGroups} className="text-xs text-[var(--color-accent)] hover:underline">
              {validGroups.length > 0 && validGroups.every((r) => selectedGroupIds.has(r.id)) ? 'Deselect All' : 'Select All'}
            </button>
            {selectedGroupIds.size >= 2 && (
              <Button size="sm" onClick={calcCrossGroup} disabled={crossGroupResult !== null}>
                {crossGroupResult ? 'Calculated' : 'Calculate'}
              </Button>
            )}
          </div>
        </div>

        {selectedGroupIds.size < 2 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Select 2 or more groups, then click Calculate to compute Mean, SD, and SEM across their means.
          </p>
        ) : crossGroupResult ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <StatBox label="N (groups)" value={`${crossGroupResult.n}`} />
              <StatBox label="Grand Mean" value={fmt(crossGroupResult.mean, digits)} highlight />
              <StatBox label="Inter-Group SD" value={fmt(crossGroupResult.std, digits)} />
              <StatBox label="Inter-Group SEM" value={fmt(crossGroupResult.sem, digits)} />
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={includeCrossGroup}
                onChange={(e) => setIncludeCrossGroup(e.target.checked)}
                className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
              />
              Include cross-group analysis when saving to Results
            </label>
          </>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">
            Click <span className="font-semibold text-[var(--color-accent)]">Calculate</span> to compute cross-group statistics.
          </p>
        )}
      </Card>
    </div>
  )
}
