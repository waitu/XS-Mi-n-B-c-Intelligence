# XS Miền Bắc Platform Architecture

## Overview
The project delivers a full-stack experience for exploring, analyzing, and experimenting with miền Bắc (northern) Vietnam lottery data for the current calendar year. It consists of four primary layers:

1. **Data Ingestion Service (Python)**
   - Scrapes the official lottery portal for daily draw results using HTTPX and BeautifulSoup.
   - Normalizes and stores results in a local SQLite database via SQLModel.
   - Supports idempotent refresh to keep the cache up to date.

2. **Backend API (FastAPI)**
   - Provides REST endpoints for raw results, statistics, frequency analysis, and heuristic predictions.
   - Exposes on-demand refresh to re-run the ingestion pipeline.
   - Generates computed summaries (win counts per prize, frequency of last two digits, hot/cold number trends).

3. **Analytics & Prediction Module**
   - Re-usable Python services invoked by the API.
   - Implements multiple algorithms (frequency-based, moving-window trends, randomized combos) with room for future ML models.

4. **Frontend Web Application (React + Vite + Tailwind CSS)**
   - Consumes the backend API to visualize results and analytics.
   - Provides interactive controls to inspect last-two-digit frequencies, filter by date, and execute prediction experiments.
   - Features a bold, modern theme with high-contrast palettes and subtle motion cues.

## Data Flow

```
Remote Lottery Site --> Ingestion Worker --> SQLite Cache --> FastAPI Endpoints --> React UI
```

1. On startup or by manual trigger, the ingestion worker retrieves all draws for the current year.
2. Draw results are persisted to SQLite tables (`draws`, `prizes`).
3. API endpoints read from the cache to serve clients with predictable latency.
4. Aggregations are computed on the fly with SQL queries or cached computations.

## Backend API Surface

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Service heartbeat |
| `/results` | GET | Paginated list of draws with optional `date`, `limit`, `offset` filters |
| `/results/{draw_date}` | GET | Detailed draw by date |
| `/stats/summary` | GET | Prize counts, number of draws, latest update |
| `/stats/frequencies` | GET | Frequency of each 5-digit prize number |
| `/stats/tail-frequencies` | GET | Frequency of last-two-digit combinations across all prizes |
| `/predictions/heads` | GET | Returns predicted leading digits by algorithm (`frequency`, `trend`, `randomized`) |
| `/ingest/refresh` | POST | Re-run ingestion to fetch latest draws |

## Key Technologies

- **Python 3.11** with `FastAPI`, `UVicorn`, `SQLModel`, `httpx`, `beautifulsoup4`, `pandas`, `numpy`.
- **SQLite** for lightweight, zero-config persistent storage.
- **React 18** + **TypeScript** + **Vite** for fast frontend development.
- **Tailwind CSS** + custom theme for a "dangerously sleek" visual aesthetic.
- **Vitest** and **Pytest** for automated testing.

## Deployment & Execution

- Backend runs via `uvicorn backend.main:app --reload` during development.
- Frontend served with `npm run dev` (Vite dev server).
- Production setup can leverage separate processes or containerized deployment using Docker (future enhancement).

## Assumptions & Notes

- External network access is available to fetch lottery data.
- The ingestion worker targets the current year (2025) and can be extended to historical years via optional parameters.
- Prediction algorithms are heuristic-based for now; the architecture leaves room for advanced ML integrations later.
