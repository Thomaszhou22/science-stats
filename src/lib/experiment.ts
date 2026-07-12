/** Shared types for experiment data between StatsTool and ResultsView */

export interface GroupStat {
  name: string
  unit: string
  mean: number
  std: number
  sem: number
  n: number
}

/** A variable (IV or DV) attached to an experiment */
export interface Variable {
  id: string
  name: string
  value: string
  unit: string
  type: 'iv' | 'dv'
}

/** A complete experiment entry */
export interface ExperimentEntry {
  id: string
  label: string
  groups: GroupStat[]
  crossGroup: { mean: number; std: number; sem: number; n: number } | null
  measurementUnit: string
  variables: Variable[]
  ts: number
  savedLabelId: string | null
}

export interface LabelItem {
  id: string
  name: string
  ts: number
}

// ── localStorage helpers ─────────────────────────

export function loadResults(): ExperimentEntry[] {
  try {
    const raw = localStorage.getItem('science-stats-results')
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate old entries without variables field
      return parsed.map((e: ExperimentEntry) => ({
        ...e,
        variables: e.variables || [],
        concentration: undefined,
        concUnit: undefined,
      }))
    }
  } catch {}
  return []
}

export function saveResults(v: ExperimentEntry[]) {
  localStorage.setItem('science-stats-results', JSON.stringify(v))
}

export function loadLabels(): LabelItem[] {
  try {
    const raw = localStorage.getItem('science-stats-labels')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveLabels(v: LabelItem[]) {
  localStorage.setItem('science-stats-labels', JSON.stringify(v))
}
