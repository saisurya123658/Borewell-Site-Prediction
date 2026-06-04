const API_BASE = (
  import.meta.env.VITE_API_BASE as string | undefined
)?.replace(/\/$/, "") ??
"/api";

export type AnalyzeResult = {
  latitude: number;
  longitude: number;
  potential_category: string;
  confidence: number;
  notes: string;
  disclaimer: string;
};

export async function analyzePolygon(
  feature: GeoJSON.Feature,
  resolution_m = 30,
): Promise<AnalyzeResult> {
  const r = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polygon_geojson: feature, resolution_m }),
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const err: { detail?: string | unknown } = await r.json();
      const d = err.detail;
      msg = typeof d === "string" ? d : JSON.stringify(d ?? err);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<AnalyzeResult>;
}

export type GeocodeHit = {
  display_name: string;
  lat: number;
  lon: number;
};

export async function geocode(q: string): Promise<GeocodeHit[]> {
  const r = await fetch(
    `${API_BASE}/geocode?q=${encodeURIComponent(q)}&limit=8`,
  );
  if (!r.ok) {
    throw new Error("Search failed");
  }
  return r.json() as Promise<GeocodeHit[]>;
}
