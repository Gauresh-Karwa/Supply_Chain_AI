'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Shipment } from '@/types'

interface Alert {
  id:      string
  message: string
  level:   'high' | 'watch' | 'ok'
  time:    string
}

function buildMessage(s: Shipment): string {
  const route = `${s.origin} → ${s.destination}`
  if (s.risk_score >= 0.70) {
    const delay = s.predicted_delay_days > 0
      ? ` Estimated disruption: ${s.predicted_delay_days.toFixed(1)} days.`
      : ''
    return `${route}: High disruption risk (${Math.round(s.risk_score * 100)}%).${delay} Recommended route available.`
  }
  if (s.anomaly_flag) {
    return `${route}: Unusual conditions detected on this route today. Risk level is above normal.`
  }
  if (s.risk_score >= 0.45) {
    return `${route}: Route is under watch. Conditions have changed — review recommended.`
  }
  return `${route}: Risk refreshed. Shipment remains on schedule.`
}

interface Props {
  initialShipments: Shipment[]
}

export default function AlertFeed({ initialShipments }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    initialShipments
      .filter(s => s.risk_score >= 0.45 || s.anomaly_flag)
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 8)
      .map(s => ({
        id:      s.id,
        message: buildMessage(s),
        level:   s.risk_score >= 0.70 ? 'high' : 'watch',
        time:    'Last refresh',
      }))
  )

  useEffect(() => {
    const channel = supabase
      .channel('shipment-feed')
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'shipments',
      }, payload => {
        const s = payload.new as Shipment
        if (s.risk_score >= 0.45 || s.anomaly_flag) {
          setAlerts(prev => [
            {
              id:      s.id,
              message: buildMessage(s),
              level:   s.risk_score >= 0.70 ? 'high' : 'watch',
              time:    'Just now',
            },
            ...prev.filter(a => a.id !== s.id),
          ].slice(0, 10))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const dotColor = { high: '#dc2626', watch: '#d97706', ok: '#16a34a' }

  return (
    <div className="bg-white border-t border-slate-200 flex-shrink-0">
      <div className="px-5 py-2.5 border-b border-slate-100 flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-700">Live alert feed</span>
        <span className="text-xs text-slate-300">Updates automatically</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 140 }}>
        {alerts.length === 0 ? (
          <div className="px-5 py-4 text-xs text-slate-400 text-center">
            All shipments on schedule. No alerts at this time.
          </div>
        ) : (
          alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0"
            >
              <div
                style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: dotColor[alert.level],
                }}
              />
              <p className="text-xs text-slate-600 leading-relaxed flex-1">{alert.message}</p>
              <span className="text-xs text-slate-300 whitespace-nowrap">{alert.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}