# 🌍 Borewell Site Prediction System

<div align="center">

# 🚀 AI-Powered Groundwater Potential Zone Prediction Platform

Predict the **best borewell drilling location** inside a user-selected land parcel using **terrain analysis, NDVI vegetation insights, and machine learning**.

![React](https://img.shields.io/badge/Frontend-React%2019-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.11+-yellow?style=for-the-badge&logo=python)
![Leaflet](https://img.shields.io/badge/Maps-Leaflet-green?style=for-the-badge&logo=leaflet)
![Machine Learning](https://img.shields.io/badge/ML-Random%20Forest-orange?style=for-the-badge)

</div>

---

# ✨ Features

- ✅ Draw custom land parcels directly on the map
- ✅ Circle-based study area selection
- ✅ AI-powered groundwater suitability scoring
- ✅ Terrain slope analysis
- ✅ NDVI vegetation analysis
- ✅ Random Forest classification model
- ✅ Confidence-based prediction system
- ✅ FastAPI backend with geospatial processing
- ✅ React + Leaflet interactive frontend
- ✅ Optional Google Earth Engine integration
- ✅ Fully responsive UI

---

# 🖼️ Application Workflow

```text
Draw Area → Send Polygon → Analyze Terrain & Vegetation →
ML Prediction → Best Borewell Location
```

---

# 🧠 How It Works

The system predicts groundwater potential using geospatial and environmental indicators.

## 🔄 Workflow

### 1️⃣ User Draws Area

The user selects:

- A polygon parcel
OR
- A circular region (center + radius)

on the interactive map.

---

### 2️⃣ Frontend Sends GeoJSON

The frontend sends the selected geometry to:

```http
POST /analyze
```

Example payload:

```json
{
  "polygon_geojson": { ... },
  "resolution_m": 30
}
```

---

### 3️⃣ Backend Processing

The backend performs:

- CRS transformation (WGS84 → Local UTM)
- Rasterization
- Terrain feature extraction
- NDVI computation
- Synthetic geology feature generation
- ML-based groundwater scoring

---

### 4️⃣ Machine Learning Prediction

A lightweight **Random Forest Classifier** predicts the best groundwater potential zone.

The API returns:

- 📍 Suggested latitude & longitude
- 🌊 Potential category
- 📊 Confidence score
- 📝 Analysis notes

---

# 🏗️ Tech Stack

| Layer | Technology |
|------|-------------|
| Frontend | React 19 |
| Language | TypeScript |
| Build Tool | Vite 7 |
| Maps | Leaflet + React Leaflet |
| Drawing Tools | leaflet-draw |
| Spatial Utilities | Turf.js |
| Backend | FastAPI |
| Geospatial Processing | GeoPandas |
| Raster Processing | Rasterio |
| Machine Learning | scikit-learn |
| Optional Satellite Data | Google Earth Engine |

---

# 📂 Project Structure

```bash
borewell-site-prediction/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── engine/
│   │   ├── services/
│   │   └── utils/
│   │
│   ├── requirements.txt
│   └── .venv/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── vite.config.ts
│   └── package.json
│
└── README.md
```

---

# ⚙️ Backend Setup

## 📌 Requirements

- Python 3.11+
- pip
- virtualenv

---

## 🚀 Installation

```bash
cd backend

python -m venv .venv
```

### Activate Environment

### Windows

```bash
.venv\Scripts\activate
```

### Linux / macOS

```bash
source .venv/bin/activate
```

---

## 📦 Install Dependencies

```bash
pip install -r requirements.txt
```

---

## ▶️ Run Backend

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

# 🔥 Backend Endpoints

## ✅ Health Check

```http
GET /health
```

Example:

```http
http://127.0.0.1:8000/health
```

---

## 🌍 Analyze Borewell Site

```http
POST /analyze
```

### Request Body

```json
{
  "polygon_geojson": { ... },
  "resolution_m": 30
}
```

### Response Example

```json
{
  "latitude": 15.9129,
  "longitude": 79.7400,
  "potential_category": "Very Good",
  "confidence": 0.89,
  "notes": "High vegetation and favorable slope detected"
}
```

---

## 🔎 Geocoding API

```http
GET /geocode?q=tirupati
```

Uses:

- OpenStreetMap Nominatim
- India-biased place search

---

# 🌐 Frontend Setup

## 📦 Install Packages

```bash
cd frontend

npm install
```

---

## ▶️ Run Frontend

```bash
npm run dev
```

---

# 🔗 API Proxy Configuration

The Vite dev server proxies:

```bash
/api/*
```

to:

```bash
http://127.0.0.1:8000
```

Configured inside:

```bash
frontend/vite.config.ts
```

---

# 🌎 Production API URL

To use another backend URL:

## Windows CMD

```bash
set VITE_API_BASE=https://your-api.example.com
npm run dev
```

## PowerShell

```powershell
$env:VITE_API_BASE="https://your-api.example.com"
npm run dev
```

---

# 🏗️ Production Build

## Build Frontend

```bash
npm run build
```

---

## Preview Production Build

```bash
npm run preview
```

---

# 🛰️ Google Earth Engine Integration

The project optionally supports:

- SRTM terrain data
- Sentinel-2 NDVI imagery

via Google Earth Engine.

---

## Enable GEE

Set:

```env
USE_GEE=true
```

---

## Authenticate Earth Engine

Follow official setup:

```text
https://developers.google.com/earth-engine/guides/python_install
```

---

## Fallback Mode

If GEE fails or is disabled:

- ✅ Synthetic slope data
- ✅ Mock NDVI generation

are used for local development.

---

# 🧪 ML Model Details

The prediction engine uses:

## 🌲 Random Forest Classifier

Features include:

- Terrain slope
- Elevation proxies
- Vegetation density
- Mock geology layers
- Hydrological indicators

---

## 📊 Output Categories

| Category | Meaning |
|----------|----------|
| Very Good | Excellent groundwater potential |
| Good | Favorable borewell zone |
| Moderate | Medium potential |
| Poor | Low groundwater possibility |

---

# 📌 Resolution Settings

`resolution_m`

Controls raster precision.

| Value | Meaning |
|------|----------|
| 5 | High detail |
| 30 | Recommended |
| 100+ | Faster processing |

Allowed range:

```text
5 → 500 meters
```

---

# 🛡️ Disclaimer

⚠️ This project is intended for:

- Educational purposes
- Research prototypes
- Geospatial experimentation

It is NOT a replacement for:

- Geological surveys
- Hydrogeologist field inspections
- Government-approved groundwater studies

Predictions are generated using environmental proxies and ML estimation — not real underground water validation.

---

# 📜 License & Data Sources

This project uses:

- OpenStreetMap map tiles
- Nominatim geocoding
- Optional Google Earth Engine datasets

Please respect their terms and usage policies.

---

# ❤️ Credits

Built with passion using:

- React
- FastAPI
- GeoPandas
- Rasterio
- Leaflet
- Machine Learning
- Open Geospatial Technologies

---

# ⭐ Future Improvements

- Real borewell training datasets
- Groundwater depth prediction
- Rainfall integration
- Soil classification
- Satellite time-series analysis
- AI heatmap visualization
- Mobile app support
- Cloud deployment

---

# 🤝 Contributing

Contributions are welcome!

## Steps

```bash
Fork → Clone → Create Branch → Commit → Push → Pull Request
```

---

# 📬 Contact

```text
Developer: Surya
Project: Borewell Site Prediction
```

---

<div align="center">

# 🌊 Smart Groundwater Prediction using AI & Geospatial Intelligence

⭐ Star this repository if you like the project!

</div>
