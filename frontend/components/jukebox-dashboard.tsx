"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowIcon } from "@/components/icons";
import { JukeboxPlayer } from "@/components/jukebox-player";
import { LocationPicker } from "@/components/location-picker";
import { RadiusMap } from "@/components/radius-map";
import { MapUpload, type VisualizationCrop } from "@/components/map-upload";
import { RotationVisualization, datasetLabels, type Dataset, type ScanMode, type SoundTemplateOption } from "@/components/rotation-visualization";
import { loadTrack } from "@/lib/track";
import { cropGlobalPng, filterPoints, type PointCollection } from "@/lib/geo";
import type { LoadedTrack, LocationSelection } from "@/types/track";

const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "http://localhost:8001";
const teamProfileUrl = "https://www.spaceappschallenge.org/2026/find-a-team/team-lychee/";
const teamMembers = ["Mert Özcan", "Ahmet Efe Erdoğan", "Utku Aras Aytürk", "Boran Okandan", "Umut ÇAYCI"];

export function JukeboxDashboard() {
  const [loadedTrack, setLoadedTrack] = useState<LoadedTrack | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<LocationSelection>({ name: "North Atlantic", latitude: 38, longitude: -35, radiusKm: 500 });
  const [dataset, setDataset] = useState<Dataset>("actual");
  const trackId = dataset === "ocean" ? "ocean" : "precipitation";
  const [pointData, setPointData] = useState<PointCollection | null>(null);
  const [crop, setCrop] = useState<VisualizationCrop | null>(null);
  const [earthCrop, setEarthCrop] = useState<VisualizationCrop | null>(null);
  const [cropSource, setCropSource] = useState<Dataset>("actual");
  const [cropError, setCropError] = useState("");
  const [duration, setDuration] = useState<10 | 20 | 30>(10);
  const [templates, setTemplates] = useState<SoundTemplateOption[]>([]);
  const [soundTemplate, setSoundTemplate] = useState("original");
  const [scanMode, setScanMode] = useState<ScanMode>("clockwise");
  const [templateError, setTemplateError] = useState("");
  const [templateReload, setTemplateReload] = useState(0);
  const matchesSelection = (value: VisualizationCrop | null) => value && value.latitude === selection.latitude && value.longitude === selection.longitude && value.radiusKm === (selection.radiusKm ?? 500);
  const activeCrop = dataset === "actual" && matchesSelection(crop) ? crop : cropSource === dataset && matchesSelection(earthCrop) ? earthCrop : null;
  const visiblePoints = useMemo(() => pointData ? filterPoints(pointData, selection) : { type: "FeatureCollection" as const, features: [] }, [pointData, selection]);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTemplates() {
      try {
        const response = await fetch(`${soundApiBase}/templates`, { signal: controller.signal });
        if (!response.ok) throw new Error("The sound templates could not be loaded.");
        const catalog: unknown = await response.json();
        if (!catalog || typeof catalog !== "object" || !("templates" in catalog) || !Array.isArray(catalog.templates) || !("defaultTemplate" in catalog) || typeof catalog.defaultTemplate !== "string") {
          throw new Error("The sound service returned an invalid template catalog.");
        }
        const options = catalog.templates as unknown[];
        if (!options.length || !options.every((option): option is SoundTemplateOption => typeof option === "object" && option !== null && "id" in option && typeof option.id === "string" && "label" in option && typeof option.label === "string" && "description" in option && typeof option.description === "string")) {
          throw new Error("The sound service returned an invalid template catalog.");
        }
        if (!options.some((option) => option.id === catalog.defaultTemplate)) throw new Error("The sound service returned an invalid default template.");
        if (controller.signal.aborted) return;
        setTemplates(options);
        setSoundTemplate((current) => options.some((option) => option.id === current) ? current : catalog.defaultTemplate as string);
        setTemplateError("");
      } catch (cause) {
        if (!controller.signal.aborted) setTemplateError(cause instanceof Error ? cause.message : "The sound templates could not be loaded.");
      }
    }
    void loadTemplates();
    return () => controller.abort();
  }, [templateReload]);

  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop.url); }, [crop]);
  useEffect(() => () => { if (earthCrop) URL.revokeObjectURL(earthCrop.url); }, [earthCrop]);

  useEffect(() => {
    const controller = new AbortController();
    const selected = { latitude: selection.latitude, longitude: selection.longitude, radiusKm: selection.radiusKm ?? 500, name: "Selected region" };
    async function prepareRegion() {
      try {
        const sourcePath = dataset.startsWith("map") ? `/media/map-${dataset.slice(-1)}.jpeg` : "/earth-atmos-2048.jpg";
        const response = await fetch(sourcePath, { signal: controller.signal });
        if (!response.ok) throw new Error("The Earth imagery could not be loaded.");
        const source = new File([await response.blob()], "earth.jpg", { type: "image/jpeg" });
        const result = await cropGlobalPng(source, selected);
        if (controller.signal.aborted) return;
        setEarthCrop({ ...selected, blob: result.blob, bounds: result.bounds, url: URL.createObjectURL(result.blob) });
        setCropSource(dataset);
        setCropError("");
      } catch (cause) {
        if (!controller.signal.aborted) setCropError(cause instanceof Error ? cause.message : "The region could not be prepared.");
      }
    }
    void prepareRegion();
    return () => controller.abort();
  }, [dataset, selection.latitude, selection.longitude, selection.radiusKm]);

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
        <a className="brand" href="#top" aria-label="Team Lychee Earth Jukebox home"><span className="brand-mark" aria-hidden="true">L</span><strong>Team Lychee<br /><small>Earth Jukebox</small></strong></a>
        <nav aria-label="Main navigation"><a href="#explore">Explore</a><a href="#maps">Your maps</a><a href="#mapping">How it sounds</a><a href="#team">Our team</a><a href="#sources">Sources</a></nav>
        <a className="header-cta" href="#listen">Start listening <ArrowIcon /></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-fruit" aria-hidden="true" />
        <p className="eyebrow">Team Lychee · 2026 NASA Space Apps Challenge</p>
        <h1>Hear Earth.<br /><em>With Team Lychee.</em></h1>
        <p className="hero-copy">We are Team Lychee, five students from Türkiye turning Earth imagery into an experience you can see, hear, and explore. Pick a place, set a radius, and listen to visualizations of our planet.</p>
        <a className="text-link" href="#explore">Explore the globe <ArrowIcon /></a>
        <div className="hero-meta" aria-label="Team and challenge information"><span>Earth Information Jukebox</span><span>Eindhoven local event</span><a href={teamProfileUrl} target="_blank" rel="noreferrer">Official team page <ArrowIcon /></a></div>
      </section>

      <section className="experience" id="explore" aria-labelledby="explore-title">
        <div className="globe-column">
          <div className="section-heading"><p className="eyebrow">01 · Choose a place</p><h2 id="explore-title">Where will you listen from?</h2><p>Pan, zoom, or click the map to choose a center. You can also use the presets and coordinate fields below.</p></div>
          <RadiusMap selection={selection} onSelect={setSelection} points={visiblePoints} />
          <LocationPicker selection={selection} onSelect={setSelection} />
        </div>

        <div id="listen" className="player-column">
          <MapUpload selection={selection} points={visiblePoints} onPointsChange={setPointData} onCropChange={setCrop} soundTemplate={soundTemplate} scanMode={scanMode} />
          <RotationVisualization key={`${dataset}:${soundTemplate}:${scanMode}:${activeCrop?.url ?? "no-crop"}`} crop={activeCrop} selection={selection} duration={duration} onDurationChange={setDuration} dataset={dataset} onDatasetChange={setDataset} templates={templates} soundTemplate={soundTemplate} onSoundTemplateChange={setSoundTemplate} scanMode={scanMode} onScanModeChange={setScanMode} templateError={templateError} onRetryTemplates={() => setTemplateReload((value) => value + 1)} track={!loading && !loadError && loadedTrack?.track.videoUrl.includes(trackId) ? loadedTrack : null} />
          {cropError && !activeCrop && <p className="field-error" role="alert">{cropError}</p>}
          {(dataset === "precipitation" || dataset === "ocean") && loading && <div className="load-state" role="status"><span className="loader" />Loading the visualization timeline…</div>}
          {(dataset === "precipitation" || dataset === "ocean") && !loading && loadError && (
            <div className="load-state error" role="alert">
              <strong>We couldn’t read the track data.</strong><p>{loadError}</p>
              <div><button type="button" onClick={() => void fetchTrack()}>Try again</button><button type="button" onClick={() => void fetchTrack(true)}>Use synthetic preview</button></div>
            </div>
          )}
          {(dataset === "precipitation" || dataset === "ocean") && !loading && loadedTrack && <JukeboxPlayer key={loadedTrack.track.id} loadedTrack={loadedTrack} hideVisual />}
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

      <section className="team-section" id="team" aria-labelledby="team-title">
        <div className="team-intro">
          <p className="eyebrow">03 · The people behind the jukebox</p>
          <h2 id="team-title">Curiosity has a team name.</h2>
          <p>Our official Space Apps profile describes Team Lychee as high schoolers who bring creativity, curiosity, and coding together. We are taking on The Earth Information Jukebox challenge to make Earth science more accessible through sight and sound.</p>
          <a className="text-link" href={teamProfileUrl} target="_blank" rel="noreferrer">Meet us on Space Apps <ArrowIcon /></a>
        </div>
        <div className="team-roster" aria-label="Team Lychee members">
          {teamMembers.map((member, index) => <div className="team-member" key={member}><span className="member-number">{String(index + 1).padStart(2, "0")}</span><strong>{member}</strong>{index === 0 && <small>Team owner</small>}</div>)}
          <p className="team-event">2026 NASA Space Apps Challenge <span>·</span> Eindhoven, Netherlands</p>
        </div>
      </section>

      <section className="source-section" id="sources" aria-labelledby="sources-title">
        <p className="eyebrow">04 · Sources & limits</p>
        <h2 id="sources-title">Clear about what you’re hearing.</h2>
        <div className="source-grid">
          <p>The sound is generated live in your browser from timestamped features. It is an interpretation of visualization frames, not a direct recording of Earth and not a substitute for calibrated scientific measurements.</p>
          <div>
            {dataset.startsWith("map") ? <><strong>{datasetLabels[dataset]} source</strong><p>{datasetLabels[dataset]} is a still NASA/GMAO-labeled image supplied for this project. It has no timeline frames.</p></> : dataset === "actual" ? <><strong>Actual World source</strong><p>The existing Earth texture is a still image from the Three.js imagery example. It has no NASA timeline frames.</p></> : loadedTrack?.isSynthetic ? <><strong>Preview status</strong><p>The NASA timeline is unavailable; the synthetic preview is shown only in the sound player.</p></> : <><strong>Visualization credit</strong><p>{loadedTrack?.track.credits}</p></>}
            {(dataset === "precipitation" || dataset === "ocean") && loadedTrack && <a href={loadedTrack.track.sourceUrl} target="_blank" rel="noreferrer">View source information <ArrowIcon /></a>}
            <p className="globe-credit">Globe texture from the <a href="https://github.com/mrdoob/three.js/blob/dev/examples/textures/planets/earth_atmos_2048.jpg" target="_blank" rel="noreferrer">Three.js Earth imagery example</a>.</p>
          </div>
        </div>
      </section>

      <footer><span>Team Lychee · Earth Information Jukebox</span><p>Built for the 2026 NASA Space Apps Challenge · <a href={teamProfileUrl} target="_blank" rel="noreferrer">Our team profile</a> · Browser audio begins only after you press Play.</p></footer>
    </main>
  );
}
