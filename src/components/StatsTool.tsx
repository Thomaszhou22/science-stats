import { useState, useMemo } from 'react'
import { Card, Button, StatBox, fmt } from './ui'

interface SampleGroup {
  id: string
  name: string
  unit: string
  values: string[]
}

// ── localStorage helpers ─────────────────────────

interface SavedStatsEntry {
  id: string
  label: string
  data: { name: string; unit: string; mean: string; std: string; sem: string; n: number }[]
  ts: number
}

function loadStatsEntries(): SavedStatsEntry[] {
  try {
    const raw = localStorage.getItem('science-stats-saved')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveStatsEntries(entries: SavedStatsEntry[]) {
  localStorage.setItem('science-stats-saved', JSON.stringify(entries))
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

export default function StatsTool() {
  const [groups, setGroups] = useState<SampleGroup[]>([
    { id: 'g-init-1', name: 'Group 1', unit: 'mm', values: ['', '', '', '', ''] },
    { id: 'g-init-2', name: 'Group 2', unit: 'mm', values: ['', '', '', '', ''] },
    { id: 'g-init-3', name: 'Group 3', unit: 'mm', values: ['', '', '', '', ''] },
  ])
  const [digits, setDigits] = useState(4)
  const [savedEntries, setSavedEntries] = useState<SavedStatsEntry[]>(loadStatsEntries)
  const [saveLabel, setSaveLabel] = useState('')

  const results = useMemo(() => {
    return groups.map((g) => {
      const nums = g.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v))
      return { ...g, stats: calcStats(nums) }
    })
  }, [groups])

  const summary = useMemo(() => {
    const allMeans = results.filter((r) => r.stats).map((r) => r.stats!.mean)
    if (allMeans.length === 0) return null
    return calcStats(allMeans)
  }, [results])

  // ── Handlers ────────────────────────────────────

  function updateValue(groupId: string, idx: number, val: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, values: g.values.map((v, i) => (i === idx ? val : v)) } : g
      )
    )
  }
  function updateGroupName(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)))
  }
  function updateGroupUnit(groupId: string, unit: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, unit } : g)))
  }
  function applyUnitToAll(unit: string) {
    setGroups((prev) => prev.map((g) => ({ ...g, unit })))
  }
  function addRow(groupId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, values: [...g.values, ''] } : g)))
  }
  function removeRow(groupId: string, idx: number) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, values: g.values.filter((_, i) => i !== idx) } : g))
    )
  }
  function removeLastRow(groupId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, values: g.values.slice(0, -1) } : g))
    )
  }
  function addGroup() {
    setGroups((prev) => [...prev, newGroup()])
  }
  function removeGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId))
  }
  function clearAll() {
    groupCounter = 0
    setGroups([
      { id: 'g-r1', name: 'Group 1', unit: 'mm', values: ['', '', '', '', ''] },
      { id: 'g-r2', name: 'Group 2', unit: 'mm', values: ['', '', '', '', ''] },
      { id: 'g-r3', name: 'Group 3', unit: 'mm', values: ['', '', '', '', ''] },
    ])
  }

  // ── Save / Load ─────────────────────────────────

  function handleSave() {
    const data = results
      .filter((r) => r.stats)
      .map((r) => ({
        name: r.name,
        unit: r.unit,
        mean: fmt(r.stats!.mean, digits),
        std: fmt(r.stats!.std, digits),
        sem: fmt(r.stats!.sem, digits),
        n: r.stats!.n,
      }))
    if (data.length === 0) return
    const entry: SavedStatsEntry = {
      id: `s-${Date.now()}`,
      label: saveLabel.trim() || `Saved ${new Date().toLocaleString()}`,
      data,
      ts: Date.now(),
    }
    const next = [entry, ...savedEntries]
    setSavedEntries(next)
    saveStatsEntries(next)
    setSaveLabel('')
  }

  function deleteEntry(id: string) {
    const next = savedEntries.filter((e) => e.id !== id)
    setSavedEntries(next)
    saveStatsEntries(next)
  }

  function clearEntries() {
    setSavedEntries([])
    saveStatsEntries([])
  }

  return (
    <div className="space-y-6">
      {/* Formula reference */}
      <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-[var(--color-muted)]">Mean</span>
            <span className="ml-2 font-mono">x̄ = (Σxᵢ) / N</span>
          </div>
          <div>
            <span className="text-[var(--color-muted)]">Std Dev</span>
            <span className="ml-2 font-mono">σ = √[ Σ(xᵢ − x̄)² / (N−1) ]</span>
          </div>
          <div>
            <span className="text-[var(--color-muted)]">Std Error</span>
            <span className="ml-2 font-mono">SEM = σ / √N</span>
          </div>
        </div>
      </Card>

      {/* Decimal selector */}
      <div className="flex items-center justify-end gap-2">
        <label className="text-xs text-[var(--color-muted)]">Decimals</label>
        <select
          value={digits}
          onChange={(e) => setDigits(Number(e.target.value))}
          className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
        >
          {[2, 3, 4, 5, 6].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {results.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-1">
              <input
                value={r.name}
                onChange={(e) => updateGroupName(r.id, e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none focus:bg-gray-50 rounded px-2 py-1"
              />
              <div className="flex items-center gap-1">
                <input
                  value={r.unit}
                  onChange={(e) => updateGroupUnit(r.id, e.target.value)}
                  placeholder="unit"
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
              <Button size="sm" variant="danger" onClick={() => removeGroup(r.id)}>Delete Group</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {r.values.map((val, idx) => (
              <div key={idx} className="relative group">
                <input
                  type="number"
                  value={val}
                  onChange={(e) => updateValue(r.id, idx, e.target.value)}
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

      {summary && summary.n >= 2 && (
        <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
          <h2 className="text-sm font-bold mb-1">Cross-Group Summary</h2>
          <p className="text-xs text-[var(--color-muted)] mb-4">Statistics computed across group means</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Groups" value={`${summary.n}`} />
            <StatBox label="Grand Mean" value={fmt(summary.mean, digits)} highlight />
            <StatBox label="Inter-Group σ" value={fmt(summary.std, digits)} />
            <StatBox label="Inter-Group SEM" value={fmt(summary.sem, digits)} />
          </div>
        </Card>
      )}

      {/* Save bar */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 min-w-[160px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <Button onClick={handleSave}>Save Results</Button>
        </div>
      </Card>

      {/* Saved entries */}
      {savedEntries.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Saved Results</h2>
            <button
              onClick={clearEntries}
              className="text-xs text-red-400 hover:text-red-600"
            >Clear all</button>
          </div>
          <div className="space-y-4">
            {savedEntries.map((e) => (
              <div key={e.id} className="border border-[var(--color-border)] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{e.label}</span>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="text-xs text-[var(--color-muted)] hover:text-red-500"
                  >Delete</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                        <th className="text-left py-1.5 pr-3">Group</th>
                        <th className="text-right py-1.5 px-2">N</th>
                        <th className="text-right py-1.5 px-2">Mean</th>
                        <th className="text-right py-1.5 px-2">Std Dev</th>
                        <th className="text-right py-1.5 px-2">SEM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.data.map((d, i) => (
                        <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-1.5 pr-3 font-medium">{d.name}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.n}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.mean} {d.unit}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.std} {d.unit}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{d.sem} {d.unit}</td>
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
