"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MutedIcon, PauseIcon, PlayIcon, VolumeIcon } from "@/components/icons";
import { SyntheticVisual } from "@/components/synthetic-visual";
import { SonificationEngine } from "@/lib/audio-engine";
import { sampleFeatures } from "@/lib/track";
import type { LoadedTrack } from "@/types/track";

interface JukeboxPlayerProps {
  loadedTrack: LoadedTrack;
}

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function JukeboxPlayer({ loadedTrack, hideVisual = false }: JukeboxPlayerProps & { hideVisual?: boolean }) {
  const { track, isSynthetic } = loadedTrack;
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<SonificationEngine | null>(null);
  const playingRef = useRef(false);
  const syntheticClock = useRef({ base: 0, startedAt: 0 });

  const feature = useMemo(() => sampleFeatures(track.samples, currentTime), [currentTime, track.samples]);

  const readClock = useCallback(() => {
    if (!isSynthetic && videoRef.current) return videoRef.current.currentTime;
    if (!playingRef.current) return syntheticClock.current.base;
    return syntheticClock.current.base + (performance.now() - syntheticClock.current.startedAt) / 1000;
  }, [isSynthetic]);

  useEffect(() => {
    const engine = new SonificationEngine();
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []); // One audio context per mounted player; changing controls updates it below.

  useEffect(() => engineRef.current?.setVolume(volume), [volume]);
  useEffect(() => engineRef.current?.setMuted(muted), [muted]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!playingRef.current) return;
      const time = readClock();
      if (time >= track.durationSeconds) {
        playingRef.current = false;
        setPlaying(false);
        setCurrentTime(track.durationSeconds);
        syntheticClock.current.base = track.durationSeconds;
        engineRef.current?.reset(track.durationSeconds);
        return;
      }
      setCurrentTime(time);
      if (!buffering) engineRef.current?.schedule(time, track.durationSeconds, track.samples);
    }, 80);
    return () => window.clearInterval(timer);
  }, [buffering, readClock, track.durationSeconds, track.samples]);

  const start = async (startedAt: number) => {
    setAudioError("");
    try {
      await engineRef.current?.initialize();
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : "Audio could not start in this browser.");
      return;
    }

    if (currentTime >= track.durationSeconds - 0.01) seek(0, startedAt);
    if (isSynthetic) {
      syntheticClock.current = { base: currentTime >= track.durationSeconds - 0.01 ? 0 : currentTime, startedAt };
      playingRef.current = true;
      setPlaying(true);
      return;
    }
    try {
      await videoRef.current?.play();
    } catch {
      setMediaError("The visualization could not start. Check that the MP4 is present and browser-compatible.");
    }
  };

  const pause = () => {
    const time = readClock();
    if (!isSynthetic) videoRef.current?.pause();
    syntheticClock.current.base = time;
    playingRef.current = false;
    setPlaying(false);
    setCurrentTime(time);
    engineRef.current?.reset(time);
  };

  const seek = (time: number, startedAt: number) => {
    const next = Math.min(track.durationSeconds, Math.max(0, time));
    if (!isSynthetic && videoRef.current) videoRef.current.currentTime = next;
    syntheticClock.current = { base: next, startedAt };
    setCurrentTime(next);
    engineRef.current?.reset(next);
  };

  const onRealVideoPlaying = () => {
    setBuffering(false);
    playingRef.current = true;
    setPlaying(true);
  };

  return (
    <section className="listening-panel" aria-labelledby="listen-title">
      <div className="panel-kicker"><span className={playing ? "status-dot active" : "status-dot"} />{playing ? "Playing live" : "Ready to listen"}</div>
      <div className="player-heading">
        <div><p className="eyebrow">Track 01 · Global timeline</p><h2 id="listen-title">{track.title}</h2></div>
        <span className={isSynthetic ? "data-badge fixture" : "data-badge"}>{isSynthetic ? "Synthetic preview" : "NASA-derived data"}</span>
      </div>

      <div className="media-frame" style={hideVisual ? { display: "none" } : undefined}>
        {isSynthetic ? (
          <SyntheticVisual time={currentTime} feature={feature} />
        ) : (
          <video
            ref={videoRef}
            src={track.videoUrl}
            preload="metadata"
            playsInline
            onPlay={onRealVideoPlaying}
            onPause={() => { playingRef.current = false; setPlaying(false); engineRef.current?.reset(videoRef.current?.currentTime ?? 0); }}
            onWaiting={() => { setBuffering(true); engineRef.current?.reset(videoRef.current?.currentTime ?? 0); }}
            onCanPlay={() => setBuffering(false)}
            onSeeking={() => engineRef.current?.reset(videoRef.current?.currentTime ?? 0)}
            onEnded={() => { playingRef.current = false; setPlaying(false); engineRef.current?.reset(track.durationSeconds); }}
            onError={() => setMediaError("The NASA video could not be loaded. Confirm the file at the URL declared by the track data.")}
          >Your browser does not support HTML video.</video>
        )}
        {!isSynthetic && <div className="scan-line" style={{ left: `${((currentTime % 3) / 3) * 100}%` }} aria-hidden="true" />}
        {buffering && <div className="media-overlay" role="status">Buffering visualization…</div>}
      </div>

      <div className="transport">
        <button className="play-button" type="button" onClick={(event) => playing ? pause() : void start(event.timeStamp)} aria-label={playing ? "Pause visualization and sound" : "Play visualization and sound"}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="timeline-control">
          <label htmlFor="timeline">Visualization timeline</label>
          <input id="timeline" type="range" min="0" max={track.durationSeconds} step="0.01" value={currentTime} onChange={(event) => seek(Number(event.target.value), event.timeStamp)} />
          <div className="time-row"><span>{formatTime(currentTime)}</span><span>{formatTime(track.durationSeconds)}</span></div>
        </div>
        <div className="volume-control">
          <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute sound" : "Mute sound"}>{muted ? <MutedIcon /> : <VolumeIcon />}</button>
          <label htmlFor="volume" className="sr-only">Volume</label>
          <input id="volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </div>
      </div>

      {(audioError || mediaError) && <div className="player-error" role="alert">{audioError || mediaError}</div>}

      <div className="feature-readout" aria-label="Current normalized visual feature scores">
        <FeatureMeter label="Color warmth" value={feature.colorWarmth} note="Pitch register" />
        <FeatureMeter label="Frame motion" value={feature.motion} note="Note density" />
        <FeatureMeter label="Visual variation" value={feature.variation} note="Instrument" />
      </div>
      <p className="measurement-note">These are normalized visual scores extracted from the animation frames, not calibrated precipitation measurements.</p>
    </section>
  );
}

function FeatureMeter({ label, value, note }: { label: string; value: number; note: string }) {
  const percent = Math.round(value * 100);
  return (
    <div className="feature-meter">
      <div><span>{label}</span><strong>{percent}</strong></div>
      <div className="meter-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
      <small>{note}</small>
    </div>
  );
}
