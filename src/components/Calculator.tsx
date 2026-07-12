import { useState, useMemo, useEffect } from 'react'
import { Card } from './ui'

// ── Safe expression evaluator ────────────────────

function evaluate(expr: string): number {
  // Replace ^ with **
  let s = expr.replace(/\^/g, '**')
  // Replace function names
  s = s.replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|log|ln|log2|exp|sqrt|cbrt|abs|floor|ceil|round|pow|max|min|sign)\b/g, 'Math.$1')
  // ln is not Math.ln, fix it
  s = s.replace(/\bMath\.ln\b/g, 'Math.log')
  // log should be log10 in calculator convention
  s = s.replace(/\bMath\.log\b(?!2|10)/g, 'Math.log10')
  // Replace constants
  s = s.replace(/\bpi\b/gi, 'Math.PI').replace(/(?<!\w)e(?!\w)/g, 'Math.E')
  // eslint-disable-next-line no-new-func
  const result = new Function('"use strict"; return (' + s + ')')()
  if (typeof result !== 'number' || isNaN(result)) throw new Error('Invalid')
  return result
}

// ── Geometry formulas ────────────────────────────

const GEOMETRY_FORMULAS = [
  {
    id: 'circle-area',
    name: 'Circle Area',
    icon: '◯',
    inputs: [{ label: 'Radius r', default: '' }],
    altInput: { label: 'Diameter d' },
    unit: '²',
    calc: (v: number[]) => Math.PI * v[0] ** 2,
  },
  {
    id: 'circle-perim',
    name: 'Circle Perimeter',
    icon: '◯',
    inputs: [{ label: 'Radius r', default: '' }],
    altInput: { label: 'Diameter d' },
    unit: '',
    calc: (v: number[]) => 2 * Math.PI * v[0],
  },
  {
    id: 'sphere-sa',
    name: 'Sphere Surface Area',
    icon: '⬤',
    inputs: [{ label: 'Radius r', default: '' }],
    altInput: { label: 'Diameter d' },
    unit: '²',
    calc: (v: number[]) => 4 * Math.PI * v[0] ** 2,
  },
  {
    id: 'sphere-vol',
    name: 'Sphere Volume',
    icon: '⬤',
    inputs: [{ label: 'Radius r', default: '' }],
    altInput: { label: 'Diameter d' },
    unit: '³',
    calc: (v: number[]) => (4 / 3) * Math.PI * v[0] ** 3,
  },
  {
    id: 'cylinder-vol',
    name: 'Cylinder Volume',
    icon: '⌭',
    inputs: [{ label: 'Radius r', default: '' }, { label: 'Height h', default: '' }],
    unit: '³',
    calc: (v: number[]) => Math.PI * v[0] ** 2 * v[1],
  },
  {
    id: 'cylinder-sa',
    name: 'Cylinder Surface Area',
    icon: '⌭',
    inputs: [{ label: 'Radius r', default: '' }, { label: 'Height h', default: '' }],
    unit: '²',
    calc: (v: number[]) => 2 * Math.PI * v[0] * (v[0] + v[1]),
  },
  {
    id: 'cone-vol',
    name: 'Cone Volume',
    icon: '▲',
    inputs: [{ label: 'Radius r', default: '' }, { label: 'Height h', default: '' }],
    unit: '³',
    calc: (v: number[]) => (1 / 3) * Math.PI * v[0] ** 2 * v[1],
  },
  {
    id: 'cone-sa',
    name: 'Cone Surface Area',
    icon: '▲',
    inputs: [{ label: 'Radius r', default: '' }, { label: 'Slant l', default: '' }],
    unit: '²',
    calc: (v: number[]) => Math.PI * v[0] * (v[0] + v[1]),
  },
  {
    id: 'rect-vol',
    name: 'Rectangular Box Volume',
    icon: '▢',
    inputs: [{ label: 'Length', default: '' }, { label: 'Width', default: '' }, { label: 'Height', default: '' }],
    unit: '³',
    calc: (v: number[]) => v[0] * v[1] * v[2],
  },
  {
    id: 'rect-sa',
    name: 'Rectangular Box Surface Area',
    icon: '▢',
    inputs: [{ label: 'Length', default: '' }, { label: 'Width', default: '' }, { label: 'Height', default: '' }],
    unit: '²',
    calc: (v: number[]) => 2 * (v[0] * v[1] + v[1] * v[2] + v[0] * v[2]),
  },
  {
    id: 'triangle-area',
    name: 'Triangle Area',
    icon: '△',
    inputs: [{ label: 'Base b', default: '' }, { label: 'Height h', default: '' }],
    unit: '²',
    calc: (v: number[]) => 0.5 * v[0] * v[1],
  },
  {
    id: 'trapezoid-area',
    name: 'Trapezoid Area',
    icon: '⏢',
    inputs: [{ label: 'Top a', default: '' }, { label: 'Bottom b', default: '' }, { label: 'Height h', default: '' }],
    unit: '²',
    calc: (v: number[]) => 0.5 * (v[0] + v[1]) * v[2],
  },
]

// ── Calculator component ─────────────────────────

