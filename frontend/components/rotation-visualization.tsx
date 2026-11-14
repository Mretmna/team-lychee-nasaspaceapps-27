"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualizationCrop } from "@/components/map-upload";
import { cropGlobalPng, drawCircularGlobalFrame, projectCircularPng } from "@/lib/geo";
import type { LoadedTrack } from "@/types/track";

const apiBase = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";
const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "http://localhost:8001";
const durations = [10, 20, 30] as const;
export type SoundTemplateOption = { id: string; label: string; description: string };
export type Dataset = "actual" | "precipitation" | "ocean" | "map1" | "map2" | "map3";
export const datasetLabels: Record<Dataset, string> = { actual: "Actual World", precipitation: "Global Precipitation", ocean: "North Pacific Color", map1: "Air Quality", map2: "Near Surface Ozone", map3: "Earth Now" };
const datasets = (Object.entries(datasetLabels) as [Dataset, string][]).map(([id, label]) => ({ id, label }));
const hasVideo = (dataset: Dataset) => dataset === "precipitation" || dataset === "ocean";

export function RotationVisualization({ crop, duration, onDurationChange, dataset, onDatasetChange, templates, soundTemplate, onSoundTemplateChange, templateError, onRetryTemplates, track }: { crop: VisualizationCrop | null; duration: 10 | 20 | 30; onDurationChange: (duration: 10 | 20 | 30) => void; dataset: Dataset; onDatasetChange: (dataset: Dataset) => void; templates: SoundTemplateOption[]; soundTemplate: string; onSoundTemplateChange: (template: string) => void; templateError: string; onRetryTemplates: () => void; track: LoadedTrack | null }) {
  const [angle, setAngle] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [circularUrl, setCircularUrl] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const lastVideoUpdateRef = useRef(-Infinity);

  const renderVideoFrame = () => {
    if (videoRef.current && frameCanvasRef.current && crop) {
      try { drawCircularGlobalFrame(videoRef.current, frameCanvasRef.current, crop); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "The NASA frame could not be displayed."); }
    }
  };

  useEffect(() => {
    if (!crop || hasVideo(dataset)) return;
    let cancelled = false;
    let url = "";
    projectCircularPng(crop).then((image) => {
      url = URL.createObjectURL(image);
      if (cancelled) URL.revokeObjectURL(url);
      else setCircularUrl(url);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "The circular map could not be displayed."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [crop, dataset]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const observer = new ResizeObserver(() => setSize({ width: image.clientWidth, height: image.clientHeight }));
    observer.observe(image);
    return () => observer.disconnect();
  }, [crop?.url]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      requestRef.current?.abort();
      audio?.pause();
    };
  }, [crop]);

  useEffect(() => () => { if (soundUrl) URL.revokeObjectURL(soundUrl); }, [soundUrl]);

  function syncToAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    const fraction = Math.min(1, audio.currentTime / length);
    setAngle(fraction * 360);
    const video = videoRef.current;
    if (video && track && (Math.abs(audio.currentTime - lastVideoUpdateRef.current) >= 0.08 || fraction === 1)) {
      const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
      video.currentTime = Math.min(videoLength, fraction * videoLength);
      lastVideoUpdateRef.current = audio.currentTime;
    }
  }

  function animateAudio() {
    if (audioRef.current?.paused) return;
    syncToAudio();
    frameRef.current = requestAnimationFrame(animateAudio);
  }

  function onAudioPlay() {
    setError("");
    setRunning(true);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(animateAudio);
  }

  function onAudioStop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setRunning(false);
    busyRef.current = false;
  }

  function startWithoutSound(message: string) {
    setStarting(false);
    setError(`${message} The visualization is playing without generated sound.`);
    setRunning(true);
    const startedAt = performance.now();
    let lastVideoUpdate = -Infinity;
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - startedAt) / (duration * 1000));
      setAngle(fraction * 360);
      const video = videoRef.current;
      if (video && track && (now - lastVideoUpdate >= 80 || fraction === 1)) {
        const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
        video.currentTime = Math.min(videoLength, fraction * videoLength);
        lastVideoUpdate = now;
      }
      if (fraction < 1) frameRef.current = requestAnimationFrame(tick);
      else {
        frameRef.current = null;
        busyRef.current = false;
        setRunning(false);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    if (!crop || busyRef.current || (hasVideo(dataset) && (!track || track.isSynthetic))) return;
    busyRef.current = true;
    setStarting(true);
    setRunning(false);
    setAngle(0);
    setError("");
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    audioRef.current?.pause();
    setSoundUrl("");
    const controller = new AbortController();
    requestRef.current = controller;
    const video = videoRef.current;
    const body = new FormData();
    body.append("file", crop.blob, "selected-area.png");
    body.append("latitude", String(crop.latitude));
    body.append("longitude", String(crop.longitude));
    body.append("radius_km", String(crop.radiusKm));
    for (const [key, value] of Object.entries(crop.bounds)) body.append(key, String(value));
    body.append("duration_seconds", String(duration));
    body.append("visualization_id", dataset);
    try {
      let soundImage = crop.blob;
      if (hasVideo(dataset)) {
        if (!video) throw new Error("The NASA video is unavailable.");
        if (video.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const loaded = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error("The NASA video could not be loaded.")); };
            const cleanup = () => { video.removeEventListener("loadeddata", loaded); video.removeEventListener("error", failed); controller.signal.removeEventListener("abort", failed); };
            video.addEventListener("loadeddata", loaded);
            video.addEventListener("error", failed);
            controller.signal.addEventListener("abort", failed);
            video.load();
          });
        }
        if (video.currentTime > 0) {
          await new Promise<void>((resolve, reject) => {
            const seeked = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error("The NASA video frame could not be read.")); };
            const cleanup = () => { video.removeEventListener("seeked", seeked); video.removeEventListener("error", failed); controller.signal.removeEventListener("abort", failed); };
            video.addEventListener("seeked", seeked);
            video.addEventListener("error", failed);
            controller.signal.addEventListener("abort", failed);
            video.currentTime = 0;
          });
        }
        if (controller.signal.aborted) return;
        const frame = document.createElement("canvas");
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        const context = frame.getContext("2d");
        if (!context || !frame.width || !frame.height) throw new Error("The NASA video frame could not be read.");
        context.drawImage(video, 0, 0);
        const frameBlob = await new Promise<Blob>((resolve, reject) => frame.toBlob((value) => value ? resolve(value) : reject(new Error("The NASA video frame could not be encoded.")), "image/png"));
        const selectedFrame = await cropGlobalPng(new File([frameBlob], "nasa-frame.png", { type: "image/png" }), { name: "Selected region", latitude: crop.latitude, longitude: crop.longitude, radiusKm: crop.radiusKm });
        soundImage = selectedFrame.blob;
      }
      const response = await fetch(`${apiBase}/api/raster-selection`, { method: "POST", body, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "The visualization could not start.");
      if (result.durationSeconds !== duration) throw new Error("The backend did not confirm the selected duration.");
      if (result.visualizationId !== dataset) throw new Error("The backend did not confirm the selected visualization.");
      if (controller.signal.aborted) return;
      const soundBody = new FormData();
      soundBody.append("file", soundImage, "selected-area.png");
      let sound: Blob;
      try {
        const soundResponse = await fetch(`${soundApiBase}/sonify?duration_seconds=${duration}&scan_mode=clockwise&sound_template=${encodeURIComponent(soundTemplate)}`, { method: "POST", body: soundBody, signal: controller.signal });
        if (!soundResponse.ok) {
          const detail = await soundResponse.json().catch(() => null) as { detail?: string } | null;
          throw new Error(detail?.detail ?? `Sound service returned ${soundResponse.status}.`);
        }
        sound = await soundResponse.blob();
        if (!sound.type.startsWith("audio/")) throw new Error("The sound service did not return audio.");
      } catch (cause) {
        if (!controller.signal.aborted) startWithoutSound(cause instanceof Error ? cause.message : "The sound service is unavailable.");
        return;
      }
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(sound);
      setSoundUrl(url);
      const audio = audioRef.current;
      if (!audio) throw new Error("The audio player is unavailable.");
      audio.src = url;
      audio.currentTime = 0;
      lastVideoUpdateRef.current = -Infinity;
      setStarting(false);
      try { await audio.play(); }
      catch { setError("Sound is ready. Press Play in the audio controls to begin the rotation."); busyRef.current = false; }
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
      <div className="dataset-options" role="group" aria-label="Visualization dataset">{datasets.map((option) => <button key={option.id} type="button" aria-pressed={dataset === option.id} className={dataset === option.id ? "active" : ""} onClick={() => onDatasetChange(option.id)}>{option.label}</button>)}</div>
      <div className="rotation-image" ref={imageRef}>{!hasVideo(dataset) ? circularUrl ? <img src={circularUrl} alt={`Circular view of ${datasets.find((option) => option.id === dataset)?.label}`} /> : <p>Preparing selected region…</p> : track && !track.isSynthetic ? <><video ref={videoRef} className="timeline-source" src={track.track.videoUrl} preload="auto" muted playsInline onLoadedData={renderVideoFrame} onSeeked={renderVideoFrame} onError={() => setError("The NASA video could not be loaded.")} /><canvas ref={frameCanvasRef} className="timeline-canvas" role="img" aria-label={`${datasets.find((option) => option.id === dataset)?.label} within the selected radius`} /></> : <p>{track?.isSynthetic ? "NASA timeline unavailable. The synthetic preview is not shown here." : "Loading NASA timeline…"}</p>}<svg className="rotation-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true"><line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} /></svg></div>
      <div className="sound-template-choice">
        <label htmlFor="sound-template">Sound template</label>
        <select id="sound-template" value={soundTemplate} disabled={!templates.length || starting} onChange={(event) => onSoundTemplateChange(event.target.value)}>
          {templates.length ? templates.map((option) => <option key={option.id} value={option.id}>{option.label}</option>) : <option value="original">Loading templates…</option>}
        </select>
        {templates.find((option) => option.id === soundTemplate)?.description && <p>{templates.find((option) => option.id === soundTemplate)?.description}</p>}
        {templateError && <p role="alert">{templateError} <button type="button" onClick={onRetryTemplates}>Retry</button></p>}
      </div>
      <p className="duration-label">Choose animation duration</p>
      <div className="rotation-controls"><div className="duration-options" role="group" aria-label="Rotation duration">{durations.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} className={duration === seconds ? "active" : ""} disabled={running || starting} onClick={() => onDurationChange(seconds)}>{seconds} seconds</button>)}</div><button type="button" className="rotation-start" disabled={!crop || running || starting || (hasVideo(dataset) && (!track || track.isSynthetic))} onClick={() => void start()}>{starting ? "Generating sound…" : running ? "Playing…" : templateError ? "Start visualization" : "Start with sound"}</button></div>
      <div className="rotation-audio"><p>{soundUrl ? "Sound ready for this region." : "Start generates sound for the selected region."}</p>{soundUrl && <button type="button" className="rotation-start" onClick={() => void audioRef.current?.play().catch(() => setError("Playback was blocked. Use the audio controls to start it."))}>{running ? "Resume sound" : "Play generated sound"}</button>}<audio ref={audioRef} controls={Boolean(soundUrl)} style={{ display: soundUrl ? "block" : "none" }} aria-label="Generated region sound" onPlay={onAudioPlay} onPause={onAudioStop} onSeeked={syncToAudio} onEnded={() => { setAngle(360); onAudioStop(); }} onError={() => setError("The generated audio could not be played by this browser.")} /></div>
      <p role="status">{running ? `Rotating at ${360 / duration}° per second.` : angle === 360 ? "One revolution complete." : "Choose a duration and press Start."}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
