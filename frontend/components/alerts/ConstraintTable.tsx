'use client'
import { useState } from 'react'
import { Constraint } from '@/types'
import { updateConstraint } from '@/lib/api'

interface Props {
  constraints: Constraint[]
  onUpdate: () => void
}

const STATUS_STYLES = {
  open:       'bg-green-50 text-green-700 border-green-200',
  restricted: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked:    'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABELS = {
  open:       'Open',
  restricted: 'Under watch',
  blocked:    'Blocked',
}

const TYPE_LABELS = {
  geopolitical: 'Geopolitical',
  environmental: 'Environmental',
}

export default function ConstraintTable({ constraints, onUpdate }: Props) {
  const [updating, setUpdating] = useState<string | null>(null)

  async function handleUpdate(regionId: string, newStatus: string) {
    setUpdating(regionId)
    try {
      await updateConstraint(regionId, newStatus)
      onUpdate()
    } catch {
      alert('Failed to update. Please try again.')
    } finally {
      setUpdating(null)
    }
  }

  const sorted = [...constraints].sort((a, b) => {
    const order = { blocked: 0, restricted: 1, open: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Maritime region', 'Type', 'Current status', 'Notes', 'Update status'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(c => (
            <tr key={c.region_id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800">{c.region_name}</td>
              <td className="px-4 py-3 text-slate-500">{TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] || c.type}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_STYLES[c.status]}`}>
                  {STATUS_LABELS[c.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{c.notes || '—'}</td>
              <td className="px-4 py-3">
                <select
                  value={c.status}
                  disabled={updating === c.region_id}
                  onChange={e => handleUpdate(c.region_id, e.target.value)}
                  className={`text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700
                    ${updating === c.region_id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <option value="open">Open</option>
                  <option value="restricted">Under watch</option>
                  <option value="blocked">Blocked</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}