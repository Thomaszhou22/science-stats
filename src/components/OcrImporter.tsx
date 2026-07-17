import { useState, useEffect } from 'react'
import { Card, Button } from './ui'

const STORAGE_KEY = 'scienc…rter'

type ImportMode = 'volume' | 'mass'

interface ConcGroup {
  conc: string
  samples: number
}

interface ImporterSettings {
  timeLabel: string
  groups: ConcGroup[]
  appsScriptUrl: string
  mode: ImportMode
  massGroups: ConcGroup[]
}

function loadSettings(): Partial<ImporterSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSettings(s: Partial<ImporterSettings>) {
  try {
    const existing = loadSettings()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...s }))
  } catch {}
}

// ── Parsing ────────────────────────────────────────────────────────

interface ParsedRow {
  conc: string
  sample: number
  values: number[]
  raw: string
}

/**
 * Parse text into rows. Each line = values for one sample.
 */
function parseTextData(text: string, groups: ConcGroup[], valuesPerRow: number): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const rows: ParsedRow[] = []
  const errors: string[] = []

  let lineIdx = 0
  for (const group of groups) {
    for (let s = 1; s <= group.samples; s++) {
      if (lineIdx >= lines.length) {
        errors.push(`Not enough lines: expected ${totalExpected(groups)} rows, got ${lineIdx}. Missing ${group.conc}% Sample ${s}.`)
        return { rows, errors }
      }
      const parts = lines[lineIdx].split(/[\s,\t]+/).map(p => parseFloat(p))
      if (parts.some(p => isNaN(p))) {
        errors.push(`Line ${lineIdx + 1}: "${lines[lineIdx]}" contains non-numeric values.`)
      }
      if (parts.length < valuesPerRow) {
        errors.push(`Line ${lineIdx + 1}: expected ${valuesPerRow} values, got ${parts.length}.`)
      }
      rows.push({
        conc: group.conc,
        sample: s,
        values: parts,
        raw: lines[lineIdx],
      })
      lineIdx++
    }
  }

  if (lineIdx < lines.length) {
    errors.push(`${lines.length - lineIdx} extra line(s) ignored (expected only ${totalExpected(groups)} rows).`)
  }

  return { rows, errors }
}

function totalExpected(groups: ConcGroup[]): number {
  return groups.reduce((sum, g) => sum + g.samples, 0)
}

// Mass sheet: 4 mass values per row (t=0h, t=18h, t=23h, t=48h)
// Columns: A=Conc, B=Sample, C=t=0h, D=t=18h, E=t=23h, F=t=48h
// Formulas: G=(D-C)/C*100, H=(E-D)/D*100, I=(F-E)/E*100

// ── Component ──────────────────────────────────────────────────────

