"""
Groundwater Potential Zone (GWPZ) preview engine.

- Pulls / generates thematic rasters inside a user polygon.
- Trains a lightweight Random Forest on pixel samples and scores all pixels.
- Returns best lat/lon, category, and model confidence.

GEE: set USE_GEE=true and configure EE credentials (see Google Earth Engine docs).
Without GEE, slope/NDVI are mocked from synthetic surfaces for local dev.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Any

import geopandas as gpd
import numpy as np
import rasterio
from rasterio import features as rio_features
from rasterio.transform import from_bounds
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

USE_GEE = os.environ.get("USE_GEE", "").lower() in ("1", "true", "yes")


def _polygon_from_geojson(geojson: dict[str, Any]) -> gpd.GeoDataFrame:
    geom = shape(geojson.get("geometry") or geojson)
    if not geom.is_valid:
        geom = geom.buffer(0)
    return gpd.GeoDataFrame(geometry=[geom], crs="EPSG:4326")


def _reproject_to_metric(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    centroid = unary_union(gdf.geometry.values).centroid
    utm = int(np.floor((centroid.x + 180) / 6) + 1)
    epsg = 32600 + utm if centroid.y >= 0 else 32700 + utm
    return gdf.to_crs(epsg=epsg)


def _rasterize_polygon(
    gdf_metric: gpd.GeoDataFrame,
    resolution_m: float,
) -> tuple[np.ndarray, rasterio.Affine, int, int]:
    minx, miny, maxx, maxy = gdf_metric.total_bounds
    width = max(1, int(np.ceil((maxx - minx) / resolution_m)))
    height = max(1, int(np.ceil((maxy - miny) / resolution_m)))
    transform = from_bounds(minx, miny, maxx, maxy, width, height)
    out = np.zeros((height, width), dtype=np.uint8)
    rio_features.rasterize(
        [(mapping(geom), 1) for geom in gdf_metric.geometry],
        out=out,
        transform=transform,
        fill=0,
        all_touched=True,
    )
    return out, transform, width, height


def _mock_slope_ndvi(
    mask: np.ndarray,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    # Smooth synthetic surfaces: lower "slope" in center-ish, variable NDVI
    cx, cy = w / 2.0, h / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    slope = 2.0 + 18.0 * (dist / (dist.max() + 1e-6)) + rng.normal(0, 0.5, size=mask.shape)
    ndvi = 0.15 + 0.55 * (1.0 - dist / (dist.max() + 1e-6)) + rng.normal(0, 0.03, size=mask.shape)
    slope = np.clip(slope, 0.1, 45.0)
    ndvi = np.clip(ndvi, -0.2, 0.95)
    slope[mask == 0] = np.nan
    ndvi[mask == 0] = np.nan
    return slope.astype(np.float32), ndvi.astype(np.float32)


def _mock_geology_layers(mask: np.ndarray, seed: int) -> dict[str, np.ndarray]:
    """
    Stand-in for Bhuvan lithology/geomorphology/lineaments.
    Replace with rasterio-opened COGs or stitched WMS/WCS tiles once licensed.
    """
    rng = np.random.default_rng(seed + 42)
    h, w = mask.shape
    lineament_density = rng.uniform(0, 4.0, size=mask.shape).astype(np.float32)
    lithology_class = rng.integers(0, 5, size=mask.shape).astype(np.float32)
    geomorph_class = rng.integers(0, 6, size=mask.shape).astype(np.float32)
    for arr in (lineament_density, lithology_class, geomorph_class):
        arr[mask == 0] = np.nan
    return {
        "lineament_density": lineament_density,
        "lithology_class": lithology_class,
        "geomorph_class": geomorph_class,
    }


def _gee_slope_ndvi(
    geojson: dict[str, Any],
    scale_m: int,
) -> tuple[np.ndarray | None, np.ndarray | None]:
    """
    Fetch median slope (degrees) and NDVI for recent cloud-free window.
    Requires: earthengine-api, authenticated project (ee.Initialize()).
    Returns None, None if import or init fails — caller falls back to mock.
    """
    if not USE_GEE:
        return None, None
    try:
        import ee

        ee.Initialize()
    except Exception:
        return None, None

    region = ee.Geometry(geojson.get("geometry") or geojson)
    dem = ee.Image("USGS/SRTMGL1_003")
    slope = ee.Terrain.slope(dem).rename("slope")

    sentinel = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    filtered = sentinel.filterBounds(region).filterDate("2024-01-01", "2026-01-01")
    mosaic = filtered.median().divide(10000)
    ndvi = mosaic.normalizedDifference(["B8", "B4"]).rename("ndvi")

    # Sample to regular grid inside ROI by reducing to image at native-ish scale
    # For production: use sampleRectangle or export to Cloud Storage as COG.
    sample = slope.addBands(ndvi).sampleRectangle(region=region, defaultValue=-9999)
    info = sample.getInfo()
    slope_arr = np.array(info["properties"]["slope"], dtype=np.float32)
    ndvi_arr = np.array(info["properties"]["ndvi"], dtype=np.float32)
    slope_arr[slope_arr < 0] = np.nan
    ndvi_arr[ndvi_arr < -1] = np.nan
    return slope_arr, ndvi_arr


def _stack_features(
    slope: np.ndarray,
    ndvi: np.ndarray,
    geo: dict[str, np.ndarray],
) -> np.ndarray:
    return np.stack(
        [
            slope,
            ndvi,
            geo["lineament_density"],
            geo["lithology_class"],
            geo["geomorph_class"],
        ],
        axis=-1,
    )


def _pixel_latlon(
    row: int,
    col: int,
    transform: rasterio.Affine,
    crs_metric,
) -> tuple[float, float]:
    x, y = rasterio.transform.xy(transform, row, col)
    pt = gpd.GeoSeries(gpd.points_from_xy([x], [y], crs=crs_metric), crs=crs_metric)
    ll = pt.to_crs(4326)
    return float(ll.y.iloc[0]), float(ll.x.iloc[0])


@dataclass
class GWPZResult:
    latitude: float
    longitude: float
    potential_category: str
    confidence: float
    notes: str


_CATEGORY_BUCKETS = (
    (0.75, "Very Good"),
    (0.55, "Good"),
    (0.35, "Moderate"),
    (0.0, "Poor"),
)


def _category_from_score(p: float) -> str:
    for threshold, label in _CATEGORY_BUCKETS:
        if p >= threshold:
            return label
    return "Poor"


def run_gwpz(
    geojson: dict[str, Any],
    resolution_m: float = 30.0,
    random_state: int = 42,
) -> GWPZResult:
    gdf_wgs = _polygon_from_geojson(geojson)
    geom_wgs = gdf_wgs.geometry.iloc[0]
    gdf_m = _reproject_to_metric(gdf_wgs)
    mask, transform, width, height = _rasterize_polygon(gdf_m, resolution_m)

    seed = random_state
    gee_slope, gee_ndvi = _gee_slope_ndvi(geojson, scale_m=int(resolution_m))

    if (
        gee_slope is None
        or gee_ndvi is None
        or gee_slope.shape != mask.shape
        or gee_ndvi.shape != mask.shape
    ):
        slope, ndvi = _mock_slope_ndvi(mask, seed)
        gee_note = "Using mocked slope/NDVI (GEE off or shape mismatch). "
    else:
        slope = np.where(mask, gee_slope, np.nan).astype(np.float32)
        ndvi = np.where(mask, gee_ndvi, np.nan).astype(np.float32)
        gee_note = "Used GEE for slope/NDVI where available. "

    geo = _mock_geology_layers(mask, seed)
    stack = _stack_features(slope, ndvi, geo)
    valid = mask.astype(bool) & np.isfinite(stack).all(axis=-1)
    if not valid.any():
        raise ValueError("No valid pixels inside polygon.")

    X = stack[valid]
    # Proxy labels: higher potential where low slope, higher NDVI, higher lineament density
    # (hard-rock heuristic — refit with CGWB-labeled yields for production)
    score_proxy = (
        -0.04 * X[:, 0]
        + 0.8 * X[:, 1]
        + 0.15 * X[:, 2]
        + 0.02 * X[:, 3]
        + 0.01 * X[:, 4]
    )
    y = (score_proxy > np.median(score_proxy)).astype(np.int32)

    if len(np.unique(y)) < 2:
        y = (score_proxy > np.percentile(score_proxy, 60)).astype(np.int32)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=random_state, stratify=y if len(np.unique(y)) > 1 else None
    )
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=8,
        min_samples_leaf=3,
        random_state=random_state,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)
    confidence = float(np.mean(clf.predict(X_test) == y_test)) if len(X_test) else 0.65

    proba = clf.predict_proba(stack.reshape(-1, stack.shape[-1]))[:, 1]
    proba_img = proba.reshape(stack.shape[:2])
    proba_img[~valid] = np.nan

    hh, ww = proba_img.shape
    flat_idx = np.arange(hh * ww, dtype=np.int64)
    valid_flat = valid.reshape(-1)
    scores_flat = proba_img.reshape(-1)
    cand_idx = flat_idx[valid_flat]
    cand_scores = scores_flat[valid_flat]
    order = np.argsort(-cand_scores)
    lat: float
    lon: float
    best_p: float
    extra = ""
    for j in order:
        idx = int(cand_idx[j])
        br, bc = np.unravel_index(idx, (hh, ww))
        plat, plon = _pixel_latlon(br, bc, transform, gdf_m.crs)
        if geom_wgs.covers(Point(plon, plat)):
            best_p = float(proba_img[br, bc])
            lat, lon = plat, plon
            break
    else:
        rp = geom_wgs.representative_point()
        lat, lon = float(rp.y), float(rp.x)
        best_p = float(np.nanmax(proba_img))
        extra = "Grid cell centers did not fall inside the polygon geometry; using an interior reference point with category from the best in-grid score. "

    return GWPZResult(
        latitude=lat,
        longitude=lon,
        potential_category=_category_from_score(best_p),
        confidence=round(min(0.99, max(0.5, confidence)), 3),
        notes=gee_note
        + extra
        + "Geology layers mocked; replace with Bhuvan/CGWB rasters. "
        + f"run_id={uuid.uuid4().hex[:8]}",
    )
