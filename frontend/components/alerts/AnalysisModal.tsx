import { SimulationResult } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import ReactMarkdown from 'react-markdown'

interface Props {
  isOpen: boolean
  onClose: () => void
  result: SimulationResult | null
  geminiBrief: string
  isLoading: boolean
}

export default function AnalysisModal({ isOpen, onClose, result, geminiBrief, isLoading }: Props) {
  if (!isOpen) return null

  // Data for charts
  const statusData = result ? [
    { name: 'Safe', value: result.unaffected_count, color: '#22c55e' },
    { name: 'Reroutable', value: result.reroutable_count, color: '#3b82f6' },
    { name: 'Exposed', value: result.exposed_count, color: '#ef4444' }
  ] : []

  const costData = result ? result.affected_vessels.map(v => ({
    name: v.shipment_id.slice(0, 8),
    cost: v.cost_impact_usd,
    delay: v.delay_added_days
  })).sort((a,b) => b.cost - a.cost).slice(0, 5) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Executive Analysis Insights</h2>
            <p className="text-xs text-slate-500">Real-Time Simulation Report</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
          
          {/* Left Col: Gemini Point-Wise */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="text-violet-600">✨</span> AI Strategic Advisory
            </h3>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex-1 shadow-inner overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4 text-violet-600">
                  <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span className="text-sm font-medium animate-pulse">Analyzing global fleet exposure...</span>
                </div>
              ) : geminiBrief ? (
                <div className="prose prose-sm prose-slate max-w-none text-slate-700">
                  <ReactMarkdown>{geminiBrief}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No analysis available.
                </div>
              )}
            </div>
          </div>

          {/* Right Col: Charts & Visuals */}
          <div className="w-full md:w-[400px] flex flex-col gap-6">
            
            {/* Chart 1: Fleet Exposure Ring */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Fleet Exposure</h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ color: '#1e293b', fontSize: '12px', fontWeight: 600 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 text-xs mt-2">
                {statusData.map(d => d.value > 0 && (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-600 font-medium">{d.name} <span className="text-slate-400">({d.value})</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Top Cost Impacts */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-3">Highest Cost Impacts (Top 5)</h3>
              <div className="h-48 w-full">
                {costData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" fontSize={10} tickFormatter={(val) => `$${val/1000}k`} stroke="#94a3b8" />
                      <YAxis dataKey="name" type="category" fontSize={10} width={60} stroke="#94a3b8" />
                      <Tooltip 
                        formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Cost Impact']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#ef4444', fontSize: '12px', fontWeight: 600 }}
                        labelStyle={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}
                      />
                      <Bar dataKey="cost" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    No risk cost data
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
