import { useState, useRef, useCallback } from 'react'
import { Card, Button } from './ui'

// ── Google Sheet layout (volume sheet) ─────────────────────────────
// Each time block starts with a header row, then data rows grouped by concentration.
// Row offsets within a time block (after header):
//   10% → samples 1..4
//   9%  → samples 1..3
//   8%  → samples 1..4
// Dia_1..Dia_5 → columns C..G (sheet columns 3..7)

interface SheetLayout {
  label: string          // e.g. "t=0h"
  headerRow: number      // 1-based row number of the second header (Concentration row)
  firstDataRow: number   // 1-based row number of first data row
}

// Layout parsed from the actual sheet
const SHEET_LAYOUTS: SheetLayout[] = [
  { label: 't=0h',  headerRow: 14,  firstDataRow: 15 },
  { label: 't=18h', headerRow: 27,  firstDataRow: 28 },
  { label: 't=23h', headerRow: 40,  firstDataRow: 41 },
  { label: 't=47h', headerRow: 53,  firstDataRow: 54 },
]

// Concentration groups: [concentration, sampleCount, labelRowIndex]
// Within each time block, rows are laid out as:
//   10% row (conc filled), then sample rows
//   9% row, then sample rows
//   8% row, then sample rows
const CONCENTRATION_GROUPS = [
  { conc: '10', samples: 4 },
  { conc: '9',  samples: 3 },
  { conc: '8',  samples: 4 },
]

/**
 * Find the sheet row for a given time label, concentration, and sample number.
 */
function findSheetRow(timeLabel: string, concentration: string, sample: number): number | null {
  const layout = SHEET_LAYOUTS.find(l => l.label === timeLabel)
  if (!layout) return null

  let rowOffset = 0
  for (const group of CONCENTRATION_GROUPS) {
    if (group.conc === concentration) {
      // concentration row itself + sample offset
      return layout.firstDataRow + rowOffset + sample
    }
    rowOffset += 1 + group.samples // conc label row + sample rows
  }
  return null
}

// ── OCR ────────────────────────────────────────────────────────────

interface OcrResult {
  index: number
  value: number
  rawText: string
}

/**
 * Extract measurement values from text like "[1]9170.57μm"
 */
function parseMeasurements(text: string): OcrResult[] {
  const results: OcrResult[] = []
  // Match patterns like [1]9170.57 or [1] 9170.57 or 1: 9170.57
  const regex = /\[?(\d+)\]?\s*:?\s*(\d{3,6}(?:\.\d{1,4})?)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1])
    const value = parseFloat(match[2])
    if (!isNaN(value) && index >= 1 && index <= 20) {
      results.push({ index, value, rawText: match[0] })
    }
  }
  // Sort by index
  results.sort((a, b) => a.index - b.index)
  return results
}

async function runOcr(imageFile: File, onProgress?: (p: number) => void): Promise<string> {
  const Tesseract = await import('tesseract.js')
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress)
      }
    }
  })

  const { data: { text } } = await worker.recognize(imageFile)
  await worker.terminate()
  return text
}

// ── Component ──────────────────────────────────────────────────────

