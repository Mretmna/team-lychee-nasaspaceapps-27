import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeImageColors, parseVoiceAnalysis, sampleVoiceAnalysis } from "./voice-analysis";

const response = { mapping: { enabledVoices: ["red", "green", "blue", "neutral"], voiceTimeline: [
  { red: 0.2, green: 0, blue: 0, neutral: 0 },
  { red: 0, green: 0.1, blue: 0.3, neutral: 0 },
] } };

describe("voice analysis", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("interpolates the backend timeline at audio progress", () => {
    const analysis = parseVoiceAnalysis(response);
    expect(sampleVoiceAnalysis(analysis, 0.5)).toEqual({ levels: { red: 0.1, green: 0.05, blue: 0.15, neutral: 0 }, brightness: 0.30000000000000004 });
    expect(sampleVoiceAnalysis(analysis, 2).levels.blue).toBe(0.3);
  });

  it("rejects missing or invalid color levels", () => {
    expect(() => parseVoiceAnalysis({ mapping: { ...response.mapping, voiceTimeline: [{ ...response.mapping.voiceTimeline[0], blue: Number.NaN }, response.mapping.voiceTimeline[1]] } })).toThrow(/color data/);
    expect(() => parseVoiceAnalysis({ mapping: { voiceTimeline: [] } })).toThrow(/color data/);
  });

  it("shows red image contributions before the sound service responds", async () => {
    const pixels = new Uint8ClampedArray(24 * 24 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 255;
      pixels[index + 3] = 255;
    }
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 24, height: 24, close: vi.fn() })));
    vi.stubGlobal("document", { createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ data: pixels }) }),
    }) });
    const analysis = await analyzeImageColors(new Blob(), "clockwise", "circle");
    expect(analysis.timeline).toHaveLength(49);
    expect(analysis.timeline[0].red).toBeCloseTo(0.2126);
    expect(analysis.timeline[47].green).toBe(0);
    expect(analysis.timeline[47].blue).toBe(0);
  });
});
