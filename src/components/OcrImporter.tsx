import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, Button } from './ui'

const STORAGE_KEY = 'science-stats-importer'

interface ImporterSettings {
  timeLabel: string
  concentration: string
  sample: string
  appsScriptUrl: string
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

// clearSettings available if needed
// function clearSettings() {
//   try { localStorage.removeItem(STORAGE_KEY) } catch {}
// }

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
  const regex = /\[?(\d+)\]?\s*:?\s*(\d{3,6}(?:\.\d{1,4})?)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1])
    const value = parseFloat(match[2])
    if (!isNaN(value) && index >= 1 && index <= 20) {
      results.push({ index, value, rawText: match[0] })
    }
  }
  results.sort((a, b) => a.index - b.index)
  return results
}

import { createWorker } from 'tesseract.js'

/**
 * Preprocess image for better OCR:
 * 1. Scale up 2x
 * 2. Grayscale
 * 3. Boost contrast
 * 4. Sharpen text edges
 */
async function preprocessImage(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = img.width * scale
  canvas.height = img.height * scale
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data

  // Grayscale + contrast boost
  const contrast = 1.8
  const intercept = 128 * (1 - contrast)
  for (let i = 0; i < d.length; i += 4) {
    // Check if pixel is bright (likely text overlay)
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const brightness = (r + g + b) / 3
    const adjusted = Math.min(255, Math.max(0, brightness * contrast + intercept))
    // Make bright pixels white, dark pixels black (threshold)
    const val = adjusted > 140 ? 255 : adjusted < 80 ? 0 : adjusted
    d[i] = d[i + 1] = d[i + 2] = val
  }
  ctx.putImageData(imageData, 0, 0)

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png')!)
}

async function runOcr(imageFile: File, onProgress?: (p: number) => void): Promise<string> {
  // Preprocess first
  const processed = await preprocessImage(imageFile)

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress)
      }
    }
  })

  const { data: { text } } = await worker.recognize(processed)
  await worker.terminate()
  return text
}

// ── Component ──────────────────────────────────────────────────────

