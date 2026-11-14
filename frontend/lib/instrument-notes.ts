export type InstrumentNote = { time: number; duration: number; note: string; velocity: number };

const pitches = [
  ["C3", 130.81], ["D3", 146.83], ["E3", 164.81], ["G3", 196], ["A3", 220],
  ["C4", 261.63], ["D4", 293.66], ["E4", 329.63], ["G4", 392], ["A4", 440],
  ["C5", 523.25], ["D5", 587.33], ["E5", 659.25], ["G5", 783.99], ["A5", 880],
] as const;

function dominantPitch(window: Float32Array, sampleRate: number): string {
  let best: string = pitches[0][0];
  let strongest = -Infinity;
  for (const [note, frequency] of pitches) {
    const coefficient = 2 * Math.cos(2 * Math.PI * frequency / sampleRate);
    let previous = 0;
    let beforePrevious = 0;
    for (const sample of window) {
      const current = sample + coefficient * previous - beforePrevious;
      beforePrevious = previous;
      previous = current;
    }
    const power = previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious;
    if (power > strongest) { strongest = power; best = note; }
  }
  return best;
}

export function extractInstrumentNotes(samples: Float32Array, sampleRate: number): InstrumentNote[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !samples.length) return [];
  const step = Math.max(1, Math.round(sampleRate * 0.24));
  const windows: { time: number; rms: number; note: string }[] = [];
  for (let start = 0; start < samples.length; start += step) {
    const length = Math.min(step, samples.length - start);
    if (length < sampleRate * 0.06) break;
    const stride = Math.max(1, Math.ceil(length / 2048));
    const count = Math.ceil(length / stride);
    const window = new Float32Array(count);
    let energy = 0;
    for (let i = 0; i < count; i++) {
      const value = samples[start + i * stride];
      energy += value * value;
      window[i] = value * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.max(1, count - 1)));
    }
    const rms = Math.sqrt(energy / count);
    windows.push({ time: start / sampleRate, rms, note: dominantPitch(window, sampleRate / stride) });
  }
  const maximum = Math.max(0, ...windows.map((window) => window.rms));
  const threshold = Math.max(0.012, maximum * 0.12);
  return windows.filter((window) => window.rms >= threshold).map((window) => ({
    time: window.time,
    duration: Math.min(0.22, samples.length / sampleRate - window.time),
    note: window.note,
    velocity: Math.min(0.85, Math.max(0.18, window.rms / maximum * 0.75)),
  }));
}
