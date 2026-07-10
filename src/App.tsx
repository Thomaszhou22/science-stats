import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────

interface SampleGroup {
  id: string
  name: string
  values: string[] // keep as string for input control
}

// ── Stats helpers ─────────────────────────────────

function calcStats(values: number[]) {
  const n = values.length
  if (n === 0) return null
  const mean = values.reduce((a, b) => a + b, 0) / n
  if (n === 1) {
    return { mean, std: 0, sem: 0, n }
  }
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
  const std = Math.sqrt(variance)
  const sem = std / Math.sqrt(n)
  return { mean, std, sem, n }
}

function fmt(val: number, digits = 4) {
  if (val === 0) return '0'
  const abs = Math.abs(val)
  if (abs < 0.001 || abs >= 1e6) return val.toExponential(3)
  return val.toFixed(digits)
}

// ── Small UI atoms (shadcn-inspired) ──────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  className?: string
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer select-none'
  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
  }
  const variants = {
    default: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    outline: 'border border-[var(--color-border)] bg-white hover:bg-gray-50 text-[var(--color-text)]',
    ghost: 'hover:bg-gray-100 text-[var(--color-muted)]',
    danger: 'text-red-500 hover:bg-red-50',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}

// ── Main App ──────────────────────────────────────

let groupCounter = 0
function newGroup(name?: string): SampleGroup {
  groupCounter++
  return {
    id: `g-${Date.now()}-${groupCounter}`,
    name: name || `样品 ${groupCounter}`,
    values: ['', '', '', '', ''],
  }
}

export default function App() {
  const [groups, setGroups] = useState<SampleGroup[]>([
    { id: 'g-init-1', name: '小球 1', values: ['', '', '', '', ''] },
    { id: 'g-init-2', name: '小球 2', values: ['', '', '', '', ''] },
    { id: 'g-init-3', name: '小球 3', values: ['', '', '', '', ''] },
  ])

  const [digits, setDigits] = useState(4)

  // Calculate stats for all groups
  const results = useMemo(() => {
    return groups.map((g) => {
      const nums = g.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v))
      return { ...g, stats: calcStats(nums), rawCount: nums.length }
    })
  }, [groups])

  // Summary table across all groups
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

  function addRow(groupId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, values: [...g.values, ''] } : g)))
  }

  function removeRow(groupId: string, idx: number) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, values: g.values.filter((_, i) => i !== idx) }
          : g
      )
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
      { id: 'g-reset-1', name: '小球 1', values: ['', '', '', '', ''] },
      { id: 'g-reset-2', name: '小球 2', values: ['', '', '', '', ''] },
      { id: 'g-reset-3', name: '小球 3', values: ['', '', '', '', ''] },
    ])
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">科研数据处理工具</h1>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              平均值 / 标准差 / 标准误（SEM）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-muted)]">保留小数</label>
            <select
              value={digits}
              onChange={(e) => setDigits(Number(e.target.value))}
              className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white cursor-pointer outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
            >
              {[2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {d} 位
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Formula reference */}
        <Card className="bg-[var(--color-accent-light)] border-[var(--color-accent)]/20">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-[var(--color-muted)]">平均值</span>
              <span className="ml-2 font-mono">
                x̄ = (Σxᵢ) / N
              </span>
            </div>
            <div>
              <span className="text-[var(--color-muted)]">标准差</span>
              <span className="ml-2 font-mono">
                σ = √[ Σ(xᵢ − x̄)² / (N−1) ]
              </span>
            </div>
            <div>
              <span className="text-[var(--color-muted)]">标准误</span>
              <span className="ml-2 font-mono">
                SEM = σ / √N
              </span>
            </div>
          </div>
        </Card>

        {/* Input groups */}
        {results.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between mb-4">
              <input
                value={r.name}
                onChange={(e) => updateGroupName(r.id, e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2 flex-1"
              />
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => addRow(r.id)}>
                  + 数据
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeGroup(r.id)}>
                  删除组
                </Button>
              </div>
            </div>

            {/* Data inputs */}
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
                  {r.values.length > 2 && (
                    <button
                      onClick={() => removeRow(r.id, idx)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-400 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Stats for this group */}
            {r.stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBox label="数据数 N" value={`${r.stats.n}`} />
                <StatBox label="平均值 x̄" value={fmt(r.stats.mean, digits)} highlight />
                <StatBox label="标准差 σ" value={fmt(r.stats.std, digits)} />
                <StatBox label="标准误 SEM" value={fmt(r.stats.sem, digits)} />
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">输入至少 1 个数据点</p>
            )}
          </Card>
        ))}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={addGroup}>
            + 添加样品组
          </Button>
          <Button variant="ghost" onClick={clearAll}>
            清空所有
          </Button>
        </div>

        {/* Cross-group summary */}
        {summary && summary.n >= 2 && (
          <Card className="bg-gradient-to-br from-[var(--color-accent-light)] to-white border-[var(--color-accent)]/20">
            <h2 className="text-sm font-bold mb-1">组间汇总</h2>
            <p className="text-xs text-[var(--color-muted)] mb-4">
              对各组平均值再次计算统计
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="组数" value={`${summary.n}`} />
              <StatBox label="总平均值" value={fmt(summary.mean, digits)} highlight />
              <StatBox label="组间标准差" value={fmt(summary.std, digits)} />
              <StatBox label="组间标准误" value={fmt(summary.sem, digits)} />
            </div>
          </Card>
        )}

        <footer className="text-center text-xs text-[var(--color-muted)] pt-4 pb-8">
          标准差使用样本标准差（N−1）· 标准误 SEM = σ/√N
        </footer>
      </main>
    </div>
  )
}

function StatBox({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 ${
        highlight
          ? 'bg-[var(--color-accent)]/8 border border-[var(--color-accent)]/20'
          : 'bg-gray-50 border border-[var(--color-border)]'
      }`}
    >
      <div className="text-[11px] text-[var(--color-muted)] mb-0.5">{label}</div>
      <div className={`text-base font-mono font-semibold ${highlight ? 'text-[var(--color-accent)]' : ''}`}>
        {value}
      </div>
    </div>
  )
}
