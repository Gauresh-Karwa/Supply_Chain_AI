'use client'
import { useState } from 'react'
import { Constraint } from '@/types'
import { updateConstraint } from '@/lib/api'

interface Props {
  constraints: Constraint[]
  onUpdate: () => void
}

const STATUS_STYLES = {
  open:       'bg-emerald-50 text-emerald-700 border-emerald-200',
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
    return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3)
  })

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {['Maritime region', 'Type', 'Current status', 'Intelligence Notes', 'Update status'].map(h => (
              <th key={h} className="px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(c => (
            <tr key={c.region_id} className="hover:bg-slate-50 transition-colors">
              
              {/* Region */}
              <td className="px-5 py-4 font-semibold text-slate-800">{c.region_name}</td>
              
              {/* Type */}
              <td className="px-5 py-4 text-slate-500 text-xs font-medium">
                {TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] || c.type}
              </td>
              
              {/* Status Badge */}
              <td className="px-5 py-4">
                <span className={`text-xs px-3 py-1.5 rounded-full border font-bold ${STATUS_STYLES[c.status as keyof typeof STATUS_STYLES]}`}>
                  {STATUS_LABELS[c.status as keyof typeof STATUS_LABELS]}
                </span>
              </td>
              
              {/* FIXED NOTES COLUMN: Removed 'truncate', added 'whitespace-normal' and 'min-w-[300px]' so text wraps perfectly */}
              <td className="px-5 py-4 text-slate-600 text-xs leading-relaxed whitespace-normal min-w-[300px]">
                {c.notes || '—'}
              </td>
              
              {/* Interactive Override Dropdown */}
              <td className="px-5 py-4">
                <select
                  value={c.status}
                  disabled={updating === c.region_id}
                  onChange={e => handleUpdate(c.region_id, e.target.value)}
                  className={`text-xs font-bold border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 focus:outline-none cursor-pointer
                    ${updating === c.region_id ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <option value="open">Set to Open</option>
                  <option value="restricted">Set to Under watch</option>
                  <option value="blocked">Set to Blocked</option>
                </select>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}