'use client'
import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import ConstraintTable from '@/components/alerts/ConstraintTable'
import { fetchConstraints } from '@/lib/api'
import { Constraint } from '@/types'

export default function AlertsPage() {
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [loading,     setLoading]     = useState(true)

  function reload() {
    fetchConstraints()
      .then(d => setConstraints(d.constraints || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const blocked    = constraints.filter(c => c.status === 'blocked').length
  const restricted = constraints.filter(c => c.status === 'restricted').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Global alerts"
        subtitle="Live status of maritime regions, chokepoints, and geopolitical constraints"
        badges={[
          ...(blocked > 0    ? [{ label: `${blocked} blocked`,    color: 'red'   as const }] : []),
          ...(restricted > 0 ? [{ label: `${restricted} restricted`, color: 'amber' as const }] : []),
        ]}
      />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-xs text-amber-800">
          <strong>Demo:</strong> Change a region's status below and watch the Fleet Tracker and Overview map update automatically.
          Try setting <strong>Suez Canal</strong> to blocked — all affected routes will reroute via Cape of Good Hope.
        </div>
        {loading
          ? <div className="text-center text-sm text-slate-400 py-12">Loading constraint data...</div>
          : <ConstraintTable constraints={constraints} onUpdate={reload} />
        }
      </div>
    </div>
  )
}