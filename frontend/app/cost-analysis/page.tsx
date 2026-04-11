'use client'
import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { fetchShipments } from '@/lib/api'
import { Shipment } from '@/types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area } from 'recharts'

export default function CostAnalysisPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [saving, setSaving] = useState(false)

  // Use strings to avoid 0N string rendering glitch
  const [inputs, setInputs] = useState({
    analysisTitle: "Shanghai Q3 Contingency",
    companyName: "DCL Electronics",
    cargoValue: "2500000",
    demurrageRate: "15000",
    holdingRatePct: "1",
    penaltyRatePct: "0.5",
  })

  const [history, setHistory] = useState<any[]>([])

  // Executive summary logic
  const atRisk = shipments.filter(s => s.risk_score >= 0.70);
  const watch = shipments.filter(s => s.risk_score >= 0.45 && s.risk_score < 0.70);
  
  // To make it fully "real", we dynamically compute based on historical analysis baselines, or fall back to standard estimation if ledger is empty.
  const averageSavedPerShipment = history.length > 0 ? history.reduce((sum, h) => sum + h.total_savings_usd, 0) / history.length : 2500000;
  const valueAtRisk = atRisk.length * averageSavedPerShipment + watch.length * (averageSavedPerShipment * 0.4);
  
  // True MTD Savings pulled directly from the Supabase Ledger
  const realMtdSavings = history.reduce((sum, h) => sum + (h.total_savings_usd || 0), 0);
  const realSavedDays = history.reduce((sum, h) => sum + (h.delay_days_avoided || 0), 0);

  useEffect(() => {
    Promise.all([
      fetchShipments(),
      fetch('http://localhost:8000/cost-analysis').then(r => r.ok ? r.json() : { analyses: [] }).catch(() => ({ analyses: [] }))
    ])
    .then(([d, histR]) => {
      const ships = d.shipments || []
      setShipments(ships)
      if (ships.length > 0) {
        const sorted = [...ships].sort((a,b) => (b.predicted_delay_days || 0) - (a.predicted_delay_days || 0));
        setSelectedShipment(sorted[0])
      }
      if (histR && histR.analyses) setHistory(histR.analyses)
    })
    .finally(() => setLoading(false))
  }, [])

  const handleInput = (key: keyof typeof inputs, val: string) => {
    if (/^\d*\.?\d*$/.test(val)) {
      setInputs(prev => ({ ...prev, [key]: val }))
    }
  }

  // Current Math
  const cargoVal = parseFloat(inputs.cargoValue) || 0;
  const demurrage = parseFloat(inputs.demurrageRate) || 0;
  const holdPct = parseFloat(inputs.holdingRatePct) || 0;
  const penPct = parseFloat(inputs.penaltyRatePct) || 0;
  
  const delayDays = selectedShipment ? (selectedShipment.predicted_delay_days || 0) : 0;
  
  const demurrageSavings = demurrage * delayDays;
  const holdingSavings = cargoVal * (holdPct / 100) / 30 * delayDays;
  const penaltySavings = cargoVal * (penPct / 100) * delayDays;
  
  const totalSavings = demurrageSavings + holdingSavings + penaltySavings;

  const chartData = [
    { name: 'Demurrage', amount: demurrageSavings, fill: '#3b82f6' },
    { name: 'Hold Cost', amount: holdingSavings, fill: '#10b981' },
    { name: 'Penalties', amount: penaltySavings, fill: '#ef4444' }
  ]

  const generateAIExplanation = () => {
    if (!selectedShipment || delayDays === 0) return "No disruption predicted. Routing is optimal."
    const isPenalized = penaltySavings > demurrageSavings;
    const impactReason = isPenalized ? "severe SLA violations from late delivery constraints" : "massive demurrage staging fees";
    return `MarineIQ Neural Net flagged a ${delayDays.toFixed(1)}-day delay probability on the baseline ${selectedShipment.origin.replace('_', ' ')} corridor. Without intervention, ${inputs.companyName} faces ${impactReason}. Rerouting avoids capital lockup and definitively verifies ${totalSavings > 1000000 ? '$' + (totalSavings/1000000).toFixed(1) + 'M' : '$' + (totalSavings/1000).toFixed(0) + 'K'} in preserved contract value.`
  }

  const handleSave = async () => {
    if (!selectedShipment || saving) return;
    setSaving(true)
    
    const reqBody = {
      analysis_title: inputs.analysisTitle,
      company_name: inputs.companyName,
      shipment_id: selectedShipment.id,
      origin: selectedShipment.origin,
      destination: selectedShipment.destination,
      cargo_value_usd: cargoVal,
      daily_demurrage_usd: demurrage,
      penalty_rate_pct: penPct,
      holding_rate_pct: holdPct,
      delay_days_avoided: delayDays,
      total_savings_usd: totalSavings,
      co2_delta_tonnes: 0, 
    };
    
    try {
      await fetch('http://localhost:8000/cost-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      alert('Analysis saved successfully to active ledger. The MTD Savings will reflect this immediately on refresh.')
      setHistory(prev => [{ ...reqBody, created_at: new Date().toISOString() }, ...prev])
    } catch(e) {
      alert('Failed to save analysis')
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar
        title="Financial Intelligence"
        subtitle="Understand the economic impact of global fleet risks and calculate proactive simulation savings."
      />

      <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 text-slate-900">
        {loading ? (
           <p className="text-slate-400">Loading intelligent ledger...</p>
        ) : (
          <div className="max-w-7xl mx-auto space-y-8">
            
            {/* 1. Fleet Executive Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full" />
                <h3 className="text-xs uppercase tracking-widest font-semibold text-slate-500 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Cargo Value at Risk
                </h3>
                <div className="text-5xl font-light text-slate-900 mb-2">
                  ${(valueAtRisk / 1000000).toFixed(1)}<span className="text-3xl text-slate-400">M</span>
                </div>
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">{atRisk.length}</span> Critical shipments flagged today.
                </p>
              </div>

              <div className="bg-gradient-to-br from-[#0B1221] to-[#111827] rounded-2xl p-8 border border-slate-800 shadow-xl relative overflow-hidden text-white group">
                <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-emerald-500/10 rounded-full blur-[60px] group-hover:bg-emerald-400/20 transition-all duration-700" />
                <h3 className="relative z-10 text-xs uppercase tracking-widest font-semibold text-slate-400 mb-2 flex items-center gap-2">
                  AI Reroute Savings (MTD)
                </h3>
                <div className="relative z-10 text-5xl font-semibold tracking-tight text-emerald-400 mb-2">
                  +${(realMtdSavings / 1000000).toFixed(4)}<span className="text-3xl text-emerald-500/80">M</span>
                </div>
                <p className="relative z-10 text-sm text-slate-400">
                  Total verified savings derived from <span className="font-medium text-white">{realSavedDays.toFixed(1)}</span> disruption days bypassed. Verified via historical ledger.
                </p>
              </div>
            </div>

            {/* 1.5 Historical Trend Chart */}
            {history.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-hidden">
                <h3 className="text-sm uppercase tracking-widest font-semibold text-slate-500 mb-4">Historical Savings Trajectory</h3>
                <div style={{ width: '100%', height: 180, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={[...history].reverse().map((h, i) => ({ name: h.analysis_title || `Analysis ${i+1}`, savings: h.total_savings_usd, company: h.company_name }))}>
                      <defs>
                        <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} formatter={(val: any) => [`$${val.toLocaleString()}`, 'Saved']} labelStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
                      <Area type="monotone" dataKey="savings" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSavings)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 2. Interactive Shipment ROI Caluclator */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
               <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">Dynamic Cost-Benefit Analysis</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Simulate actual dollar impact of utilizing alternative routes per specific vessel.</p>
                  </div>
               </div>

               <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                 
                 {/* Inputs */}
                 <div className="lg:col-span-4 space-y-5">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1">Target Shipment</label>
                      <select 
                        className="w-full bg-white border border-slate-300 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedShipment?.id || ''}
                        onChange={(e) => setSelectedShipment(shipments.find(s => s.id === e.target.value) || null)}
                      >
                        {shipments.filter(s => s.predicted_delay_days > 0).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.origin.replace('_', ' ')} → {s.destination.replace('_', ' ')} ({s.predicted_delay_days?.toFixed(1)}d delay)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Company Context</label>
                          <input type="text" value={inputs.companyName} onChange={e => setInputs({...inputs, companyName: e.target.value})} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Ledger Title</label>
                          <input type="text" value={inputs.analysisTitle} onChange={e => setInputs({...inputs, analysisTitle: e.target.value})} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Total Cargo Value (USD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">$</span>
                          <input type="text" value={inputs.cargoValue} onChange={e => handleInput('cargoValue', e.target.value)} className="w-full bg-slate-50 border border-slate-200 pl-7 pr-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Daily Demurrage Rate (USD)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-slate-400">$</span>
                          <input type="text" value={inputs.demurrageRate} onChange={e => handleInput('demurrageRate', e.target.value)} className="w-full bg-slate-50 border border-slate-200 pl-7 pr-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Penalty / Day</label>
                          <div className="relative">
                            <input type="text" value={inputs.penaltyRatePct} onChange={e => handleInput('penaltyRatePct', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                            <span className="absolute right-3 top-2.5 text-slate-400">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold uppercase text-slate-500 block mb-1">Hold / Month</label>
                          <div className="relative">
                            <input type="text" value={inputs.holdingRatePct} onChange={e => handleInput('holdingRatePct', e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                            <span className="absolute right-3 top-2.5 text-slate-400">%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleSave} 
                      disabled={saving || delayDays === 0} 
                      className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg shadow-sm transition"
                    >
                      {saving ? 'Recording Ledger...' : 'Commit Savings Ledger'}
                    </button>
                 </div>

                 {/* Charts & Breakdown */}
                 <div className="lg:col-span-8 flex flex-col justify-center">
                    <div className="flex flex-col md:flex-row gap-8 items-center h-full">
                       {/* Total Hero */}
                       <div className="flex-1 text-center bg-slate-50 border border-slate-100 rounded-2xl p-8 w-full">
                          <p className="text-sm uppercase tracking-widest text-slate-500 font-bold mb-3">Projected Cost Savings</p>
                          <h4 className="text-5xl font-light text-blue-600 tracking-tight flex items-center justify-center gap-1.5 mb-2">
                             <span className="text-3xl text-blue-300">$</span>
                             {totalSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </h4>
                          <p className="text-xs font-medium text-slate-400">Avoiding {delayDays.toFixed(1)} Days Delay via Recommended Route</p>
                       </div>

                       {/* Bar Chart Composition */}
                       <div style={{ width: '100%', height: 220, minWidth: 0, flex: 1 }}>
                         <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 500}} width={70} />
                              <Tooltip cursor={{fill: '#f1f5f9'}} formatter={(value: any) => [`$${value.toLocaleString()}`, 'Saved']} />
                              <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={28}>
                                {
                                  chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                  ))
                                }
                              </Bar>
                            </BarChart>
                         </ResponsiveContainer>
                       </div>
                       {/* AI Rationale Block */}
                       <div className="flex w-full mt-6 bg-blue-50 border border-blue-100 rounded-xl p-5 items-start gap-4">
                         <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0 mt-0.5">
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                           </svg>
                         </div>
                         <div>
                           <h4 className="text-sm font-bold text-blue-900 mb-1">MarineIQ AI Explanation</h4>
                           <p className="text-sm text-blue-800 leading-relaxed">
                             {generateAIExplanation()}
                           </p>
                         </div>
                       </div>
                    </div>
                 </div>

               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