export default function Calculator() {
  const [expr, setExpr] = useState(() => {
    try { return localStorage.getItem('calc-expr') || '' } catch { return '' }
  })
  const [history, setHistory] = useState<{ expr: string; result: string }[]>(() => {
    try { const raw = localStorage.getItem('calc-history'); return raw ? JSON.parse(raw) : [] } catch { return [] }
  })
  const [digits, setDigits] = useState(() => {
    try { const raw = localStorage.getItem('calc-digits'); return raw ? JSON.parse(raw) : 6 } catch { return 6 }
  })

  // Geometry state
  const [geoInputs, setGeoInputs] = useState<Record<string, string[]>>(() => {
    try { const raw = localStorage.getItem('calc-geo-inputs'); return raw ? JSON.parse(raw) : {} } catch { return {} }
  })
  const [activeGeo, setActiveGeo] = useState(() => {
    try { return localStorage.getItem('calc-active-geo') || GEOMETRY_FORMULAS[0].id } catch { return GEOMETRY_FORMULAS[0].id }
  })

  useEffect(() => { localStorage.setItem('calc-expr', expr) }, [expr])
  useEffect(() => { localStorage.setItem('calc-history', JSON.stringify(history)) }, [history])
  useEffect(() => { localStorage.setItem('calc-digits', JSON.stringify(digits)) }, [digits])
  useEffect(() => { localStorage.setItem('calc-geo-inputs', JSON.stringify(geoInputs)) }, [geoInputs])
  useEffect(() => { localStorage.setItem('calc-active-geo', activeGeo) }, [activeGeo])

  const result = useMemo(() => {
    if (!expr.trim()) return ''
    try {
      const r = evaluate(expr)
      if (isNaN(r)) return 'Error'
      return r.toFixed(digits).replace(/\.?0+$/, '')
    } catch {
      return 'Error'
    }
  }, [expr, digits])

  function handleCalc() {
    if (!expr.trim() || result === 'Error') return
    setHistory((prev) => [{ expr, result }, ...prev].slice(0, 20))
  }

  function clearHistory() {
    setHistory([])
  }

  function appendToExpr(s: string) {
    setExpr((prev) => prev + s)
  }

  // Track whether using diameter input for circle/sphere formulas
  const [useDiameter, setUseDiameter] = useState(() => {
    try { return localStorage.getItem('calc-use-diameter') === 'true' } catch { return false }
  })
  useEffect(() => { localStorage.setItem('calc-use-diameter', String(useDiameter)) }, [useDiameter])

  const activeFormula = GEOMETRY_FORMULAS.find((f) => f.id === activeGeo)!
  const geoInputValues = geoInputs[activeGeo] || activeFormula.inputs.map((i) => i.default)
  const geoResult = useMemo(() => {
    let nums = geoInputValues.map((v) => parseFloat(v))
    if (nums.some((n) => isNaN(n))) return null
    // If using diameter mode for circle/sphere, convert to radius
    if (useDiameter && activeFormula.altInput) {
      nums = nums.map((n) => n / 2)
    }
    try {
      const r = activeFormula.calc(nums)
      return isNaN(r) ? null : r
    } catch { return null }
  }, [geoInputValues, activeFormula, useDiameter])

  function setGeoInput(idx: number, val: string) {
    setGeoInputs((prev) => {
      const arr = [...(prev[activeGeo] || activeFormula.inputs.map((i) => i.default))]
      arr[idx] = val
      return { ...prev, [activeGeo]: arr }
    })
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Calculator */}
      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-bold mb-3">Calculator</h2>
          {/* Display */}
          <div className="mb-3">
            <input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCalc()}
              placeholder="e.g. 2*sin(pi/4) + 3^2"
              className="w-full text-lg font-mono border border-[var(--color-border)] rounded-lg px-3 py-3 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="text-2xl font-mono font-bold text-[var(--color-accent)] min-h-[2rem]">
                {result && result !== 'Error' ? `= ${result}` : result === 'Error' ? 'Error' : ''}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={digits}
                  onChange={(e) => setDigits(Number(e.target.value))}
                  className="text-xs border border-[var(--color-border)] rounded-lg px-2 py-1 bg-white cursor-pointer outline-none"
                >
                  {[2, 4, 6, 8, 10].map((d) => <option key={d} value={d}>{d} dp</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { l: 'sin', v: 'sin(' }, { l: 'cos', v: 'cos(' }, { l: 'tan', v: 'tan(' },
              { l: 'π', v: 'pi' }, { l: 'e', v: 'e' },
              { l: 'log', v: 'log(' }, { l: 'ln', v: 'ln(' }, { l: '√', v: 'sqrt(' },
              { l: 'x²', v: '^2' }, { l: 'xʸ', v: '^' },
              { l: '(', v: '(' }, { l: ')', v: ')' }, { l: '7', v: '7' },
              { l: '8', v: '8' }, { l: '9', v: '9' },
              { l: 'C', v: 'CLEAR' }, { l: '⌫', v: 'BACK' }, { l: '4', v: '4' },
              { l: '5', v: '5' }, { l: '6', v: '6' },
              { l: '+', v: '+' }, { l: '-', v: '-' }, { l: '1', v: '1' },
              { l: '2', v: '2' }, { l: '3', v: '3' },
              { l: '×', v: '*' }, { l: '÷', v: '/' }, { l: '0', v: '0' },
              { l: '.', v: '.' }, { l: '=', v: 'ENTER' },
            ].map((btn) => (
              <button
                key={btn.l}
                onClick={() => {
                  if (btn.v === 'CLEAR') setExpr('')
                  else if (btn.v === 'BACK') setExpr((prev) => prev.slice(0, -1))
                  else if (btn.v === 'ENTER') handleCalc()
                  else appendToExpr(btn.v)
                }}
                className={`text-sm font-mono rounded-lg py-2.5 transition-all active:scale-95 ${
                  btn.v === 'ENTER'
                    ? 'bg-[var(--color-accent)] text-white font-bold col-span-1 hover:opacity-90'
                    : btn.v === 'CLEAR' || btn.v === 'BACK'
                    ? 'bg-red-50 text-red-500 hover:bg-red-100'
                    : ['+', '-', '*', '/'].includes(btn.v) || btn.v === '^'
                    ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 font-semibold'
                    : ['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'sqrt(', 'pi', 'e'].includes(btn.v) || btn.v === '(' || btn.v === ')' || btn.v === '^2' || btn.v === '^'
                    ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 text-xs'
                    : 'bg-gray-50 hover:bg-gray-100 font-semibold'
                }`}
              >
                {btn.l}
              </button>
            ))}
          </div>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">History</h3>
              <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-600">Clear</button>
            </div>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpr(h.expr)}
                >
                  <span className="text-[var(--color-muted)]">{h.expr}</span>
                  <span className="font-semibold text-[var(--color-accent)]">= {h.result}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Quick reference */}
        <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
          <h3 className="text-xs font-bold mb-2">Supported Functions</h3>
          <p className="text-xs text-[var(--color-muted)] font-mono leading-relaxed">
            sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, log (base 10), ln (natural), log2, exp, sqrt, cbrt, abs, floor, ceil, round, pow, max, min, sign, pi, e
          </p>
        </Card>
      </div>

      {/* Geometry shortcuts */}
      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-bold mb-3">Geometry & Formulas</h2>

          {/* Formula selector */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {GEOMETRY_FORMULAS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveGeo(f.id)}
                className={`text-xs px-2.5 py-1.5 rounded-lg transition-all ${
                  activeGeo === f.id
                    ? 'bg-[var(--color-accent)] text-white font-semibold'
                    : 'bg-gray-100 text-[var(--color-muted)] hover:bg-gray-200'
                }`}
              >
                <span className="font-mono mr-1">{f.icon}</span>{f.name}
              </button>
            ))}
          </div>

          {/* Active formula inputs */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl font-mono">{activeFormula.icon}</span>
                <h3 className="text-sm font-bold">{activeFormula.name}</h3>
              </div>
              {/* Radius / Diameter toggle */}
              {activeFormula.altInput && (
                <div className="flex items-center bg-white rounded-lg border border-[var(--color-border)] p-0.5">
                  <button
                    onClick={() => setUseDiameter(false)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all ${!useDiameter ? 'bg-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}
                  >Radius</button>
                  <button
                    onClick={() => setUseDiameter(true)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-all ${useDiameter ? 'bg-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}
                  >Diameter</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {activeFormula.inputs.map((inp, idx) => {
                const label = useDiameter && activeFormula.altInput && idx === 0
                  ? activeFormula.altInput.label
                  : inp.label
                return (
                  <div key={idx}>
                    <label className="text-xs text-[var(--color-muted)] block mb-1">{label}</label>
                    <input
                      type="number"
                      value={geoInputValues[idx] || ''}
                      onChange={(e) => setGeoInput(idx, e.target.value)}
                      placeholder="0"
                      step="any"
                      className="w-full text-sm font-mono border border-[var(--color-border)] rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                  </div>
                )
              })}
            </div>
            {geoResult !== null && (
              <div className="flex items-center justify-between bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20 rounded-lg px-4 py-3">
                <span className="text-xs text-[var(--color-muted)]">Result</span>
                <span className="text-xl font-mono font-bold text-[var(--color-accent)]">
                  {geoResult.toFixed(digits).replace(/\.?0+$/, '')}
                  <span className="text-sm font-normal ml-1">{activeFormula.unit}</span>
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Formula reference */}
        <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
          <h3 className="text-xs font-bold mb-2">Formula Reference</h3>
          <div className="grid grid-cols-1 gap-1 text-xs font-mono text-[var(--color-muted)]">
            <div>Circle Area: πr²</div>
            <div>Circle Perimeter: 2πr</div>
            <div>Sphere Volume: ⁴⁄₃πr³</div>
            <div>Sphere SA: 4πr²</div>
            <div>Cylinder Volume: πr²h</div>
            <div>Cone Volume: ⅓πr²h</div>
            <div>Triangle Area: ½bh</div>
            <div>Trapezoid Area: ½(a+b)h</div>
          </div>
        </Card>
      </div>
    </div>
  )
}
