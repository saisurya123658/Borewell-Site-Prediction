import * as turf from "@turf/turf";
import L from "leaflet";
import "leaflet-draw";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import {
  type AnalyzeResult,
  analyzePolygon,
  geocode,
  type GeocodeHit,
} from "./api";

const INDIA_CENTER: [number, number] = [22.5, 79.0];
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
Reflect.deleteProperty(L.Icon.Default.prototype as object, "_getIconUrl");
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});
L.Marker.prototype.options.icon = DefaultIcon;

type Mode = "polygon" | "circle";

function FlyToSelection({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo(target, 16, { duration: 1.1 });
  }, [map, target]);
  return null;
}

function PolygonDrawControl({
  active,
  onStudyChange,
}: {
  active: boolean;
  onStudyChange: (
    f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null,
  ) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    // leaflet-draw extends L.Control
    const DrawControl = (L as unknown as { Control: { Draw: new (o: unknown) => L.Control } })
      .Control.Draw;
    const ctl = new DrawControl({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#e07b39",
            weight: 2,
            fillOpacity: 0.12,
          },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawn,
        remove: true,
      },
    });
    map.addControl(ctl);

    const onCreated = (e: L.LeafletEvent & { layer: L.Layer }) => {
      drawn.clearLayers();
      drawn.addLayer(e.layer);
      const gj = (e.layer as L.Polygon).toGeoJSON() as GeoJSON.Feature<
        GeoJSON.Polygon | GeoJSON.MultiPolygon
      >;
      onStudyChange(gj);
    };

    const onDeleted = () => {
      drawn.clearLayers();
      onStudyChange(null);
    };

    map.on("draw:created", onCreated as L.LeafletEventHandlerFn);
    map.on("draw:deleted", onDeleted);

    return () => {
      map.off("draw:created", onCreated as L.LeafletEventHandlerFn);
      map.off("draw:deleted", onDeleted);
      map.removeControl(ctl);
      map.removeLayer(drawn);
    };
  }, [active, map, onStudyChange]);

  return null;
}

