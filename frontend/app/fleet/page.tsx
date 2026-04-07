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

  useEffect(() => {
    fetchShipments()
      .then(d => setShipments(d.shipments || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Fleet tracker"
        subtitle="All active shipments with real-time risk assessments"
        badges={[{ label: `${shipments.length} shipments`, color: 'blue' }]}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {loading
            ? <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading...</div>
            : <ShipmentTable shipments={shipments} onSelect={setSelected} selected={selected} />
          }
        </div>
        {selected && (
          <ShipmentDrawer shipment={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}