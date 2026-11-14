"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import { JukeboxPlayer } from "@/components/jukebox-player";
import { LocationPicker } from "@/components/location-picker";
import { loadTrack } from "@/lib/track";
import type { LoadedTrack, LocationSelection } from "@/types/track";

const Globe = dynamic(() => import("@/components/globe").then((module) => module.Globe), {
  ssr: false,
  loading: () => <div className="globe-loading" role="status">Preparing interactive globe…</div>,
});

export function JukeboxDashboard() {
  const [loadedTrack, setLoadedTrack] = useState<LoadedTrack | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<LocationSelection>({ name: "North Atlantic", latitude: 38, longitude: -35 });
  const [trackId, setTrackId] = useState<"precipitation" | "ocean">("precipitation");
  const requestId = useRef(0);

  const fetchTrack = useCallback(async (fixture = false) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await loadTrack(fixture, trackId);
      if (currentRequest === requestId.current) setLoadedTrack(result);
    } catch (error) {
      if (currentRequest === requestId.current) {
        setLoadedTrack(null);
        setLoadError(error instanceof Error ? error.message : "The track data could not be loaded.");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchTrack(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchTrack]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Earth Information Jukebox home"><span>EI</span><strong>Earth Information<br />Jukebox</strong></a>
        <nav aria-label="Main navigation"><a href="#explore">Explore</a><a href="#mapping">How it sounds</a><a href="#sources">Sources</a></nav>
        <a className="header-cta" href="#listen">Start listening <ArrowIcon /></a>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">NASA Space Apps · Earth Information Jukebox</p>
        <h1>Choose a place.<br /><em>Hear Earth move.</em></h1>
        <p className="hero-copy">Turn the globe, mark a point, then listen as visual patterns in an Earth observation timeline become pitch, rhythm, and texture.</p>
        <a className="text-link" href="#explore">Explore the globe <ArrowIcon /></a>
      </section>

      <section className="experience" id="explore" aria-labelledby="explore-title">
        <div className="globe-column">
          <div className="section-heading"><p className="eyebrow">01 · Choose a place</p><h2 id="explore-title">Where will you listen from?</h2><p>Drag to rotate, scroll to zoom, or click the globe. Keyboard users can use the presets and coordinate fields below.</p></div>
          <Globe selection={selection} onSelect={setSelection} />
          <LocationPicker key={`${selection.latitude}:${selection.longitude}`} selection={selection} onSelect={setSelection} />
        </div>

        <div id="listen" className="player-column">
          <div className="track-choice" aria-label="Earth visualization"><span>Explore a visualization</span><button type="button" className={trackId === "precipitation" ? "active" : ""} onClick={() => setTrackId("precipitation")}>Global precipitation</button><button type="button" className={trackId === "ocean" ? "active" : ""} onClick={() => setTrackId("ocean")}>North Pacific color</button></div>
          {loading && <div className="load-state" role="status"><span className="loader" />Loading the visualization timeline…</div>}
          {!loading && loadError && (
            <div className="load-state error" role="alert">
              <strong>We couldn’t read the track data.</strong><p>{loadError}</p>
              <div><button type="button" onClick={() => void fetchTrack()}>Try again</button><button type="button" onClick={() => void fetchTrack(true)}>Use synthetic preview</button></div>
            </div>
          )}
          {!loading && loadedTrack && <JukeboxPlayer key={loadedTrack.track.id} loadedTrack={loadedTrack} />}
        </div>
      </section>

      <section className="mapping-section" id="mapping" aria-labelledby="mapping-title">
        <div><p className="eyebrow">02 · Understand the mapping</p><h2 id="mapping-title">A score you can follow.</h2></div>
        <div className="mapping-list">
          <article><span>01</span><div><h3>Warm colors → pitch</h3><p>Warmer-colored parts of the precipitation frames move notes higher through a fixed register. The score is derived from the published animation, not a measured rain rate.</p></div></article>
          <article><span>02</span><div><h3>Frame change → rhythm</h3><p>More frame-to-frame change increases note density as the scan moves across the animation.</p></div></article>
          <article><span>03</span><div><h3>Visual variation → instrument</h3><p>More varied frames shift from low marimba-like tones to high bell-like tones, inspired by NASA’s image sonifications.</p></div></article>
        </div>
      </section>

      <section className="source-section" id="sources" aria-labelledby="sources-title">
        <p className="eyebrow">03 · Sources & limits</p>
        <h2 id="sources-title">Clear about what you’re hearing.</h2>
        <div className="source-grid">
          <p>The sound is generated live in your browser from timestamped features. It is an interpretation of visualization frames, not a direct recording of Earth and not a substitute for calibrated scientific measurements.</p>
          <div>
            {loadedTrack?.isSynthetic ? <><strong>Preview status</strong><p>The production NASA clip and extracted feature document are not present yet. This session uses a separate synthetic fixture and visual animation.</p></> : <><strong>Visualization credit</strong><p>{loadedTrack?.track.credits}</p></>}
            {loadedTrack && <a href={loadedTrack.track.sourceUrl} target="_blank" rel="noreferrer">View source information <ArrowIcon /></a>}
            <p className="globe-credit">Globe texture from the <a href="https://github.com/mrdoob/three.js/blob/dev/examples/textures/planets/earth_atmos_2048.jpg" target="_blank" rel="noreferrer">Three.js Earth imagery example</a>.</p>
          </div>
        </div>
      </section>

      <footer><span>Earth Information Jukebox</span><p>Built for NASA Space Apps 2026 · Browser audio begins only after you press Play.</p></footer>
    </main>
  );
}
