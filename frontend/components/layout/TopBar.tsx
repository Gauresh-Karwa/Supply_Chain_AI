interface TopBarProps {
  title: string
  subtitle: string
  badges?: { label: string; color: 'red' | 'amber' | 'green' | 'blue' }[]
}

export default function TopBar({ title, subtitle, badges = [] }: TopBarProps) {
  const colorMap = {
    red:   'bg-red-50 text-red-600 border-red-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    blue:  'bg-blue-50 text-blue-600 border-blue-200',
  }

  return (
    <div className="px-6 py-3.5 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0">
      <div>
        <h1 className="text-sm font-semibold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        {badges.map((b, i) => (
          <span
            key={i}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium ${colorMap[b.color]}`}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}