import { Shipment } from '@/types'

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

export default function ShipmentTable({ shipments, onSelect, selected }: Props) {
  const sorted = [...shipments].sort((a, b) => b.risk_score - a.risk_score)

  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
        <tr>
          {['Route', 'Departure', 'Risk assessment', 'Predicted delay', 'Anomaly', ''].map(h => (
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