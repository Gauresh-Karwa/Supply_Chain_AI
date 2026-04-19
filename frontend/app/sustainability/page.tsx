'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { fetchESGDashboard } from '@/lib/api'
import {
    LineChart, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, Area, AreaChart, CartesianGrid
} from 'recharts'

interface ESGData {
    metrics: {
        total_co2_tonnes: number
        co2_saved_by_rerouting: number
        carbon_tax_liability_usd: number
        carbon_tax_saved_usd: number
        green_route_percentage: number
        total_distance_km: number
        fleet_size: number
        ai_rerouted_count: number
    }
    cii_rating: { rating: string; value: number; status: string; description: string }
    trend_data: { date: string; actual: number; without_ai: number }[]
    route_breakdown: {
        origin: string; destination: string; route_name: string
        distance_km: number; co2_tonnes: number; rating: string; is_green: boolean
    }[]
    compliance: Record<string, {
        status: string; headline: string; explanation: string; action: string
    }>
}

const RATING_COLORS = {
    A: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
    B: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    C: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    D: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    E: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
}

const STATUS_DOT: Record<string, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-400',
    red: 'bg-red-500',
}

function MetricCard({
    label, value, sub, accent = 'blue', icon
}: {
    label: string; value: string; sub: string; accent?: string; icon?: React.ReactNode
}) {
    const colors: Record<string, string> = {
        blue: 'text-blue-700',
        green: 'text-green-600',
        red: 'text-red-600',
        amber: 'text-amber-600',
    }
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
                <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
                <span className="text-base">{icon}</span>
            </div>
            <div className={`text-2xl font-bold ${colors[accent] ?? colors.blue}`}>{value}</div>
            <div className="text-xs text-slate-400 mt-1">{sub}</div>
        </div>
    )
}

