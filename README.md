# MarineIQ — Maritime Supply Chain Intelligence

**Live platform →** https://supply-chain-ai-pi.vercel.app/overview

MarineIQ is a real-time maritime decision intelligence platform that predicts shipment delay risk before disruption occurs, recommends the mathematically optimal route across all feasible corridors, and delivers financially-quantified crisis analysis to executives. It moves supply chain decision-making from reactive monitoring to prescriptive action.

---

## What it does

Maritime supply chains lose an estimated $56B annually to unplanned disruptions. Existing platforms — Project44, FourKites, Flexport — provide tracking and historical ETAs. None provide per-prediction explainability, fleet-wide scenario simulation, or a generative AI advisory layer. MarineIQ does all three, deployed on a fully free-tier stack.

The system ingests origin, destination, and departure date. It filters all 36+ maritime routes through a live constraint engine checking geopolitical statuses in real time. It scores every feasible route using a multi-objective optimizer, runs XGBoost ML predictions with SHAP explainability, and surfaces the recommendation with Gemini 2.5 Flash translating the output into executive-readable language with specific financial implications.

---

## ML Performance

| Model | Metric | Value |
|---|---|---|
| XGBoost Classifier | AUC-ROC | 0.841 |
| XGBoost Classifier | Train/test gap | 0.036 |
| XGBoost Classifier | Precision (delayed) | 0.92 |
| XGBoost Regressor | R² | 0.539 |
| XGBoost Regressor | MAE | 4.18 days |
| Training dataset | Rows | 100,000 |
| Feature set | Features | 21 |
| Anomaly detection | Coverage | Top 5% flagged |

The R² of 0.539 for delay duration prediction is consistent with published maritime ML benchmarks (0.45–0.65 range). The remaining variance reflects inherent stochasticity in port operations and weather micro-events that route-level features cannot capture. The classifier's 0.92 precision on delayed shipments means when MarineIQ flags a shipment at risk, it is correct 92% of the time.

---

## Feature Engineering

The prediction pipeline builds a 21-feature vector per route at inference time:

- `distance_km`, `base_time_hrs`, `reliability_score` — route fundamentals
- `weather_severity_origin`, `weather_severity_route` — live Open-Meteo data
- `n_restricted_regions`, `n_blocked_regions`, `constraint_penalty` — geopolitical state
- `passes_suez`, `passes_hormuz`, `passes_malacca`, `passes_bab_el_mandeb` — chokepoint flags
- `passes_cape`, `passes_taiwan_strait`, `passes_south_china_sea` — corridor flags
- `departure_month`, `is_peak_season`, `is_monsoon_season` — temporal features
- `zone_id`, `zone_risk_score` — K-Means geographic clustering
- `anomaly_flag` — z-score anomaly detection vs per-route historical baseline

---
## Decision Engine

The multi-objective composite scoring formula:
Score = W1 × risk + W2 × (1 − reliability) + W3 × norm_cost + W4 × norm_time + W5 × norm_co2

| Weight | Factor | Value |
|---|---|---|
| W1 | Delay risk (ML predicted probability) | 0.35 |
| W2 | Reliability (inverse of historical rate) | 0.25 |
| W3 | Normalized route cost | 0.10 |
| W4 | Normalized transit time | 0.10 |
| W5 | Carbon emissions (1.82 t/km IMO standard) | 0.20 |

Lower composite score = better route. All feasible routes are scored and ranked. The top recommendation, two alternatives, and all blocked routes with reasons are returned to the dashboard.

---

## Core Features

### Route Intelligence
Assess any origin-destination pair. The constraint engine filters blocked routes in real time, scores all remaining routes with the composite optimizer, and returns the recommendation with risk score, predicted delay, SHAP explainability chart, and Gemini executive brief.

### SHAP Explainability
Every prediction includes a per-feature attribution breakdown using SHapley Additive exPlanations. Two-column view: factors protecting the shipment vs factors increasing risk. Each feature shows its exact contribution in percentage points, with plain English labels. Not a black box.

### Risk Simulation Engine
Simulate Black Swan events across the entire fleet before they happen. Activate geopolitical or environmental scenarios (Red Sea closure, Hormuz blockade, Taiwan Strait military closure, Pacific typhoon, and more). The engine runs the full constraint × decision pipeline for every active shipment, computes cascade port congestion at destination ports, calculates total financial exposure and daily loss rate, and generates a Gemini executive advisory.

## Port Traffic Control

Real-time monitoring and simulation of global port congestion and its direct impact on active shipments. The feature combines a heuristic congestion engine with manual override capability, giving operators both a live global picture and the ability to inject verified ground-truth data when it differs from simulation.
Port Traffic is not a standalone tracker — it reads directly from active shipment data:

- Selecting any port reveals all inbound freighters assigned to that destination, each with their current risk score
- Estimated delay cost is calculated per port based on average wait hours at a standard operating cost of $15,000 per vessel per day
- Ports in critical status automatically flag inbound shipments likely to face significant arrival delays, enabling proactive rerouting before the vessel reaches port

| Metric | Description |
|---|---|
| Total ports monitored | Scope of global tracking coverage |
| Freighters queued | Total vessels waiting across all monitored ports |
| Critical control points | Ports currently in red status |
| Avg congestion | Global maritime traffic health index |
| Manual overrides | Ports being tracked via direct user input rather than engine simulation |

### ESG and Carbon Compliance
Fleet CO₂ tracking using the IMO standard of 1.82 tonnes per km. IMO CII rating (A through E) for the fleet. EU ETS carbon tax liability at $70.20 per tonne. 30-day CO₂ trend chart showing actual vs without-AI-routing comparison. Route emissions breakdown table with A–D efficiency ratings. Three regulatory compliance panels: IMO CII, EU ETS Scope 3, and CBAM.

