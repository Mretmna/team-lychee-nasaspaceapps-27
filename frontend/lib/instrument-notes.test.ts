import { describe, expect, it } from "vitest";
import { extractInstrumentNotes } from "./instrument-notes";

describe("extractInstrumentNotes", () => {
  it("turns pitched audio into timed notes and skips silence", () => {
    const sampleRate = 8000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate / 2; i++) samples[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / sampleRate);
    const notes = extractInstrumentNotes(samples, sampleRate);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].note).toBe("A4");
    expect(notes.every((note) => note.time < 0.5 && note.velocity > 0)).toBe(true);
  });

  it("returns no notes for silence", () => {
    expect(extractInstrumentNotes(new Float32Array(8000), 8000)).toEqual([]);
  });
});
