import React from 'react'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  className = '',
  disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer select-none'
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2' }
  const variants = {
    default: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    outline: 'border border-[var(--color-border)] bg-white hover:bg-gray-50 text-[var(--color-text)]',
    ghost: 'hover:bg-gray-100 text-[var(--color-muted)]',
    danger: 'text-red-500 hover:bg-red-50',
  }
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function StatBox({
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

export function fmt(val: number, digits = 4) {
  if (val === 0) return '0'
  const abs = Math.abs(val)
  if (abs < 0.001 || abs >= 1e6) return val.toExponential(3)
  return val.toFixed(digits)
}
