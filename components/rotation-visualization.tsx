"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualizationCrop } from "@/components/map-upload";
import { projectCircularPng } from "@/lib/geo";

const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";
const durations = [10, 20, 30] as const;

export function RotationVisualization({ crop, duration, onDurationChange }: { crop: VisualizationCrop | null; duration: 10 | 20 | 30; onDurationChange: (duration: 10 | 20 | 30) => void }) {
  const [angle, setAngle] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [circularUrl, setCircularUrl] = useState("");
  const imageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!crop) return;
    let cancelled = false;
    let url = "";
    projectCircularPng(crop).then((image) => {
      url = URL.createObjectURL(image);
      if (cancelled) URL.revokeObjectURL(url);
      else setCircularUrl(url);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "The circular map could not be displayed."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [crop]);

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
  const reach = Math.min(halfWidth, halfHeight);
  const endX = halfWidth + Math.sin(radians) * reach;
  const endY = halfHeight - Math.cos(radians) * reach;

  return <section className="rotation-visualization" aria-labelledby="rotation-title">
    <h2 id="rotation-title">Explore a visualization</h2>
      <div className="rotation-image" ref={imageRef}>{circularUrl ? <img src={circularUrl} alt="Circular view of the selected map region" /> : <p>Preparing selected region…</p>}<svg className="rotation-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true"><line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} /></svg></div>
      <p className="duration-label">Choose animation duration</p>
      <div className="rotation-controls"><div className="duration-options" role="group" aria-label="Rotation duration">{durations.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} className={duration === seconds ? "active" : ""} disabled={running || starting} onClick={() => onDurationChange(seconds)}>{seconds} seconds</button>)}</div><button type="button" className="rotation-start" disabled={!crop || running || starting} onClick={() => void start()}>{starting ? "Starting…" : running ? "Rotating…" : "Start"}</button></div>
      <p role="status">{running ? `Rotating at ${360 / duration}° per second.` : angle === 360 ? "One revolution complete." : "Choose a duration and press Start."}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
