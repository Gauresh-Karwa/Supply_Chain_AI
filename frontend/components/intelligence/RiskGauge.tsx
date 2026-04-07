interface Props {
  score: number
}

export default function RiskGauge({ score }: Props) {
  const pct    = Math.round(score * 100)
  const color  = score >= 0.70 ? '#dc2626' : score >= 0.45 ? '#d97706' : '#16a34a'
  const label  = score >= 0.70 ? 'Attention needed' : score >= 0.45 ? 'Under watch' : 'On schedule'
  const radius = 52
  const circ   = 2 * Math.PI * radius
  const dash   = circ * score
  const gap    = circ - dash

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="65" cy="65" r={radius} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            transform="rotate(-90 65 65)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{pct}%</span>
          <span className="text-xs text-slate-400">risk</span>
        </div>
      </div>
      <span className="text-xs font-medium mt-1" style={{ color }}>{label}</span>
    </div>
  )
}