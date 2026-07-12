import { useState, useRef, useEffect } from 'react'

const COMMON_UNITS = [
  // Length
  { symbol: 'nm', name: 'Nanometer' },
  { symbol: 'μm', name: 'Micrometer' },
  { symbol: 'mm', name: 'Millimeter' },
  { symbol: 'cm', name: 'Centimeter' },
  { symbol: 'dm', name: 'Decimeter' },
  { symbol: 'm', name: 'Meter' },
  { symbol: 'km', name: 'Kilometer' },
  // Volume
  { symbol: 'nL', name: 'Nanoliter' },
  { symbol: 'μL', name: 'Microliter' },
  { symbol: 'mL', name: 'Milliliter' },
  { symbol: 'L', name: 'Liter' },
  // Mass
  { symbol: 'ng', name: 'Nanogram' },
  { symbol: 'μg', name: 'Microgram' },
  { symbol: 'mg', name: 'Milligram' },
  { symbol: 'g', name: 'Gram' },
  { symbol: 'kg', name: 'Kilogram' },
  // Concentration
  { symbol: 'mg/mL', name: 'mg per mL' },
  { symbol: 'μg/mL', name: 'μg per mL' },
  { symbol: 'mol/L', name: 'Molar' },
  { symbol: 'mmol/L', name: 'Millimolar' },
  { symbol: 'μmol/L', name: 'Micromolar' },
  { symbol: '%', name: 'Percent' },
  { symbol: 'w/v%', name: 'Weight/Volume %' },
  // Time
  { symbol: 'ms', name: 'Millisecond' },
  { symbol: 's', name: 'Second' },
  { symbol: 'min', name: 'Minute' },
  { symbol: 'h', name: 'Hour' },
  // Temperature
  { symbol: '°C', name: 'Celsius' },
  { symbol: '°F', name: 'Fahrenheit' },
  { symbol: 'K', name: 'Kelvin' },
  // Pressure
  { symbol: 'Pa', name: 'Pascal' },
  { symbol: 'kPa', name: 'Kilopascal' },
  { symbol: 'MPa', name: 'Megapascal' },
  { symbol: 'bar', name: 'Bar' },
  { symbol: 'atm', name: 'Atmosphere' },
  // Area
  { symbol: 'mm²', name: 'Square Millimeter' },
  { symbol: 'cm²', name: 'Square Centimeter' },
  { symbol: 'm²', name: 'Square Meter' },
  // Energy
  { symbol: 'J', name: 'Joule' },
  { symbol: 'kJ', name: 'Kilojoule' },
  { symbol: 'cal', name: 'Calorie' },
  { symbol: 'kcal', name: 'Kilocalorie' },
  // Frequency
  { symbol: 'Hz', name: 'Hertz' },
  { symbol: 'kHz', name: 'Kilohertz' },
  { symbol: 'MHz', name: 'Megahertz' },
  // Voltage / Current
  { symbol: 'mV', name: 'Millivolt' },
  { symbol: 'V', name: 'Volt' },
  { symbol: 'mA', name: 'Milliampere' },
  { symbol: 'A', name: 'Ampere' },
  // Data
  { symbol: 'kb', name: 'Kilobase' },
  { symbol: 'kDa', name: 'Kilodalton' },
  { symbol: 'bp', name: 'Base Pair' },
  // Other
  { symbol: 'AU', name: 'Arbitrary Unit' },
  { symbol: 'OD', name: 'Optical Density' },
  { symbol: 'pfu', name: 'Plaque Forming Unit' },
  { symbol: 'CFU', name: 'Colony Forming Unit' },
  { symbol: 'rpm', name: 'Revolutions Per Minute' },
]

export function UnitPicker({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const filtered = search.trim()
    ? COMMON_UNITS.filter(
        (u) =>
          u.symbol.toLowerCase().includes(search.toLowerCase()) ||
          u.name.toLowerCase().includes(search.toLowerCase())
      )
    : COMMON_UNITS

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        className={className}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-[var(--color-border)] overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-[var(--color-border)]">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search unit..."
              className="w-full text-xs border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  onChange(filtered[0].symbol)
                  setOpen(false)
                  setSearch('')
                }
                if (e.key === 'Escape') {
                  setOpen(false)
                  setSearch('')
                }
              }}
            />
          </div>
          {/* List */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[var(--color-muted)] text-center">
                No match. Type your own unit above.
              </div>
            ) : (
              filtered.map((u) => (
                <button
                  key={`${u.symbol}-${u.name}`}
                  onClick={() => {
                    onChange(u.symbol)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[var(--color-accent-light)] transition-colors ${
                    value === u.symbol ? 'bg-[var(--color-accent-light)]/50 text-[var(--color-accent)] font-semibold' : ''
                  }`}
                >
                  <span className="font-mono font-medium">{u.symbol}</span>
                  <span className="text-[var(--color-muted)] ml-2 truncate">{u.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
