"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualizationCrop } from "@/components/map-upload";
import { InstrumentPlayback } from "@/components/instrument-playback";
import { HeadphonesIcon, PlayIcon, ScanPathIcon, SoundWaveIcon } from "@/components/icons";
import { cropGlobalPng, drawCircularGlobalFrame, projectCircularPng } from "@/lib/geo";
import type { LoadedTrack, LocationSelection } from "@/types/track";

const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "http://localhost:8001";
const durations = [10, 20, 30] as const;
const scanOptions: { id: ScanMode; label: string }[] = [
  { id: "clockwise", label: "Clockwise" },
  { id: "linear", label: "Left to right" },
  { id: "circle_outward", label: "Center outward" },
  { id: "circle_inward", label: "Outside inward" },
];
const soundModes: { id: SoundMode; label: string; description: string }[] = [
  { id: "normal", label: "Normal", description: "Clear, centered sound. Great on any speaker." },
  { id: "3d", label: "3D", description: "Spatial stereo follows the scan. Put on headphones." },
  { id: "8d", label: "8D", description: "A wider moving sound with a soft echo. Made for headphones." },
];
export type ScanMode = "clockwise" | "linear" | "circle_outward" | "circle_inward";
export type SoundMode = "normal" | "3d" | "8d";
export type SoundTemplateOption = { id: string; label: string; description: string };
export type Dataset = "actual" | "precipitation" | "ocean" | "map1" | "map2" | "map3" | "seaCurrents" | "precipitationClouds" | "surfaceTemperature" | "surfaceHumidity" | "surfaceOzone" | "surfaceWindSpeed" | "carbonMonoxide" | "nitrogenOxides";
export const datasetLabels: Record<Dataset, string> = {
  actual: "Actual World", precipitation: "Global Precipitation", ocean: "North Pacific Color",
  map1: "Air Quality", map2: "Near Surface Ozone", map3: "Earth Now",
  seaCurrents: "Sea Currents & Temperatures", precipitationClouds: "Precipitation & Clouds",
  surfaceTemperature: "Near Surface Temperature", surfaceHumidity: "Near Surface Humidity",
  surfaceOzone: "Near Surface Ozone (HD)", surfaceWindSpeed: "Near Surface Wind Speed",
  carbonMonoxide: "Carbon Monoxide", nitrogenOxides: "Nitrogen Oxides",
};
export const sharedMapIds: Dataset[] = ["seaCurrents", "precipitationClouds", "surfaceTemperature", "surfaceHumidity", "surfaceOzone", "surfaceWindSpeed", "carbonMonoxide", "nitrogenOxides"];
export const stillMapPaths: Partial<Record<Dataset, string>> = {
  map1: "/media/map-1.jpeg", map2: "/media/map-2.jpeg", map3: "/media/map-3.jpeg",
  seaCurrents: "/media/maps/sea-currents.jpg",
  precipitationClouds: "/media/maps/precipitation-clouds.jpg",
  surfaceTemperature: "/media/maps/surface-temperature.jpg",
  surfaceHumidity: "/media/maps/surface-humidity.png",
  surfaceOzone: "/media/maps/surface-ozone.jpg",
  surfaceWindSpeed: "/media/maps/surface-wind-speed.jpg",
  carbonMonoxide: "/media/maps/carbon-monoxide.jpg",
  nitrogenOxides: "/media/maps/nitrogen-oxides.jpg",
};
const hasVideo = (dataset: Dataset) => dataset === "precipitation" || dataset === "ocean";
const scanDescriptions: Record<ScanMode, string> = {
  clockwise: "a line rotating clockwise from the center",
  linear: "a line moving from left to right",
  circle_outward: "a circle expanding from the center to the outer edge",
  circle_inward: "a circle contracting from the outer edge to the center",
};
export function RotationVisualization({ crop, selection, duration, onDurationChange, dataset, sourceMode, sourceLabel, templates, soundTemplate, onSoundTemplateChange, scanMode, onScanModeChange, soundMode, onSoundModeChange, templateError, onRetryTemplates, track }: { crop: VisualizationCrop | null; selection: LocationSelection; duration: 10 | 20 | 30; onDurationChange: (duration: 10 | 20 | 30) => void; dataset: Dataset; sourceMode: "default" | "upload"; sourceLabel: string; templates: SoundTemplateOption[]; soundTemplate: string; onSoundTemplateChange: (template: string) => void; scanMode: ScanMode; onScanModeChange: (mode: ScanMode) => void; soundMode: SoundMode; onSoundModeChange: (mode: SoundMode) => void; templateError: string; onRetryTemplates: () => void; track: LoadedTrack | null }) {
  const [angle, setAngle] = useState(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [circularUrl, setCircularUrl] = useState("");
  const [soundUrl, setSoundUrl] = useState("");
  const [soundBlob, setSoundBlob] = useState<Blob | null>(null);
  const [instrumentPlaying, setInstrumentPlaying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const lastVideoUpdateRef = useRef(-Infinity);
  const instrumentPlayingRef = useRef(false);
  const announcedQuarterRef = useRef(0);

  function announceProgress(fraction: number) {
    const quarter = Math.min(4, Math.floor(fraction * 4));
    if (quarter <= announcedQuarterRef.current) return;
    announcedQuarterRef.current = quarter;
    setAnnouncement(quarter === 4 ? `${sourceLabel} complete.` : `${sourceLabel} ${quarter * 25} percent complete.`);
  }

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
    announceProgress(fraction);
    const video = videoRef.current;
    if (video && track && (Math.abs(audio.currentTime - lastVideoUpdateRef.current) >= 0.08 || fraction === 1)) {
      const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
      video.currentTime = Math.min(videoLength, fraction * videoLength);
      lastVideoUpdateRef.current = audio.currentTime;
    }
  }

  function syncToInstrument(fraction: number) {
    setAngle(fraction * 360);
    announceProgress(fraction);
    const video = videoRef.current;
    const elapsed = fraction * duration;
    if (video && track && (Math.abs(elapsed - lastVideoUpdateRef.current) >= 0.08 || fraction === 1)) {
      const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
      video.currentTime = Math.min(videoLength, fraction * videoLength);
      lastVideoUpdateRef.current = elapsed;
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
    setAnnouncement(`${sourceLabel} playback started. ${duration} seconds total.`);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(animateAudio);
  }

  function onAudioStop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (instrumentPlayingRef.current) return;
    setRunning(false);
    busyRef.current = false;
  }

  function startWithoutSound(message: string) {
    setStarting(false);
    setError(`${message} The visualization is playing without generated sound.`);
    setRunning(true);
    setAnnouncement(`${sourceLabel} playback started without sound. ${duration} seconds total.`);
    const startedAt = performance.now();
    let lastVideoUpdate = -Infinity;
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - startedAt) / (duration * 1000));
      setAngle(fraction * 360);
      announceProgress(fraction);
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
    announcedQuarterRef.current = 0;
    setAnnouncement(`Preparing ${sourceLabel} for ${duration} seconds.`);
    setError("");
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    audioRef.current?.pause();
    setSoundUrl("");
    setSoundBlob(null);
    setInstrumentPlaying(false);
    instrumentPlayingRef.current = false;
    const controller = new AbortController();
    requestRef.current = controller;
    const video = videoRef.current;
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
      if (controller.signal.aborted) return;
      const soundBody = new FormData();
      soundBody.append("file", soundImage, "selected-area.png");
      let sound: Blob;
      try {
        const soundResponse = await fetch(`${soundApiBase}/sonify?duration_seconds=${duration}&scan_mode=${scanMode}&sound_template=${encodeURIComponent(soundTemplate)}&spatial_audio=${soundMode !== "normal"}&eight_d_audio=${soundMode === "8d"}`, { method: "POST", body: soundBody, signal: controller.signal });
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
      setSoundBlob(sound);
      const audio = audioRef.current;
      if (!audio) throw new Error("The audio player is unavailable.");
      audio.src = url;
      audio.currentTime = 0;
      lastVideoUpdateRef.current = -Infinity;
      setStarting(false);
      try { await audio.play(); }
      catch { setError("Sound is ready. Press Play in the audio controls to begin the scan."); busyRef.current = false; }
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
  const progress = angle / 360;

  const selectedTemplate = templates.find((option) => option.id === soundTemplate);
  const selectedSoundMode = soundModes.find((option) => option.id === soundMode) ?? soundModes[0];
  const canGenerate = Boolean(crop) && !running && !starting && (!hasVideo(dataset) || Boolean(track && !track.isSynthetic));

  return <section className="rotation-visualization" aria-labelledby="rotation-title">
    <div className="sound-intro">
      <p className="eyebrow">03 · Create your sound</p>
      <h2 id="rotation-title">Give your map a voice.</h2>
      <p>Every color and contour can become a note. Choose how your sound feels, then watch the scan and listen together.</p>
    </div>
    <div className="sound-preview">
      <div className="rotation-image" ref={imageRef} role="img" aria-label={`${sourceLabel} in a circular view`}>{!hasVideo(dataset) ? circularUrl ? <img src={circularUrl} alt="" aria-hidden="true" /> : <p>{sourceMode === "upload" ? "Upload a PNG or JPEG, then prepare the selected area." : "Preparing selected region…"}</p> : track && !track.isSynthetic ? <><video ref={videoRef} className="timeline-source" src={track.track.videoUrl} preload="auto" muted playsInline onLoadedData={renderVideoFrame} onSeeked={renderVideoFrame} onError={() => setError("The NASA video could not be loaded.")} /><canvas ref={frameCanvasRef} className="timeline-canvas" aria-hidden="true" /></> : <p>{track?.isSynthetic ? "NASA timeline unavailable. The synthetic preview is not shown here." : "Loading NASA timeline…"}</p>}<svg className="rotation-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true">
        {scanMode === "clockwise" && <line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} />}
        {scanMode === "linear" && <line x1={size.width * progress} y1={0} x2={size.width * progress} y2={size.height} />}
        {(scanMode === "circle_outward" || scanMode === "circle_inward") && <circle cx={halfWidth} cy={halfHeight} r={reach * (scanMode === "circle_inward" ? 1 - progress : progress)} />}
      </svg></div>
      <div className="sound-preview-caption"><span>YOUR LISTENING CANVAS</span><strong>{sourceLabel}</strong><p>{selection.name} · {selection.radiusKm ?? 500} km radius</p><small>The gold line shows where the sound is being drawn from.</small></div>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    <div className="sound-builder">
      <div className="sound-builder-heading"><span className="sound-builder-kicker"><SoundWaveIcon /> THE SOUND STUDIO</span><h3>Four choices. One new perspective.</h3><p>Set the voice, the route, the listening style, and the length. Then press generate to hear your selected place.</p></div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">01</span><div><label htmlFor="sound-template">Choose its voice</label><p>Each template gives the same map a different character.</p></div></div>
        <div className="sound-template-choice"><select id="sound-template" value={soundTemplate} disabled={!templates.length || starting || running} onChange={(event) => onSoundTemplateChange(event.target.value)}>
          {templates.length ? templates.map((option) => <option key={option.id} value={option.id}>{option.label}</option>) : <option value="original">Loading templates…</option>}
        </select>
        {selectedTemplate?.description && <p>{selectedTemplate.description}</p>}
        {templateError && <p role="alert">{templateError} <button type="button" onClick={onRetryTemplates}>Retry</button></p>}</div>
      </div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">02</span><div><span id="scan-mode-label" className="sound-step-label">Choose its journey</span><p>The scan path decides which part of the map you hear next.</p></div></div>
        <div className="scan-path-options" role="group" aria-labelledby="scan-mode-label">{scanOptions.map((option) => <button key={option.id} type="button" aria-pressed={scanMode === option.id} disabled={starting || running} onClick={() => onScanModeChange(option.id)}><ScanPathIcon mode={option.id} /><span>{option.label}</span></button>)}</div>
        <p className="scan-choice-description">The sound follows {scanDescriptions[scanMode]}.</p>
      </div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">03</span><div><span id="sound-mode-label" className="sound-step-label">Choose your listening style</span><p className="headphone-hint"><HeadphonesIcon /> Try 3D or 8D with headphones to hear the scan move.</p></div></div>
        <div className="sound-mode-toggle" role="group" aria-labelledby="sound-mode-label">{soundModes.map((option) => <button key={option.id} type="button" aria-pressed={soundMode === option.id} disabled={starting || running} onClick={() => onSoundModeChange(option.id)}>{option.label}</button>)}</div>
        <p className="sound-mode-description"><strong>{selectedSoundMode.label}:</strong> {selectedSoundMode.description}</p>
      </div>
      <div className="sound-step sound-step-last">
        <div className="sound-step-heading"><span className="sound-step-number">04</span><div><span id="duration-label" className="sound-step-label">Choose the length</span><p>A longer scan gives the details more room to unfold.</p></div></div>
        <div className="duration-options" role="group" aria-labelledby="duration-label">{durations.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} className={duration === seconds ? "active" : ""} disabled={running || starting} onClick={() => onDurationChange(seconds)}>{seconds} sec</button>)}</div>
      </div>
      <div className="sound-generate"><p>{!crop ? "Choose a map above to unlock your sound." : "Your map is ready. Press generate and listen to the result."}</p><button type="button" className="rotation-start" disabled={!canGenerate} onClick={() => void start()}>{starting ? "Generating your sound…" : running ? "Playing your sound…" : <><PlayIcon /> Generate & play sound</>}</button></div>
    </div>
    <div className="rotation-audio">
      <p>{soundUrl ? "Sound ready. Replay it here or try browser instruments below." : "Your audio player will appear here after generation."}</p>
      {soundUrl && !instrumentPlaying && <button type="button" className="rotation-start" onClick={() => void audioRef.current?.play().catch(() => setError("Playback was blocked. Use the audio controls to start it."))}><PlayIcon /> Replay sound</button>}
      <audio ref={audioRef} controls={Boolean(soundUrl) && !instrumentPlaying} style={{ display: soundUrl && !instrumentPlaying ? "block" : "none" }} aria-label="Generated region sound" onPlay={onAudioPlay} onPause={onAudioStop} onSeeked={syncToAudio} onEnded={() => { setAngle(360); onAudioStop(); }} onError={() => setError("The generated audio could not be played by this browser.")} />
      {soundBlob && <InstrumentPlayback key={soundUrl} audioBlob={soundBlob}
        onStart={() => { instrumentPlayingRef.current = true; audioRef.current?.pause(); setInstrumentPlaying(true); setRunning(true); busyRef.current = true; setAngle(0); announcedQuarterRef.current = 0; setAnnouncement(`${sourceLabel} instrument playback started.`); }}
        onProgress={syncToInstrument}
        onFinish={(completed) => { instrumentPlayingRef.current = false; setInstrumentPlaying(false); setRunning(false); busyRef.current = false; if (completed) setAngle(360); }} />}
    </div>
    <p className="sound-status" role="status">{starting ? "Turning your map into sound…" : running ? "Playing the scan. Follow the gold line." : angle === 360 ? "Scan complete. Replay your sound or try another style." : crop ? "Your map is ready to become sound." : "Select a map to begin."}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
