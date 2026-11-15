"use client";

import { useState } from "react";
import Image from "next/image";
import { datasetLabels, sharedMapIds, stillMapPaths, type Dataset } from "@/components/rotation-visualization";

type MapGroup = "earth" | "detailed" | "classic";

const groups: { id: MapGroup; label: string; maps: Dataset[] }[] = [
  { id: "earth", label: "Earth & motion", maps: ["actual", "precipitation", "ocean"] },
  { id: "detailed", label: "Detailed maps", maps: sharedMapIds },
  { id: "classic", label: "Older previews", maps: ["map1", "map2", "map3"] },
];

const resolutions: Partial<Record<Dataset, string>> = {
  actual: "2048 × 1024", map1: "320 × 180", map2: "320 × 180", map3: "512 × 256",
  seaCurrents: "8192 × 4096", precipitationClouds: "4096 × 2048",
  surfaceTemperature: "4096 × 2048", surfaceHumidity: "4096 × 2048",
  surfaceOzone: "2048 × 1024", surfaceWindSpeed: "4096 × 2048",
  carbonMonoxide: "4095 × 2048", nitrogenOxides: "4096 × 2048",
};

export function MapChooser({ dataset, onSelect }: { dataset: Dataset; onSelect: (dataset: Dataset) => void }) {
  const [group, setGroup] = useState<MapGroup>(() => groups.find((item) => item.maps.includes(dataset))?.id ?? "earth");
  const visibleMaps = groups.find((item) => item.id === group)?.maps ?? [];

  return (
    <div className="map-chooser">
      <div className="map-chooser-topline"><span>Browse maps</span><strong aria-live="polite">Selected: {datasetLabels[dataset]}</strong></div>
      <div className="map-chooser-filters" role="group" aria-label="Filter maps">
        {groups.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}<span>{item.maps.length}</span></button>)}
      </div>
      <div className="map-chooser-grid" role="group" aria-label={`${groups.find((item) => item.id === group)?.label} choices`}>
        {visibleMaps.map((id) => {
          const animated = id === "precipitation" || id === "ocean";
          const imagePath = id === "actual" ? "/earth-atmos-2048.jpg" : stillMapPaths[id];
          const selected = dataset === id;
          const detail = animated ? "Animated timeline" : group === "classic" ? "Low-resolution still" : "Still image";
          return <button key={id} type="button" className="map-choice-card" data-map-id={id} aria-pressed={selected} onClick={() => onSelect(id)}>
            <span className={`map-choice-art${animated ? " is-animated" : ""}`} aria-hidden="true">
              {imagePath ? <Image src={imagePath} alt="" width={120} height={80} sizes="120px" /> : <span>▶</span>}
            </span>
            <span className="map-choice-copy"><strong>{datasetLabels[id]}</strong><small>{detail}</small><small>{resolutions[id] ? `${resolutions[id]} pixels` : "Moving visualization"}</small></span>
            <span className="map-choice-indicator" aria-hidden="true">{selected ? "✓" : ""}</span>
          </button>;
        })}
      </div>
      {group === "classic" && <p className="map-chooser-note">These older previews have less detail at small radii. Choose Detailed maps for a sharper crop.</p>}
    </div>
  );
}