export default function OcrImporter() {
  const saved = loadSettings()
  const [timeLabel, setTimeLabel] = useState(saved.timeLabel ?? '')
  const [concentration, setConcentration] = useState(saved.concentration ?? '10')
  const [sample, setSample] = useState(saved.sample ?? '1')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrResults, setOcrResults] = useState<OcrResult[]>([])
  const [rawText, setRawText] = useState('')
  const [error, setError] = useState('')
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    saved.appsScriptUrl ??
    'https://script.google.com/macros/s/AKfycbxzDS4r_F4kw5730dQ0AgHZGBKtBAc1aOTznKUhLIaBxH9nf9-jB-UduArizPL7JPL6nA/exec'
  )
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')

  // Persist settings on change
  useEffect(() => { saveSettings({ timeLabel }) }, [timeLabel])
  useEffect(() => { saveSettings({ concentration }) }, [concentration])
  useEffect(() => { saveSettings({ sample }) }, [sample])
  useEffect(() => { saveSettings({ appsScriptUrl }) }, [appsScriptUrl])

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

  // Quick manual fill: paste/type 5 values at once
  const [bulkInput, setBulkInput] = useState('')
  const applyBulk = () => {
    const nums = bulkInput.split(/[\s,\n]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    if (nums.length === 0) return
    const results: OcrResult[] = nums.slice(0, 10).map((n, i) => ({ index: i + 1, value: n, rawText: '' }))
    setOcrResults(results)
    setBulkInput('')
  }

  // Start with empty 5 slots for manual mode
  const startManual = () => {
    setOcrResults([
      { index: 1, value: 0, rawText: '' },
      { index: 2, value: 0, rawText: '' },
      { index: 3, value: 0, rawText: '' },
      { index: 4, value: 0, rawText: '' },
      { index: 5, value: 0, rawText: '' },
    ])
    setImageFile(null)
    setImagePreview(null)
    setRawText('')
    setError('')
  }

  const syncToSheet = async () => {
    if (!appsScriptUrl) {
      setError('Please set the Google Apps Script Web App URL first.')
      return
    }
    if (ocrResults.length === 0) {
      setError('No values to sync.')
      return
    }
    if (!timeLabel.trim()) {
      setError('Please enter a time point (e.g. t=47h).')
      return
    }

    setSyncStatus('syncing')
    setError('')
    try {
      const values = [...ocrResults].sort((a, b) => a.index - b.index).slice(0, 5).map(r => r.value)
      while (values.length < 5) values.push(0)

      // Google Apps Script POST does 302→GET redirect, use no-cors
      // The script auto-finds or creates the time block + row
      await fetch(appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify({
          timeLabel: timeLabel.trim(),
          concentration,
          sample: parseInt(sample),
          values: values,
        }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        mode: 'no-cors',
      })

      setSyncStatus('done')
    } catch (err) {
      setSyncStatus('error')
      setError('Failed to sync: ' + (err as Error).message)
    }
  }

  const reset = () => {
    setSyncStatus('idle')
    setOcrResults([])
    setRawText('')
    setImageFile(null)
    setImagePreview(null)
    setError('')
  }

  return (
    <div className="space-y-4" onPaste={onPaste} tabIndex={0}>
      {/* Condition selectors */}
      <Card>
        <h2 className="text-base font-bold mb-3">Experiment Data Importer</h2>
        <p className="text-sm text-[var(--color-muted)] mb-4">
          Upload a microscope screenshot, auto-extract diameter values, and sync to Google Sheets.
          New time points are created automatically.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Time Point</label>
            <input
              type="text"
              value={timeLabel}
              onChange={(e) => { setTimeLabel(e.target.value); setSyncStatus('idle') }}
              placeholder="e.g. t=47h"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            />
            <div className="text-[10px] text-[var(--color-muted)] mt-1">Free input, auto-creates new block</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Concentration %(w/v)</label>
            <select
              value={concentration}
              onChange={(e) => { setConcentration(e.target.value); setSyncStatus('idle') }}
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
              onChange={(e) => { setSample(e.target.value); setSyncStatus('idle') }}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
        </div>

        {/* Target preview */}
        {timeLabel.trim() && (
          <div className="text-xs text-[var(--color-muted)] font-mono p-2 bg-gray-50 rounded-lg">
            → {syncStatus === 'done'
              ? `Written to volume sheet: ${timeLabel.trim()}, ${concentration}%, Sample ${sample}`
              : `Will write to volume sheet: ${timeLabel.trim()}, ${concentration}%, Sample ${sample}, Dia_1 to Dia_5`
            }
          </div>
        )}
      </Card>

      {/* Image upload + OCR results side by side on wide screens */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Image upload */}
        <Card>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-4 text-center cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)]/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <div className="space-y-2">
                <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                <div className="text-xs text-[var(--color-muted)]">Click to change, or paste (Ctrl+V)</div>
              </div>
            ) : (
              <div className="py-6">
                <div className="text-3xl mb-2">📷</div>
                <div className="text-sm font-medium">Drop, click, or paste screenshot</div>
                <div className="text-xs text-[var(--color-muted)] mt-1">PNG, JPG from measurement software</div>
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
              <Button onClick={runOcrScan} disabled={ocrRunning} size="sm">
                {ocrRunning ? `Scanning... ${Math.round(ocrProgress * 100)}%` : '🔍 Extract Values'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setImageFile(null); setImagePreview(null); setOcrResults([]); setRawText('') }}>
                Clear
              </Button>
            </div>
          )}

          {ocrRunning && (
            <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[var(--color-accent)] h-full transition-all"
                style={{ width: `${Math.round(ocrProgress * 100)}%` }}
              />
            </div>
          )}

          {/* Manual input divider */}
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-px bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-muted)]">or enter manually</span>
              <div className="flex-1 h-px bg-[var(--color-border)]" />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Paste 5 values: 9170.57, 9095.94, ..."
                className="flex-1 px-3 py-2 text-sm font-mono border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
                onKeyDown={(e) => { if (e.key === 'Enter') applyBulk() }}
              />
              <Button size="sm" variant="outline" onClick={applyBulk} disabled={!bulkInput.trim()}>Fill</Button>
              <Button size="sm" variant="ghost" onClick={startManual}>5 Empty Slots</Button>
            </div>
          </div>
        </Card>

        {/* OCR Results */}
        <Card>
          {ocrResults.length > 0 ? (
            <>
              <h3 className="text-sm font-bold mb-3">Extracted Values</h3>
              <div className="space-y-2">
                {ocrResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-light)] flex items-center justify-center text-xs font-bold text-[var(--color-accent)]">
                      {r.index}
                    </div>
                    <input
                      type="number"
                      value={r.value}
                      onChange={(e) => { updateResult(i, e.target.value); setSyncStatus('idle') }}
                      step="0.01"
                      className="flex-1 px-2 py-1.5 text-sm font-mono border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <span className="text-xs text-[var(--color-muted)]">μm</span>
                    <button
                      onClick={() => removeResult(i)}
                      className="text-xs text-red-400 hover:text-red-600 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={addResult}>+ Add</Button>
                {ocrResults.length !== 5 && (
                  <span className="text-xs text-amber-500">
                    Expected 5 values, got {ocrResults.length}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted)] py-6">
              {ocrRunning ? 'Extracting...' : 'Values will appear here after scan'}
            </div>
          )}
        </Card>
      </div>

      {/* Sync button */}
      {ocrResults.length > 0 && (
        <div className="flex gap-2">
          <Button
            onClick={syncToSheet}
            disabled={syncStatus === 'syncing' || ocrResults.length === 0 || !timeLabel.trim()}
            className="flex-1"
          >
            {syncStatus === 'syncing' ? '⏳ Syncing...' :
             syncStatus === 'done' ? '✓ Synced to Google Sheets' :
             `→ Send to Google Sheets (${timeLabel.trim() || '...'}, ${concentration}%, #${sample})`}
          </Button>
          {syncStatus === 'done' && (
            <Button variant="outline" onClick={reset}>
              Import Another
            </Button>
          )}
        </div>
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

      {/* Setup */}
      <Card>
        <details>
          <summary className="text-sm font-bold cursor-pointer">⚙ Setup & Apps Script Code</summary>
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
            <p>If you need to recreate the Apps Script, paste this code:</p>
            <pre className="p-3 bg-gray-900 text-green-300 rounded-lg text-xs overflow-auto font-mono max-h-96">
{`function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents)
      return jsonOut({ error: 'No POST data' });

    const sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName('volume');
    const data = JSON.parse(e.postData.contents);
    const timeLabel = data.timeLabel;
    const concentration = String(data.concentration);
    const sample = parseInt(data.sample);
    const values = data.values;
    if (!timeLabel || !concentration || !sample || !values)
      return jsonOut({ error: 'Missing fields' });

    // Search column A for the time label
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const labels = sheet.getRange(1, 1, lastRow, 1).getValues();
    let blockStart = -1;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i][0] === timeLabel) {
        blockStart = i + 1; break;
      }
    }

    // If not found, create a new time block
    if (blockStart === -1) {
      blockStart = lastRow + 2;
      sheet.getRange(blockStart, 1).setValue(timeLabel);
      const headers = [
        'Concentration_%(w/v)','Sample',
        'Dia_1','Dia_2','Dia_3','Dia_4','Dia_5',
        'vol_1','vol_2','vol_3','vol_4','vol_5',
        'vol_avg','std_vol','percent change in volume_%'
      ];
      sheet.getRange(blockStart+1,1,1,headers.length)
        .setValues([headers]);

      var groups = [
        {conc:'10',samples:4},
        {conc:'9',samples:3},
        {conc:'8',samples:4}
      ];
      var row = blockStart + 2;
      groups.forEach(function(g) {
        sheet.getRange(row,1).setValue(parseFloat(g.conc));
        for (var s=1; s<=g.samples; s++) {
          sheet.getRange(row+s,2).setValue(s);
          ['C','D','E','F','G'].forEach(function(dc,idx){
            sheet.getRange(row+s,8+idx).setFormula(
              '=(4/3)*PI()*('+dc+(row+s)+'/2)^3/1000000');
          });
          sheet.getRange(row+s,13).setFormula(
            '=AVERAGE(H'+(row+s)+':L'+(row+s)+')');
          sheet.getRange(row+s,14).setFormula(
            '=STDEV(H'+(row+s)+':L'+(row+s)+')');
        }
        row += 1 + g.samples;
      });

      // percent change referencing t=0h block
      var t0Start = -1;
      for (var i=0; i< labels.length; i++) {
        if (labels[i][0]==='t=0h') { t0Start=i+1; break; }
      }
      if (t0Start!==-1 && timeLabel!=='t=0h') {
        var t0Data=t0Start+2, off2=0, row2=blockStart+2;
        groups.forEach(function(g){
          for (var s=1; s<=g.samples; s++) {
            var t0Row=t0Data+off2+s;
            sheet.getRange(row2+s,15).setFormula(
              '=(M'+(row2+s)+'-M'+t0Row+')/M'+t0Row);
          }
          off2+=1+g.samples; row2+=1+g.samples;
        });
      }
    }

    // Find target row within block
    var groups2=[
      {conc:'10',samples:4},
      {conc:'9',samples:3},
      {conc:'8',samples:4}
    ];
    var off=0, targetRow=-1;
    for (var i=0; i<groups2.length; i++) {
      if (groups2[i].conc===concentration) {
        targetRow=blockStart+2+off+(sample-1); break;
      }
      off+=1+groups2[i].samples;
    }
    if (targetRow===-1)
      return jsonOut({error:'Invalid concentration'});

    sheet.getRange(targetRow,3,1,5).setValues([values]);
    return jsonOut({ok:true,row:targetRow});
  } catch(err) {
    return jsonOut({error:String(err)});
  }
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
`}
            </pre>
          </div>
        </details>
      </Card>
    </div>
  )
}
