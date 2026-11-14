import type { LocationSelection } from "@/types/track";

export interface PointFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown> | null;
}

export interface PointCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}

export function distanceKm(latitude: number, longitude: number, otherLatitude: number, otherLongitude: number) {
  const toRadians = Math.PI / 180;
  const lat1 = latitude * toRadians;
  const lat2 = otherLatitude * toRadians;
  const deltaLat = (otherLatitude - latitude) * toRadians;
  const deltaLon = (otherLongitude - longitude) * toRadians;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parsePointCollection(value: unknown): PointCollection {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "FeatureCollection" || !("features" in value) || !Array.isArray(value.features)) {
    throw new Error("Choose a GeoJSON FeatureCollection of point locations.");
  }
  const features = value.features.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "Feature" || !("geometry" in entry)) {
      throw new Error("Every GeoJSON entry must be a point feature.");
    }
    const geometry = entry.geometry;
    if (!geometry || typeof geometry !== "object" || !("type" in geometry) || geometry.type !== "Point" || !("coordinates" in geometry) || !Array.isArray(geometry.coordinates)) {
      throw new Error("Radius filtering currently supports GeoJSON Point features.");
    }
    const [longitude, latitude] = geometry.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error("A point has invalid coordinates.");
    }
    return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [longitude, latitude] as [number, number] }, properties: null };
  });
  return { type: "FeatureCollection", features };
}

export function filterPoints(collection: PointCollection, selection: LocationSelection): PointCollection {
  const radius = selection.radiusKm ?? 500;
  return {
    type: "FeatureCollection",
    features: collection.features.filter(({ geometry }) => distanceKm(selection.latitude, selection.longitude, geometry.coordinates[1], geometry.coordinates[0]) <= radius),
  };
}

export async function cropGlobalPng(file: File, selection: LocationSelection) {
  const source = await createImageBitmap(file);
  try {
    if (source.width > 4096 || source.height > 2048) throw new Error("Use a PNG up to 4096 × 2048 pixels.");
    const radiusKm = selection.radiusKm ?? 500;
    const angularRadius = radiusKm / 6371.0088;
    const latitudeSpan = angularRadius * 180 / Math.PI;
    const north = Math.min(90, selection.latitude + latitudeSpan);
    const south = Math.max(-90, selection.latitude - latitudeSpan);
    const reachesPole = north === 90 || south === -90;
    const longitudeSpan = reachesPole ? 180 : Math.asin(Math.min(1, Math.sin(angularRadius) / Math.cos(selection.latitude * Math.PI / 180))) * 180 / Math.PI;
    const west = selection.longitude - longitudeSpan;
    const east = selection.longitude + longitudeSpan;
    const width = Math.max(1, Math.min(1024, Math.ceil(source.width * (east - west) / 360)));
    const height = Math.max(1, Math.min(1024, Math.ceil(source.height * (north - south) / 180)));
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("The map image could not be read.");
    sourceContext.drawImage(source, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("The selected map could not be created.");
    const output = outputContext.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const latitude = north - ((y + 0.5) / height) * (north - south);
      const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor((90 - latitude) / 180 * source.height)));
      for (let x = 0; x < width; x++) {
        const longitude = west + ((x + 0.5) / width) * (east - west);
        if (distanceKm(selection.latitude, selection.longitude, latitude, longitude) > radiusKm) continue;
        const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360;
        const sourceX = Math.min(source.width - 1, Math.floor(wrappedLongitude / 360 * source.width));
        const from = (sourceY * source.width + sourceX) * 4;
        const to = (y * width + x) * 4;
        output.data.set(sourcePixels.subarray(from, from + 4), to);
      }
    }
    outputContext.putImageData(output, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => outputCanvas.toBlob((value) => value ? resolve(value) : reject(new Error("The selected map could not be encoded.")), "image/png"));
    return { blob, bounds: { west, east, south, north }, width, height };
  } finally {
    source.close();
  }
}
