"use client";

import { useState } from "react";
import Image from "next/image";
import { datasetLabels, sharedMapIds, stillMapPaths, type Dataset } from "@/components/rotation-visualization";

type MapGroup = "earth" | "detailed";

const groups: { id: MapGroup; label: string; description: string; maps: Dataset[] }[] = [
  { id: "earth", label: "Earth & motion", description: "Global views and moving data", maps: ["actual", "precipitation", "ocean"] },
  { id: "detailed", label: "Detailed maps", description: "Sharper detail for smaller areas", maps: sharedMapIds },
];

const resolutions: Partial<Record<Dataset, string>> = {
  actual: "2048 × 1024",
  seaCurrents: "8192 × 4096", precipitationClouds: "4096 × 2048",
  surfaceTemperature: "4096 × 2048", surfaceHumidity: "4096 × 2048",
  surfaceOzone: "2048 × 1024", surfaceWindSpeed: "4096 × 2048",
  carbonMonoxide: "4095 × 2048", nitrogenOxides: "4096 × 2048",
};

const mapLegends: Partial<Record<Dataset, { src: string; width: number; height: number }>> = {
  seaCurrents: { src: "/media/maps/sea-currents-legend.png", width: 310, height: 95 },
  precipitationClouds: { src: "/media/maps/precipitation-clouds-legend.png", width: 528, height: 165 },
  surfaceTemperature: { src: "/media/maps/surface-temperature-legend.png", width: 528, height: 165 },
  surfaceHumidity: { src: "/media/maps/surface-humidity-legend.png", width: 528, height: 165 },
  surfaceOzone: { src: "/media/maps/surface-ozone-legend.png", width: 528, height: 125 },
  surfaceWindSpeed: { src: "/media/maps/surface-wind-speed-legend.png", width: 528, height: 165 },
  carbonMonoxide: { src: "/media/maps/carbon-monoxide-legend.png", width: 528, height: 125 },
  nitrogenOxides: { src: "/media/maps/nitrogen-oxides-legend.png", width: 528, height: 125 },
};

export function MapChooser({ dataset, onSelect }: { dataset: Dataset; onSelect: (dataset: Dataset) => void }) {
  const [group, setGroup] = useState<MapGroup>(() => groups.find((item) => item.maps.includes(dataset))?.id ?? "earth");
  const visibleMaps = groups.find((item) => item.id === group)?.maps ?? [];
  const selectedLegend = mapLegends[dataset];

  return (
    <div className="map-chooser">
      <div className="map-chooser-topline"><span>Choose a collection</span><strong aria-live="polite">Selected: {datasetLabels[dataset]}</strong></div>
      <div className="map-chooser-filters" role="group" aria-label="Map collections">
        {groups.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)}><span className="map-group-copy"><span className="map-group-title"><strong>{item.label}</strong>{item.id === "detailed" && <em className="map-recommended">Recommended</em>}</span><small>{item.description}</small></span><span className="map-group-count" aria-label={`${item.maps.length} maps`}>{item.maps.length}</span></button>)}
      </div>
      <div className="map-chooser-grid" role="group" aria-label={`${groups.find((item) => item.id === group)?.label} choices`}>
        {visibleMaps.map((id) => {
          const animated = id === "precipitation" || id === "ocean";
          const imagePath = id === "actual" ? "/earth-atmos-2048.jpg" : stillMapPaths[id];
          const selected = dataset === id;
          return <button key={id} type="button" className="map-choice-card" data-map-id={id} aria-pressed={selected} onClick={() => onSelect(id)}>
            <span className={`map-choice-art${animated ? " is-animated" : ""}`} aria-hidden="true">
              {imagePath ? <Image src={imagePath} alt="" width={120} height={80} sizes="120px" /> : <span>▶</span>}
            </span>
            <span className="map-choice-copy"><strong>{datasetLabels[id]}</strong><small>{animated ? "Moving visualization" : resolutions[id] ? `${resolutions[id]} pixels` : "Still image"}</small></span>
            <span className="map-choice-indicator" aria-hidden="true">{selected ? "✓" : ""}</span>
          </button>;
        })}
      </div>
      {selectedLegend && <aside className="map-legend" aria-labelledby="map-legend-title">
        <div className="map-legend-heading">
          <div>
            <span>Selected map legend</span>
            <h3 id="map-legend-title">{datasetLabels[dataset]}</h3>
          </div>
        </div>
        <Image
          src={selectedLegend.src}
          alt={`Color legend for ${datasetLabels[dataset]}`}
          width={selectedLegend.width}
          height={selectedLegend.height}
          sizes="(max-width: 640px) 100vw, 528px"
        />
      </aside>}
    </div>
  );
}
