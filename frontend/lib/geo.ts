import type { LocationSelection, RegionShape } from "@/types/track";

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

export function regionBounds(selection: LocationSelection, shape: RegionShape) {
  if (shape === "full") return { west: -180, east: 180, south: -90, north: 90 };
  const angularRadius = (selection.radiusKm ?? 500) / 6371.0088;
  const latitudeSpan = angularRadius * 180 / Math.PI;
  const north = Math.min(90, selection.latitude + latitudeSpan);
  const south = Math.max(-90, selection.latitude - latitudeSpan);
  const reachesPole = north === 90 || south === -90;
  const longitudeSpan = reachesPole ? 180 : Math.asin(Math.min(1, Math.sin(angularRadius) / Math.cos(selection.latitude * Math.PI / 180))) * 180 / Math.PI;
  return { west: selection.longitude - longitudeSpan, east: selection.longitude + longitudeSpan, south, north };
}

export function filterPoints(collection: PointCollection, selection: LocationSelection, shape: RegionShape = "circle"): PointCollection {
  if (shape === "full") return collection;
  const radius = selection.radiusKm ?? 500;
  const bounds = regionBounds(selection, shape);
  return {
    type: "FeatureCollection",
    features: collection.features.filter(({ geometry }) => {
      const [longitude, latitude] = geometry.coordinates;
      if (shape === "circle") return distanceKm(selection.latitude, selection.longitude, latitude, longitude) <= radius;
      const unwrappedLongitude = selection.longitude + ((((longitude - selection.longitude + 540) % 360) + 360) % 360 - 180);
      return latitude >= bounds.south && latitude <= bounds.north && unwrappedLongitude >= bounds.west && unwrappedLongitude <= bounds.east;
    }),
  };
}

function sampleBilinear(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, output: Uint8ClampedArray, to: number, wrapX = false) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const xWeight = x - left;
  const yWeight = y - top;
  let alpha = 0;
  const color = [0, 0, 0];
  for (let dy = 0; dy <= 1; dy++) {
    const sourceY = Math.max(0, Math.min(height - 1, top + dy));
    for (let dx = 0; dx <= 1; dx++) {
      const sourceX = wrapX ? ((left + dx) % width + width) % width : Math.max(0, Math.min(width - 1, left + dx));
      const from = (sourceY * width + sourceX) * 4;
      const weight = (dx ? xWeight : 1 - xWeight) * (dy ? yWeight : 1 - yWeight) * source[from + 3] / 255;
      alpha += weight;
      for (let channel = 0; channel < 3; channel++) color[channel] += source[from + channel] * weight;
    }
  }
  if (alpha > 0) {
    for (let channel = 0; channel < 3; channel++) output[to + channel] = color[channel] / alpha;
    output[to + 3] = alpha * 255;
  }
}

