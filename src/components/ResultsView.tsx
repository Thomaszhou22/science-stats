import { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Card, Button } from './ui'
import { UnitPicker } from './UnitPicker'
import {
  type ExperimentEntry, type LabelItem, type Variable,
  loadResults, saveResults, loadLabels, saveLabels,
} from '../lib/experiment'

export default function ResultsView() {
  const [results, setResults] = useState<ExperimentEntry[]>(loadResults)
  const [labels, setLabels] = useState<LabelItem[]>(loadLabels)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignLabelId, setAssignLabelId] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [exportSelection, setExportSelection] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Sync to localStorage whenever results change
  useEffect(() => { saveResults(results) }, [results])
  useEffect(() => { saveLabels(labels) }, [labels])

  const unlabeled = results.filter((r) => !r.savedLabelId)
  const labeled = labels.map((lbl) => ({
    label: lbl,
    items: results.filter((r) => r.savedLabelId === lbl.id),
  })).filter((g) => g.items.length > 0)

  // ── Handlers ────────────────────────────────────

  function renameEntry(id: string, label: string) {
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, label } : r))
  }

  function deleteResult(id: string) {
    setResults((prev) => prev.filter((r) => r.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  function clearAllResults() {
    setResults([])
    setSelectedIds(new Set())
  }

  function createLabel() {
    const name = newLabelName.trim()
    if (!name) return
    const lbl: LabelItem = { id: `l-${Date.now()}`, name, ts: Date.now() }
    setLabels((prev) => [...prev, lbl])
    setNewLabelName('')
  }

  function deleteLabel(id: string) {
    setLabels((prev) => prev.filter((l) => l.id !== id))
    setResults((prev) => prev.map((r) => r.savedLabelId === id ? { ...r, savedLabelId: null } : r))
  }

  function renameLabel(id: string, name: string) {
    setLabels((prev) => prev.map((l) => l.id === id ? { ...l, name } : l))
  }

  function assignSelected() {
    if (!assignLabelId || selectedIds.size === 0) return
    setResults((prev) => prev.map((r) => selectedIds.has(r.id) ? { ...r, savedLabelId: assignLabelId } : r))
    setSelectedIds(new Set())
    setAssignLabelId('')
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  // ── Variable handlers (per experiment) ──────────

  function addVariable(expId: string, type: 'iv' | 'dv') {
    const newVar: Variable = {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: type === 'iv' ? 'Concentration' : 'ΔV',
      value: '',
      unit: type === 'iv' ? 'mol/L' : 'mL',
      type,
    }
    setResults((prev) => prev.map((r) => r.id === expId ? { ...r, variables: [...r.variables, newVar] } : r))
  }

  function updateVariable(expId: string, varId: string, patch: Partial<Variable>) {
    setResults((prev) => prev.map((r) =>
      r.id === expId
        ? { ...r, variables: r.variables.map((v) => v.id === varId ? { ...v, ...patch } : v) }
        : r
    ))
  }

  function deleteVariable(expId: string, varId: string) {
    setResults((prev) => prev.map((r) =>
      r.id === expId
        ? { ...r, variables: r.variables.filter((v) => v.id !== varId) }
        : r
    ))
  }

  // ── PDF Export ──────────────────────────────────

  function toggleExportSection(id: string) {
    setExportSelection((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function selectAllExport() {
    const all = new Set<string>()
    if (unlabeled.length > 0) all.add('__unlabeled__')
    labels.forEach((l) => all.add(l.id))
    setExportSelection(all)
  }

  function exportPDF() {
    const doc = new jsPDF()
    let y = 20
    let hasContent = false

    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('Science Stats Lab - Export', 14, y); y += 7
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, y); y += 8

    function renderEntry(entry: ExperimentEntry) {
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold')
      doc.text(entry.label, 14, y); y += 5
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      const ivs = entry.variables.filter((v) => v.type === 'iv')
      const dvs = entry.variables.filter((v) => v.type === 'dv')
      const metaParts = [
        ...ivs.map((v) => `${v.name}: ${v.value} ${v.unit}`),
        ...dvs.map((v) => `${v.name}: ${v.value} ${v.unit}`),
        new Date(entry.ts).toLocaleString(),
      ]
      if (metaParts.length > 0) { doc.text(metaParts.join('  |  '), 14, y); y += 4 }

      autoTable(doc, {
        startY: y,
        head: [['Group', 'N', 'Mean', 'SD', 'SEM']],
        body: entry.groups.map((g) => [g.name, String(g.n), `${g.mean} ${g.unit}`, `${g.std} ${g.unit}`, `${g.sem} ${g.unit}`]),
        theme: 'grid',
        headStyles: { fillColor: [66, 139, 202], fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable
      y = doc.lastAutoTable.finalY + 3

      if (entry.crossGroup) {
        autoTable(doc, {
          startY: y,
          body: [['Cross-Group', String(entry.crossGroup.n), `${entry.crossGroup.mean.toFixed(4)} ${entry.measurementUnit}`, `${entry.crossGroup.std.toFixed(4)} ${entry.measurementUnit}`, `${entry.crossGroup.sem.toFixed(4)} ${entry.measurementUnit}`]],
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2, fontStyle: 'bold' },
          margin: { left: 14, right: 14 },
        })
        // @ts-expect-error jspdf-autotable
        y = doc.lastAutoTable.finalY + 8
      } else { y += 6 }
      hasContent = true
    }

    if (exportSelection.has('__unlabeled__')) unlabeled.forEach(renderEntry)
    labels.forEach((lbl) => {
      if (!exportSelection.has(lbl.id)) return
      const items = results.filter((r) => r.savedLabelId === lbl.id)
      if (items.length === 0) return
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text(lbl.name, 14, y); y += 6
      items.forEach(renderEntry)
    })

    if (hasContent) doc.save(`science-stats-${Date.now()}.pdf`)
  }

  // ── Render ──────────────────────────────────────

  if (results.length === 0) {
    return (
      <div className="text-center py-20 text-[var(--color-muted)]">
        <p className="text-base font-semibold mb-2">No saved experiments yet</p>
        <p className="text-sm">Go to Statistics, fill in data, then click Save to Results.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Create label */}
          <input
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createLabel()}
            placeholder="New label name..."
            className="flex-1 min-w-[140px] text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <Button size="sm" variant="outline" onClick={createLabel} disabled={!newLabelName.trim()}>+ Create Label</Button>
          <div className="w-px h-6 bg-[var(--color-border)] mx-1" />

          {/* Assign to label */}
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-[var(--color-muted)]">{selectedIds.size} selected</span>
              <select
                value={assignLabelId}
                onChange={(e) => setAssignLabelId(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              >
                <option value="">Assign to...</option>
                {labels.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
              <Button size="sm" onClick={assignSelected} disabled={!assignLabelId}>Assign</Button>
            </>
          )}

          {/* Export */}
          <div className="w-px h-6 bg-[var(--color-border)] mx-1" />
          <div className="flex items-center gap-1.5">
            {unlabeled.length > 0 && (
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={exportSelection.has('__unlabeled__')} onChange={() => toggleExportSection('__unlabeled__')} className="w-3.5 h-3.5 accent-[var(--color-accent)]" />
                Unlabeled
              </label>
            )}
            {labels.map((l) => (
              <label key={l.id} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={exportSelection.has(l.id)} onChange={() => toggleExportSection(l.id)} className="w-3.5 h-3.5 accent-[var(--color-accent)]" />
                {l.name}
              </label>
            ))}
            <button onClick={selectAllExport} className="text-[10px] text-[var(--color-accent)] hover:underline px-1">All</button>
            <Button size="sm" onClick={exportPDF} disabled={exportSelection.size === 0}>PDF</Button>
          </div>

          <div className="flex-1" />
          <button onClick={clearAllResults} className="text-xs text-red-400 hover:text-red-600">Clear all</button>
        </div>
      </Card>

      {/* Unlabeled experiments */}
      {unlabeled.length > 0 && (
        <ExperimentSection
          title="Unlabeled"
          items={unlabeled}
          selectedIds={selectedIds}
          expandedId={expandedId}
          onToggle={toggleSelect}
          onExpand={setExpandedId}
          onDelete={deleteResult}
          onRenameEntry={renameEntry}
          onAddVar={addVariable}
          onUpdateVar={updateVariable}
          onDeleteVar={deleteVariable}
        />
      )}

      {/* Labeled groups */}
      {labeled.map(({ label, items }) => (
        <ExperimentSection
          key={label.id}
          title={label.name}
          labelId={label.id}
          items={items}
          selectedIds={selectedIds}
          expandedId={expandedId}
          onToggle={toggleSelect}
          onExpand={setExpandedId}
          onDelete={deleteResult}
          onRenameEntry={renameEntry}
          onRenameLabel={(name) => renameLabel(label.id, name)}
          onDeleteLabel={() => deleteLabel(label.id)}
          onAddVar={addVariable}
          onUpdateVar={updateVariable}
          onDeleteVar={deleteVariable}
        />
      ))}
    </div>
  )
}

// ── Experiment Section ────────────────────────────

function ExperimentSection({
  title, items, labelId, selectedIds, expandedId,
  onToggle, onExpand, onDelete,
  onRenameLabel, onDeleteLabel, onRenameEntry,
  onAddVar, onUpdateVar, onDeleteVar,
}: {
  title: string
  items: ExperimentEntry[]
  labelId?: string
  selectedIds: Set<string>
  expandedId: string | null
  onToggle: (id: string) => void
  onExpand: (id: string | null) => void
  onDelete: (id: string) => void
  onRenameLabel?: (name: string) => void
  onDeleteLabel?: () => void
  onRenameEntry?: (id: string, label: string) => void
  onAddVar: (expId: string, type: 'iv' | 'dv') => void
  onUpdateVar: (expId: string, varId: string, patch: Partial<Variable>) => void
  onDeleteVar: (expId: string, varId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(title)
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [entryDraft, setEntryDraft] = useState('')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {labelId && editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (onRenameLabel && name.trim()) onRenameLabel(name.trim()); else setName(title) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); if (onRenameLabel && name.trim()) onRenameLabel(name.trim()) } if (e.key === 'Escape') { setName(title); setEditing(false) } }}
            autoFocus
            className="text-sm font-bold bg-transparent border-b border-[var(--color-accent)] outline-none px-1"
          />
        ) : (
          <h2
            className={`text-base font-bold ${labelId ? 'cursor-pointer hover:text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            onClick={() => labelId && setEditing(true)}
          >
            {title}
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">{items.length}</span>
          </h2>
        )}
        {labelId && onDeleteLabel && (
          <button onClick={onDeleteLabel} className="text-xs text-[var(--color-muted)] hover:text-red-500">Remove label</button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((entry) => {
          const expanded = expandedId === entry.id
          const ivs = entry.variables.filter((v) => v.type === 'iv')
          const dvs = entry.variables.filter((v) => v.type === 'dv')
          return (
            <Card key={entry.id} className={selectedIds.has(entry.id) ? 'ring-2 ring-[var(--color-accent)]/40' : ''}>
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => onToggle(entry.id)}
                    className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                  />
                  <button
                    onClick={() => onExpand(expanded ? null : entry.id)}
                    className="text-sm font-semibold hover:text-[var(--color-accent)] flex items-center gap-1"
                  >
                    {expanded ? '▼' : '▶'}
                    {editingEntry === entry.id ? (
                      <input
                        value={entryDraft}
                        onChange={(e) => setEntryDraft(e.target.value)}
                        onBlur={() => {
                          if (onRenameEntry && entryDraft.trim()) onRenameEntry(entry.id, entryDraft.trim())
                          setEditingEntry(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { if (onRenameEntry && entryDraft.trim()) onRenameEntry(entry.id, entryDraft.trim()); setEditingEntry(null) }
                          if (e.key === 'Escape') setEditingEntry(null)
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold bg-transparent border-b border-[var(--color-accent)] outline-none px-1 text-sm"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingEntry(entry.id); setEntryDraft(entry.label) }}
                        title="Double-click to rename"
                      >{entry.label}</span>
                    )}
                  </button>
                  {editingEntry !== entry.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingEntry(entry.id); setEntryDraft(entry.label) }}
                      className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                      title="Rename"
                    >✎</button>
                  )}
                  <span className="text-xs text-[var(--color-muted)]">
                    {new Date(entry.ts).toLocaleDateString()}
                  </span>
                </div>
                <button onClick={() => onDelete(entry.id)} className="text-[var(--color-muted)] hover:text-red-500 text-sm">Delete</button>
              </div>

              {/* Collapsed: summary line */}
              {!expanded && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                  <span>{entry.groups.length} groups</span>
                  {entry.crossGroup && <span>Cross-group: {entry.crossGroup.mean.toFixed(2)} ± {entry.crossGroup.sem.toFixed(2)} {entry.measurementUnit}</span>}
                  {ivs.length > 0 && <span>IVs: {ivs.map((v) => `${v.name}=${v.value} ${v.unit}`).join(', ')}</span>}
                  {dvs.length > 0 && <span>DVs: {dvs.map((v) => `${v.name}=${v.value} ${v.unit}`).join(', ')}</span>}
                </div>
              )}

              {/* Expanded: full details */}
              {expanded && (
                <div className="mt-4 space-y-4">
                  {/* Variables section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">Variables</h4>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onAddVar(entry.id, 'iv')}>+ IV</Button>
                        <Button size="sm" variant="ghost" onClick={() => onAddVar(entry.id, 'dv')}>+ DV</Button>
                      </div>
                    </div>
                    {entry.variables.length === 0 ? (
                      <p className="text-xs text-[var(--color-muted)]">No variables yet. Add IVs (e.g. Concentration) and DVs (e.g. ΔV, ΔM) for plotting.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {/* IVs */}
                        {ivs.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-[var(--color-accent)] w-6">IV</span>
                            {ivs.map((v) => (
                              <div key={v.id} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-accent-light)]/30 px-1.5 py-1">
                                <input
                                  value={v.name}
                                  onChange={(e) => onUpdateVar(entry.id, v.id, { name: e.target.value })}
                                  className="text-xs font-medium bg-transparent border-none outline-none w-20 focus:bg-white rounded px-1"
                                />
                                <input
                                  value={v.value}
                                  onChange={(e) => onUpdateVar(entry.id, v.id, { value: e.target.value })}
                                  placeholder="val"
                                  inputMode="decimal"
                                  className="text-xs font-mono bg-transparent border-none outline-none w-14 text-right focus:bg-white rounded px-1"
                                />
                                <UnitPicker
                                  value={v.unit}
                                  onChange={(unit) => onUpdateVar(entry.id, v.id, { unit })}
                                  className="text-[10px] font-mono w-14 text-center border border-[var(--color-border)] rounded px-1 py-0.5 bg-white outline-none"
                                />
                                <button onClick={() => onDeleteVar(entry.id, v.id)} className="text-[var(--color-muted)] hover:text-red-500 text-xs">×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* DVs */}
                        {dvs.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-[var(--color-accent)] w-6">DV</span>
                            {dvs.map((v) => (
                              <div key={v.id} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-orange-50/40 px-1.5 py-1">
                                <input
                                  value={v.name}
                                  onChange={(e) => onUpdateVar(entry.id, v.id, { name: e.target.value })}
                                  className="text-xs font-medium bg-transparent border-none outline-none w-20 focus:bg-white rounded px-1"
                                />
                                <input
                                  value={v.value}
                                  onChange={(e) => onUpdateVar(entry.id, v.id, { value: e.target.value })}
                                  placeholder="val"
                                  inputMode="decimal"
                                  className="text-xs font-mono bg-transparent border-none outline-none w-14 text-right focus:bg-white rounded px-1"
                                />
                                <UnitPicker
                                  value={v.unit}
                                  onChange={(unit) => onUpdateVar(entry.id, v.id, { unit })}
                                  className="text-[10px] font-mono w-14 text-center border border-[var(--color-border)] rounded px-1 py-0.5 bg-white outline-none"
                                />
                                <button onClick={() => onDeleteVar(entry.id, v.id)} className="text-[var(--color-muted)] hover:text-red-500 text-xs">×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stats table */}
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
                            <CopyCell value={g.n} />
                            <CopyCell value={`${g.mean} ${g.unit}`} primary />
                            <CopyCell value={g.std} />
                            <CopyCell value={g.sem} />
                          </tr>
                        ))}
                        {entry.crossGroup && (
                          <tr className="bg-[var(--color-accent-light)]/30 font-bold">
                            <td className="py-1.5 pr-3">Cross-Group</td>
                            <CopyCell value={entry.crossGroup.n} />
                            <CopyCell value={Number(entry.crossGroup.mean.toFixed(4))} primary />
                            <CopyCell value={Number(entry.crossGroup.std.toFixed(4))} />
                            <CopyCell value={Number(entry.crossGroup.sem.toFixed(4))} />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Click-to-copy number cell ─────────────────────

function CopyCell({ value, primary = false }: { value: string | number; primary?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    const text = String(value)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    })
  }, [value])
  return (
    <td
      onClick={copy}
      className={`py-1.5 px-2 text-right font-mono cursor-pointer transition-all rounded select-none ${
        primary
          ? 'text-[var(--color-accent)] font-bold'
          : 'text-[var(--color-muted)]'
      } ${copied ? '!bg-green-100 !text-green-700' : 'hover:bg-gray-100'}`}
      title={copied ? 'Copied!' : `Click to copy: ${value}`}
    >
      {value}{copied ? ' ✓' : ''}
    </td>
  )
}