### Inventory Intelligence
Stockout risk alerts linked directly to live shipment delay predictions. Core calculation: buffer days = days of remaining stock minus days until shipment arrival. When buffer goes negative, a critical alert fires with financial exposure in dollar terms. Scenario planner lets operators model what happens if all linked shipments are delayed by 1–21 additional days.

### Supabase Realtime Fleet Tracking
APScheduler refreshes risk scores for all active shipments every 15 minutes. When risk crosses a threshold, Supabase Realtime fires a WebSocket event to the frontend alert feed — no page refresh needed. Status changes propagate instantly across Fleet Tracker, Inventory, and ESG modules.

---

## Architecture
```
Frontend (Next.js 15 / Vercel)
│
├── REST API calls
├── Supabase Realtime WebSocket
│
Backend (FastAPI / Render.com)
│
├── Constraint Engine
│     Fetches live statuses from Supabase
│     Hard-blocks routes through blocked regions
│     Applies reliability and cost penalties for restricted regions
│     Fallback mode: returns least-bad route if all blocked
│
├── Feature Builder
│     Builds 21-feature vector per feasible route
│     Live weather from Open-Meteo API
│     Zone assignment from K-Means lookup
│     Z-score anomaly flag vs per-route baseline
│
├── XGBoost ML Core
│     Classifier → risk probability
│     Regressor → delay days
│     SHAP TreeExplainer → per-feature attribution
│
├── Decision Engine
│     Composite scoring across all feasible routes
│     Route ranking and recommendation selection
│
└── Gemini Model
Executive advisory generation
Risk simulation briefs
Comparative route analysis
│
Data Layer (Supabase PostgreSQL)
shipments │ routes (36) │ constraints (16 regions)
inventory_items │ esg_reports │ scenario_simulations
cost_analyses
```
---

## Tech Stack

**Frontend**
- Next.js 15 with App Router
- Tailwind CSS v4
- Recharts for data visualization
- Canvas API for custom world map (no Leaflet)
- Supabase JS client for Realtime subscriptions

**Backend**
- FastAPI with Python 3.11
- uvicorn with APScheduler (15-minute risk refresh)
- Pydantic v2 for request validation
- supabase-py 2.4.6

**Machine Learning**
- XGBoost 2.0.3 — classifier and regressor in native `.ubj` format
- SHAP — TreeExplainer for per-prediction attribution
- scikit-learn — K-Means zone clustering, StandardScaler
- NumPy, Pandas, joblib

**Google AI**
- Gemini Models via `google-genai` SDK — route analysis, simulation advisories, comparative route explanations

**Data and Infrastructure**
- Supabase — PostgreSQL 15, Realtime WebSocket
- Open-Meteo API — historical and forecast weather, free, no key required
  
---

## Database Schema

**Core tables**

`shipments` — origin, destination, route_id, departure_time, risk_score, predicted_delay_days, anomaly_flag, status, cargo_type, cargo_value_usd, daily_delay_cost_usd

`routes` — origin, destination, waypoints (JSONB), distance_km, base_time_hrs, reliability_score, cost_estimate, passes_through (JSONB), zone_path (JSONB)

`constraints_table` — region_id (PK), region_name, status (open/restricted/blocked), type, notes

**Feature tables**

`inventory_items` — product_name, sku, current_stock_units, daily_consumption_rate, linked_shipment_id, incoming_quantity, reorder_point, unit_value_usd, warehouse_location

`esg_reports` — report_month, total_co2_emitted_tonnes, co2_saved_by_ai_tonnes, carbon_tax_liability_usd, green_route_percentage

`scenario_simulations` — scenario_name, blocked_regions[], affected_count, exposed_count, total_value_at_risk_usd, daily_loss_rate_usd, gemini_brief

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Model metadata, AUC, R², feature count |
| GET | `/shipments` | All active shipments ordered by risk |
| PATCH | `/shipments/{id}` | Update route, status, risk score |
| GET | `/routes` | All 36 maritime routes |
| GET | `/routes/{origin}/{dest}` | Routes for a specific pair |
| GET | `/constraints` | All 16 maritime region statuses |
| PUT | `/constraints/{region_id}` | Update region status live |
| POST | `/predict` | Full prediction pipeline — recommendation, SHAP, Gemini |
| POST | `/predict/whatif` | Compare two routes with delta analysis |
| POST | `/scenarios/simulate` | War Room fleet simulation |
| GET | `/esg` | Fleet CO₂ aggregation and compliance |

---

## Competitive Positioning

| Feature | Project44 | FourKites | MarineIQ |
|---|---|---|---|
| ML delay prediction | Yes | Yes | Yes — XGBoost AUC 0.841 |
| SHAP explainability | No | No | Yes — per prediction |
| GenAI advisory layer | Adding | No | Yes — Gemini 2.5 Flash |
| Crisis scenario simulation | No | No | Yes — Risk Simulation Engine |
| ESG / Carbon compliance | Basic | No | Yes — IMO CII + EU ETS |
| Cargo financial modeling | No | No | Yes — cargo-specific rates |
| Free deployment | No | No | Yes — entire stack |

---

## Google Solution Challenge 2026

MarineIQ was built for the Google Solution Challenge 2026. Google technologies used:

- **Gemini API** — core AI advisory layer, translating ML outputs into executive language
- **Google Antigravity** — agentic help in UI/UX and helpful in backend logic refinement
- **Google Colab** — ML training environment for all three pipeline phases
