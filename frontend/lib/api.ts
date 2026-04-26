const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim()
}

export function formatExposure(
  riskScore: number,
  delayDays: number,
  dailyCost: number
): string | null {
  if (riskScore < 0.45 || delayDays <= 0 || !dailyCost) return null
  const exposure = delayDays * dailyCost
  if (exposure >= 1_000_000) return `$${(exposure / 1_000_000).toFixed(1)}M exposure`
  if (exposure >= 1_000)     return `$${(exposure / 1_000).toFixed(0)}k exposure`
  return `$${exposure.toFixed(0)} exposure`
}

export async function fetchShipments() {
  const res = await fetch(`${BASE}/shipments`)
  if (!res.ok) throw new Error('Failed to fetch shipments')
  return res.json()
}

export async function fetchRoutes() {
  const res = await fetch(`${BASE}/routes`)
  if (!res.ok) throw new Error('Failed to fetch routes')
  return res.json()
}

export async function fetchRoutesForPair(origin: string, destination: string) {
  const res = await fetch(
    `${BASE}/routes/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`
  )
  if (!res.ok) throw new Error('No routes found')
  return res.json()
}

export async function fetchConstraints() {
  const res = await fetch(`${BASE}/constraints`)
  if (!res.ok) throw new Error('Failed to fetch constraints')
  return res.json()
}

export async function updateConstraint(regionId: string, status: string) {
  const res = await fetch(`${BASE}/constraints/${regionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error('Failed to update constraint')
  return res.json()
}

export async function fetchESGDashboard() {
  const res = await fetch(`${BASE}/esg`)
  if (!res.ok) throw new Error('Failed to fetch ESG data')
  return res.json()
}

export async function predictRoute(
  origin: string,
  destination: string,
  departureDate: string
) {
  const res = await fetch(`${BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destination,
      departure_date: departureDate
    })
  })
  if (!res.ok) throw new Error('Prediction failed')
  return res.json()
}

export async function whatIfSimulation(
  origin: string,
  destination: string,
  departureDate: string,
  currentRouteId: string,
  alternateRouteId: string
) {
  const res = await fetch(`${BASE}/predict/whatif`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destination,
      departure_date: departureDate,
      current_route_id: currentRouteId,
      alternate_route_id: alternateRouteId
    })
  })
  if (!res.ok) throw new Error('What-if simulation failed')
  return res.json()
}

export async function simulateScenario(
  blockedRegions: string[],
  restrictedRegions: string[],
  scenarioName: string,
  save = false
) {
  const res = await fetch(`${BASE}/scenarios/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocked_regions: blockedRegions,
      restricted_regions: restrictedRegions,
      scenario_name: scenarioName,
      save_simulation: save,
    }),
  })
  if (!res.ok) throw new Error('Scenario simulation failed')
  return res.json()
}

export async function applyConstraintOverrides(
  overrides: Record<string, 'open' | 'restricted' | 'blocked'>
) {
  const updates = Object.entries(overrides).map(([regionId, status]) =>
    fetch(`${BASE}/constraints/${regionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  )
  await Promise.all(updates)
}