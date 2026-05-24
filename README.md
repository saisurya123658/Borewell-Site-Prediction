# Borewell Site Prediction

A full-stack app for **groundwater potential zone (GWPZ)–style preview** inside a user-defined study area in India. You draw a parcel (polygon) or define a circle (center + radius); the backend scores pixels with terrain and vegetation proxies plus placeholder geology layers, then suggests a lat/lon inside your boundary.


## Stack

| Part | Technology |
|------|------------|
| Frontend | React 19, TypeScript, Vite, Leaflet / react-leaflet, leaflet-draw, Turf.js |
| Backend | FastAPI, GeoPandas, Rasterio, scikit-learn (Random Forest), optional Google Earth Engine |

## How it works (short)

1. The frontend sends your study polygon as GeoJSON (WGS84) to `POST /analyze`.
2. The backend rasterizes the polygon in a local UTM CRS, builds feature stacks (slope, NDVI, mocked geology-style layers), fits a lightweight classifier, and returns the best-scoring pixel coordinates, a **potential category** (Very Good → Poor), and a **confidence** figure derived from hold-out accuracy (not field truth).
3. With `USE_GEE=true` and valid Earth Engine credentials, slope (SRTM) and NDVI (Sentinel-2) can come from GEE when grid shapes align; otherwise slope/NDVI are **synthetic mocks** for local development.

## Prerequisites

- **Python** 3.11+ recommended (geospatial wheels vary by version).
- **Node.js** 20+ (for Vite 7).
- On Windows, GDAL/rasterio wheels usually install via pip; if `rasterio` fails, use a conda env or follow [rasterio install docs](https://rasterio.readthedocs.io/en/stable/installation.html).

## Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health check: `GET http://127.0.0.1:8000/health`
- Analyze: `POST http://127.0.0.1:8000/analyze` with JSON body `{ "polygon_geojson": { ... }, "resolution_m": 30 }` (`resolution_m` between 5 and 500).

### Optional: Google Earth Engine

Set `USE_GEE=true` and authenticate per [Earth Engine Python setup](https://developers.google.com/earth-engine/guides/python_install). If GEE is off or initialization fails, the engine uses mocked slope/NDVI.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000` (see `frontend/vite.config.ts`). The client defaults `VITE_API_BASE` to `/api`, so **run the backend on port 8000** while using `npm run dev`.

To point at a different API URL (e.g. production):

```bash
set VITE_API_BASE=https://your-api.example.com   # Windows cmd
# or PowerShell: $env:VITE_API_BASE="https://your-api.example.com"
npm run dev
```

Build for production:

```bash
npm run build
npm run preview   # optional local preview of dist/
```

## API summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| POST | `/analyze` | Body: `polygon_geojson`, optional `resolution_m`. Returns lat/lon, category, confidence, notes, disclaimer |
| GET | `/geocode?q=...` | India-biased place search (proxies OpenStreetMap Nominatim). Use polite traffic; production should use a commercial geocoder if volume is high |

## Project layout

```
backend/app/     # FastAPI app and GWPZ engine
frontend/src/    # React UI and API client
```

## License and data

Map tiles: OpenStreetMap contributors. Geocoding uses Nominatim; respect their [usage policy](https://operations.osmfoundation.org/policies/nominatim/). Earth Engine datasets are subject to Google’s terms when enabled.
