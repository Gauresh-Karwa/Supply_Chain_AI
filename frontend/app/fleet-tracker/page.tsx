'use client'
import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import ShipmentTable from '@/components/fleet/ShipmentTable'
import ShipmentDrawer from '@/components/fleet/ShipmentDrawer'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'

export default function FleetPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selected,  setSelected]  = useState<Shipment | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)

  useEffect(() => {
    fetchShipments()
      .then(d => {
        setShipments(d.shipments || [])
        setError(false)
      })
      .catch(e => {
        console.error("Fleet fetch failed:", e)
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Fleet tracker"
        subtitle="All active shipments with real-time risk assessments"
        badges={[{ label: `${shipments.length} shipments`, color: 'blue' }]}
      />
      
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-slate-400">Loading fleet data...</p>
            </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
                <p className="text-slate-400 mb-4">The fleet tracker is temporarily unavailable. This usually means the API is starting up.</p>
                <button onClick={() => window.location.reload()} className="text-blue-600 font-medium text-sm">Refresh browser</button>
            </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                <ShipmentTable shipments={shipments} onSelect={setSelected} selected={selected} />
            </div>
            {selected && (
                <ShipmentDrawer shipment={selected} onClose={() => setSelected(null)} />
            )}
        </div>
      )}
    </div>
  )
}