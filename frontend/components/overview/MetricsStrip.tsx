import { Shipment } from '@/types'

interface Props {
  shipments: Shipment[]
}

export default function MetricsStrip({ shipments }: Props) {
  const total   = shipments.length
  const high    = shipments.filter(s => s.risk_score >= 0.70).length
  const watch   = shipments.filter(s => s.risk_score >= 0.45 && s.risk_score < 0.70).length
  const onTime  = shipments.filter(s => s.risk_score < 0.45).length
  const avgRisk = total > 0
    ? shipments.reduce((a, s) => a + s.risk_score, 0) / total
    : 0

  const metrics = [
    {
      label: 'Total shipments',
      value: String(total),
      sub:   'active fleet',
      color: 'text-blue-700',
    },
    {
      label: 'Needs attention',
      value: String(high),
      sub:   'risk above 70%',
      color: 'text-red-600',
    },
    {
      label: 'Under watch',
      value: String(watch),
      sub:   'risk 45–70%',
      color: 'text-amber-600',
    },
    {
      label: 'On schedule',
      value: String(onTime),
      sub:   'risk below 45%',
      color: 'text-green-600',
    },
    {
      label: 'Fleet risk score',
      value: avgRisk.toFixed(2),
      sub:   'fleet average',
      color: avgRisk > 0.6 ? 'text-red-600' : avgRisk > 0.4 ? 'text-amber-600' : 'text-green-600',
    },
  ]

  return (
    <div className="flex gap-3 px-5 py-3 bg-white border-b border-slate-200 overflow-x-auto flex-shrink-0">
      {metrics.map((m, i) => (
        <div
          key={i}
          className="bg-slate-50 rounded-lg px-4 py-3 min-w-[120px] border border-slate-100 flex-shrink-0"
        >
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{m.label}</div>
          <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
          <div className="text-xs text-slate-400 mt-0.5">{m.sub}</div>
        </div>
      ))}
    </div>
  )
}