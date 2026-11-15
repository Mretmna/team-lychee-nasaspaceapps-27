export type FeatureKey = "colorWarmth" | "motion" | "variation";

export interface FeatureSample {
  timeSeconds: number;
  colorWarmth: number;
  motion: number;
  variation: number;
}

export interface TrackDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  sourceUrl: string;
  credits: string;
  featureDefinitions: Record<FeatureKey, string>;
  samples: FeatureSample[];
}

export interface LoadedTrack {
  track: TrackDocument;
  isSynthetic: boolean;
}

export interface LocationSelection {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
  city?: string;
  country?: string;
}

export type RegionShape = "circle" | "square" | "full";
