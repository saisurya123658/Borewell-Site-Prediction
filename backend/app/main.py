from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.gwpz_engine import run_gwpz

DECISION_SUPPORT_DISCLAIMER = (
    "This result is decision-support only. It does not guarantee bore yield, water quality, "
    "or legal suitability. Obtain permits, follow local regulations, and consult qualified "
    "hydrogeologists / drillers before drilling."
)

app = FastAPI(title="Borewell GWPZ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    polygon_geojson: dict[str, Any] = Field(
        ...,
        description="GeoJSON Feature or Geometry in WGS84 (EPSG:4326)",
    )
    resolution_m: float = Field(30.0, ge=5.0, le=500.0)


class AnalyzeResponse(BaseModel):
    latitude: float
    longitude: float
    potential_category: str
    confidence: float
    notes: str
    disclaimer: str = Field(
        default=DECISION_SUPPORT_DISCLAIMER,
        description="Non-binding guidance; user remains responsible for permits and due diligence.",
    )


class GeocodeResult(BaseModel):
    display_name: str
    lat: float
    lon: float


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest) -> AnalyzeResponse:
    try:
        result = run_gwpz(body.polygon_geojson, resolution_m=body.resolution_m)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return AnalyzeResponse(
        latitude=result.latitude,
        longitude=result.longitude,
        potential_category=result.potential_category,
        confidence=result.confidence,
        notes=result.notes,
        disclaimer=DECISION_SUPPORT_DISCLAIMER,
    )


@app.get("/geocode")
async def geocode(q: str, limit: int = 5) -> list[GeocodeResult]:
    """
    Proxy search for India-biased place names (OpenStreetMap Nominatim).
    Use polite traffic only; for production consider a commercial geocoder.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query q is required.")
    lim = max(1, min(limit, 10))
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "format": "json",
                    "q": q,
                    "countrycodes": "in",
                    "limit": lim,
                },
                headers={
                    "User-Agent": "BoreWell-Site-Prediction/0.1 (educational; contact local maintainer)",
                    "Accept-Language": "en",
                },
            )
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Geocoder unavailable: {e}") from e

    out: list[GeocodeResult] = []
    for row in data:
        try:
            out.append(
                GeocodeResult(
                    display_name=str(row.get("display_name", "")),
                    lat=float(row["lat"]),
                    lon=float(row["lon"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out
