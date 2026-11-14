"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualizationCrop } from "@/components/map-upload";

const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";
const durations = [10, 20, 30] as const;

export function RotationVisualization({ crop }: { crop: VisualizationCrop | null }) {
  const [duration, setDuration] = useState<10 | 20 | 30>(10);
  const [angle, setAngle] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const observer = new ResizeObserver(() => setSize({ width: image.clientWidth, height: image.clientHeight }));
    observer.observe(image);
    return () => observer.disconnect();
  }, [crop?.url]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      requestRef.current?.abort();
    };
  }, [crop]);

  async function start() {
    if (!crop || busyRef.current) return;
    busyRef.current = true;
    setStarting(true);
    setRunning(false);
    setAngle(0);
    setError("");
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const controller = new AbortController();
    requestRef.current = controller;
    const body = new FormData();
    body.append("file", crop.blob, "selected-area.png");
    body.append("latitude", String(crop.latitude));
    body.append("longitude", String(crop.longitude));
    body.append("radius_km", String(crop.radiusKm));
    for (const [key, value] of Object.entries(crop.bounds)) body.append(key, String(value));
    body.append("duration_seconds", String(duration));
    try {
      const response = await fetch(`${apiBase}/api/raster-selection`, { method: "POST", body, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "The visualization could not start.");
      if (result.durationSeconds !== duration) throw new Error("The backend did not confirm the selected duration.");
      if (controller.signal.aborted) return;
      setStarting(false);
      setRunning(true);
      const startedAt = performance.now();
      const tick = (now: number) => {
        const fraction = Math.min(1, (now - startedAt) / (duration * 1000));
        setAngle(fraction * 360);
        if (fraction < 1) frameRef.current = requestAnimationFrame(tick);
        else { frameRef.current = null; busyRef.current = false; setRunning(false); }
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (cause) {
      if (!controller.signal.aborted) {
        busyRef.current = false;
        setStarting(false);
        setError(cause instanceof Error ? cause.message : "The visualization could not start.");
      }
    }
  }

  const radians = angle * Math.PI / 180;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const reach = size.width && size.height ? Math.min(Math.abs(Math.sin(radians)) < 1e-9 ? Infinity : halfWidth / Math.abs(Math.sin(radians)), Math.abs(Math.cos(radians)) < 1e-9 ? Infinity : halfHeight / Math.abs(Math.cos(radians))) : 0;
  const endX = halfWidth + Math.sin(radians) * reach;
  const endY = halfHeight - Math.cos(radians) * reach;

  return <section className="rotation-visualization" aria-labelledby="rotation-title">
    <h2 id="rotation-title">Explore a visualization</h2>
    {crop ? <>
      <div className="rotation-image"><img ref={imageRef} src={crop.url} alt="Cropped selected map" /><svg className="rotation-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true"><line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} /></svg></div>
      <div className="rotation-controls"><div className="duration-options" role="group" aria-label="Rotation duration">{durations.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} className={duration === seconds ? "active" : ""} disabled={running || starting} onClick={() => setDuration(seconds)}>{seconds} seconds</button>)}</div><button type="button" className="rotation-start" disabled={running || starting} onClick={() => void start()}>{starting ? "Starting…" : running ? "Rotating…" : "Start"}</button></div>
      <p role="status">{running ? `Rotating at ${360 / duration}° per second.` : angle === 360 ? "One revolution complete." : "Choose a duration and press Start."}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </> : <p>Send a PNG map selection above to visualize its cropped image.</p>}
  </section>;
}
