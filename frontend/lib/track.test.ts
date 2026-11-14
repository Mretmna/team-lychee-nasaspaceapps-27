import { describe, expect, it } from "vitest";
import { sampleFeatures, validateTrack } from "./track";
import type { FeatureSample } from "@/types/track";

const samples: FeatureSample[] = [
  { timeSeconds: 0, colorWarmth: 0.2, motion: 0, variation: 0.4 },
  { timeSeconds: 2, colorWarmth: 0.8, motion: 1, variation: 0.6 },
];

describe("sampleFeatures", () => {
  it("clamps before and after the timeline", () => {
    expect(sampleFeatures(samples, -1)).toEqual(samples[0]);
    expect(sampleFeatures(samples, 10)).toEqual(samples[1]);
  });

  it("interpolates between timestamps", () => {
    expect(sampleFeatures(samples, 1)).toEqual({
      timeSeconds: 1,
      colorWarmth: 0.5,
      motion: 0.5,
      variation: 0.5,
    });
  });

  it("uses the first sample for a non-finite seek time", () => {
    expect(sampleFeatures(samples, Number.NaN)).toEqual(samples[0]);
  });
});

describe("validateTrack", () => {
  const valid = {
    schemaVersion: 1,
    id: "test",
    title: "Test",
    videoUrl: "/test.mp4",
    durationSeconds: 2,
    sourceUrl: "https://example.com",
    credits: "Test credit",
    featureDefinitions: { colorWarmth: "Warm", motion: "Motion", variation: "Variation" },
    samples,
  };

  it("accepts the shared contract", () => expect(validateTrack(valid)).toEqual(valid));
  it("rejects out-of-range features", () => {
    expect(() => validateTrack({ ...valid, samples: [{ ...samples[0], motion: 2 }] })).toThrow(/motion/);
  });
  it("rejects non-increasing timestamps", () => {
    expect(() => validateTrack({ ...valid, samples: [samples[0], { ...samples[1], timeSeconds: 0 }] })).toThrow(/strictly increasing/);
  });
});
