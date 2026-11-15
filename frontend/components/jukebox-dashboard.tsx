"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowIcon, PlayIcon } from "@/components/icons";
import { DemoVideo } from "@/components/demo-video";
import { LocationPicker } from "@/components/location-picker";
import { MapChooser } from "@/components/map-chooser";
import { RadiusMap } from "@/components/radius-map";
import { MapUpload, type VisualizationCrop } from "@/components/map-upload";
import { RotationVisualization, datasetLabels, sharedMapIds, stillMapPaths, type Dataset, type ScanMode, type SoundMode, type SoundTemplateOption } from "@/components/rotation-visualization";
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
  const [mapMode, setMapMode] = useState<"default" | "upload">("default");
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
  const [soundMode, setSoundMode] = useState<SoundMode>("normal");
  const [templateError, setTemplateError] = useState("");
  const [templateReload, setTemplateReload] = useState(0);
  const matchesSelection = (value: VisualizationCrop | null) => value && value.latitude === selection.latitude && value.longitude === selection.longitude && value.radiusKm === (selection.radiusKm ?? 500);
  const activeCrop = mapMode === "upload" ? matchesSelection(crop) ? crop : null : cropSource === dataset && matchesSelection(earthCrop) ? earthCrop : null;
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
        const sourcePath = stillMapPaths[dataset] ?? "/earth-atmos-2048.jpg";
        const response = await fetch(sourcePath, { signal: controller.signal });
        if (!response.ok) throw new Error("The selected map could not be loaded.");
        const sourceBlob = await response.blob();
        const source = new File([sourceBlob], sourcePath.split("/").pop() ?? "map", { type: sourceBlob.type });
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
        <nav aria-label="Main navigation"><a href="#explore">Explore</a><a href="#demo">Demo</a><a href="#maps">Your maps</a><a href="#mapping">How it sounds</a><Link href="/tutorial">Tutorial</Link><a href="#team">Our team</a><a href="#sources">Sources</a></nav>
        <a className="header-cta" href="#listen">Start listening <ArrowIcon /></a>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-content">
          <p className="eyebrow">Team Lychee · 2026 NASA Space Apps Challenge</p>
          <h1 id="hero-title">Earth has a story.<br /><em>Hear it unfold.</em></h1>
          <p className="hero-copy">Choose a place and a map. Turn its colors and patterns into a soundscape you can follow, shape, and share.</p>
          <div className="hero-actions"><a className="hero-primary" href="#explore">Start exploring <ArrowIcon /></a><a className="hero-secondary" href="#demo"><PlayIcon /> See the demo</a></div>
          <p className="hero-footnote">Made by Team Lychee, five students from Türkiye. Your first sound is a place, a map, and one tap away.</p>
        </div>
        <div className="hero-art" aria-hidden="true"><span className="hero-art-label">EARTH, REIMAGINED AS SOUND</span><span className="hero-orbit" /><span className="hero-planet" /><svg className="hero-wave" viewBox="0 0 320 84" fill="none"><path d="M2 42h30l12-19 17 38 20-57 21 75 18-52 13 15h31l12-23 14 46 17-59 18 71 16-35h78" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="hero-art-caption">01 PLACE &nbsp; / &nbsp; 02 MAP &nbsp; / &nbsp; 03 SOUND</span></div>
        <div className="hero-meta" aria-label="Team and challenge information"><span>Earth Information Jukebox</span><span>Eindhoven local event</span><a href={teamProfileUrl} target="_blank" rel="noreferrer">Official team page <ArrowIcon /></a></div>
      </section>

      <section className="demo-section" id="demo" aria-labelledby="demo-title">
        <div className="demo-copy"><p className="eyebrow">Watch the idea come alive</p><h2 id="demo-title">See the map.<br />Follow the sound.</h2><p>Watch a quick walkthrough, then make your own version from any of the available Earth maps or an image you upload.</p><a href="#explore">Try the jukebox <ArrowIcon /></a></div>
        <DemoVideo />
      </section>

      <section className="experience" id="explore" aria-labelledby="explore-title">
        <div className="globe-column">
          <div className="section-heading"><p className="eyebrow">01 · Choose a place</p><h2 id="explore-title">Where will you listen from?</h2><p>Pan, zoom, or click the globe to choose a center, then adjust the radius. City and coordinate search are under Advanced location options.</p></div>
          <RadiusMap selection={selection} onSelect={setSelection} points={visiblePoints} />
          <LocationPicker selection={selection} onSelect={setSelection} />
        </div>

        <div id="listen" className="player-column">
          <div className="map-mode-picker" id="maps">
            <p className="eyebrow">02 · Choose a map</p>
            <div className="map-mode-tabs" role="tablist" aria-label="Map source" onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "default" : event.key === "End" ? "upload" : mapMode === "default" ? "upload" : "default";
              setMapMode(next);
              event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-map-tab`)?.focus();
            }}>
              <button id="default-map-tab" type="button" role="tab" tabIndex={mapMode === "default" ? 0 : -1} aria-selected={mapMode === "default"} aria-controls="default-map-panel" onClick={() => setMapMode("default")}>Use default maps</button>
              <button id="upload-map-tab" type="button" role="tab" tabIndex={mapMode === "upload" ? 0 : -1} aria-selected={mapMode === "upload"} aria-controls="upload-map-panel" onClick={() => setMapMode("upload")}>Create your own map</button>
            </div>
          </div>
          <section id="default-map-panel" className="map-source-panel" role="tabpanel" aria-labelledby="default-map-tab" hidden={mapMode !== "default"}>
            <h2>Use a default map</h2>
            <p>Choose an Earth image or NASA visualization. Your globe selection and radius apply to every map.</p>
            <MapChooser dataset={dataset} onSelect={setDataset} />
          </section>
          <div id="upload-map-panel" role="tabpanel" aria-labelledby="upload-map-tab" hidden={mapMode !== "upload"}>
            <MapUpload selection={selection} points={visiblePoints} onPointsChange={setPointData} onCropChange={setCrop} />
          </div>
          <RotationVisualization key={`${mapMode}:${dataset}:${soundTemplate}:${scanMode}:${soundMode}:${activeCrop?.url ?? "no-crop"}`} crop={activeCrop} selection={selection} duration={duration} onDurationChange={setDuration} dataset={mapMode === "upload" ? "actual" : dataset} sourceMode={mapMode} sourceLabel={mapMode === "upload" ? "Your map" : datasetLabels[dataset]} templates={templates} soundTemplate={soundTemplate} onSoundTemplateChange={setSoundTemplate} scanMode={scanMode} onScanModeChange={setScanMode} soundMode={soundMode} onSoundModeChange={setSoundMode} templateError={templateError} onRetryTemplates={() => setTemplateReload((value) => value + 1)} track={mapMode === "default" && !loading && !loadError && loadedTrack?.track.videoUrl.includes(trackId) ? loadedTrack : null} />
          {mapMode === "default" && cropError && !activeCrop && <p className="field-error" role="alert">{cropError}</p>}
          {mapMode === "default" && (dataset === "precipitation" || dataset === "ocean") && loading && <div className="load-state" role="status"><span className="loader" />Loading the visualization timeline…</div>}
          {mapMode === "default" && (dataset === "precipitation" || dataset === "ocean") && !loading && loadError && (
            <div className="load-state error" role="alert">
              <strong>We couldn’t read the track data.</strong><p>{loadError}</p>
              <div><button type="button" onClick={() => void fetchTrack()}>Try again</button><button type="button" onClick={() => void fetchTrack(true)}>Use synthetic preview</button></div>
            </div>
          )}
        </div>
      </section>

      <section className="mapping-section" id="mapping" aria-labelledby="mapping-title">
        <div><p className="eyebrow">03 · Understand the mapping</p><h2 id="mapping-title">A score you can follow.</h2></div>
        <div className="mapping-list">
          <article><span>01</span><div><h3>Image details → notes</h3><p>Colors and brightness in the selected map region shape the generated tones.</p></div></article>
          <article><span>02</span><div><h3>Scan path → movement</h3><p>The chosen path moves through the image over the selected duration. Spatial audio can move that sound between your ears.</p></div></article>
          <article><span>03</span><div><h3>Template → sound character</h3><p>Choose a template to change the instruments and texture, then play the result or use the browser instrument option.</p></div></article>
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
          <p>Sound is generated from the selected image or visualization frame. It is an interpretation of map pixels, not a direct recording of Earth or a calibrated scientific measurement.</p>
          <div>
            {mapMode === "upload" ? <><strong>Your uploaded map</strong><p>Your PNG or JPEG is treated as a full-world equirectangular image; the selected center and radius determine the region used for sound.</p></> : sharedMapIds.includes(dataset) ? <><strong>{datasetLabels[dataset]} source</strong><p>This still image came from the map folder you shared. It is a snapshot, not live data.</p></> : dataset.startsWith("map") ? <><strong>{datasetLabels[dataset]} source</strong><p>{datasetLabels[dataset]} is a still NASA/GMAO-labeled image supplied for this project. It has no timeline frames.</p></> : dataset === "actual" ? <><strong>Actual World source</strong><p>The existing Earth texture is a still image from the Three.js imagery example. It has no NASA timeline frames.</p></> : loadedTrack?.isSynthetic ? <><strong>Preview status</strong><p>The NASA timeline is unavailable. Choose a still map to generate sound.</p></> : <><strong>Visualization credit</strong><p>{loadedTrack?.track.credits}</p></>}
            {mapMode === "default" && (dataset === "precipitation" || dataset === "ocean") && loadedTrack && <a href={loadedTrack.track.sourceUrl} target="_blank" rel="noreferrer">View source information <ArrowIcon /></a>}
            <p className="globe-credit">Globe texture from the <a href="https://github.com/mrdoob/three.js/blob/dev/examples/textures/planets/earth_atmos_2048.jpg" target="_blank" rel="noreferrer">Three.js Earth imagery example</a>.</p>
          </div>
        </div>
      </section>

      <section className="tutorial-teaser" id="tutorial" aria-labelledby="tutorial-teaser-title">
        <div><p className="eyebrow">Need a hand?</p><h2 id="tutorial-teaser-title">Your first sound,<br />step by step.</h2><p>Follow a short guide from choosing a place to playing your finished soundscape.</p><Link href="/tutorial" className="tutorial-link">Open the tutorial <ArrowIcon /></Link></div>
        <ol><li><span>01</span><div><strong>Pick a place</strong><p>Set the center and the area you want to hear.</p></div></li><li><span>02</span><div><strong>Choose a map</strong><p>Use an Earth map or upload your own image.</p></div></li><li><span>03</span><div><strong>Shape the sound</strong><p>Choose a voice, scan path, and listening style.</p></div></li></ol>
      </section>
      <footer><span>Team Lychee · Earth Information Jukebox</span><nav aria-label="Footer navigation"><a href="#demo">Demo</a><Link href="/tutorial">Tutorial</Link><a href="#sources">Sources</a></nav><p>Built for the 2026 NASA Space Apps Challenge · <a href={teamProfileUrl} target="_blank" rel="noreferrer">Our team profile</a> · Browser audio begins only after you press Play.</p></footer>
    </main>
  );
}
