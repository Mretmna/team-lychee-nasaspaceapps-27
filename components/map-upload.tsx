"use client";

import { useState } from "react";
import type { LocationSelection } from "@/types/track";

interface UploadedMap { id: string; name: string; kind: "image" | "geojson"; url: string; area: LocationSelection }
const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";

export function MapUpload({ selection }: { selection: LocationSelection }) {
  const [file, setFile] = useState<File | null>(null);
  const [map, setMap] = useState<UploadedMap | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);
    body.append("area_name", selection.name);
    body.append("city", selection.city ?? "");
    body.append("country", selection.country ?? "");
    body.append("latitude", String(selection.latitude));
    body.append("longitude", String(selection.longitude));
    if (selection.radiusKm) body.append("radius_km", String(selection.radiusKm));
    try {
      const response = await fetch(`${apiBase}/api/maps`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "The map could not be uploaded.");
      setMap(result as UploadedMap);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The map API is unavailable.");
    } finally {
      setUploading(false);
    }
  }

  return <section className="map-upload-section" id="maps" aria-labelledby="maps-title">
    <p className="eyebrow">Your maps</p>
    <h2 id="maps-title">Bring your own map.</h2>
    <p>Upload a PNG, JPEG, WebP, or GeoJSON file (up to 10 MB) to the map API.</p>
    <p>Selected area: {selection.name}{selection.city ? ` · ${selection.city}` : ""}{selection.country ? `, ${selection.country}` : ""} ({selection.latitude.toFixed(1)}°, {selection.longitude.toFixed(1)}°{selection.radiusKm ? `, ${selection.radiusKm} km radius` : ""}). This area is sent with the map.</p>
    <form onSubmit={upload}>
      <input id="map-file" type="file" accept=".png,.jpg,.jpeg,.webp,.geojson,application/geo+json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
      <label htmlFor="map-file" className="file-picker">Choose a map</label>
      <span className="file-name" aria-live="polite">{file?.name ?? "No file selected"}</span>
      <button type="submit" disabled={!file || uploading}>{uploading ? "Uploading…" : "Upload map"}</button>
    </form>
    {error && <p className="field-error" role="alert">{error}</p>}
    {map && <div className="uploaded-map" role="status"><strong>{map.name}</strong>{map.kind === "image" ? <img src={`${apiBase}${map.url}`} alt={`Uploaded map: ${map.name}`} /> : <a href={`${apiBase}${map.url}`} target="_blank" rel="noreferrer">View uploaded GeoJSON</a>}</div>}
  </section>;
}
