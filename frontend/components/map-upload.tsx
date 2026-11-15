"use client";

import { useEffect, useState } from "react";
import { cropGlobalPng, parsePointCollection, type PointCollection } from "@/lib/geo";
import type { LocationSelection } from "@/types/track";

const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";
export type VisualizationCrop = { blob: Blob; url: string; latitude: number; longitude: number; radiusKm: number; bounds: { west: number; east: number; south: number; north: number } };

export function MapUpload({ selection, points, onPointsChange, onCropChange }: { selection: LocationSelection; points: PointCollection; onPointsChange: (value: PointCollection | null) => void; onCropChange: (crop: VisualizationCrop | null) => void }) {
  const [fileName, setFileName] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [rasterFile, setRasterFile] = useState<File | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmedKey, setConfirmedKey] = useState("");
  const [preview, setPreview] = useState<{ key: string; pngUrl: string } | null>(null);
  const [error, setError] = useState("");
  const selectionKey = `${selection.latitude}:${selection.longitude}:${selection.radiusKm ?? 500}:${fileName}:${JSON.stringify(points.features)}`;

  useEffect(() => () => {
    if (preview) {
      URL.revokeObjectURL(preview.pngUrl);
    }
  }, [preview]);

  async function chooseFile(file: File | undefined) {
    setActive(false);
    setStatus("");
    setPreview(null);
    onCropChange(null);
    setError("");
    onPointsChange(null);
    setRasterFile(null);
    setFileName("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a map file smaller than 10 MB.");
      return;
    }
    if ((file.name.toLowerCase().endsWith(".png") && file.type === "image/png") || (/\.jpe?g$/i.test(file.name) && file.type === "image/jpeg")) {
      setRasterFile(file);
      setFileName(file.name);
      return;
    }
    try {
      const collection = parsePointCollection(JSON.parse(await file.text()));
      onPointsChange(collection);
      setSourceCount(collection.features.length);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The map file could not be read.");
    }
  }

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setError("");
      try {
        let response: Response;
        let croppedBlob: Blob | null = null;
        let croppedBounds: VisualizationCrop["bounds"] | null = null;
        if (rasterFile) {
          const cropped = await cropGlobalPng(rasterFile, selection);
          if (controller.signal.aborted) return;
          croppedBlob = cropped.blob;
          croppedBounds = cropped.bounds;
          const body = new FormData();
          body.append("file", cropped.blob, "selected-area.png");
          body.append("latitude", String(selection.latitude));
          body.append("longitude", String(selection.longitude));
          body.append("radius_km", String(selection.radiusKm ?? 500));
          for (const [name, value] of Object.entries(cropped.bounds)) body.append(name, String(value));
          response = await fetch(`${apiBase}/api/raster-selection`, { method: "POST", body, signal: controller.signal });
        } else {
          response = await fetch(`${apiBase}/api/selection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: selection.latitude, longitude: selection.longitude, radiusKm: selection.radiusKm ?? 500, data: points }),
            signal: controller.signal,
          });
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail ?? "The selected area could not be sent.");
        if (croppedBlob) {
          if (controller.signal.aborted) return;
          setPreview({ key: selectionKey, pngUrl: URL.createObjectURL(croppedBlob) });
          if (croppedBounds) onCropChange({ blob: croppedBlob, url: URL.createObjectURL(croppedBlob), latitude: selection.latitude, longitude: selection.longitude, radiusKm: selection.radiusKm ?? 500, bounds: croppedBounds });
        }
        setStatus(rasterFile ? `Map ready: ${result.width} × ${result.height} pixels within ${result.radiusKm} km. Choose sound settings below, then press Start with sound.` : `${result.receivedPoints} points within ${result.radiusKm} km are shown on the globe. Upload a PNG or JPEG to create sound.`);
        setConfirmedKey(selectionKey);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setStatus("");
          setError(cause instanceof Error ? cause.message : "The map API is unavailable.");
        }
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [active, points, rasterFile, selection, selectionKey, onCropChange]);

  return <section className="map-upload-section" id="uploaded-map-section" aria-labelledby="maps-title">
    <p className="eyebrow">Your maps</p>
    <h2 id="maps-title">Bring your own map.</h2>
    <p>Choose a full-world equirectangular PNG or JPEG (up to 8192 × 4096 pixels and 10 MB), then use the sound controls below. A detailed source gives a clearer crop. GeoJSON points can also be displayed on the globe, but cannot be turned into sound.</p>
    <p>Selected area: {selection.name} ({selection.latitude.toFixed(3)}°, {selection.longitude.toFixed(3)}°; {selection.radiusKm ?? 500} km).</p>
    <form onSubmit={(event) => { event.preventDefault(); setActive(true); }}>
      <input id="map-file" type="file" accept=".png,.jpg,.jpeg,.geojson,.json,image/png,image/jpeg,application/geo+json,application/json" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <label htmlFor="map-file" className="file-picker">Choose a map</label>
      <span className="file-name" aria-live="polite">{fileName || "No file selected"}</span>
      <button type="submit" disabled={!fileName}>Prepare selected area</button>
    </form>
    {fileName && !rasterFile && <p>{points.features.length} of {sourceCount} points are inside the radius. The map updates as you change the center or radius.</p>}
    {rasterFile && <p>The image is interpreted as a global equirectangular map spanning 180° W to 180° E and 90° S to 90° N.</p>}
    {active && <p role="status">{confirmedKey === selectionKey ? status : "Updating selected area…"}</p>}
    {preview?.key === selectionKey && <div className="crop-preview"><p>Selected area preview</p><img src={preview.pngUrl} alt={`Cropped map within ${selection.radiusKm ?? 500} km of ${selection.name}`} /><a href={preview.pngUrl} download="selected-area.png">Download cropped PNG</a></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
