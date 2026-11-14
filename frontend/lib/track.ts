import type { FeatureKey, FeatureSample, LoadedTrack, TrackDocument } from "@/types/track";

const FEATURE_KEYS: FeatureKey[] = ["colorWarmth", "motion", "variation"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateTrack(value: unknown): TrackDocument {
  if (!isRecord(value)) throw new Error("Track data must be a JSON object.");
  if (value.schemaVersion !== 1) throw new Error("Unsupported track schema version.");

  for (const key of ["id", "title", "videoUrl", "sourceUrl", "credits"] as const) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`Track field “${key}” must be a non-empty string.`);
    }
  }

  if (typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0) {
    throw new Error("Track duration must be a positive finite number.");
  }
  if (!isRecord(value.featureDefinitions)) throw new Error("Feature definitions are missing.");
  for (const key of FEATURE_KEYS) {
    if (typeof value.featureDefinitions[key] !== "string" || value.featureDefinitions[key].trim() === "") {
      throw new Error(`Feature definition “${key}” is missing.`);
    }
  }
  if (!Array.isArray(value.samples) || value.samples.length === 0) throw new Error("Track has no feature samples.");

  let previousTime = -Infinity;
  const samples = value.samples.map((sample, index) => {
    if (!isRecord(sample)) throw new Error(`Sample ${index + 1} is not an object.`);
    const time = sample.timeSeconds;
    if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > (value.durationSeconds as number)) {
      throw new Error(`Sample ${index + 1} has an invalid timestamp.`);
    }
    if (time <= previousTime) throw new Error("Sample timestamps must be strictly increasing.");
    previousTime = time;
    for (const key of FEATURE_KEYS) {
      const feature = sample[key];
      if (typeof feature !== "number" || !Number.isFinite(feature) || feature < 0 || feature > 1) {
        throw new Error(`Sample ${index + 1} has an invalid ${key} value.`);
      }
    }
    return sample as unknown as FeatureSample;
  });

  if (samples[0].timeSeconds !== 0) throw new Error("The first sample must start at zero seconds.");
  return value as unknown as TrackDocument;
}

export function sampleFeatures(samples: FeatureSample[], timeSeconds: number): FeatureSample {
  if (samples.length === 0) throw new Error("Cannot sample an empty feature timeline.");
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  if (time <= samples[0].timeSeconds) return { ...samples[0] };
  const last = samples[samples.length - 1];
  if (time >= last.timeSeconds) return { ...last };

  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeSeconds <= time) low = middle;
    else high = middle;
  }

  const before = samples[low];
  const after = samples[high];
  const progress = (time - before.timeSeconds) / (after.timeSeconds - before.timeSeconds);
  return {
    timeSeconds: time,
    colorWarmth: before.colorWarmth + (after.colorWarmth - before.colorWarmth) * progress,
    motion: before.motion + (after.motion - before.motion) * progress,
    variation: before.variation + (after.variation - before.variation) * progress,
  };
}

async function fetchAndValidate(url: string): Promise<TrackDocument> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "NOT_FOUND" : `Could not load track data (${response.status}).`);
  return validateTrack(await response.json());
}

export async function loadTrack(forceFixture = false, trackId: "precipitation" | "ocean" = "precipitation"): Promise<LoadedTrack> {
  if (!forceFixture) {
    try {
      return { track: await fetchAndValidate(`/data/${trackId}.json`), isSynthetic: false };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "NOT_FOUND") throw error;
    }
  }
  return { track: await fetchAndValidate("/fixtures/ocean.synthetic.json"), isSynthetic: true };
}
