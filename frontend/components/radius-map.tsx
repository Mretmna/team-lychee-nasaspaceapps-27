"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "@/components/globe";
import type { PointCollection } from "@/lib/geo";
import type { LocationSelection, RegionShape } from "@/types/track";

type LatLng = { lat(): number; lng(): number };
type MapListener = { remove(): void };
type MapInstance = {
  addListener(event: string, callback: (event: { latLng?: LatLng }) => void): MapListener;
  fitBounds(bounds: object, padding?: number): void;
  getCenter(): LatLng | undefined;
  getProjection(): { fromLatLngToPoint(position: LatLng): { x: number; y: number } | null } | undefined;
  getZoom(): number | undefined;
  data: { addGeoJson(data: PointCollection): void; forEach(callback: (feature: object) => void): void; remove(feature: object): void; setStyle(style: object): void };
};
type CircleInstance = { setCenter(center: object): void; setRadius(radius: number): void; getBounds(): object | null; setMap(map: MapInstance | null): void };
type MapsApi = {
  Map: new (element: HTMLElement, options: object) => MapInstance;
  Circle: new (options: object) => CircleInstance;
  LatLng: new (latitude: number, longitude: number) => LatLng;
  geometry: { spherical: { computeOffset(origin: LatLng, distance: number, heading: number): LatLng } };
};

let mapsPromise: Promise<MapsApi> | null = null;

function loadMaps(key: string): Promise<MapsApi> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const browserWindow = window as typeof window & { google?: { maps: MapsApi }; __earthMapReady?: () => void };
    if (browserWindow.google?.maps?.Map) {
      resolve(browserWindow.google.maps);
      return;
    }
    browserWindow.__earthMapReady = () => resolve(browserWindow.google!.maps);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=geometry&callback=__earthMapReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps could not load."));
    document.head.append(script);
  });
  return mapsPromise;
}

export function RadiusMap({ selection, shape, onSelect, points }: { selection: LocationSelection; shape: RegionShape; onSelect: (next: LocationSelection) => void; points: PointCollection }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mountRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const circleRef = useRef<CircleInstance | null>(null);
  const mapsRef = useRef<MapsApi | null>(null);
  const selectionRef = useRef(selection);
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState("");

  useEffect(() => { selectionRef.current = selection; onSelectRef.current = onSelect; }, [selection, onSelect]);
  useEffect(() => { pointsRef.current = points; }, [points]);

  useEffect(() => {
    if (!key || shape !== "circle" || !mountRef.current) return;
    let cancelled = false;
    let listeners: MapListener[] = [];
    let mapElement: HTMLDivElement;
    loadMaps(key).then((maps) => {
      if (cancelled || !mountRef.current) return;
      mapsRef.current = maps;
      mapElement = mountRef.current;
      const selected = selectionRef.current;
      const center = { lat: selected.latitude, lng: selected.longitude };
      const map = new maps.Map(mapElement, { center, zoom: 5, gestureHandling: "greedy", clickableIcons: false, streetViewControl: false, mapTypeControl: false });
      const circle = new maps.Circle({ map, center, radius: (selected.radiusKm ?? 500) * 1000, strokeColor: "#d89026", strokeWeight: 2, fillColor: "#f2b64b", fillOpacity: 0.1, clickable: false });
      mapRef.current = map;
      circleRef.current = circle;
      map.data.setStyle({ icon: { path: 0, fillColor: "#d89026", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1, scale: 5 } });
      map.data.addGeoJson(pointsRef.current);

      const updateMask = () => {
        const projection = map.getProjection();
        const viewportCenter = map.getCenter();
        const zoom = map.getZoom();
        const mask = maskRef.current;
        if (!projection || !viewportCenter || zoom === undefined || !mask || !mountRef.current) return;
        const location = new maps.LatLng(selectionRef.current.latitude, selectionRef.current.longitude);
        const centerPoint = projection.fromLatLngToPoint(viewportCenter);
        if (!centerPoint) return;
        const scale = 2 ** zoom;
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        const boundary = Array.from({ length: 96 }, (_, index) => {
          const position = maps.geometry.spherical.computeOffset(location, (selectionRef.current.radiusKm ?? 500) * 1000, index * 360 / 96);
          const point = projection.fromLatLngToPoint(position);
          if (!point) return "";
          const wrappedX = ((point.x - centerPoint.x + 384) % 256) - 128;
          return `${width / 2 + wrappedX * scale},${height / 2 + (point.y - centerPoint.y) * scale}`;
        });
        if (boundary.some((point) => !point)) return;
        mask.setAttribute("d", `M0,0H${width}V${height}H0Z M${boundary.join(" L")}Z`);
      };
      listeners = [
        map.addListener("click", (event) => {
          if (!event.latLng) return;
          onSelectRef.current({ name: "Selected area", latitude: event.latLng.lat(), longitude: event.latLng.lng(), radiusKm: selectionRef.current.radiusKm ?? 500 });
        }),
        map.addListener("bounds_changed", updateMask),
        map.addListener("idle", updateMask),
      ];
      const bounds = circle.getBounds();
      if (bounds) map.fitBounds(bounds, 28);
      updateMask();
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Google Maps could not load."); });

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
      circleRef.current?.setMap(null);
      mapRef.current = null;
      circleRef.current = null;
      mapsRef.current = null;
      if (mapElement) mapElement.replaceChildren();
    };
  }, [key, shape]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const circle = circleRef.current;
    if (!maps || !map || !circle) return;
    const center = { lat: selection.latitude, lng: selection.longitude };
    circle.setCenter(center);
    circle.setRadius((selection.radiusKm ?? 500) * 1000);
    const bounds = circle.getBounds();
    if (bounds) map.fitBounds(bounds, 28);
  }, [selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.data.forEach((feature) => map.data.remove(feature));
    map.data.addGeoJson(points);
  }, [points]);

  if (shape !== "circle" || !key || error) return <div><Globe selection={selection} shape={shape} onSelect={onSelect} />{shape === "circle" && <p className="map-setup-note">{error || "Google Maps requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. The globe preview remains available."}</p>}</div>;
  return <div className="radius-map-shell"><div className="radius-map" ref={mountRef} aria-label="Interactive radius map. Pan, zoom, or click to select a center." /><svg className="radius-map-mask" width="100%" height="100%" aria-hidden="true"><path ref={maskRef} fill="#dbe6df" fillRule="evenodd" /></svg></div>;
}
