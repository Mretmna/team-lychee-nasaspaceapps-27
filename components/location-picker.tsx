"use client";

import { useEffect, useState } from "react";
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
  const [areas, setAreas] = useState<LocationSelection[]>([]);
  const [areaName, setAreaName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [radiusKm, setRadiusKm] = useState("500");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("earth-jukebox-areas") ?? "[]");
        if (Array.isArray(saved)) {
          setAreas(saved.filter((area) => typeof area.name === "string" &&
            Number.isFinite(area.latitude) && Number.isFinite(area.longitude) &&
            Number.isFinite(area.radiusKm) && area.radiusKm > 0));
        }
      } catch { /* Ignore damaged local preferences. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const saveAreas = (next: LocationSelection[]) => {
    setAreas(next);
    localStorage.setItem("earth-jukebox-areas", JSON.stringify(next));
  };

  const addArea = () => {
    const radius = Number(radiusKm);
    const name = areaName.trim();
    if (!name || !Number.isFinite(radius) || radius < 10 || radius > 10000) {
      setError("Enter an area name and a radius from 10 to 10,000 km.");
      return;
    }
    const area = { name, city: city.trim(), country: country.trim(), latitude: selection.latitude, longitude: selection.longitude, radiusKm: radius };
    saveAreas([...areas, area]);
    onSelect(area);
    setAreaName("");
    setCity("");
    setCountry("");
    setError("");
  };

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
      <section className="areas-section" aria-labelledby="areas-title">
        <h3 id="areas-title">Areas</h3>
        <p>Save an area around the selected coordinates. Its outline appears on the globe.</p>
        <div className="area-form">
          <label>Area name<input value={areaName} maxLength={40} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. North Atlantic" /></label>
          <label>City<input value={city} maxLength={80} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Istanbul" /></label>
          <label>Country<input value={country} maxLength={80} onChange={(event) => setCountry(event.target.value)} placeholder="e.g. Türkiye" /></label>
          <label>Radius (km)<input inputMode="numeric" type="number" min="10" max="10000" value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} /></label>
          <button type="button" onClick={addArea}>Add area</button>
        </div>
        {areas.length > 0 && <ul className="area-list">{areas.map((area, index) => (
          <li key={`${area.name}-${index}`}>
            <button type="button" onClick={() => onSelect(area)} aria-label={`Select ${area.name}`}>
              <strong>{area.name}</strong><small>{[area.city, area.country].filter(Boolean).join(", ")}{area.city || area.country ? " · " : ""}{area.latitude.toFixed(1)}°, {area.longitude.toFixed(1)}° · {area.radiusKm} km</small>
            </button>
            <button type="button" className="remove-area" onClick={() => saveAreas(areas.filter((_, areaIndex) => areaIndex !== index))} aria-label={`Remove ${area.name}`}>Remove</button>
          </li>
        ))}</ul>}
      </section>
      <p className="location-note">Place selection is exploratory. It does not change the global visualization data or the sound mapping.</p>
    </div>
  );
}
