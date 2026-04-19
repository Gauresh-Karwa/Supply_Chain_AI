'use client'
import { useState, Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import RouteAssessor from '@/components/intelligence/RouteAssessor'
import RouteCompare from '@/components/intelligence/RouteCompare'

export default function IntelligencePage() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'assess' | 'compare'>(
    (searchParams.get('tab') as 'assess' | 'compare') ?? 'assess'
  )

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'assess' || t === 'compare') {
      setTab(t)
    }
  }, [searchParams])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Route intelligence"
        subtitle="Assess disruption risk and compare routing options before you ship"
      />
      <div className="flex gap-1 px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        {[
          { key: 'assess',  label: 'Assess a route' },
          { key: 'compare', label: 'Compare routes' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors
              ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className="p-5 text-xs text-slate-500">Loading...</div>}>
          {tab === 'assess'  && <RouteAssessor />}
          {tab === 'compare' && <RouteCompare />}
        </Suspense>
      </div>
    </div>
  )
}