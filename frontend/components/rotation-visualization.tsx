"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualizationCrop } from "@/components/map-upload";
import { InstrumentPlayback } from "@/components/instrument-playback";
import { DjIcon, HeadphonesIcon, PlayIcon, ScanPathIcon, SoundWaveIcon } from "@/components/icons";
import { cropGlobalPng, drawCircularGlobalFrame, drawRectangularGlobalFrame, projectCircularPng } from "@/lib/geo";
import { analyzeImageColors, parseVoiceAnalysis, sampleVoiceAnalysis, voiceKeys, type VoiceAnalysis } from "@/lib/voice-analysis";
import type { LoadedTrack, LocationSelection, RegionShape } from "@/types/track";

const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "/sound-api";
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
export type Dataset = "actual" | "precipitation" | "ocean" | "seaCurrents" | "precipitationClouds" | "surfaceTemperature" | "surfaceHumidity" | "surfaceOzone" | "surfaceWindSpeed" | "carbonMonoxide" | "nitrogenOxides";
export const datasetLabels: Record<Dataset, string> = {
  actual: "Actual World", precipitation: "Global Precipitation", ocean: "North Pacific Color",
  seaCurrents: "Sea Currents & Temperatures", precipitationClouds: "Precipitation & Clouds",
  surfaceTemperature: "Near Surface Temperature", surfaceHumidity: "Near Surface Humidity",
  surfaceOzone: "Near Surface Ozone (HD)", surfaceWindSpeed: "Near Surface Wind Speed",
  carbonMonoxide: "Carbon Monoxide", nitrogenOxides: "Nitrogen Oxides",
};
export const sharedMapIds: Dataset[] = ["seaCurrents", "precipitationClouds", "surfaceTemperature", "surfaceHumidity", "surfaceOzone", "surfaceWindSpeed", "carbonMonoxide", "nitrogenOxides"];
export const stillMapPaths: Partial<Record<Dataset, string>> = {
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
export function RotationVisualization({ crop, selection, duration, onDurationChange, onPlaybackStart, dataset, sourceMode, sourceLabel, regionShape, templates, soundTemplate, onSoundTemplateChange, scanMode, onScanModeChange, soundMode, onSoundModeChange, templateError, onRetryTemplates, track }: { crop: VisualizationCrop | null; selection: LocationSelection; duration: 10 | 20 | 30; onDurationChange: (duration: 10 | 20 | 30) => void; onPlaybackStart: () => void; dataset: Dataset; sourceMode: "default" | "upload"; sourceLabel: string; regionShape: RegionShape; templates: SoundTemplateOption[]; soundTemplate: string; onSoundTemplateChange: (template: string) => void; scanMode: ScanMode; onScanModeChange: (mode: ScanMode) => void; soundMode: SoundMode; onSoundModeChange: (mode: SoundMode) => void; templateError: string; onRetryTemplates: () => void; track: LoadedTrack | null }) {
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
  const [voiceAnalysis, setVoiceAnalysis] = useState<VoiceAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [manualScan, setManualScan] = useState(false);
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
  const djDragActiveRef = useRef(false);
  const djBufferRef = useRef<AudioBuffer | null>(null);
  const djDecodeRef = useRef<Promise<AudioBuffer> | null>(null);
  const djContextRef = useRef<AudioContext | null>(null);
  const djSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const djLastSampleAtRef = useRef(-Infinity);

  function announceProgress(fraction: number) {
    const quarter = Math.min(4, Math.floor(fraction * 4));
    if (quarter <= announcedQuarterRef.current) return;
    announcedQuarterRef.current = quarter;
    setAnnouncement(quarter === 4 ? `${sourceLabel} complete.` : `${sourceLabel} ${quarter * 25} percent complete.`);
  }

  const renderVideoFrame = () => {
    if (videoRef.current && frameCanvasRef.current && crop) {
      try { if (regionShape === "circle") drawCircularGlobalFrame(videoRef.current, frameCanvasRef.current, crop); else drawRectangularGlobalFrame(videoRef.current, frameCanvasRef.current, crop.bounds, regionShape === "full"); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "The NASA frame could not be displayed."); }
    }
  };

  useEffect(() => {
    if (!crop || hasVideo(dataset)) return;
    let cancelled = false;
    let url = "";
    (regionShape === "circle" ? projectCircularPng(crop) : Promise.resolve(crop.blob)).then((image) => {
      url = URL.createObjectURL(image);
      if (cancelled) URL.revokeObjectURL(url);
      else setCircularUrl(url);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "The selected map could not be displayed."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [crop, dataset, regionShape]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const observer = new ResizeObserver(() => setSize({ width: image.clientWidth, height: image.clientHeight }));
    observer.observe(image);
    return () => observer.disconnect();
  }, [crop?.url]);

  useEffect(() => {
    if (!crop) return;
    let cancelled = false;
    void analyzeImageColors(crop.blob, scanMode, regionShape).then((analysis) => {
      if (!cancelled) { setVoiceAnalysis(analysis); setAnalysisError(""); }
    }).catch(() => {
      if (!cancelled) setAnalysisError("The color graph could not read this image.");
    });
    return () => { cancelled = true; };
  }, [crop, scanMode, regionShape]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      requestRef.current?.abort();
      audio?.pause();
    };
  }, [crop]);

  useEffect(() => () => { if (soundUrl) URL.revokeObjectURL(soundUrl); }, [soundUrl]);

  useEffect(() => {
    djBufferRef.current = null;
    djDecodeRef.current = null;
    if (!soundBlob) return;
    let active = true;
    const sources = djSourcesRef.current;
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const decoding = soundBlob.arrayBuffer().then((data) => decoder.decodeAudioData(data));
    djDecodeRef.current = decoding;
    void decoding.then((buffer) => { if (active) djBufferRef.current = buffer; }).catch(() => {
      if (active) setError("This sound could not be prepared for DJ mode. You can still use the audio player.");
    });
    return () => {
      active = false;
      sources.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
      sources.clear();
      void djContextRef.current?.close();
      djContextRef.current = null;
    };
  }, [soundBlob]);



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
    if (!djDragActiveRef.current) syncToAudio();
    frameRef.current = requestAnimationFrame(animateAudio);
  }

  function onAudioPlay() {
    setError("");
    setRunning(true);
    onPlaybackStart();
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
    setAnalysisError("");
    setInstrumentPlaying(false);
    instrumentPlayingRef.current = false;
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    let requestTimeout: number | null = null;
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
        const selectedFrame = await cropGlobalPng(new File([frameBlob], "nasa-frame.png", { type: "image/png" }), { name: "Selected region", latitude: crop.latitude, longitude: crop.longitude, radiusKm: crop.radiusKm }, regionShape);
        soundImage = selectedFrame.blob;
      }
      if (controller.signal.aborted) return;
      if (hasVideo(dataset)) {
        try { setVoiceAnalysis(await analyzeImageColors(soundImage, scanMode, regionShape)); setAnalysisError(""); }
        catch { setAnalysisError("The color graph could not read this video frame."); }
      }
      requestTimeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
      const soundBody = new FormData();
      soundBody.append("file", soundImage, "selected-area.png");
      const query = new URLSearchParams({
        duration_seconds: String(duration), scan_mode: scanMode, region_shape: regionShape,
        sound_template: soundTemplate, spatial_audio: String(soundMode !== "normal"), eight_d_audio: String(soundMode === "8d"),
      });
      try {
        const analysisBody = new FormData();
        analysisBody.append("file", soundImage, "selected-area.png");
        const response = await fetch(`${soundApiBase}/analyze?${query}`, { method: "POST", body: analysisBody, signal: controller.signal });
        if (!response.ok) throw new Error(`Color analysis returned ${response.status}.`);
        setVoiceAnalysis(parseVoiceAnalysis(await response.json() as unknown));
        setAnalysisError("");
      } catch {
        if (timedOut) throw new Error("The sound service timed out. Generate again to retry.");
        if (controller.signal.aborted) return;
        // The local image analysis keeps the graph usable with older sound services.
      }
      let sound: Blob;
      try {
        const soundResponse = await fetch(`${soundApiBase}/sonify?${query}`, { method: "POST", body: soundBody, signal: controller.signal });
        if (!soundResponse.ok) {
          const detail = await soundResponse.json().catch(() => null) as { detail?: string } | null;
          throw new Error(detail?.detail ?? `Sound service returned ${soundResponse.status}.`);
        }
        sound = await soundResponse.blob();
        if (!sound.type.startsWith("audio/")) throw new Error("The sound service did not return audio.");
      } catch (cause) {
        if (timedOut) throw new Error("The sound service timed out. Generate again to retry.");
        if (!controller.signal.aborted) startWithoutSound(cause instanceof Error ? cause.message : "The sound service is unavailable.");
        return;
      }
      if (timedOut) throw new Error("The sound service timed out. Generate again to retry.");
      if (controller.signal.aborted) return;
      if (requestTimeout !== null) { window.clearTimeout(requestTimeout); requestTimeout = null; }
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
      if (!controller.signal.aborted || timedOut) {
        busyRef.current = false;
        setStarting(false);
        setError(cause instanceof Error ? cause.message : "The visualization could not start.");
      }
    } finally {
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
    }
  }

  function seekScan(fraction: number) {
    const bounded = Math.max(0, Math.min(1, fraction));
    const audio = audioRef.current;
    if (soundUrl && audio && !instrumentPlayingRef.current) {
      const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      audio.currentTime = bounded * length;
      syncToAudio();
    } else {
      setAngle(bounded * 360);
      const video = videoRef.current;
      if (video && track) {
        const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
        video.currentTime = bounded * videoLength;
      }
    }
  }

  async function playDjSample(fraction: number) {
    if (!soundBlob || !djDragActiveRef.current) return;
    try {
      const context = djContextRef.current ?? new AudioContext();
      djContextRef.current = context;
      if (context.state !== "running") await context.resume();
      const buffer = djBufferRef.current ?? await djDecodeRef.current;
      if (!buffer || !djDragActiveRef.current || context !== djContextRef.current) return;
      const now = context.currentTime;
      if (now - djLastSampleAtRef.current < 0.065) return;
      djLastSampleAtRef.current = now;
      const length = Math.min(0.16, buffer.duration);
      if (length <= 0) return;
      const offset = Math.min(Math.max(0, fraction * buffer.duration), buffer.duration - length);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.55, now + Math.min(0.012, length / 4));
      gain.gain.setValueAtTime(0.55, now + Math.max(0.012, length - 0.025));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      source.onended = () => djSourcesRef.current.delete(source);
      djSourcesRef.current.add(source);
      source.start(now, offset, length);
    } catch {
      if (djDragActiveRef.current) setError("DJ playback could not start. Try the regular audio player.");
    }
  }

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!manualScan || instrumentPlayingRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.min(1, regionShape === "circle"
      ? Math.hypot(x, y) / (Math.min(bounds.width, bounds.height) / 2)
      : Math.max(Math.abs(x) / (bounds.width / 2), Math.abs(y) / (bounds.height / 2)));
    const fraction = Math.max(0, Math.min(1, scanMode === "linear" ? (x + bounds.width / 2) / bounds.width
      : scanMode === "clockwise" ? ((Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
      : scanMode === "circle_inward" ? 1 - distance : distance));
    if (!djDragActiveRef.current) {
      seekScan(fraction);
      return;
    }
    setAngle(fraction * 360);
    const video = videoRef.current;
    if (video && track && performance.now() - lastVideoUpdateRef.current >= 80) {
      const videoLength = Number.isFinite(video.duration) ? video.duration : track.track.durationSeconds;
      video.currentTime = fraction * videoLength;
      lastVideoUpdateRef.current = performance.now();
    }
    void playDjSample(fraction);
  }

  function beginDjDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!manualScan || instrumentPlayingRef.current || !(event.target as Element).closest("[data-scan-handle]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    audioRef.current?.pause();
    djDragActiveRef.current = true;
    djLastSampleAtRef.current = -Infinity;
    if (soundBlob) { setRunning(true); setError(""); }
    seekFromPointer(event);
  }

  function endDjDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    djDragActiveRef.current = false;
    djSourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
    djSourcesRef.current.clear();
    seekFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setRunning(false);
  }

  const radians = angle * Math.PI / 180;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const reach = Math.min(halfWidth, halfHeight);
  const rayReach = Math.min(Math.abs(Math.sin(radians)) > 1e-8 ? halfWidth / Math.abs(Math.sin(radians)) : Infinity, Math.abs(Math.cos(radians)) > 1e-8 ? halfHeight / Math.abs(Math.cos(radians)) : Infinity);
  const endX = halfWidth + Math.sin(radians) * rayReach;
  const endY = halfHeight - Math.cos(radians) * rayReach;
  const progress = angle / 360;
  const currentVoices = voiceAnalysis ? sampleVoiceAnalysis(voiceAnalysis, progress) : { levels: { red: 0, green: 0, blue: 0, neutral: 0 }, brightness: 0 };
  const colorTotal = voiceKeys.reduce((sum, voice) => sum + currentVoices.levels[voice], 0);
  const ringProgress = scanMode === "circle_inward" ? 1 - progress : progress;
  const radialMarker = regionShape === "circle"
    ? <circle cx={halfWidth} cy={halfHeight} r={reach * ringProgress} />
    : <rect x={halfWidth * (1 - ringProgress)} y={halfHeight * (1 - ringProgress)} width={size.width * ringProgress} height={size.height * ringProgress} />;

  const selectedTemplate = templates.find((option) => option.id === soundTemplate);
  const selectedSoundMode = soundModes.find((option) => option.id === soundMode) ?? soundModes[0];
  const canGenerate = Boolean(crop) && !running && !starting && (!hasVideo(dataset) || Boolean(track && !track.isSynthetic));

  return <section className="rotation-visualization" aria-labelledby="rotation-title">
    <div className="sound-intro">
      <p className="eyebrow">03 · Sound</p>
      <h2 id="rotation-title">Map preview</h2>
      <p>The gold line shows which part of the map you’re hearing.</p>
    </div>
    <div className="sound-preview" id="sound-preview">
      <div className={`rotation-image region-${regionShape} ${manualScan ? "manual-scan-active" : ""}`} ref={imageRef} role="img" aria-label={`${sourceLabel} in a ${regionShape === "full" ? "whole-map" : regionShape} view`} onPointerDown={beginDjDrag} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }} onPointerUp={endDjDrag} onPointerCancel={endDjDrag}>{!hasVideo(dataset) ? circularUrl ? <img src={circularUrl} alt="" aria-hidden="true" /> : <p>{sourceMode === "upload" ? "Upload a PNG or JPEG, then prepare the selected area." : "Preparing selected region…"}</p> : track && !track.isSynthetic ? <><video ref={videoRef} className="timeline-source" src={track.track.videoUrl} preload="auto" muted playsInline onLoadedData={renderVideoFrame} onSeeked={renderVideoFrame} onError={() => setError("The NASA video could not be loaded.")} /><canvas ref={frameCanvasRef} className="timeline-canvas" aria-hidden="true" /></> : <p>{track?.isSynthetic ? "NASA timeline unavailable. The synthetic preview is not shown here." : "Loading NASA timeline…"}</p>}<svg className="rotation-overlay" width={size.width} height={size.height} viewBox={`0 0 ${size.width || 1} ${size.height || 1}`} aria-hidden="true">
        {scanMode === "clockwise" && <line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} />}
        {scanMode === "linear" && <line x1={size.width * progress} y1={0} x2={size.width * progress} y2={size.height} />}
        {(scanMode === "circle_outward" || scanMode === "circle_inward") && radialMarker}
        {manualScan && !instrumentPlaying && <g className="scan-grab-targets" data-scan-handle="true">
          {scanMode === "clockwise" && <line x1={halfWidth} y1={halfHeight} x2={endX} y2={endY} />}
          {scanMode === "linear" && <line x1={size.width * progress} y1={0} x2={size.width * progress} y2={size.height} />}
          {(scanMode === "circle_outward" || scanMode === "circle_inward") && radialMarker}
          {scanMode !== "linear" && <circle className="scan-center-grip" cx={halfWidth} cy={halfHeight} r={16} />}
        </g>}
      </svg></div>
    <div className="rotation-audio">
      <strong className="rotation-audio-title">{soundUrl ? "Now playing" : "Listen here"}</strong>
      <p>{soundUrl ? "Use the controls to pause or replay." : "Generate a sound to see playback controls."}</p>
      {soundUrl && !instrumentPlaying && <button type="button" className="rotation-start" onClick={() => void audioRef.current?.play().catch(() => setError("Playback was blocked. Use the audio controls to start it."))}><PlayIcon /> Replay sound</button>}
      <audio ref={audioRef} controls={Boolean(soundUrl) && !instrumentPlaying} style={{ display: soundUrl && !instrumentPlaying ? "block" : "none" }} aria-label="Generated region sound" onPlay={onAudioPlay} onPause={onAudioStop} onSeeked={syncToAudio} onEnded={() => { setAngle(360); onAudioStop(); }} onError={() => setError("The generated audio could not be played by this browser.")} />
      {soundBlob && <InstrumentPlayback key={soundUrl} audioBlob={soundBlob}
        onStart={() => { onPlaybackStart(); instrumentPlayingRef.current = true; audioRef.current?.pause(); setInstrumentPlaying(true); setRunning(true); busyRef.current = true; setAngle(0); announcedQuarterRef.current = 0; setAnnouncement(`${sourceLabel} instrument playback started.`); }}
        onProgress={syncToInstrument}
        onFinish={(completed) => { instrumentPlayingRef.current = false; setInstrumentPlaying(false); setRunning(false); busyRef.current = false; if (completed) setAngle(360); }} />}
    </div>
      <div className="manual-scan-controls">
        <label className="manual-scan-toggle"><input type="checkbox" checked={manualScan} disabled={instrumentPlaying} onChange={(event) => setManualScan(event.target.checked)} /><DjIcon /><span>DJ mode</span><small>Optional</small></label>
        {manualScan && <div className="manual-scan-slider"><label htmlFor="scan-position">Scan position <output>{Math.round(progress * 100)}%</output></label><input id="scan-position" type="range" min="0" max="100" value={Math.round(progress * 100)} disabled={instrumentPlaying} onChange={(event) => seekScan(Number(event.target.value) / 100)} aria-valuetext={`${Math.round(progress * 100)} percent through the scan`} /><p>{soundUrl ? "Hold and drag the gold line to hear and scrub the sound. Release to stop, or use the slider for precise seeking." : "Generate a sound first, then hold and drag the gold line to hear it as you move. You can preview the scan position now."}</p></div>}
      </div>
      <div className="sound-preview-caption"><span>SELECTED MAP</span><strong>{sourceLabel}</strong><p>{regionShape === "full" ? "Entire map" : `${selection.name} · ${selection.radiusKm ?? 500} km ${regionShape}`}</p><small>The gold line follows playback. Turn on DJ mode to drag it.</small></div>
      <section className="color-graph" aria-label="Live image color layers">
        <div className="color-graph-heading"><strong>Colors in this scan</strong><span>{Math.round(progress * 100)}% through map</span></div>
          <div className="color-graph-bars">{voiceKeys.map((voice) => {
            const percent = colorTotal > 0 ? Math.round(currentVoices.levels[voice] / colorTotal * 100) : 0;
            return <div className={`color-graph-row voice-${voice}`} key={voice}>
              <span className="color-graph-label">{voice === "neutral" ? "Gray" : voice[0].toUpperCase() + voice.slice(1)}</span>
              <div className="color-graph-track" role="meter" aria-label={`${voice === "neutral" ? "Gray" : voice} color contribution`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
              <output>{percent}%</output>
            </div>;
          })}</div>
          <div className="color-graph-brightness"><span>Brightness</span><div className="color-graph-track" role="meter" aria-label="Scan brightness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(currentVoices.brightness * 100)}><span style={{ width: `${currentVoices.brightness * 100}%` }} /></div><output>{Math.round(currentVoices.brightness * 100)}%</output></div>
          <p>Bars show brightness-weighted color layers at the gold scan marker. They follow playback and DJ mode.</p>
          {!voiceAnalysis && <p className="color-graph-empty">{analysisError || (crop ? "Reading the map’s color layers…" : "Choose a map to see its color layers.")}</p>}
      </section>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    <div className="sound-builder">
      <div className="sound-builder-heading"><span className="sound-builder-kicker"><SoundWaveIcon /> SOUND SETTINGS</span><h3>Make the sound</h3><p>Choose a template, scan path, listening mode, and length.</p></div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">01</span><div><label htmlFor="sound-template">Sound template</label><p>Choose the instruments.</p></div></div>
        <div className="sound-template-choice"><select id="sound-template" value={soundTemplate} disabled={!templates.length || starting || running} onChange={(event) => onSoundTemplateChange(event.target.value)}>
          {templates.length ? templates.map((option) => <option key={option.id} value={option.id}>{option.label}</option>) : <option value="original">Loading templates…</option>}
        </select>
        {selectedTemplate?.description && <p>{selectedTemplate.description}</p>}
        {templateError && <p role="alert">{templateError} <button type="button" onClick={onRetryTemplates}>Retry</button></p>}</div>
      </div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">02</span><div><span id="scan-mode-label" className="sound-step-label">Scan path</span><p>Choose how the line moves across the map.</p></div></div>
        <div className="scan-path-options" role="group" aria-labelledby="scan-mode-label">{scanOptions.map((option) => <button key={option.id} type="button" aria-pressed={scanMode === option.id} disabled={starting || running} onClick={() => onScanModeChange(option.id)}><ScanPathIcon mode={option.id} /><span>{option.label}</span></button>)}</div>
        <p className="scan-choice-description">The sound follows {regionShape === "circle" || !scanMode.startsWith("circle_") ? scanDescriptions[scanMode] : scanMode === "circle_outward" ? `a ${regionShape === "square" ? "square" : "rectangle"} expanding from the center to the edges` : `a ${regionShape === "square" ? "square" : "rectangle"} contracting from the edges to the center`}.</p>
      </div>
      <div className="sound-step">
        <div className="sound-step-heading"><span className="sound-step-number">03</span><div><span id="sound-mode-label" className="sound-step-label">Listening mode</span><p className="headphone-hint"><HeadphonesIcon /> Try 3D or 8D with headphones to hear the scan move.</p></div></div>
        <div className="sound-mode-toggle" role="group" aria-labelledby="sound-mode-label">{soundModes.map((option) => <button key={option.id} type="button" aria-pressed={soundMode === option.id} disabled={starting || running} onClick={() => onSoundModeChange(option.id)}>{option.label}</button>)}</div>
        <p className="sound-mode-description"><strong>{selectedSoundMode.label}:</strong> {selectedSoundMode.description}</p>
      </div>
      <div className="sound-step sound-step-last">
        <div className="sound-step-heading"><span className="sound-step-number">04</span><div><span id="duration-label" className="sound-step-label">Length</span><p>Choose 10, 20, or 30 seconds.</p></div></div>
        <div className="duration-options" role="group" aria-labelledby="duration-label">{durations.map((seconds) => <button key={seconds} type="button" aria-pressed={duration === seconds} className={duration === seconds ? "active" : ""} disabled={running || starting} onClick={() => onDurationChange(seconds)}><strong>{seconds}</strong><span>seconds</span></button>)}</div>
      </div>
      <div className="sound-generate"><p>{!crop ? "Choose a map to continue." : "Ready to generate."}</p><button type="button" className="rotation-start" disabled={!canGenerate} onClick={() => void start()}>{starting ? "Generating your sound…" : running ? "Playing your sound…" : <><PlayIcon /> Generate & play sound</>}</button></div>
    </div>
    <p className="sound-status" role="status">{starting ? "Turning your map into sound…" : running ? "Playing." : angle === 360 ? "Finished. Replay or change the settings." : crop ? "Ready to generate." : "Select a map to begin."}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
