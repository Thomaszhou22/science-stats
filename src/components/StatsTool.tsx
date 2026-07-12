import { useState, useMemo, useEffect } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Card, Button, StatBox, fmt } from './ui'

interface SampleGroup {
  id: string
  name: string
  unit: string
  values: string[]
}

// ── localStorage types ───────────────────────────

interface SavedResult {
  id: string
  groupName: string
  unit: string
  mean: string
  std: string
  sem: string
  n: number
  ts: number
  labelId: string | null
}

interface LabelItem {
  id: string
  name: string
  ts: number
}

function loadResults(): SavedResult[] {
  try {
    const raw = localStorage.getItem('science-stats-results')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveResults(v: SavedResult[]) {
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

  // Saved results & labels
  const [results, setResults] = useState<SavedResult[]>(loadResults)
  const [labels, setLabels] = useState<LabelItem[]>(loadLabels)
  const [showResults, setShowResults] = useState(false)

  // Modal state
  const [newLabelName, setNewLabelName] = useState('')
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set())
  const [assignLabelId, setAssignLabelId] = useState<string>('')

  // Export selection: which sections (labels + unlabeled) to include in PDF
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set()) // '__unlabeled__' or label.id

  // Cross-group analysis: select groups to compute mean/SD/SEM across their means
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [showAnalysis, setShowAnalysis] = useState(false)

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

  useEffect(() => {
    localStorage.setItem('science-stats-groups', JSON.stringify(groups))
  }, [groups])
  useEffect(() => {
    localStorage.setItem('science-stats-digits', JSON.stringify(digits))
  }, [digits])

  function toggleSelectGroup(id: string) {
    setSelectedGroupIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function selectAllGroups() {
    const valid = computed.filter((r) => r.stats)
    if (valid.length === 0) return
    // If all selected, deselect all
    const allSelected = valid.every((r) => selectedGroupIds.has(r.id))
    if (allSelected) {
      setSelectedGroupIds(new Set())
    } else {
      setSelectedGroupIds(new Set(valid.map((r) => r.id)))
    }
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
  }

  // ── Add single group to results ─────────────────

  function addToResults(groupId: string) {
    const g = computed.find((r) => r.id === groupId)
    if (!g || !g.stats) return
    const entry: SavedResult = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupName: g.name,
      unit: g.unit,
      mean: fmt(g.stats.mean, digits),
      std: fmt(g.stats.std, digits),
      sem: fmt(g.stats.sem, digits),
      n: g.stats.n,
      ts: Date.now(),
      labelId: null,
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
    const lbl: LabelItem = {
      id: `l-${Date.now()}`,
      name,
      ts: Date.now(),
    }
    const next = [...labels, lbl]
    setLabels(next)
    saveLabels(next)
    setNewLabelName('')
  }

  function deleteLabel(id: string) {
    const next = labels.filter((l) => l.id !== id)
    setLabels(next)
    saveLabels(next)
    // Unassign results that had this label
    const updated = results.map((r) => (r.labelId === id ? { ...r, labelId: null } : r))
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
      selectedResultIds.has(r.id) ? { ...r, labelId: assignLabelId } : r
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
    if (unlabeledResults.length > 0) all.add('__unlabeled__')
    labels.forEach((l) => all.add(l.id))
    setExportSelection(all)
  }

  function exportPDF() {
    const doc = new jsPDF()
    const dateStr = new Date().toLocaleDateString()
    let hasContent = false

    // Title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Science Stats Lab - Results Export', 14, 20)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${dateStr}`, 14, 27)

    let y = 35

    // Unlabeled
    if (exportSelection.has('__unlabeled__') && unlabeledResults.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Unlabeled Results', '', '', '', '']],
        body: [['Group', 'N', 'Mean', 'Std Dev', 'SEM']],
        theme: 'plain',
        headStyles: { fontStyle: 'bold', fontSize: 12, fillColor: [240, 240, 240] },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable adds lastAutoTable
      y = doc.lastAutoTable.finalY + 2

      autoTable(doc, {
        startY: y,
        head: [['Group', 'N', 'Mean', 'Std Dev', 'SEM']],
        body: unlabeledResults.map((r) => [
          r.groupName,
          String(r.n),
          `${r.mean} ${r.unit}`,
          `${r.std} ${r.unit}`,
          `${r.sem} ${r.unit}`,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable adds lastAutoTable
      y = doc.lastAutoTable.finalY + 8
      hasContent = true
    }

    // Each selected label
    for (const lbl of labels) {
      if (!exportSelection.has(lbl.id)) continue
      const items = results.filter((r) => r.labelId === lbl.id)
      if (items.length === 0) continue

      if (y > 250) {
        doc.addPage()
        y = 20
      }

      autoTable(doc, {
        startY: y,
        head: [[lbl.name, '', '', '', '']],
        body: [],
        theme: 'plain',
        headStyles: { fontStyle: 'bold', fontSize: 12, fillColor: [240, 240, 240] },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable adds lastAutoTable
      y = doc.lastAutoTable.finalY + 2

      autoTable(doc, {
        startY: y,
        head: [['Group', 'N', 'Mean', 'Std Dev', 'SEM']],
        body: items.map((r) => [
          r.groupName,
          String(r.n),
          `${r.mean} ${r.unit}`,
          `${r.std} ${r.unit}`,
          `${r.sem} ${r.unit}`,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable adds lastAutoTable
      y = doc.lastAutoTable.finalY + 8
      hasContent = true
    }

    if (!hasContent) return

    doc.save(`science-stats-${Date.now()}.pdf`)
  }

  // ── Grouped results for modal ───────────────────

  const unlabeledResults = results.filter((r) => !r.labelId)
  const labeledGroups = labels.map((lbl) => ({
    label: lbl,
    items: results.filter((r) => r.labelId === lbl.id),
  })).filter((g) => g.items.length > 0)

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

      {/* Top bar: decimals + results button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
        <Button
          variant="outline"
          onClick={() => setShowResults(true)}
          className="relative"
        >
          Saved Results
          {results.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-[var(--color-accent)] text-white">
              {results.length}
            </span>
          )}
        </Button>
      </div>

      {/* Group cards */}
      {computed.map((r) => (
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => addToResults(r.id)}
                disabled={!r.stats}
                className={!r.stats ? 'opacity-40 cursor-not-allowed' : ''}
              >
                + Add to Results
              </Button>
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

      {/* Selection toolbar + Cross-Group Analysis */}
      <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold">Cross-Group Analysis</h2>
            <span className="text-xs text-[var(--color-muted)]">
              {selectedGroupIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllGroups}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >{computed.filter((r) => r.stats).length > 0 && computed.filter((r) => r.stats).every((r) => selectedGroupIds.has(r.id)) ? 'Deselect All' : 'Select All'}</button>
            <Button
              size="sm"
              onClick={() => setShowAnalysis(true)}
              disabled={selectedGroupIds.size < 2}
            >Analyze</Button>
          </div>
        </div>

        {selectedGroupIds.size < 2 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Check the box on each group card, then click Analyze to compute Mean, SD, and SEM across the selected groups' means.
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

      {/* Analysis detail modal */}
      {showAnalysis && summary && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowAnalysis(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-base font-bold">Cross-Group Analysis</h2>
              <button
                onClick={() => setShowAnalysis(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-[var(--color-muted)] text-lg"
              >×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Selected groups */}
              <div>
                <h3 className="text-xs font-semibold text-[var(--color-muted)] mb-2">Selected Groups</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.groupNames.map((name, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-gray-100 font-medium">
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Results */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="N (groups)" value={`${summary.n}`} />
                <StatBox label="Grand Mean" value={fmt(summary.mean, digits)} highlight />
                <StatBox label="Inter-Group SD" value={fmt(summary.std, digits)} />
                <StatBox label="Inter-Group SEM" value={fmt(summary.sem, digits)} />
              </div>

              {/* Formula note */}
              <div className="text-xs text-[var(--color-muted)] bg-gray-50 rounded-lg p-3">
                N = {summary.n} (number of group means).<br/>
                Grand Mean = average of the {summary.n} group means.<br/>
                SD = standard deviation across group means (N-1 denominator).<br/>
                SEM = SD / √N.
              </div>

              {/* Add to Saved Results */}
              <Button
                className="w-full"
                onClick={() => {
                  const entry: SavedResult = {
                    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    groupName: `Analysis (${summary.groupNames.join(', ')})`,
                    unit: '(cross-group)',
                    mean: fmt(summary.mean, digits),
                    std: fmt(summary.std, digits),
                    sem: fmt(summary.sem, digits),
                    n: summary.n,
                    ts: Date.now(),
                    labelId: null,
                  }
                  const next = [entry, ...results]
                  setResults(next)
                  saveResults(next)
                  setShowAnalysis(false)
                }}
              >
                + Add to Saved Results
              </Button>
            </div>
          </div>
        </div>
      )}

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
                {/* Export controls */}
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
                      <button
                        onClick={selectAllExport}
                        className="text-[10px] text-[var(--color-accent)] hover:underline px-1"
                      >All</button>
                      <Button
                        size="sm"
                        onClick={exportPDF}
                        disabled={exportSelection.size === 0}
                        className="ml-1"
                      >
                        PDF
                      </Button>
                    </div>
                  </>
                )}
                {results.length > 0 && (
                  <button
                    onClick={clearAllResults}
                    className="text-xs text-red-400 hover:text-red-600"
                  >Clear all</button>
                )}
                <button
                  onClick={() => setShowResults(false)}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-[var(--color-muted)] text-lg"
                >×</button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {results.length === 0 ? (
                <div className="text-center py-16 text-[var(--color-muted)]">
                  <p className="text-sm">No saved results yet</p>
                  <p className="text-xs mt-1">Click <span className="font-medium">+ Add to Results</span> on any group to save its stats</p>
                </div>
              ) : (
                <>
                  {/* Create label + assign bar */}
                  <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-[var(--color-border)]">
                    <input
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createLabel()}
                      placeholder="New label name..."
                      className="flex-1 min-w-[140px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                    <Button size="sm" variant="outline" onClick={createLabel} disabled={!newLabelName.trim()}>
                      + Create Label
                    </Button>
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
                          {labels.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <Button size="sm" onClick={assignSelectedToLabel} disabled={!assignLabelId}>
                          Assign
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Unlabeled results */}
                  {unlabeledResults.length > 0 && (
                    <ResultSection
                      title="Unlabeled"
                      items={unlabeledResults}
                      selectedIds={selectedResultIds}
                      onToggle={toggleSelect}
                      onDelete={deleteResult}
                    />
                  )}

                  {/* Labeled groups */}
                  {labeledGroups.map(({ label, items }) => (
                    <ResultSection
                      key={label.id}
                      title={label.name}
                      labelId={label.id}
                      items={items}
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

// ── Result Section component ──────────────────────

function ResultSection({
  title,
  items,
  selectedIds,
  onToggle,
  onDelete,
  labelId,
  onRenameLabel,
  onDeleteLabel,
}: {
  title: string
  items: SavedResult[]
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
            onBlur={() => {
              setEditing(false)
              if (onRenameLabel && name.trim()) onRenameLabel(name.trim())
              else setName(title)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditing(false)
                if (onRenameLabel && name.trim()) onRenameLabel(name.trim())
              }
              if (e.key === 'Escape') {
                setName(title)
                setEditing(false)
              }
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
          <button
            onClick={onDeleteLabel}
            className="text-xs text-[var(--color-muted)] hover:text-red-500"
          >Remove label</button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((r) => (
          <div
            key={r.id}
            className={`flex items-center gap-3 rounded-lg border p-2.5 transition-all cursor-pointer ${
              selectedIds.has(r.id)
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/50'
                : 'border-[var(--color-border)] hover:bg-gray-50'
            }`}
            onClick={() => onToggle(r.id)}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(r.id)}
              onChange={() => onToggle(r.id)}
              className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex-1 grid grid-cols-5 gap-2 text-xs">
              <span className="font-semibold">{r.groupName}</span>
              <span className="text-right font-mono text-[var(--color-muted)]">N={r.n}</span>
              <span className="text-right font-mono">{r.mean} {r.unit}</span>
              <span className="text-right font-mono text-[var(--color-muted)]">σ={r.std}</span>
              <span className="text-right font-mono text-[var(--color-muted)]">SEM={r.sem}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(r.id)
              }}
              className="text-[var(--color-muted)] hover:text-red-500 text-sm px-1"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