export async function cropGlobalPng(file: File, selection: LocationSelection, shape: RegionShape = "circle") {
  const source = await createImageBitmap(file);
  try {
    if (source.width > 8192 || source.height > 4096) throw new Error("Use a PNG or JPEG up to 8192 × 4096 pixels.");
    const radiusKm = selection.radiusKm ?? 500;
    const { west, east, south, north } = regionBounds(selection, shape);
    const fullScale = Math.min(1, 1024 / source.width, 1024 / source.height);
    const squareSize = Math.max(1, Math.min(1024, Math.ceil(Math.max(source.width * (east - west) / 360, source.height * (north - south) / 180) * 2)));
    const width = shape === "full" ? Math.max(1, Math.round(source.width * fullScale)) : shape === "square" ? squareSize : Math.max(1, Math.min(1024, Math.ceil(source.width * (east - west) / 360 * 2)));
    const height = shape === "full" ? Math.max(1, Math.round(source.height * fullScale)) : shape === "square" ? squareSize : Math.max(1, Math.min(1024, Math.ceil(source.height * (north - south) / 180 * 2)));
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("The selected map could not be created.");
    if (shape === "full") {
      outputContext.imageSmoothingQuality = "high";
      outputContext.drawImage(source, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => outputCanvas.toBlob((value) => value ? resolve(value) : reject(new Error("The selected map could not be encoded.")), "image/png"));
      return { blob, bounds: { west, east, south, north }, width, height };
    }
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("The map image could not be read.");
    sourceContext.drawImage(source, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    const output = outputContext.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const latitude = north - ((y + 0.5) / height) * (north - south);
      const sourceY = (90 - latitude) / 180 * source.height - 0.5;
      for (let x = 0; x < width; x++) {
        const longitude = west + ((x + 0.5) / width) * (east - west);
        if (shape === "circle" && distanceKm(selection.latitude, selection.longitude, latitude, longitude) > radiusKm) continue;
        const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360;
        const sourceX = wrappedLongitude / 360 * source.width - 0.5;
        sampleBilinear(sourcePixels, source.width, source.height, sourceX, sourceY, output.data, (y * width + x) * 4, true);
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
    const size = 960;
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
        const sourceX = (longitudeDegrees - crop.bounds.west) / (crop.bounds.east - crop.bounds.west) * bitmap.width - 0.5;
        const sourceY = (crop.bounds.north - latitudeDegrees) / (crop.bounds.north - crop.bounds.south) * bitmap.height - 0.5;
        sampleBilinear(source, bitmap.width, bitmap.height, sourceX, sourceY, output.data, (y * size + x) * 4);
      }
    }
    context.putImageData(output, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The circular map could not be encoded.")), "image/png"));
  } finally {
    bitmap.close();
  }
}

export function drawRectangularGlobalFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, bounds: { west: number; east: number; south: number; north: number }, full: boolean) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const width = full ? 960 : 480;
  const height = full ? 480 : 480;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The NASA frame could not be displayed.");
  if (full) { context.drawImage(video, 0, 0, width, height); return; }
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = video.videoWidth;
  sourceCanvas.height = video.videoHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("The NASA frame could not be displayed.");
  sourceContext.drawImage(video, 0, 0);
  const source = sourceContext.getImageData(0, 0, video.videoWidth, video.videoHeight).data;
  const output = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const latitude = bounds.north - (y + 0.5) / height * (bounds.north - bounds.south);
    const sourceY = (90 - latitude) / 180 * video.videoHeight - 0.5;
    for (let x = 0; x < width; x++) {
      const longitude = bounds.west + (x + 0.5) / width * (bounds.east - bounds.west);
      const sourceX = (((longitude + 180) % 360 + 360) % 360) / 360 * video.videoWidth - 0.5;
      sampleBilinear(source, video.videoWidth, video.videoHeight, sourceX, sourceY, output.data, (y * width + x) * 4, true);
    }
  }
  context.putImageData(output, 0, 0);
}

export function drawCircularGlobalFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, selection: Pick<LocationSelection, "latitude" | "longitude" | "radiusKm">) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = video.videoWidth;
  sourceCanvas.height = video.videoHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const context = canvas.getContext("2d");
  if (!sourceContext || !context) throw new Error("The NASA frame could not be displayed.");
  sourceContext.drawImage(video, 0, 0);
  const source = sourceContext.getImageData(0, 0, video.videoWidth, video.videoHeight).data;
  const size = 480;
  if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
  const output = context.createImageData(size, size);
  const latitude0 = selection.latitude * Math.PI / 180;
  const longitude0 = selection.longitude * Math.PI / 180;
  const sinLatitude0 = Math.sin(latitude0);
  const cosLatitude0 = Math.cos(latitude0);
  const maxAngle = (selection.radiusKm ?? 500) / 6371.0088;
  for (let y = 0; y < size; y++) {
    const north = 1 - (y + 0.5) / size * 2;
    for (let x = 0; x < size; x++) {
      const east = (x + 0.5) / size * 2 - 1;
      const distance = Math.hypot(east, north);
      if (distance > 1) continue;
      const bearing = Math.atan2(east, north);
      const arc = distance * maxAngle;
      const latitude = Math.asin(sinLatitude0 * Math.cos(arc) + cosLatitude0 * Math.sin(arc) * Math.cos(bearing));
      const longitude = longitude0 + Math.atan2(Math.sin(bearing) * Math.sin(arc) * cosLatitude0, Math.cos(arc) - sinLatitude0 * Math.sin(latitude));
      const longitudeDegrees = ((longitude * 180 / Math.PI + 180) % 360 + 360) % 360;
      const sourceX = Math.min(video.videoWidth - 1, Math.floor(longitudeDegrees / 360 * video.videoWidth));
      const sourceY = Math.min(video.videoHeight - 1, Math.max(0, Math.floor((90 - latitude * 180 / Math.PI) / 180 * video.videoHeight)));
      const from = (sourceY * video.videoWidth + sourceX) * 4;
      const to = (y * size + x) * 4;
      output.data.set(source.subarray(from, from + 4), to);
    }
  }
  context.putImageData(output, 0, 0);
}
