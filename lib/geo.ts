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

// Reproject the validated geographic crop for the circular visualization only.
// The original equirectangular PNG remains the file sent to FastAPI.
export async function projectCircularPng(crop: { blob: Blob; latitude: number; longitude: number; radiusKm: number; bounds: { west: number; east: number; south: number; north: number } }) {
  const bitmap = await createImageBitmap(crop.blob);
  try {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("The selected map could not be displayed.");
    sourceContext.drawImage(bitmap, 0, 0);
    const source = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const size = 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The circular map could not be created.");
    const output = context.createImageData(size, size);
    const latitude0 = crop.latitude * Math.PI / 180;
    const longitude0 = crop.longitude * Math.PI / 180;
    const sinLatitude0 = Math.sin(latitude0);
    const cosLatitude0 = Math.cos(latitude0);
    const maxAngle = crop.radiusKm / 6371.0088;
    for (let y = 0; y < size; y++) {
      const north = 1 - (y + 0.5) / size * 2;
      for (let x = 0; x < size; x++) {
        const east = (x + 0.5) / size * 2 - 1;
        const distance = Math.hypot(east, north);
        if (distance > 1) continue;
        const bearing = Math.atan2(east, north);
        const arc = distance * maxAngle * 0.995;
        const latitude = Math.asin(sinLatitude0 * Math.cos(arc) + cosLatitude0 * Math.sin(arc) * Math.cos(bearing));
        const longitude = longitude0 + Math.atan2(Math.sin(bearing) * Math.sin(arc) * cosLatitude0, Math.cos(arc) - sinLatitude0 * Math.sin(latitude));
        const latitudeDegrees = latitude * 180 / Math.PI;
        let longitudeDegrees = longitude * 180 / Math.PI;
        while (longitudeDegrees < crop.bounds.west) longitudeDegrees += 360;
        while (longitudeDegrees > crop.bounds.east) longitudeDegrees -= 360;
        const sourceX = Math.min(bitmap.width - 1, Math.max(0, Math.floor((longitudeDegrees - crop.bounds.west) / (crop.bounds.east - crop.bounds.west) * bitmap.width)));
        const sourceY = Math.min(bitmap.height - 1, Math.max(0, Math.floor((crop.bounds.north - latitudeDegrees) / (crop.bounds.north - crop.bounds.south) * bitmap.height)));
        let from = (sourceY * bitmap.width + sourceX) * 4;
        if (source[from + 3] === 0) {
          outer: for (let offset = 1; offset <= 4; offset++) {
            for (let deltaY = -offset; deltaY <= offset; deltaY++) {
              for (let deltaX = -offset; deltaX <= offset; deltaX++) {
                const candidateX = sourceX + deltaX;
                const candidateY = sourceY + deltaY;
                if (candidateX < 0 || candidateX >= bitmap.width || candidateY < 0 || candidateY >= bitmap.height) continue;
                const candidate = (candidateY * bitmap.width + candidateX) * 4;
                if (source[candidate + 3] > 0) { from = candidate; break outer; }
              }
            }
          }
        }
        const to = (y * size + x) * 4;
        output.data.set(source.subarray(from, from + 4), to);
      }
    }
    context.putImageData(output, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The circular map could not be encoded.")), "image/png"));
  } finally {
    bitmap.close();
  }
}
