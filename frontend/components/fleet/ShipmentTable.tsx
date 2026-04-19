import { Shipment } from '@/types'
import { formatExposure } from '@/lib/api'

interface Props {
  shipments: Shipment[]
  onSelect: (s: Shipment) => void
  selected: Shipment | null
}

function RiskBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  if (score >= 0.70) return <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">{pct}% · Attention needed</span>
  if (score >= 0.45) return <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{pct}% · Under watch</span>
  return <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-medium">{pct}% · On schedule</span>
}

const CARGO_COLORS: Record<string, { bg: string; text: string }> = {
  electronics:      { bg: 'bg-blue-50',   text: 'text-blue-700'   },
  automotive:       { bg: 'bg-purple-50', text: 'text-purple-700' },
  pharmaceuticals:  { bg: 'bg-red-50',    text: 'text-red-700'    },
  textiles:         { bg: 'bg-amber-50',  text: 'text-amber-700'  },
  chemicals:        { bg: 'bg-orange-50', text: 'text-orange-700' },
  machinery:        { bg: 'bg-slate-100', text: 'text-slate-700'  },
  energy_equipment: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  general:          { bg: 'bg-slate-50',  text: 'text-slate-500'  },
}

export default function ShipmentTable({ shipments, onSelect, selected }: Props) {
  const sorted = [...shipments].sort((a, b) => b.risk_score - a.risk_score)

  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
        <tr>
          {['Route', 'Departure', 'Risk assessment', 'Cargo type', 'Financial exposure', 'Predicted delay', 'Anomaly', ''].map(h => (
            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-slate-100">
        {sorted.map(s => (
          <tr
            key={s.id}
            onClick={() => onSelect(s)}
            className={`cursor-pointer transition-colors hover:bg-blue-50
              ${selected?.id === s.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
          >
            <td className="px-4 py-3 font-medium text-slate-800">
              {s.origin} → {s.destination}
            </td>
            <td className="px-4 py-3 text-slate-500">
              {new Date(s.departure_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </td>
            <td className="px-4 py-3"><RiskBadge score={s.risk_score} /></td>
            <td className="px-4 py-3">
              {s.cargo_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CARGO_COLORS[s.cargo_type]?.bg} ${CARGO_COLORS[s.cargo_type]?.text}`}>
                  {s.cargo_type.replace('_', ' ')}
                </span>
              )}
            </td>
            <td className="px-4 py-3">
              {(() => {
                const exp = formatExposure(s.risk_score, s.predicted_delay_days, s.daily_delay_cost_usd ?? 18000)
                return exp
                  ? <span className="text-xs font-semibold text-red-600">{exp}</span>
                  : <span className="text-slate-300 text-xs">—</span>
              })()}
            </td>
            <td className="px-4 py-3 text-slate-600">
              {s.predicted_delay_days > 0 ? `${s.predicted_delay_days.toFixed(1)} days` : '—'}
            </td>
            <td className="px-4 py-3">
              {s.anomaly_flag
                ? <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">Unusual activity</span>
                : <span className="text-slate-300">—</span>
              }
            </td>
            <td className="px-4 py-3 text-blue-500 text-xs">View details →</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}