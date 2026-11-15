"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowIcon, DjIcon, MapIcon, PinIcon, UploadIcon, WarningIcon } from "@/components/icons";
import { DemoVideo } from "@/components/demo-video";
import { LocationPicker } from "@/components/location-picker";
import { MapChooser } from "@/components/map-chooser";
import { RadiusMap } from "@/components/radius-map";
import { MapUpload, type VisualizationCrop } from "@/components/map-upload";
import { RotationVisualization, datasetLabels, sharedMapIds, stillMapPaths, type Dataset, type ScanMode, type SoundMode, type SoundTemplateOption } from "@/components/rotation-visualization";
import { loadTrack } from "@/lib/track";
import { cropGlobalPng, filterPoints, type PointCollection } from "@/lib/geo";
import type { LoadedTrack, LocationSelection, RegionShape } from "@/types/track";

const soundApiBase = process.env.NEXT_PUBLIC_SONIFY_API_URL ?? "/sound-api";
const teamProfileUrl = "https://www.spaceappschallenge.org/2026/find-a-team/team-lychee/";
const teamMembers = ["Mert Özcan", "Ahmet Efe Erdoğan", "Utku Aras Aytürk", "Umut ÇAYCI", "Boran Okandan"];

export function JukeboxDashboard() {
  const [loadedTrack, setLoadedTrack] = useState<LoadedTrack | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<LocationSelection>({ name: "North Atlantic", latitude: 38, longitude: -35, radiusKm: 2500 });
  const [regionShape, setRegionShape] = useState<RegionShape>("circle");
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
  const matchesSelection = (value: VisualizationCrop | null) => value && value.shape === regionShape && (regionShape === "full" || value.latitude === selection.latitude && value.longitude === selection.longitude && value.radiusKm === (selection.radiusKm ?? 500));
  const activeCrop = mapMode === "upload" ? matchesSelection(crop) ? crop : null : cropSource === dataset && matchesSelection(earthCrop) ? earthCrop : null;
  const visiblePoints = useMemo(() => pointData ? filterPoints(pointData, selection, regionShape) : { type: "FeatureCollection" as const, features: [] }, [pointData, selection, regionShape]);
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
        const result = await cropGlobalPng(source, selected, regionShape);
        if (controller.signal.aborted) return;
        setEarthCrop({ ...selected, shape: regionShape, blob: result.blob, bounds: result.bounds, url: URL.createObjectURL(result.blob) });
        setCropSource(dataset);
        setCropError("");
      } catch (cause) {
        if (!controller.signal.aborted) setCropError(cause instanceof Error ? cause.message : "The region could not be prepared.");
      }
    }
    void prepareRegion();
    return () => controller.abort();
  }, [dataset, selection.latitude, selection.longitude, selection.radiusKm, regionShape]);

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

  const showPlayingMaps = useCallback(() => {
    const prefersReducedMotion = document.documentElement.dataset.reducedMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = document.getElementById("sound-preview");
    target?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <main id="main-content">
      <header className="site-header">
        <a className="brand" href="#demo" aria-label="Lychee Juicebox home"><span className="brand-logo" aria-hidden="true" /><strong>Lychee<br /><small>Juicebox</small></strong></a>
        <nav aria-label="Main navigation"><a href="#demo">Demo</a><a href="#maps">Maps</a><a href="#explore">Globe</a><Link href="/tutorial">Tutorial</Link><a href="#team">Our team</a><a href="#sources">Sources</a></nav>
        <a className="header-cta" href="#maps">Be the DJ <ArrowIcon /></a>
      </header>

      <nav className="screen-reader-guide" id="screen-reader-guide" aria-label="Keyboard route through the jukebox">
        <strong>Keyboard route</strong>
        <p>Press 1, 2, 3, or 4 to jump to a section, or use the links below. Tab moves through controls; Enter or Space selects them. Shortcuts pause while you type in a field.</p>
        <div><a href="#maps">1. Map</a><a href="#location-controls">2. Location and area</a><a href="#sound-settings">3. Sound settings</a><a href="#sound-preview">4. Player</a></div>
      </nav>
      <section className="demo-section" id="demo" aria-labelledby="demo-title">
        <div className="demo-copy">
          <p className="eyebrow">Team Lychee · NASA Space Apps 2026</p>
          <h1 id="demo-title">The Earth is your mixtape.</h1>
          <a className="hero-primary demo-start" href="#maps"><DjIcon /> Be the DJ <ArrowIcon /></a>
          <div className="demo-flow" aria-hidden="true"><span>Pick a map</span><ArrowIcon /><span>Find a spot</span><ArrowIcon /><span>Play your mix</span></div>
        </div>
        <DemoVideo />
      </section>

      <section className="map-selection-stage" id="maps" aria-label="Choose a map">
          <div className="map-mode-picker">
            <p className="eyebrow section-kicker"><MapIcon /> 01 · Pick your map</p>
            <div className="map-mode-tabs" role="tablist" aria-label="Map source" onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "default" : event.key === "End" ? "upload" : mapMode === "default" ? "upload" : "default";
              setMapMode(next);
              event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-map-tab`)?.focus();
            }}>
              <button id="default-map-tab" type="button" role="tab" tabIndex={mapMode === "default" ? 0 : -1} aria-selected={mapMode === "default"} aria-controls="default-map-panel" onClick={() => setMapMode("default")}><MapIcon /> Pick a map</button>
              <button id="upload-map-tab" type="button" role="tab" tabIndex={mapMode === "upload" ? 0 : -1} aria-selected={mapMode === "upload"} aria-controls="upload-map-panel" onClick={() => setMapMode("upload")}><UploadIcon /> Bring your own map</button>
            </div>
          </div>
          <section id="default-map-panel" className="map-source-panel" role="tabpanel" aria-labelledby="default-map-tab" hidden={mapMode !== "default"}>
            <h2>Pick your canvas</h2>
            <MapChooser dataset={dataset} onSelect={setDataset} />
          </section>
          <div id="upload-map-panel" role="tabpanel" aria-labelledby="upload-map-tab" hidden={mapMode !== "upload"}>
            <MapUpload selection={selection} shape={regionShape} points={visiblePoints} onPointsChange={setPointData} onCropChange={setCrop} />
          </div>
      </section>

      <section className="experience" id="explore" aria-labelledby="explore-title">
        <div className="globe-column">
          <div className="section-heading"><p className="eyebrow section-kicker"><PinIcon /> 02 · Find your spot</p><h2 id="explore-title">Find your spot</h2></div>
          <div className="globe-view" id="globe-view">
            <RadiusMap selection={selection} shape={regionShape} onSelect={setSelection} points={visiblePoints} />
            {Math.abs(selection.latitude) >= 80 && <p className="polar-warning" role="status"><WarningIcon /> Near the poles, the globe and map image can look stretched. Try a lower latitude for a clearer view.</p>}
          </div>
          <LocationPicker selection={selection} shape={regionShape} onShapeChange={setRegionShape} onSelect={setSelection} />
        </div>

        <div id="listen" className="player-column">
          <RotationVisualization key={`${mapMode}:${dataset}:${regionShape}:${soundTemplate}:${scanMode}:${soundMode}:${activeCrop?.url ?? "no-crop"}`} crop={activeCrop} selection={selection} duration={duration} onDurationChange={setDuration} onPlaybackStart={showPlayingMaps} dataset={mapMode === "upload" ? "actual" : dataset} sourceMode={mapMode} sourceLabel={mapMode === "upload" ? "Your map" : datasetLabels[dataset]} regionShape={regionShape} templates={templates} soundTemplate={soundTemplate} onSoundTemplateChange={(template) => { setSoundTemplate(template); if (template === "cosmic_remnant") setScanMode("circle_outward"); }} scanMode={scanMode} onScanModeChange={setScanMode} soundMode={soundMode} onSoundModeChange={setSoundMode} templateError={templateError} onRetryTemplates={() => setTemplateReload((value) => value + 1)} track={mapMode === "default" && !loading && !loadError && loadedTrack?.track.videoUrl.includes(trackId) ? loadedTrack : null} />
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

      <section className="team-section" id="team" aria-labelledby="team-title">
        <div className="team-intro">
          <h2 id="team-title">Team Lychee</h2>
          <p>We’re five students from Türkiye. We built this project for the 2026 NASA Space Apps Challenge in Eindhoven.</p>
          <a className="text-link" href={teamProfileUrl} target="_blank" rel="noreferrer">Meet us on Space Apps <ArrowIcon /></a>
        </div>
        <div className="team-roster" aria-label="Team Lychee members">
          {teamMembers.map((member, index) => <div className="team-member" key={member}><span className="member-number">{String(index + 1).padStart(2, "0")}</span><strong>{member}</strong>{index === 0 && <small>Team owner</small>}</div>)}
        </div>
      </section>

      <section className="source-section" id="sources" aria-labelledby="sources-title">
        <h2 id="sources-title">About the data</h2>
        <div className="source-grid">
          <p>The sound comes from the selected image or video frame. It represents image colors and brightness, not recorded audio or measured sound from Earth.</p>
          <div>
            {mapMode === "upload" ? <><strong>Your uploaded map</strong><p>Your image is treated as a full-world map. The selected area is used for sound.</p></> : sharedMapIds.includes(dataset) ? <><strong>{datasetLabels[dataset]} source</strong><p>This is a still image supplied with the project, not live data.</p></> : dataset.startsWith("map") ? <><strong>{datasetLabels[dataset]} source</strong><p>{datasetLabels[dataset]} is a still image supplied for this project. It has no timeline.</p></> : dataset === "actual" ? <><strong>Actual World source</strong><p>This is a still Earth image from Three.js.</p></> : loadedTrack?.isSynthetic ? <><strong>Preview status</strong><p>The video timeline is unavailable. Choose a still map to generate sound.</p></> : <><strong>Visualization credit</strong><p>{loadedTrack?.track.credits}</p></>}
            {mapMode === "default" && (dataset === "precipitation" || dataset === "ocean") && loadedTrack && <a href={loadedTrack.track.sourceUrl} target="_blank" rel="noreferrer">View source information <ArrowIcon /></a>}
            <p className="globe-credit">Globe texture from the <a href="https://github.com/mrdoob/three.js/blob/dev/examples/textures/planets/earth_atmos_2048.jpg" target="_blank" rel="noreferrer">Three.js Earth imagery example</a>.</p>
          </div>
        </div>
      </section>

      <section className="tutorial-teaser" id="tutorial" aria-labelledby="tutorial-teaser-title">
        <div><h2 id="tutorial-teaser-title">Need help?</h2></div>
        <Link href="/tutorial" className="tutorial-link">Read the tutorial <ArrowIcon /></Link>
      </section>
      <footer><span>Team Lychee · Lychee Juicebox</span><nav aria-label="Footer navigation"><a href="#demo">Demo</a><Link href="/tutorial">Tutorial</Link><a href="#sources">Sources</a></nav><p>Built for the 2026 NASA Space Apps Challenge · <a href={teamProfileUrl} target="_blank" rel="noreferrer">Our team profile</a></p></footer>
    </main>
  );
}