function RatingBadge({ rating }: { rating: string }) {
    const c = RATING_COLORS[rating as keyof typeof RATING_COLORS] ?? RATING_COLORS.C
    return (
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border ${c.bg} ${c.text} ${c.border}`}>
            {rating}
        </span>
    )
}

export default function SustainabilityPage() {
    const router = useRouter()
    const [data, setData] = useState<ESGData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchESGDashboard()
            .then(setData)
            .finally(() => setLoading(false))
    }, [])

    if (loading) return (
        <div className="flex flex-col h-full overflow-hidden">
            <TopBar title="Sustainability & ESG" subtitle="Fleet carbon performance and regulatory compliance" />
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Calculating fleet emissions...
            </div>
        </div>
    )

    if (!data) return null

    const m = data.metrics

    // Format trend data for chart — show last 14 days only for clarity
    const trendSlice = data.trend_data.slice(-14).map(d => ({
        ...d,
        date: d.date.slice(5),  // show MM-DD only
        gap: +(d.without_ai - d.actual).toFixed(1),
    }))

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <TopBar
                title="Sustainability & ESG"
                subtitle="Fleet carbon performance and EU regulatory compliance"
                badges={[
                    { label: `CII Rating: ${data.cii_rating.rating}`, color: data.cii_rating.status === 'green' ? 'green' : data.cii_rating.status === 'amber' ? 'amber' : 'red' },
                    { label: `${m.green_route_percentage}% green routes`, color: 'green' },
                ]}
            />

            <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="p-5 space-y-5 max-w-6xl">

                    {/* Section 1 — Headline metrics */}
                    <div>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Fleet carbon performance — month to date
                        </h2>
                        <div className="grid grid-cols-5 gap-3">
                            <MetricCard
                                label="Total CO₂ emitted"
                                value={`${(m.total_co2_tonnes / 1000).toFixed(1)}k t`}
                                sub="tonnes CO₂ this month"
                                accent="blue"
                            />
                            <MetricCard
                                label="Saved by AI routing"
                                value={`${Math.abs(m.co2_saved_by_rerouting / 1000).toFixed(1)}k t`}
                                sub="vs non-optimised routes"
                                accent="green"
                            />
                            <MetricCard
                                label="Carbon tax liability"
                                value={`$${(m.carbon_tax_liability_usd / 1000).toFixed(0)}k`}
                                sub="EU ETS @ $70.20/tonne"
                                accent="amber"
                            />
                            <MetricCard
                                label="Tax saved by AI"
                                value={`$${(m.carbon_tax_saved_usd / 1000).toFixed(0)}k`}
                                sub="delay-burn avoided"
                                accent="green"
                            />
                            <MetricCard
                                label="Green corridors"
                                value={`${m.green_route_percentage}%`}
                                sub={`${m.ai_rerouted_count} of ${m.fleet_size} vessels`}
                                accent={m.green_route_percentage >= 50 ? 'green' : 'amber'}
                            />
                        </div>
                    </div>

                    {/* Section 2 — CO2 trend chart */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-sm font-semibold text-slate-800">
                                    Daily CO₂ emissions — with vs without AI routing
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    The green gap shows emissions prevented by AI rerouting decisions
                                </p>
                            </div>
                            <div className="flex gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <div className="w-3 h-0.5 bg-blue-500" /> Actual emissions
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-3 h-0.5 bg-slate-300 border-dashed border-t" /> Without AI
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 bg-green-100 rounded-sm border border-green-300" /> AI impact
                                </span>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={trendSlice} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
                                />
                                <Tooltip
                                    formatter={(value: any, name: any) => [
                                        `${(value as number).toLocaleString()} t CO₂`,
                                        name === 'actual' ? 'Actual emissions' : 'Without AI routing'
                                    ]}
                                    labelStyle={{ fontSize: 11, color: '#0f172a' }}
                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                />
                                {/* Without AI line */}
                                <Area
                                    type="monotone"
                                    dataKey="without_ai"
                                    stroke="#cbd5e1"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                    fill="#f0fdf4"
                                    fillOpacity={0.6}
                                />
                                {/* Actual line */}
                                <Area
                                    type="monotone"
                                    dataKey="actual"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    fill="#eff6ff"
                                    fillOpacity={0.5}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Section 3 — Route emissions breakdown */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-100">
                            <h2 className="text-sm font-semibold text-slate-800">
                                Route emissions breakdown
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Active routes sorted by carbon footprint — highest first
                            </p>
                        </div>
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    {['Route', 'Via', 'Distance', 'CO₂ (tonnes)', 'Efficiency rating', 'Action'].map(h => (
                                        <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-400 uppercase tracking-wider text-xs">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {data.route_breakdown.map((r, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                            {r.origin} → {r.destination}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">{r.route_name}</td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {r.distance_km.toLocaleString()} km
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-700">
                                                    {r.co2_tonnes.toLocaleString()}
                                                </span>
                                                {r.is_green && (
                                                    <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full">
                                                        Green
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <RatingBadge rating={r.rating} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => router.push(`/route-intelligence?origin=${r.origin}&destination=${r.destination}&tab=assess`)}
                                                className="text-xs text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                                            >
                                                Optimise →
                                            </button>
                                    </td>
                  </tr>
                ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 4 — Regulatory compliance */}
                <div>
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Regulatory compliance status
                    </h2>
                    <div className="grid grid-cols-3 gap-4">
                        {Object.entries(data.compliance).map(([key, item]) => (
                            <div key={key} className="bg-white border border-slate-200 rounded-xl p-4">
                                <div className="flex items-start gap-2.5 mb-3">
                                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${STATUS_DOT[item.status] ?? 'bg-slate-400'}`} />
                                    <div className="text-xs font-semibold text-slate-800">{item.headline}</div>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                                    {item.explanation}
                                </p>
                                <div className={`text-xs px-3 py-2 rounded-lg font-medium ${item.status === 'green' ? 'bg-green-50 text-green-700'
                                    : item.status === 'amber' ? 'bg-amber-50 text-amber-700'
                                        : 'bg-red-50 text-red-700'
                                    }`}>
                                    Action: {item.action}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div >
  )
}