export default function OcrImporter() {
  const [timeLabel, setTimeLabel] = useState('')
  const [concentration, setConcentration] = useState('10')
  const [sample, setSample] = useState('1')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrResults, setOcrResults] = useState<OcrResult[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')
  const [sheetUrl] = useState(
    'https://docs.google.com/spreadsheets/d/1WXWZ09Ya3VUIU0T6mOEvQ_BrlHAD4Rf5smLwRAuOUcc/edit#gid=0'
  )
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    'https://script.google.com/macros/s/AKfycbwiDLeSNYOgUIE8vcBNstuYnVK9zXaf7Ev-vTZIuWFIwaXNKOSC--PmF4hXChYPhkCecQ/exec'
  )
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setOcrResults([])
    setRawText('')
    setError('')
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) handleFile(file)
        break
      }
    }
  }

  const runOcrScan = async () => {
    if (!imageFile) return
    setOcrRunning(true)
    setOcrProgress(0)
    setError('')
    try {
      const text = await runOcr(imageFile, (p) => setOcrProgress(p))
      setRawText(text)
      const parsed = parseMeasurements(text)
      if (parsed.length === 0) {
        setError('No measurement values found. Make sure the image shows labeled values like [1]9170.57μm.')
      }
      setOcrResults(parsed)
    } catch (err) {
      setError('OCR failed: ' + (err as Error).message)
    } finally {
      setOcrRunning(false)
    }
  }

  const updateResult = (idx: number, newValue: string) => {
    setOcrResults(prev => prev.map((r, i) => 
      i === idx ? { ...r, value: parseFloat(newValue) || 0 } : r
    ))
  }

  const addResult = () => {
    const nextIndex = ocrResults.length > 0 ? Math.max(...ocrResults.map(r => r.index)) + 1 : 1
    setOcrResults(prev => [...prev, { index: nextIndex, value: 0, rawText: '' }])
  }

  const removeResult = (idx: number) => {
    setOcrResults(prev => prev.filter((_, i) => i !== idx))
  }

  const syncToSheet = async () => {
    if (!appsScriptUrl) {
      setError('Please set the Google Apps Script Web App URL first. See instructions below.')
      return
    }
    if (ocrResults.length === 0) {
      setError('No values to sync.')
      return
    }

    const targetRow = findSheetRow(timeLabel, concentration, parseInt(sample))
    if (!targetRow) {
      setError(`Could not find sheet row for ${timeLabel}, ${concentration}%, sample ${sample}. Check the time label matches (e.g. t=0h, t=18h, t=23h, t=47h).`)
      return
    }

    setSyncStatus('syncing')
    setError('')
    try {
      const values = [...ocrResults].sort((a, b) => a.index - b.index).slice(0, 5).map(r => r.value)
      while (values.length < 5) values.push(0)

      // Google Apps Script redirects POST 302→GET, so use no-cors mode
      // The response is opaque but the write still happens server-side
      await fetch(appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify({
          row: targetRow,
          values: values,
          timeLabel,
          concentration,
          sample: parseInt(sample),
        }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        mode: 'no-cors',
      })

      // no-cors gives opaque response, assume success (script returns {ok:true})
      setSyncStatus('done')
    } catch (err) {
      setSyncStatus('error')
      setError('Failed to sync: ' + (err as Error).message)
    }
  }

  return (
    <div className="space-y-4" onPaste={onPaste} tabIndex={0}>
      {/* Setup */}
      <Card>
        <h2 className="text-base font-bold mb-3">Experiment Data Importer</h2>
        <p className="text-sm text-[var(--color-muted)] mb-4">
          Upload a microscope screenshot, auto-extract diameter values, and sync to Google Sheets.
        </p>

        {/* Condition selectors */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Time Point</label>
            <input
              type="text"
              value={timeLabel}
              onChange={(e) => setTimeLabel(e.target.value)}
              placeholder="e.g. t=47h"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Concentration %(w/v)</label>
            <select
              value={concentration}
              onChange={(e) => setConcentration(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="10">10%</option>
              <option value="9">9%</option>
              <option value="8">8%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Sample</label>
            <select
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
        </div>

        {/* Target row preview */}
        {timeLabel && (
          <div className="text-xs text-[var(--color-muted)] mb-3 font-mono">
            → Target: Row {findSheetRow(timeLabel, concentration, parseInt(sample)) ?? '?'} 
            ({timeLabel}, {concentration}%, Sample {sample}, Dia_1 to Dia_5)
          </div>
        )}
      </Card>

      {/* Image upload */}
      <Card>
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-6 text-center cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]/30 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <div className="space-y-3">
              <img src={imagePreview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
              <div className="text-xs text-[var(--color-muted)]">Click to change image, or paste a screenshot (Ctrl+V)</div>
            </div>
          ) : (
            <div className="py-8">
              <div className="text-3xl mb-2">📷</div>
              <div className="text-sm font-medium">Drop image, click to upload, or paste (Ctrl+V)</div>
              <div className="text-xs text-[var(--color-muted)] mt-1">PNG, JPG screenshots from measurement software</div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
          />
        </div>

        {imageFile && (
          <div className="mt-3 flex gap-2">
            <Button onClick={runOcrScan} disabled={ocrRunning}>
              {ocrRunning ? `Scanning... ${Math.round(ocrProgress * 100)}%` : '🔍 Extract Values'}
            </Button>
            <Button variant="outline" onClick={() => { setImageFile(null); setImagePreview(null); setOcrResults([]); setRawText('') }}>
              Clear
            </Button>
          </div>
        )}
      </Card>

      {/* OCR Results */}
      {ocrResults.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold mb-3">Extracted Values</h3>
          <div className="space-y-2">
            {ocrResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center text-xs font-bold text-[var(--color-accent)]">
                  {r.index}
                </div>
                <input
                  type="number"
                  value={r.value}
                  onChange={(e) => updateResult(i, e.target.value)}
                  step="0.01"
                  className="flex-1 px-3 py-2 text-sm font-mono border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
                />
                <span className="text-xs text-[var(--color-muted)]">μm</span>
                <button
                  onClick={() => removeResult(i)}
                  className="text-xs text-red-400 hover:text-red-600 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={addResult}>+ Add value</Button>
            {ocrResults.length !== 5 && (
              <span className="text-xs text-amber-500">
                Expected 5 values for Dia_1 to Dia_5, got {ocrResults.length}
              </span>
            )}
          </div>

          {/* Sync button */}
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button
              onClick={syncToSheet}
              disabled={syncStatus === 'syncing' || ocrResults.length === 0}
              className="w-full"
            >
              {syncStatus === 'syncing' ? 'Syncing...' :
               syncStatus === 'done' ? '✓ Synced! Sync another?' :
               '→ Send to Google Sheets'}
            </Button>
          </div>
        </Card>
      )}

      {/* Raw OCR text (debug) */}
      {rawText && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--color-muted)]">Raw OCR Output</summary>
          <pre className="mt-2 p-3 bg-gray-50 rounded-lg overflow-auto whitespace-pre-wrap font-mono text-xs">
            {rawText}
          </pre>
        </details>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Setup instructions */}
      <Card>
        <details>
          <summary className="text-sm font-bold cursor-pointer">⚙ Setup Google Sheets Sync (one-time)</summary>
          <div className="mt-3 space-y-3 text-sm text-[var(--color-muted)]">
            <p>
              To enable writing data into your Google Sheet, you need to deploy a small Apps Script.
              This takes about 2 minutes:
            </p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Open your <a href={sheetUrl} target="_blank" className="text-[var(--color-accent)] underline">Google Sheet</a></li>
              <li>Go to <b>Extensions → Apps Script</b></li>
              <li>Delete any existing code, paste the script below:</li>
            </ol>
            <pre className="p-3 bg-gray-900 text-green-300 rounded-lg text-xs overflow-auto font-mono">
{`function doPost(e) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('volume');
  const { row, values } = JSON.parse(e.postData.contents);
  // Write Dia_1..Dia_5 into columns C..G (3..7)
  sheet.getRange(row, 3, 1, 5).setValues([values]);
  return ContentService
    .createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}`}
            </pre>
            <ol start={4} className="list-decimal list-inside space-y-1.5">
              <li>Click <b>Deploy → New deployment</b></li>
              <li>Type: <b>Web app</b></li>
              <li>Execute as: <b>Me</b></li>
              <li>Who has access: <b>Anyone</b></li>
              <li>Click <b>Deploy</b>, copy the Web App URL</li>
              <li>Paste it below:</li>
            </ol>
            <input
              type="text"
              value={appsScriptUrl}
              onChange={(e) => setAppsScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfy.../exec"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </details>
      </Card>
    </div>
  )
}
