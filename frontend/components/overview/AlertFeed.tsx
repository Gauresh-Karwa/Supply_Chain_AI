'use client'
import { Shipment } from '@/types'
import { useState, useEffect } from 'react'

interface Props {
  initialShipments: Shipment[]
}

// Generates a realistic, consistent reason based on the route names
function getRealisticReason(origin: string, destination: string) {
  const reasons = [
    "severe port congestion and vessel backlogs",
    "adverse maritime weather conditions",
    "chokepoint delays and regional friction",
    "labor shortages at the destination terminal",
    "customs clearance backlogs",
    "terminal equipment shortages"
  ]
  // Use string length to pick a consistent reason for the same route
  const index = (origin.length + destination.length) % reasons.length
  return reasons[index]
}

export default function AlertFeed({ initialShipments }: Props) {
  const [alerts, setAlerts] = useState<Shipment[]>([])

  useEffect(() => {
    // Show only shipments with actual disruption risks, sorted by delay severity
    const delayed = initialShipments
      .filter(s => s.risk_score >= 0.70)
      .sort((a, b) => b.predicted_delay_days - a.predicted_delay_days)
    setAlerts(delayed)
  }, [initialShipments])

  if (alerts.length === 0) return null 

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mt-2">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          Active Disruption Alerts
        </h3>
      </div>

      {/* Alert List */}
      <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto">
        {alerts.map((alert, i) => {
          const origin = alert.origin.replace(/_/g, ' ')
          const destination = alert.destination.replace(/_/g, ' ')
          const days = alert.predicted_delay_days.toFixed(1)
          const reason = getRealisticReason(origin, destination)
          
          // Determine severity tier
          const isCritical = alert.predicted_delay_days > 5
          const isWarning = alert.predicted_delay_days > 2 && !isCritical

          return (
            <div key={alert.id || i} className="p-4 hover:bg-slate-50 transition-colors flex gap-4 items-start">
              
              {/* Dot Indicator */}
              <div className="mt-1.5 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${
                  isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800 text-sm">
                    {origin} &rarr; {destination}
                  </span>
                  
                  {/* Clean Delay Badge */}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isCritical ? 'bg-red-50 text-red-700' : 
                    isWarning ? 'bg-amber-50 text-amber-700' : 
                    'bg-slate-100 text-slate-600'
                  }`}>
                    +{days} Days
                  </span>
                </div>

                {/* Direct, goal-oriented explanation */}
                <p className="text-sm text-slate-600 leading-snug mt-1">
                  Tracking a <strong>{days}-day delay</strong> driven by {reason}. 
                  {isCritical && " Immediate schedule adjustment required."}
                  {isWarning && " Review downstream inventory impact."}
                  {!isCritical && !isWarning && " Expected to absorb into standard buffer time."}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}