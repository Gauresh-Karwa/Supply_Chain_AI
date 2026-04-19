'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/overview', label: 'Overview', section: 'main' },
  { href: '/fleet-tracker', label: 'Fleet tracker', section: 'main' },
  { href: '/route-intelligence', label: 'Route intelligence', section: 'tools' },
  { href: '/alerts', label: 'Risk Simulation', section: 'tools' },
  { href: '/cost-analysis', label: 'Cost analysis', section: 'tools' },
  { href: '/port-traffic', label: 'Port traffic', section: 'tools' },
  { href: '/inventory', label: 'Inventory', section: 'tools' },
  { href: '/sustainability', label: 'Sustainability', section: 'tools' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-52 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">

      {/* ── Logo ── */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="text-sm font-bold text-slate-900 tracking-tight">MarineIQ</div>
        <div className="text-xs text-slate-400 mt-0.5">Supply Chain Intelligence</div>
      </div>

      {/* ── Company header ── */}
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        {/* Company avatar + name */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-bold">D</span>
          </div>
          <span className="text-xs font-semibold text-slate-700 truncate">Demo Company</span>
        </div>

        {/* Icon placeholders */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Building icon — visual placeholder */}
          <button
            title="Company settings (coming soon)"
            className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            onClick={() => { }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </button>
          {/* Logout icon — visual placeholder */}
          <button
            title="Sign out (coming soon)"
            className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            onClick={() => { }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <div className="text-[10px] text-slate-300 uppercase tracking-widest px-2 py-2">Main</div>
        {NAV.filter(n => n.section === 'main').map(item => (
          <NavItem key={item.href} item={item} active={path === item.href} />
        ))}

        <div className="text-[10px] text-slate-300 uppercase tracking-widest px-2 py-2 mt-3">Tools</div>
        {NAV.filter(n => n.section === 'tools').map(item => (
          <NavItem key={item.href} item={item} active={path === item.href} />
        ))}
      </nav>

      {/* ── System status ── */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">System</span>
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Live
          </span>
        </div>
        <div className="text-xs text-slate-300 mt-1">Refreshes every 15 min</div>
      </div>
    </aside>
  )
}

function NavItem({ item, active }: { item: typeof NAV[0]; active: boolean }) {
  const isSpecial = 'special' in item && item.special

  const wrapCls = [
    'flex items-center gap-2.5 px-2.5 py-2 rounded-md mb-0.5 cursor-pointer transition-colors',
    isSpecial
      ? active ? 'bg-red-50 border border-red-200' : 'hover:bg-red-50/50 border border-transparent hover:border-red-100'
      : active ? 'bg-blue-50' : 'hover:bg-slate-50',
  ].join(' ')

  const dotColor = isSpecial
    ? active ? '#dc2626' : '#fca5a5'
    : active ? '#1d4ed8' : '#cbd5e1'

  const textCls = isSpecial
    ? active ? 'text-red-700' : 'text-red-500'
    : active ? 'text-blue-700' : 'text-slate-500'

  return (
    <Link href={item.href}>
      <div className={wrapCls}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
        <span className={`text-xs font-medium ${textCls}`}>{item.label}</span>
      </div>
    </Link>
  )
}