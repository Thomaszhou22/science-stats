import { useState, useMemo, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Card, Button, StatBox, fmt } from './ui'
import { UnitPicker } from './UnitPicker'

interface SampleGroup {
  id: string
  name: string
  unit: string
  values: string[]
}

// ── localStorage types ───────────────────────────

/** One group's stats snapshot inside an experiment */
interface GroupStat {
  name: string
  unit: string
  mean: number
  std: number
  sem: number
  n: number
}

/** A complete experiment entry saved to results */
interface ExperimentEntry {
  id: string
  label: string
  concentration: string
  concUnit: string
  groups: GroupStat[]
  crossGroup: { mean: number; std: number; sem: number; n: number } | null
  measurementUnit: string
  ts: number
  savedLabelId: string | null
}

interface LabelItem {
  id: string
  name: string
  ts: number
}

function loadResults(): ExperimentEntry[] {
  try {
    const raw = localStorage.getItem('science-stats-results')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveResults(v: ExperimentEntry[]) {
  localStorage.setItem('science-stats-results', JSON.stringify(v))
}
function loadLabels(): LabelItem[] {
  try {
    const raw = localStorage.getItem('science-stats-labels')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveLabels(v: LabelItem[]) {
  localStorage.setItem('science-stats-labels', JSON.stringify(v))
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

// Arrow key navigation for group value inputs
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
  try {
    const raw = localStorage.getItem('science-stats-digits')
    return raw ? JSON.parse(raw) : 4
  } catch { return 4 }
}

export default function StatsTool() {
  const [groups, setGroups] = useState<SampleGroup[]>(loadGroups)
  const [digits, setDigits] = useState(loadDigits)

  // Experiment metadata
  const [expLabel, setExpLabel] = useState(() => {
    try { return localStorage.getItem('science-stats-exp-label') || '' } catch { return '' }
  })
  const [concentration, setConcentration] = useState(() => {
    try { return localStorage.getItem('science-stats-conc') || '' } catch { return '' }
  })
  const [concUnit, setConcUnit] = useState(() => {
    try { return localStorage.getItem('science-stats-conc-unit') || 'mol/L' } catch { return 'mol/L' }
  })

  // Saved results & labels
  const [results, setResults] = useState<ExperimentEntry[]>(loadResults)
  const [labels, setLabels] = useState<LabelItem[]>(loadLabels)
  const [showResults, setShowResults] = useState(false)

  // Modal state
  const [newLabelName, setNewLabelName] = useState('')
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set())
  const [assignLabelId, setAssignLabelId] = useState<string>('')

  // Export selection
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set())

  // Cross-group analysis
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())

  const onArrow = useArrowNav()

  const computed = useMemo(() => {
    return groups.map((g) => {
      const nums = g.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v))
      return { ...g, stats: calcStats(nums) }
    })
  }, [groups])

  const summary = useMemo(() => {
    const selected = computed.filter((r) => r.stats && selectedGroupIds.has(r.id))
    const means = selected.map((r) => r.stats!.mean)
    if (means.length === 0) return null
    return { ...calcStats(means)!, groupNames: selected.map((r) => r.name) }
  }, [computed, selectedGroupIds])

  const validGroups = computed.filter((r) => r.stats)

  // ── Persist input state ─────────────────────────

  useEffect(() => {
    localStorage.setItem('science-stats-groups', JSON.stringify(groups))
  }, [groups])
  useEffect(() => {
    localStorage.setItem('science-stats-digits', JSON.stringify(digits))
  }, [digits])
  useEffect(() => { localStorage.setItem('science-stats-exp-label', expLabel) }, [expLabel])
  useEffect(() => { localStorage.setItem('science-stats-conc', concentration) }, [concentration])
  useEffect(() => { localStorage.setItem('science-stats-conc-unit', concUnit) }, [concUnit])

  // ── Group selection ─────────────────────────────

  function toggleSelectGroup(id: string) {
    setSelectedGroupIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function selectAllGroups() {
    if (validGroups.length === 0) return
    const allSelected = validGroups.every((r) => selectedGroupIds.has(r.id))
    setSelectedGroupIds(allSelected ? new Set() : new Set(validGroups.map((r) => r.id)))
  }

  // ── Group handlers ──────────────────────────────

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
    setSelectedGroupIds(new Set())
  }

  // ── Save experiment to results ──────────────────

  function saveExperiment() {
    const groupStats: GroupStat[] = validGroups.map((r) => ({
      name: r.name,
      unit: r.unit,
      mean: parseFloat(fmt(r.stats!.mean, digits)),
      std: parseFloat(fmt(r.stats!.std, digits)),
      sem: parseFloat(fmt(r.stats!.sem, digits)),
      n: r.stats!.n,
    }))
    const measurementUnit = validGroups[0]?.unit || 'mm'
    const entry: ExperimentEntry = {
      id: `exp-${Date.now()}`,
      label: expLabel.trim() || `Experiment ${new Date().toLocaleDateString()}`,
      concentration: concentration.trim(),
      concUnit,
      groups: groupStats,
      crossGroup: summary ? { mean: summary.mean, std: summary.std, sem: summary.sem, n: summary.n } : null,
      measurementUnit,
      ts: Date.now(),
      savedLabelId: null,
    }
    const next = [entry, ...results]
    setResults(next)
    saveResults(next)
  }

  // ── Result handlers ─────────────────────────────

  function deleteResult(id: string) {
    const next = results.filter((r) => r.id !== id)
    setResults(next)
    saveResults(next)
    setSelectedResultIds((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }

  function clearAllResults() {
    setResults([])
    saveResults([])
    setSelectedResultIds(new Set())
  }

  // ── Label handlers ──────────────────────────────

  function createLabel() {
    const name = newLabelName.trim()
    if (!name) return
    const lbl: LabelItem = { id: `l-${Date.now()}`, name, ts: Date.now() }
    const next = [...labels, lbl]
    setLabels(next)
    saveLabels(next)
    setNewLabelName('')
  }

  function deleteLabel(id: string) {
    const next = labels.filter((l) => l.id !== id)
    setLabels(next)
    saveLabels(next)
    const updated = results.map((r) => (r.savedLabelId === id ? { ...r, savedLabelId: null } : r))
    setResults(updated)
    saveResults(updated)
  }

  function renameLabel(id: string, name: string) {
    const next = labels.map((l) => (l.id === id ? { ...l, name } : l))
    setLabels(next)
    saveLabels(next)
  }

  function assignSelectedToLabel() {
    if (!assignLabelId || selectedResultIds.size === 0) return
    const updated = results.map((r) =>
      selectedResultIds.has(r.id) ? { ...r, savedLabelId: assignLabelId } : r
    )
    setResults(updated)
    saveResults(updated)
    setSelectedResultIds(new Set())
    setAssignLabelId('')
  }

  function toggleSelect(id: string) {
    setSelectedResultIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleExportSection(id: string) {
    setExportSelection((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function selectAllExport() {
    const all = new Set<string>()
    if (results.some((r) => !r.savedLabelId)) all.add('__unlabeled__')
    labels.forEach((l) => all.add(l.id))
    setExportSelection(all)
  }

  // ── PDF export ──────────────────────────────────

  function exportPDF() {
    const doc = new jsPDF()
    const dateStr = new Date().toLocaleDateString()
    let y = 20
    let hasContent = false

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Science Stats Lab - Export', 14, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${dateStr}`, 14, y)
    y += 8

    function renderEntry(entry: ExperimentEntry) {
      if (y > 250) { doc.addPage(); y = 20 }

      // Entry title
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(entry.label, 14, y)
      y += 5
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      const meta = [
        entry.concentration ? `Conc: ${entry.concentration} ${entry.concUnit}` : '',
        `Measurement: ${entry.measurementUnit}`,
        new Date(entry.ts).toLocaleString(),
      ].filter(Boolean).join('  |  ')
      doc.text(meta, 14, y)
      y += 4

      // Group stats table
      autoTable(doc, {
        startY: y,
        head: [['Group', 'N', 'Mean', 'SD', 'SEM']],
        body: entry.groups.map((g) => [
          g.name, String(g.n),
          `${g.mean} ${g.unit}`,
          `${g.std} ${g.unit}`,
          `${g.sem} ${g.unit}`,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable
      y = doc.lastAutoTable.finalY + 3

      // Cross-group row
      if (entry.crossGroup) {
        autoTable(doc, {
          startY: y,
          body: [[
            'Cross-Group',
            String(entry.crossGroup.n),
            `${entry.crossGroup.mean.toFixed(digits)} ${entry.measurementUnit}`,
            `${entry.crossGroup.std.toFixed(digits)} ${entry.measurementUnit}`,
            `${entry.crossGroup.sem.toFixed(digits)} ${entry.measurementUnit}`,
          ]],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold' },
          margin: { left: 14, right: 14 },
        })
        // @ts-expect-error jspdf-autotable
        y = doc.lastAutoTable.finalY + 8
      } else {
        y += 6
      }
      hasContent = true
    }

    if (exportSelection.has('__unlabeled__')) {
      results.filter((r) => !r.savedLabelId).forEach(renderEntry)
    }
    labels.forEach((lbl) => {
      if (!exportSelection.has(lbl.id)) return
      const items = results.filter((r) => r.savedLabelId === lbl.id)
      if (items.length === 0) return
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(lbl.name, 14, y)
      y += 6
      items.forEach(renderEntry)
    })

    if (!hasContent) return
    doc.save(`science-stats-${Date.now()}.pdf`)
  }

  // ── Grouped results for modal ───────────────────

  const unlabeledResults = results.filter((r) => !r.savedLabelId)
  const labeledGroups = labels.map((lbl) => ({
    label: lbl,
    items: results.filter((r) => r.savedLabelId === lbl.id),
  })).filter((g) => g.items.length > 0)

  const canSave = validGroups.length > 0

  return (
    <div className="space-y-6 relative">
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

      {/* Experiment metadata bar + top controls */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Label name */}
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">Label</label>
            <input
              value={expLabel}
              onChange={(e) => setExpLabel(e.target.value)}
              placeholder="e.g. Swell Ratio Exp 1"
              className="flex-1 text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </div>
          {/* Concentration */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">Conc</label>
            <input
              value={concentration}
              onChange={(e) => setConcentration(e.target.value)}
              placeholder="e.g. 0.5"
              inputMode="decimal"
              className="w-20 text-sm font-mono border border-[var(--color-border)] rounded-lg px-2 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
            <UnitPicker
              value={concUnit}
              onChange={setConcUnit}
              className="text-xs font-mono w-20 text-center border border-[var(--color-border)] rounded-lg px-1.5 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </div>
          {/* Decimals */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">Dec</label>
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
          {/* Save + Results buttons */}
          <Button onClick={saveExperiment} disabled={!canSave} className={!canSave ? 'opacity-40 cursor-not-allowed' : ''}>
            Save to Results
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowResults(true)}
            className="relative"
          >
            Saved
            {results.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[var(--color-accent)] text-white">
                {results.length}
              </span>
            )}
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
                title={r.stats ? 'Select for cross-group analysis' : 'Enter data first'}
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
            <span className="text-xs text-[var(--color-muted)]">
              {selectedGroupIds.size} selected
            </span>
          </div>
          <button
            onClick={selectAllGroups}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >{validGroups.length > 0 && validGroups.every((r) => selectedGroupIds.has(r.id)) ? 'Deselect All' : 'Select All'}</button>
        </div>

        {selectedGroupIds.size < 2 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Check the box on each group card to compute Mean, SD, and SEM across selected groups' means.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="N (groups)" value={`${summary?.n ?? selectedGroupIds.size}`} />
            <StatBox label="Grand Mean" value={summary ? fmt(summary.mean, digits) : '—'} highlight />
            <StatBox label="Inter-Group SD" value={summary ? fmt(summary.std, digits) : '—'} />
            <StatBox label="Inter-Group SEM" value={summary ? fmt(summary.sem, digits) : '—'} />
          </div>
        )}
      </Card>

      {/* ── Results Modal ─────────────────────────── */}
      {showResults && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-base font-bold">Saved Results</h2>
              <div className="flex items-center gap-2">
                {results.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20">
                      <span className="text-xs text-[var(--color-muted)]">Export:</span>
                      {unlabeledResults.length > 0 && (
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={exportSelection.has('__unlabeled__')}
                            onChange={() => toggleExportSection('__unlabeled__')}
                            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                          />
                          Unlabeled
                        </label>
                      )}
                      {labels.map((l) => (
                        <label key={l.id} className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={exportSelection.has(l.id)}
                            onChange={() => toggleExportSection(l.id)}
                            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                          />
                          {l.name}
                        </label>
                      ))}
                      <button onClick={selectAllExport} className="text-[10px] text-[var(--color-accent)] hover:underline px-1">All</button>
                      <Button size="sm" onClick={exportPDF} disabled={exportSelection.size === 0} className="ml-1">PDF</Button>
                    </div>
                    <button onClick={clearAllResults} className="text-xs text-red-400 hover:text-red-600">Clear all</button>
                  </>
                )}
                <button
                  onClick={() => setShowResults(false)}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-[var(--color-muted)] text-lg"
                >×</button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {results.length === 0 ? (
                <div className="text-center py-16 text-[var(--color-muted)]">
                  <p className="text-sm">No saved experiments yet</p>
                  <p className="text-xs mt-1">Fill in data, then click <span className="font-medium">Save to Results</span></p>
                </div>
              ) : (
                <>
                  {/* Label + assign bar */}
                  <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-[var(--color-border)]">
                    <input
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createLabel()}
                      placeholder="New label name..."
                      className="flex-1 min-w-[140px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                    <Button size="sm" variant="outline" onClick={createLabel} disabled={!newLabelName.trim()}>+ Create Label</Button>
                    <div className="w-px h-6 bg-[var(--color-border)] mx-1" />
                    {selectedResultIds.size > 0 && (
                      <>
                        <span className="text-xs text-[var(--color-muted)]">{selectedResultIds.size} selected</span>
                        <select
                          value={assignLabelId}
                          onChange={(e) => setAssignLabelId(e.target.value)}
                          className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                        >
                          <option value="">Assign to...</option>
                          {labels.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                        </select>
                        <Button size="sm" onClick={assignSelectedToLabel} disabled={!assignLabelId}>Assign</Button>
                      </>
                    )}
                  </div>

                  {/* Unlabeled experiments */}
                  {unlabeledResults.length > 0 && (
                    <ExperimentSection
                      title="Unlabeled"
                      items={unlabeledResults}
                      digits={digits}
                      selectedIds={selectedResultIds}
                      onToggle={toggleSelect}
                      onDelete={deleteResult}
                    />
                  )}

                  {/* Labeled experiments */}
                  {labeledGroups.map(({ label, items }) => (
                    <ExperimentSection
                      key={label.id}
                      title={label.name}
                      labelId={label.id}
                      items={items}
                      digits={digits}
                      selectedIds={selectedResultIds}
                      onToggle={toggleSelect}
                      onDelete={deleteResult}
                      onRenameLabel={(name) => renameLabel(label.id, name)}
                      onDeleteLabel={() => deleteLabel(label.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Experiment Section component ──────────────────

function ExperimentSection({
  title,
  items,
  digits,
  selectedIds,
  onToggle,
  onDelete,
  labelId,
  onRenameLabel,
  onDeleteLabel,
}: {
  title: string
  items: ExperimentEntry[]
  digits: number
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  labelId?: string
  onRenameLabel?: (name: string) => void
  onDeleteLabel?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(title)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {labelId && editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (onRenameLabel && name.trim()) onRenameLabel(name.trim()); else setName(title) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setEditing(false); if (onRenameLabel && name.trim()) onRenameLabel(name.trim()) }
              if (e.key === 'Escape') { setName(title); setEditing(false) }
            }}
            autoFocus
            className="text-sm font-bold bg-transparent border-b border-[var(--color-accent)] outline-none px-1"
          />
        ) : (
          <h3
            className={`text-sm font-bold ${labelId ? 'cursor-pointer hover:text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            onClick={() => labelId && setEditing(true)}
          >
            {title}
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">{items.length}</span>
          </h3>
        )}
        {labelId && onDeleteLabel && (
          <button onClick={onDeleteLabel} className="text-xs text-[var(--color-muted)] hover:text-red-500">Remove label</button>
        )}
      </div>
      <div className="space-y-3">
        {items.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-lg border p-3 transition-all cursor-pointer ${
              selectedIds.has(entry.id)
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/50'
                : 'border-[var(--color-border)] hover:bg-gray-50'
            }`}
            onClick={() => onToggle(entry.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-sm font-semibold">{entry.label}</span>
                {entry.concentration && (
                  <span className="text-xs text-[var(--color-muted)] font-mono">
                    {entry.concentration} {entry.concUnit}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}
                className="text-[var(--color-muted)] hover:text-red-500 text-sm px-1"
              >×</button>
            </div>
            {/* Group stats table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                    <th className="text-left py-1.5 pr-3">Group</th>
                    <th className="text-right py-1.5 px-2">N</th>
                    <th className="text-right py-1.5 px-2">Mean</th>
                    <th className="text-right py-1.5 px-2">SD</th>
                    <th className="text-right py-1.5 px-2">SEM</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.groups.map((g, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-1.5 pr-3 font-medium">{g.name}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{g.n}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{g.mean} {g.unit}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-[var(--color-muted)]">{g.std}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-[var(--color-muted)]">{g.sem}</td>
                    </tr>
                  ))}
                  {entry.crossGroup && (
                    <tr className="bg-[var(--color-accent-light)]/30 font-bold">
                      <td className="py-1.5 pr-3">Cross-Group</td>
                      <td className="py-1.5 px-2 text-right font-mono">{entry.crossGroup.n}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{entry.crossGroup.mean.toFixed(digits)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{entry.crossGroup.std.toFixed(digits)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{entry.crossGroup.sem.toFixed(digits)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
