export const voiceKeys = ["red", "green", "blue", "neutral"] as const;

export type VoiceKey = (typeof voiceKeys)[number];
export type VoiceFrame = Record<VoiceKey, number>;
export type VoiceAnalysis = { timeline: VoiceFrame[]; enabledVoices: VoiceKey[] };
export type ImageScanMode = "clockwise" | "linear" | "circle_outward" | "circle_inward";
export type ImageShape = "circle" | "square" | "full";

export function parseVoiceAnalysis(value: unknown): VoiceAnalysis {
  if (!value || typeof value !== "object" || !("mapping" in value) || !value.mapping || typeof value.mapping !== "object") {
    throw new Error("The sound service returned incomplete color data.");
  }
  const mapping = value.mapping;
  if (!("voiceTimeline" in mapping) || !Array.isArray(mapping.voiceTimeline) || mapping.voiceTimeline.length < 2 || mapping.voiceTimeline.length > 512 ||
      !mapping.voiceTimeline.every((frame) => frame && typeof frame === "object" && voiceKeys.every((key) => typeof frame[key] === "number" && Number.isFinite(frame[key]) && frame[key] >= 0 && frame[key] <= 1)) ||
      !("enabledVoices" in mapping) || !Array.isArray(mapping.enabledVoices) ||
      !mapping.enabledVoices.every((key) => voiceKeys.some((voice) => voice === key))) {
    throw new Error("The sound service returned incomplete color data.");
  }
  return { timeline: mapping.voiceTimeline as VoiceFrame[], enabledVoices: mapping.enabledVoices as VoiceKey[] };
}

export function sampleVoiceAnalysis(analysis: VoiceAnalysis, fraction: number): { levels: VoiceFrame; brightness: number } {
  const position = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * (analysis.timeline.length - 1);
  const index = Math.floor(position);
  const next = Math.min(index + 1, analysis.timeline.length - 1);
  const blend = position - index;
  const levels = Object.fromEntries(voiceKeys.map((key) => [key, analysis.timeline[index][key] * (1 - blend) + analysis.timeline[next][key] * blend])) as VoiceFrame;
  return { levels, brightness: Math.min(1, voiceKeys.reduce((sum, key) => sum + levels[key], 0)) };
}

export async function analyzeImageColors(image: Blob, scanMode: ImageScanMode, shape: ImageShape): Promise<VoiceAnalysis> {
  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(bitmap.width, 512);
    canvas.height = Math.min(bitmap.height, 512);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The selected image could not be read for its color graph.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    const empty = (): VoiceFrame => ({ red: 0, green: 0, blue: 0, neutral: 0 });
    const timeline: VoiceFrame[] = [];

    function sample(x: number, y: number, frame: VoiceFrame) {
      const column = Math.max(0, Math.min(width - 1, Math.round(x)));
      const row = Math.max(0, Math.min(height - 1, Math.round(y)));
      const offset = (row * width + column) * 4;
      const alpha = pixels[offset + 3] / 255;
      const red = pixels[offset] / 255 * alpha;
      const green = pixels[offset + 1] / 255 * alpha;
      const blue = pixels[offset + 2] / 255 * alpha;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const difference = maximum - minimum;
      const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      if (brightness <= 1 / 255) return;
      const saturation = maximum === 0 ? 0 : difference / maximum;
      let hue = 0;
      if (difference > 0) {
        if (maximum === red) hue = ((green - blue) / difference + 6) % 6;
        else if (maximum === green) hue = (blue - red) / difference + 2;
        else hue = (red - green) / difference + 4;
      }
      const sector = hue / 2;
      const lower = Math.floor(sector) % 3;
      const blend = sector - Math.floor(sector);
      frame.neutral += brightness * (1 - saturation);
      frame[voiceKeys[lower]] += brightness * saturation * (1 - blend);
      frame[voiceKeys[(lower + 1) % 3]] += brightness * saturation * blend;
    }

    for (let position = 0; position < 48; position++) {
      const frame = empty();
      for (let band = 0; band < 12; band++) {
        for (const part of [1 / 6, 1 / 2, 5 / 6]) {
          const fraction = (band + part) / 12;
          let x: number;
          let y: number;
          if (scanMode === "linear") {
            x = (position + 0.5) / 48 * (width - 1);
            y = fraction * (height - 1);
          } else {
            const angle = scanMode === "clockwise" ? 2 * Math.PI * position / 48 : 2 * Math.PI * fraction;
            const dx = Math.sin(angle);
            const dy = -Math.cos(angle);
            const edge = Math.min(
              Math.abs(dx) < 1e-10 ? Infinity : (dx > 0 ? width - 1 - centerX : centerX) / Math.abs(dx),
              Math.abs(dy) < 1e-10 ? Infinity : (dy > 0 ? height - 1 - centerY : centerY) / Math.abs(dy),
            );
            const extent = scanMode === "clockwise" ? fraction : (scanMode === "circle_inward" ? 47.5 - position : position + 0.5) / 48;
            const radius = scanMode !== "clockwise" && shape === "circle" ? Math.min(centerX, centerY) : edge;
            x = centerX + dx * radius * extent;
            y = centerY + dy * radius * extent;
          }
          sample(x, y, frame);
        }
      }
      for (const voice of voiceKeys) frame[voice] /= 36;
      timeline.push(frame);
    }
    timeline.push({ ...timeline[timeline.length - 1] });
    return { timeline, enabledVoices: [...voiceKeys] };
  } finally {
    bitmap.close();
  }
}
