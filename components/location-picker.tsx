"use client";

import { useState } from "react";
import { PinIcon } from "@/components/icons";
import type { LocationSelection } from "@/types/track";

const PRESETS: LocationSelection[] = [
  { name: "North Atlantic", latitude: 38, longitude: -35 },
  { name: "Mediterranean", latitude: 36, longitude: 18 },
  { name: "Western Pacific", latitude: 12, longitude: 145 },
];

interface LocationPickerProps {
  selection: LocationSelection;
  onSelect: (selection: LocationSelection) => void;
}

export function LocationPicker({ selection, onSelect }: LocationPickerProps) {
  const [latitude, setLatitude] = useState(String(selection.latitude));
  const [longitude, setLongitude] = useState(String(selection.longitude));
  const [error, setError] = useState("");

  const applyCoordinates = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("Use a latitude from −90 to 90 and a longitude from −180 to 180.");
      return;
    }
    setError("");
    onSelect({ name: "Custom coordinates", latitude: lat, longitude: lon });
  };

  return (
    <div className="location-picker">
      <div className="location-current" aria-live="polite">
        <PinIcon />
        <span><strong>{selection.name}</strong><small>{selection.latitude.toFixed(1)}°, {selection.longitude.toFixed(1)}°</small></span>
      </div>
      <div className="preset-row" aria-label="Location presets">
        {PRESETS.map((preset) => (
          <button key={preset.name} type="button" onClick={() => onSelect(preset)}>{preset.name}</button>
        ))}
      </div>
      <div className="coordinate-form">
        <label>Latitude<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
        <label>Longitude<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
        <button type="button" onClick={applyCoordinates}>Set point</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="location-note">Place selection is exploratory. It does not change the global visualization data or the sound mapping.</p>
    </div>
  );
}