function isAreaFeature(
  f: GeoJSON.Feature | null,
): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  if (!f || f.type !== "Feature" || !f.geometry) return false;
  return f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("polygon");
  const [studyFeature, setStudyFeature] = useState<GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon
  > | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [geohits, setGeohits] = useState<GeocodeHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [centerLat, setCenterLat] = useState("22.5726");
  const [centerLon, setCenterLon] = useState("88.3639");
  const [radiusM, setRadiusM] = useState("120");

  const handleStudyChange = useCallback(
    (f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null) => {
      setStudyFeature(f);
      setResult(null);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    setStudyFeature(null);
    setResult(null);
    setError(null);
  }, [mode]);

  const studyStyle = useMemo(
    () => ({
      color: "#e07b39",
      weight: 2,
      fillOpacity: 0.12,
    }),
    [],
  );

  const applyCircle = () => {
    const lat = Number(centerLat);
    const lon = Number(centerLon);
    const r = Number(radiusM);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(r)) {
      setError("Enter valid latitude, longitude, and radius.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("Latitude or longitude out of range.");
      return;
    }
    if (r < 10 || r > 5000) {
      setError("Use radius between 10 and 5000 metres.");
      return;
    }
    const pt = turf.point([lon, lat]);
    const poly = turf.buffer(pt, r, { units: "meters" }) as GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon
    >;
    const feature: GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon
    > = {
      type: "Feature",
      properties: { source: "center_radius", radius_m: r },
      geometry: poly.geometry,
    };
    setStudyFeature(feature);
    setFlyTo([lat, lon]);
    setResult(null);
    setError(null);
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenterLat(pos.coords.latitude.toFixed(6));
        setCenterLon(pos.coords.longitude.toFixed(6));
        setFlyTo([pos.coords.latitude, pos.coords.longitude]);
      },
      () => setError("Could not read GPS. Allow location or enter coordinates."),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const hits = await geocode(q);
      setGeohits(hits);
    } catch {
      setGeohits([]);
      setError("Search failed. Try another query.");
    } finally {
      setSearching(false);
    }
  };

  const onPickHit = (h: GeocodeHit) => {
    setFlyTo([h.lat, h.lon]);
    setCenterLat(h.lat.toFixed(6));
    setCenterLon(h.lon.toFixed(6));
  };

  const runAnalyze = async () => {
    if (!studyFeature || !isAreaFeature(studyFeature)) {
      setError("Draw a closed polygon or apply a center + radius area first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await analyzePolygon(studyFeature, 30);
      setResult(res);
      setFlyTo([res.latitude, res.longitude]);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = Boolean(studyFeature && isAreaFeature(studyFeature));

  return (
    <div className="app-shell">
      <aside className="panel">
        <header>
          <h1>Borewell site preview</h1>
          <p className="lede">
            Outline your land as a closed polygon (main flow), or switch to
            center + radius from GPS or pasted coordinates. The backend runs
            groundwater potential zoning-style scoring inside that boundary
            only (terrain slope, vegetation proxy, mocked hydrogeology layers).
            Enable <code>USE_GEE=true</code> for real SRTM slope + Sentinel NDVI
            where configured.
          </p>
        </header>

        <div className="field">
          <label htmlFor="search">Find a place in India</label>
          <div className="search-row">
            <input
              id="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              placeholder="Village, taluka, landmark…"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn"
              onClick={() => void runSearch()}
              disabled={searching}
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {geohits && geohits.length > 0 ? (
            <ul className="geocode-list">
              {geohits.map((h) => (
                <li key={`${h.lat},${h.lon}`} onClick={() => onPickHit(h)}>
                  {h.display_name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="field">
          <label>Study area</label>
          <div className="seg">
            <button
              type="button"
              className={mode === "polygon" ? "active" : ""}
              onClick={() => setMode("polygon")}
            >
              Draw polygon
            </button>
            <button
              type="button"
              className={mode === "circle" ? "active" : ""}
              onClick={() => setMode("circle")}
            >
              Center + radius
            </button>
          </div>
        </div>

        {mode === "circle" ? (
          <>
            <div className="field-row">
              <div className="field">
                <label htmlFor="lat">Latitude (°)</label>
                <input
                  id="lat"
                  value={centerLat}
                  onChange={(e) => setCenterLat(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="lon">Longitude (°)</label>
                <input
                  id="lon"
                  value={centerLon}
                  onChange={(e) => setCenterLon(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="rad">Radius (m)</label>
              <input
                id="rad"
                value={radiusM}
                onChange={(e) => setRadiusM(e.target.value)}
              />
            </div>
            <div className="search-row">
              <button type="button" className="btn" onClick={() => useGps()}>
                Use my location
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => applyCircle()}
              >
                Use circle on map
              </button>
            </div>
          </>
        ) : (
          <p className="lede" style={{ margin: 0 }}>
            Use the polygon tool on the map to trace your parcel. Edit or
            delete with the toolbar.
          </p>
        )}

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "0.25rem" }}
          disabled={!canAnalyze || loading}
          onClick={() => void runAnalyze()}
        >
          {loading ? "Analyzing…" : "Analyze study area"}
        </button>

        {error ? <p className="err">{error}</p> : null}

        {result ? (
          <div className="result-card">
            <h2>Suggested bore point (inside boundary)</h2>
            <p className="coords">
              <strong>Latitude</strong> {result.latitude.toFixed(6)}
              <br />
              <strong>Longitude</strong> {result.longitude.toFixed(6)}
            </p>
            <p style={{ margin: "0.35rem 0 0" }}>
              <strong>Potential</strong> {result.potential_category}
              <br />
              <strong>Model confidence</strong> {result.confidence} (hold-out
              accuracy proxy; not field truth)
            </p>
            {result.notes ? (
              <p className="notes-muted">{result.notes}</p>
            ) : null}
            <p className="disclaimer" style={{ marginTop: "0.5rem" }}>
              {result.disclaimer}
            </p>
          </div>
        ) : (
          <p className="disclaimer">
            Decision-support only: not yield, quality, or legal clearance.
            Coordinate with CGWA / state groundwater authorities and licensed
            drillers before acting.
          </p>
        )}
      </aside>

      <div className="map-wrap">
        <MapContainer
          center={INDIA_CENTER}
          zoom={5}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyToSelection target={flyTo} />
          <PolygonDrawControl
            active={mode === "polygon"}
            onStudyChange={handleStudyChange}
          />
          {studyFeature && isAreaFeature(studyFeature) ? (
            <GeoJSON data={studyFeature} style={studyStyle} />
          ) : null}
          {result ? (
            <Marker position={[result.latitude, result.longitude]}>
              <Popup>
                Suggested site
                <br />
                {result.potential_category}
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>
        <div className="map-hint">
          Pan and zoom, search a place, then draw your land or set center +
          radius.
        </div>
      </div>
    </div>
  );
}
