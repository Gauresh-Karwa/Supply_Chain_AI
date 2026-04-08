'use client'
import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import MetricsStrip from '@/components/overview/MetricsStrip'
import WorldMap from '@/components/overview/WorldMap'
import AlertFeed from '@/components/overview/AlertFeed'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'

export default function OverviewPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    fetchShipments()
      .then(d => setShipments(d.shipments || []))
      .finally(() => setLoading(false))
  }, [])

  const highRisk = shipments.filter(s => s.risk_score >= 0.70).length

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      <TopBar
        title="Overview"
        subtitle={`Global maritime operations · ${new Date().toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })}`}
        badges={[
          ...(highRisk > 0 ? [{ label: `${highRisk} need attention`, color: 'red' as const }] : []),
          { label: '● Realtime', color: 'green' as const },
        ]}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-400">Loading fleet data...</p>
        </div>
      ) : (
        <>
          <MetricsStrip shipments={shipments} />
          
          {/* Removed the hardcoded minHeight here to fix the gap */}
          <div className="w-full overflow-hidden">
            <WorldMap shipments={shipments} />
          </div>
          
          <AlertFeed initialShipments={shipments} />
        </>
      )}
    </div>
  )
}