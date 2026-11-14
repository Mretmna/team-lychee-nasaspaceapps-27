"use client";

import { useEffect, useRef, useState } from "react";
import { cropGlobalPng, parsePointCollection, type PointCollection } from "@/lib/geo";
import { InstrumentPlayback } from "@/components/instrument-playback";
import type { LocationSelection } from "@/types/track";
import type { ScanMode } from "@/components/rotation-visualization";

const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";
const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "http://localhost:8001";
export type VisualizationCrop = { blob: Blob; url: string; latitude: number; longitude: number; radiusKm: number; bounds: { west: number; east: number; south: number; north: number } };

export function MapUpload({ selection, points, onPointsChange, onCropChange, soundTemplate, scanMode }: { selection: LocationSelection; points: PointCollection; onPointsChange: (value: PointCollection | null) => void; onCropChange: (crop: VisualizationCrop | null) => void; soundTemplate: string; scanMode: ScanMode }) {
  const [fileName, setFileName] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [rasterFile, setRasterFile] = useState<File | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmedKey, setConfirmedKey] = useState("");
  const [preview, setPreview] = useState<{ key: string; pngUrl: string } | null>(null);
  const [sound, setSound] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [instrumentPlaying, setInstrumentPlaying] = useState(false);
  const [soundError, setSoundError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState("");
  const selectionKey = `${selection.latitude}:${selection.longitude}:${selection.radiusKm ?? 500}:${fileName}:${soundTemplate}:${scanMode}:${JSON.stringify(points.features)}`;

  useEffect(() => () => {
    if (preview) {
      URL.revokeObjectURL(preview.pngUrl);
    }
  }, [preview]);
  useEffect(() => () => { if (sound) URL.revokeObjectURL(sound.url); }, [sound]);

  async function chooseFile(file: File | undefined) {
    setActive(false);
    setStatus("");
    setPreview(null);
    onCropChange(null);
    setSound(null);
    setInstrumentPlaying(false);
    setSoundError("");
    setError("");
    onPointsChange(null);
    setRasterFile(null);
    setFileName("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a map file smaller than 10 MB.");
      return;
    }
    if (file.name.toLowerCase().endsWith(".png") && file.type === "image/png") {
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
      setSoundError("");
      try {
        let response: Response;
        let croppedBlob: Blob | null = null;
        let croppedBounds: VisualizationCrop["bounds"] | null = null;
        let soundBody: FormData | null = null;
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
          soundBody = new FormData();
          soundBody.append("file", cropped.blob, "selected-area.png");
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
        setStatus(rasterFile ? `Cropped ${result.width} × ${result.height} map pixels within ${result.radiusKm} km sent to FastAPI.` : `${result.receivedPoints} points within ${result.radiusKm} km sent to FastAPI.`);
        setConfirmedKey(selectionKey);
        if (soundBody) {
          try {
            const soundResponse = await fetch(`${soundApiBase}/sonify?duration_seconds=12&scan_mode=${scanMode}&sound_template=${encodeURIComponent(soundTemplate)}`, { method: "POST", body: soundBody, signal: controller.signal });
            if (!soundResponse.ok) {
              const detail = await soundResponse.json().catch(() => null) as { detail?: string } | null;
              throw new Error(detail?.detail ?? `Sound service returned ${soundResponse.status}.`);
            }
            const audio = await soundResponse.blob();
            if (!audio.type.startsWith("audio/")) throw new Error("Sound service did not return an audio file.");
            if (!controller.signal.aborted) setSound({ key: selectionKey, url: URL.createObjectURL(audio), blob: audio });
          } catch (cause) {
            if (!controller.signal.aborted) setSoundError(cause instanceof Error ? cause.message : "Sound could not be loaded.");
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setStatus("");
          setError(cause instanceof Error ? cause.message : "The map API is unavailable.");
        }
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [active, points, rasterFile, selection, selectionKey, soundTemplate, scanMode, onCropChange]);

  return <section className="map-upload-section" id="maps" aria-labelledby="maps-title">
    <p className="eyebrow">Your maps</p>
    <h2 id="maps-title">Bring your own map.</h2>
    <p>Choose GeoJSON points or a full-world equirectangular PNG. Only the selected radius is sent.</p>
    <p>Selected area: {selection.name} ({selection.latitude.toFixed(3)}°, {selection.longitude.toFixed(3)}°; {selection.radiusKm ?? 500} km).</p>
    <form onSubmit={(event) => { event.preventDefault(); setActive(true); }}>
      <input id="map-file" type="file" accept=".png,.geojson,.json,image/png,application/geo+json,application/json" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <label htmlFor="map-file" className="file-picker">Choose a map</label>
      <span className="file-name" aria-live="polite">{fileName || "No file selected"}</span>
      <button type="submit" disabled={!fileName}>Send selected area</button>
    </form>
    {fileName && !rasterFile && <p>{points.features.length} of {sourceCount} points are inside the radius. The map updates as you change the center or radius.</p>}
    {rasterFile && <p>The PNG is interpreted as a global equirectangular map spanning 180° W to 180° E and 90° S to 90° N.</p>}
    {active && <p role="status">{confirmedKey === selectionKey ? status : "Updating selected area…"}</p>}
    {preview?.key === selectionKey && <div className="crop-preview"><p>Trial crop: this PNG is exactly what FastAPI received.</p><img src={preview.pngUrl} alt={`Cropped map within ${selection.radiusKm ?? 500} km of ${selection.name}`} /><a href={preview.pngUrl} download="selected-area.png">Download cropped PNG</a></div>}
    {sound?.key === selectionKey && <div className="crop-sound">
      <p>Sound from /sonify is ready.</p>
      {!instrumentPlaying && <button type="button" onClick={() => void audioRef.current?.play().catch(() => setSoundError("Playback was blocked. Use the audio controls to start it."))}>Play generated sound</button>}
      <audio ref={audioRef} controls={!instrumentPlaying} style={{ display: instrumentPlaying ? "none" : "block" }} src={sound.url} onError={() => setSoundError("The generated audio could not be decoded by this browser.")} />
      <InstrumentPlayback key={sound.url} audioBlob={sound.blob} onStart={() => { audioRef.current?.pause(); setInstrumentPlaying(true); }} onFinish={() => setInstrumentPlaying(false)} />
    </div>}
    {soundError && active && <p className="field-error" role="alert">{soundError}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
