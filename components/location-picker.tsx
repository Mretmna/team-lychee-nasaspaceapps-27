"use client";

import { useEffect, useState } from "react";
import { PinIcon } from "@/components/icons";
import type { LocationSelection } from "@/types/track";

const PRESETS: LocationSelection[] = [
  { name: "North Atlantic", latitude: 38, longitude: -35 },
  { name: "Mediterranean", latitude: 36, longitude: 18 },
  { name: "Western Pacific", latitude: 12, longitude: 145 },
];
const mapApi = process.env.NEXT_PUBLIC_MAP_API_URL ?? "http://localhost:8000";

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
  const [locating, setLocating] = useState(false);

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

  const addArea = async () => {
    const radius = Number(radiusKm);
    const name = areaName.trim();
    if (!name) {
      setError("Please enter an area name.");
      return;
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
      setError("Radius must be between 10 and 10,000 km.");
      return;
    }
    let coordinates = { latitude: selection.latitude, longitude: selection.longitude };
    let resolvedCity = city.trim();
    let resolvedCountry = country.trim();
    if (resolvedCity) {
      setLocating(true);
      try {
        const query = new URLSearchParams({ city: resolvedCity, country: resolvedCountry });
        const response = await fetch(`${mapApi}/api/locations?${query}`);
        const place = await response.json();
        if (!response.ok) throw new Error(place.detail ?? "City lookup failed.");
        coordinates = { latitude: place.latitude, longitude: place.longitude };
        resolvedCity = place.city;
        resolvedCountry = place.country;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "City lookup failed.");
        setLocating(false);
        return;
      }
      setLocating(false);
    }
    const area = { name, city: resolvedCity, country: resolvedCountry, ...coordinates, radiusKm: radius };
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
        <p>Enter an area name and a radius from 10 to 10,000 km. Add a city and country to place the marker at the city’s coordinates.</p>
        <div className="area-form">
          <label>Area name<input value={areaName} maxLength={40} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. North Atlantic" /></label>
          <label>City<input value={city} maxLength={80} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Istanbul" /></label>
          <label>Country<input value={country} maxLength={80} onChange={(event) => setCountry(event.target.value)} placeholder="e.g. Türkiye" /></label>
          <label>Radius (km)<input inputMode="numeric" type="number" min="10" max="10000" value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} /></label>
          <button type="button" onClick={() => void addArea()} disabled={locating}>{locating ? "Finding city…" : "Add area"}</button>
        </div>
        {areas.length > 0 && <ul className="area-list">{areas.map((area, index) => (
          <li key={`${area.name}-${index}`}>
            <button type="button" onClick={() => onSelect(area)} aria-label={`Select ${area.name}`}>
              <strong>{area.name}</strong><small>{[area.city, area.country].filter(Boolean).join(", ")}{area.city || area.country ? " · " : ""}{area.latitude.toFixed(1)}°, {area.longitude.toFixed(1)}° · {area.radiusKm} km</small>
            </button>
            <button type="button" className="remove-area" onClick={() => saveAreas(areas.filter((_, areaIndex) => areaIndex !== index))} aria-label={`Remove ${area.name}`}>Remove</button>
          </li>
        ))}</ul>}
        <p className="location-note">City coordinates from GeoNames via Open-Meteo.</p>
      </section>
      <p className="location-note">Place selection is exploratory. It does not change the global visualization data or the sound mapping.</p>
    </div>
  );
}
