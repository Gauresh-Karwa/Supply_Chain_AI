'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/overview',     label: 'Overview',           section: 'main'  },
  { href: '/fleet',        label: 'Fleet tracker',      section: 'main'  },
  { href: '/intelligence', label: 'Route intelligence', section: 'tools' },
  { href: '/alerts',       label: 'Global alerts',      section: 'tools' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-52 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-slate-100">
        <div className="text-sm font-bold text-slate-900 tracking-tight">MarineIQ</div>
        <div className="text-xs text-slate-400 mt-0.5">Supply Chain Intelligence</div>
      </div>

      <nav className="flex-1 px-2 py-3">
        <div className="text-xs text-slate-300 uppercase tracking-widest px-2 py-2">
          Main
        </div>
        {NAV.filter(n => n.section === 'main').map(item => {
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md mb-0.5 cursor-pointer transition-colors
                ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: active ? '#1d4ed8' : '#cbd5e1',
                }} />
                <span className={`text-xs font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}

        <div className="text-xs text-slate-300 uppercase tracking-widest px-2 py-2 mt-3">
          Tools
        </div>
        {NAV.filter(n => n.section === 'tools').map(item => {
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md mb-0.5 cursor-pointer transition-colors
                ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: active ? '#1d4ed8' : '#cbd5e1',
                }} />
                <span className={`text-xs font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>

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