export default function OcrImporter() {
  const saved = loadSettings()
  const [mode, setMode] = useState<ImportMode>(saved.mode ?? 'volume')
  const [timeLabel, setTimeLabel] = useState(saved.timeLabel ?? '')
  const defaultGroups = saved.groups ?? [
    { conc: '10', samples: 4 },
    { conc: '9', samples: 3 },
    { conc: '8', samples: 4 },
  ]
  const [groups, setGroups] = useState<ConcGroup[]>(defaultGroups)
  // Mass mode uses same group structure but can be different
  const defaultMassGroups = saved.massGroups ?? [
    { conc: '10', samples: 4 },
    { conc: '9', samples: 3 },
    { conc: '8', samples: 4 },
  ]
  const [massGroups, setMassGroups] = useState<ConcGroup[]>(defaultMassGroups)
  const [textData, setTextData] = useState('')
  const [fileName, setFileName] = useState('')
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    saved.appsScriptUrl ??
    'https://script.google.com/macros/s/AKfycbxmKjXjidRwdf_KI2P6BEK-3SMjtMzzCaZrjVr9EKmIARk25t0u3q6GPF4klaHWkSj5zg/exec'
  )
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => { saveSettings({ timeLabel }) }, [timeLabel])
  useEffect(() => { saveSettings({ groups }) }, [groups])
  useEffect(() => { saveSettings({ massGroups }) }, [massGroups])
  useEffect(() => { saveSettings({ appsScriptUrl }) }, [appsScriptUrl])
  useEffect(() => { saveSettings({ mode }) }, [mode])

  const activeGroups = mode === 'volume' ? groups : massGroups
  const valuesPerRow = mode === 'volume' ? 5 : 4 // volume: 5 diameters, mass: 4 time points

  const updateGroup = (idx: number, patch: Partial<ConcGroup>) => {
    if (mode === 'volume') {
      setGroups(prev => prev.map((g, i) => i === idx ? { ...g, ...patch } : g))
    } else {
      setMassGroups(prev => prev.map((g, i) => i === idx ? { ...g, ...patch } : g))
    }
    setSyncStatus('idle')
  }

  const addGroup = () => {
    if (mode === 'volume') {
      setGroups(prev => [...prev, { conc: '', samples: 1 }])
    } else {
      setMassGroups(prev => [...prev, { conc: '', samples: 1 }])
    }
    setSyncStatus('idle')
  }

  const removeGroup = (idx: number) => {
    if (mode === 'volume') {
      setGroups(prev => prev.filter((_, i) => i !== idx))
    } else {
      setMassGroups(prev => prev.filter((_, i) => i !== idx))
    }
    setSyncStatus('idle')
  }

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    if (file.name.endsWith('.txt') || file.type.startsWith('text/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setTextData(ev.target?.result as string)
        setSyncStatus('idle')
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        const cleaned = result.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '\n')
        setTextData(cleaned)
        setSyncStatus('idle')
      }
      reader.readAsText(file)
    }
  }

  const parsed = textData.trim() ? parseTextData(textData, activeGroups, valuesPerRow) : { rows: [], errors: [] }

  const syncToSheet = async () => {
    if (mode === 'volume' && !timeLabel.trim()) { setError('Enter a time point (e.g. t=47h).'); return }
    if (parsed.rows.length === 0) { setError('No data to sync.'); return }
    if (parsed.errors.length > 0) { setError('Fix parsing errors first.'); return }

    setSyncStatus('syncing')
    setError('')
    try {
      if (mode === 'volume') {
        await fetch(appsScriptUrl, {
          method: 'POST',
          body: JSON.stringify({
            sheetType: 'volume',
            timeLabel: timeLabel.trim(),
            batch: parsed.rows.map(r => ({
              concentration: r.conc,
              sample: r.sample,
              values: r.values.slice(0, 5),
            })),
          }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          mode: 'no-cors',
        })
      } else {
        // Mass mode: write 4 mass values into columns C~F
        await fetch(appsScriptUrl, {
          method: 'POST',
          body: JSON.stringify({
            sheetType: 'mass',
            batch: parsed.rows.map(r => ({
              concentration: r.conc,
              sample: r.sample,
              values: r.values.slice(0, 4),
            })),
          }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          mode: 'no-cors',
        })
      }
      setSyncStatus('done')
    } catch (err) {
      setSyncStatus('error')
      setError('Failed: ' + (err as Error).message)
    }
  }

  const reset = () => {
    setSyncStatus('idle')
    setTextData('')
    setFileName('')
    setError('')
  }

  const switchMode = (m: ImportMode) => {
    setMode(m)
    setTextData('')
    setFileName('')
    setSyncStatus('idle')
    setError('')
  }

  const expectedRows = totalExpected(activeGroups)

  // Column headers for preview
  const previewCols = mode === 'volume'
    ? ['Dia_1', 'Dia_2', 'Dia_3', 'Dia_4', 'Dia_5']
    : ['t=0h', 't=18h', 't=23h', 't=48h']

  return (
    <div className="space-y-4">
      {/* Mode switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => switchMode('volume')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            mode === 'volume' ? 'bg-white shadow-sm text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
          }`}
        >
          Volume (Diameter)
        </button>
        <button
          onClick={() => switchMode('mass')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            mode === 'mass' ? 'bg-white shadow-sm text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
          }`}
        >
          Mass
        </button>
      </div>

      {/* Config */}
      <Card>
        <h2 className="text-base font-bold mb-3">Experiment Data Importer</h2>
        <p className="text-sm text-[var(--color-muted)] mb-4">
          {mode === 'volume'
            ? 'Each line = 5 diameter values for one sample. Auto-creates time block in volume sheet.'
            : 'Each line = 4 mass values (t=0h, t=18h, t=23h, t=48h) for one sample. Writes to mass sheet with auto percent change formulas.'}
        </p>

        {/* Time point - only for volume */}
        {mode === 'volume' && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Time Point</label>
            <input
              type="text"
              value={timeLabel}
              onChange={(e) => { setTimeLabel(e.target.value); setSyncStatus('idle') }}
              placeholder="e.g. t=47h"
              className="w-full max-w-xs px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}

        {/* Concentration groups */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[var(--color-muted)]">Concentration Groups</label>
            <Button size="sm" variant="ghost" onClick={addGroup}>+ Add Group</Button>
          </div>
          <div className="space-y-2">
            {activeGroups.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-muted)] w-6">#{i + 1}</span>
                <input
                  type="text"
                  value={g.conc}
                  onChange={(e) => updateGroup(i, { conc: e.target.value })}
                  placeholder="Conc %"
                  className="flex-1 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
                />
                <span className="text-xs text-[var(--color-muted)]">samples:</span>
                <input
                  type="number"
                  value={g.samples}
                  onChange={(e) => updateGroup(i, { samples: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={10}
                  className="w-16 px-2 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
                />
                <button
                  onClick={() => removeGroup(i)}
                  className="text-xs text-red-400 hover:text-red-600 px-1"
                  disabled={activeGroups.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-2 font-mono">
            Total: {expectedRows} rows / {valuesPerRow} values per line
          </div>
        </div>
      </Card>

      {/* Data input */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Data Input</h3>
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] bg-white hover:bg-gray-50 cursor-pointer">
              Upload .txt
              <input type="file" accept=".txt,.docx,.doc,text/*" onChange={onFileUpload} className="hidden" />
            </label>
            {fileName && <span className="text-xs text-[var(--color-muted)] self-center">{fileName}</span>}
          </div>
        </div>

        <textarea
          value={textData}
          onChange={(e) => { setTextData(e.target.value); setFileName(''); setSyncStatus('idle') }}
          placeholder={mode === 'volume'
            ? `Paste data: 5 diameter values per line.\n\n9239.71 9196.33 9203.01 9302.72 9215.09\n9187.00 9297.55 9183.15 9241.80 9172.47\n...`
            : `Paste data: 4 mass values per line (t=0h, t=18h, t=23h, t=48h).\n\n389.0 401.7 451.7 366.0\n372.0 379.3 412.3 351.4\n...`
          }
          rows={8}
          className="w-full px-3 py-2 text-sm font-mono border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)] resize-y"
        />

        {textData.trim() && (
          <div className="text-xs text-[var(--color-muted)] mt-2">
            {textData.trim().split('\n').filter(l => l.trim()).length} lines detected / {expectedRows} expected
          </div>
        )}
      </Card>

      {/* Preview table */}
      {parsed.rows.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold mb-3">Preview ({parsed.rows.length} rows)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                  <th className="text-left py-1.5 px-2">Conc %</th>
                  <th className="text-left py-1.5 px-2">Sample</th>
                  {previewCols.map(c => (
                    <th key={c} className="text-right py-1.5 px-2">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {parsed.rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]/50 hover:bg-gray-50">
                    <td className="py-1.5 px-2 font-sans font-medium">{r.conc}</td>
                    <td className="py-1.5 px-2 font-sans">{r.sample}</td>
                    {Array.from({ length: valuesPerRow }, (_, j) => (
                      <td key={j} className="text-right py-1.5 px-2">
                        {r.values[j]?.toFixed(2) ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsed.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {parsed.errors.map((e, i) => (
                <div key={i} className="text-xs text-amber-600">{e}</div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Sync */}
      {parsed.rows.length > 0 && parsed.errors.length === 0 && (
        <div className="flex gap-2">
          <Button
            onClick={syncToSheet}
            disabled={syncStatus === 'syncing' || (mode === 'volume' && !timeLabel.trim())}
            className="flex-1"
          >
            {syncStatus === 'syncing' ? 'Syncing...' :
             syncStatus === 'done' ? `Synced ${parsed.rows.length} rows` :
             mode === 'volume'
               ? `Send ${parsed.rows.length} rows to volume sheet (${timeLabel.trim() || '...'})`
               : `Send ${parsed.rows.length} rows to mass sheet`}
          </Button>
          {syncStatus === 'done' && (
            <Button variant="outline" onClick={reset}>Import Another</Button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Setup */}
      <Card>
        <details>
          <summary className="text-sm font-bold cursor-pointer">Apps Script Setup & Code</summary>
          <div className="mt-3 space-y-3 text-sm text-[var(--color-muted)]">
            <div>
              <label className="block text-xs font-medium mb-1">Apps Script Web App URL</label>
              <input
                type="text"
                value={appsScriptUrl}
                onChange={(e) => setAppsScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            <div className="space-y-1">
              <p className="font-medium text-[var(--color-text)]">How to set up (one-time):</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Open your Google Sheet</li>
                <li>Go to <b>Extensions</b> → <b>Apps Script</b></li>
                <li>Delete any existing code, paste the full code below</li>
                <li>Click <b>Deploy</b> → <b>New deployment</b></li>
                <li>Type: <b>Web app</b>, Execute as: <b>Me</b>, Who has access: <b>Anyone</b></li>
                <li>Click <b>Deploy</b>, authorize your Google account</li>
                <li>Copy the <b>Web App URL</b> and paste it above</li>
              </ol>
            </div>

            <p>The script handles both Volume and Mass sheets automatically:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li><b>Volume mode</b>: writes 5 diameter values per sample, auto-creates time blocks with vol/std formulas</li>
              <li><b>Mass mode</b>: writes 4 mass values per sample (t=0h/18h/23h/48h), auto-fills percent change formulas</li>
            </ul>

            <p className="font-medium text-[var(--color-text)]">Full Apps Script code:</p>
            <pre className="p-3 bg-gray-900 text-green-300 rounded-lg text-xs overflow-auto font-mono max-h-[500px]">{`function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents)
      return jsonOut({ error: 'No POST data' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    if (data.sheetType === 'mass') {
      return handleMass(data, ss);
    }
    return handleVolume(data, ss);
  } catch(err) {
    return jsonOut({ error: String(err) });
  }
}

// ── Volume sheet ──
function handleVolume(data, ss) {
  var sheet = ss.getSheetByName('volume');
  var timeLabel = data.timeLabel;

  var lastRow = Math.max(sheet.getLastRow(), 1);
  var labels = sheet.getRange(1, 1, lastRow, 1).getValues();
  var blockStart = -1;
  for (var i = 0; i < labels.length; i++) {
    if (labels[i][0] === timeLabel) {
      blockStart = i + 1; break;
    }
  }

  if (blockStart === -1) {
    blockStart = lastRow + 2;
    sheet.getRange(blockStart, 1).setValue(timeLabel);

    var batch = data.batch || [];
    var groups = [];
    var cc = null, sc = 0;
    batch.forEach(function(item) {
      if (cc !== item.concentration) {
        if (cc !== null) groups.push({conc: cc, samples: sc});
        cc = item.concentration; sc = 1;
      } else sc++;
    });
    if (cc !== null) groups.push({conc: cc, samples: sc});

    var headers = [
      'Concentration_%(w/v)','Sample',
      'Dia_1','Dia_2','Dia_3','Dia_4','Dia_5',
      'vol_1','vol_2','vol_3','vol_4','vol_5',
      'vol_avg','std_vol','percent change in volume_%'
    ];
    sheet.getRange(blockStart+1, 1, 1, headers.length)
      .setValues([headers]);

    var row = blockStart + 2;
    groups.forEach(function(g) {
      for (var s = 0; s < g.samples; s++) {
        if (s === 0)
          sheet.getRange(row, 1).setValue(parseFloat(g.conc));
        sheet.getRange(row, 2).setValue(s + 1);
        ['C','D','E','F','G'].forEach(function(dc, idx) {
          sheet.getRange(row, 8 + idx).setFormula(
            '=(4/3)*PI()*(' + dc + row + '/2)^3/1000000');
        });
        sheet.getRange(row, 13).setFormula(
          '=AVERAGE(H' + row + ':L' + row + ')');
        sheet.getRange(row, 14).setFormula(
          '=STDEV(H' + row + ':L' + row + ')');
        row++;
      }
    });

    // percent change referencing t=0h
    var t0Start = -1;
    for (var i = 0; i < labels.length; i++) {
      if (labels[i][0] === 't=0h') { t0Start = i + 1; break; }
    }
    if (t0Start !== -1 && timeLabel !== 't=0h') {
      var t0Data = t0Start + 2;
      var off2 = 0, row2 = blockStart + 2;
      groups.forEach(function(g) {
        for (var s = 0; s < g.samples; s++) {
          var t0Row = t0Data + off2 + s;
          sheet.getRange(row2 + s, 15).setFormula(
            '=(M' + (row2 + s) + '-M' + t0Row + ')/M' + t0Row);
        }
        off2 += g.samples; row2 += g.samples;
      });
    }
  }

  // Write batch data
  var batch2 = data.batch || [];
  var groups2 = [];
  var cc2 = null, sc2 = 0;
  batch2.forEach(function(item) {
    if (cc2 !== item.concentration) {
      if (cc2 !== null) groups2.push({conc: cc2, samples: sc2});
      cc2 = item.concentration; sc2 = 1;
    } else sc2++;
  });
  if (cc2 !== null) groups2.push({conc: cc2, samples: sc2});

  batch2.forEach(function(item) {
    var groupOff = 0;
    for (var i = 0; i < groups2.length; i++) {
      if (groups2[i].conc === String(item.concentration)) break;
      groupOff += groups2[i].samples;
    }
    var targetRow = blockStart + 2 + groupOff + (item.sample - 1);
    var vals = item.values.slice(0, 5);
    while (vals.length < 5) vals.push(0);
    sheet.getRange(targetRow, 3, 1, 5).setValues([vals]);
  });

  return jsonOut({ ok: true, count: batch2.length });
}

// ── Mass sheet ──
function handleMass(data, ss) {
  var sheet = ss.getSheetByName('mass');
  var batch = data.batch || [];

  var groups = [];
  var cc = null, sc = 0;
  batch.forEach(function(item) {
    if (cc !== item.concentration) {
      if (cc !== null) groups.push({conc: cc, samples: sc});
      cc = item.concentration; sc = 1;
    } else sc++;
  });
  if (cc !== null) groups.push({conc: cc, samples: sc});

  // Row 1 = headers, data starts Row 2
  batch.forEach(function(item) {
    var groupOff = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].conc === String(item.concentration)) break;
      groupOff += groups[i].samples;
    }
    var row = 2 + groupOff + (item.sample - 1);

    if (item.sample === 1)
      sheet.getRange(row, 1).setValue(parseFloat(item.concentration));
    sheet.getRange(row, 2).setValue(item.sample);

    // C~F = mass values (t=0h, t=18h, t=23h, t=48h)
    var vals = item.values.slice(0, 4);
    while (vals.length < 4) vals.push(0);
    sheet.getRange(row, 3, 1, 4).setValues([vals]);

    // G = (D-C)/C*100
    sheet.getRange(row, 7).setFormula(
      '=(D' + row + '-C' + row + ')/C' + row + '*100');
    // H = (E-D)/D*100
    sheet.getRange(row, 8).setFormula(
      '=(E' + row + '-D' + row + ')/D' + row + '*100');
    // I = (F-E)/E*100
    sheet.getRange(row, 9).setFormula(
      '=(F' + row + '-E' + row + ')/E' + row + '*100');
  });

  return jsonOut({ ok: true, count: batch.length });
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({status:'alive'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(
    JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`}</pre>
          </div>
        </details>
      </Card>
    </div>
  )
}
