"use client";

import { useEffect, useRef, useState } from "react";
import { extractInstrumentNotes, type InstrumentNote } from "@/lib/instrument-notes";

type ToneModule = typeof import("tone");
type Instrument = "keys" | "bells" | "strings";
type ActiveSynth = {
  triggerAttackRelease: (note: string, duration: number, time: number, velocity: number) => unknown;
  releaseAll: () => unknown;
  dispose: () => unknown;
};
type Engine = { synth: ActiveSynth; output: { dispose: () => unknown }; timer: number };

const instruments: { id: Instrument; label: string }[] = [
  { id: "keys", label: "Soft keys" },
  { id: "bells", label: "Glass bells" },
  { id: "strings", label: "String pad" },
];

function makeSynth(tone: ToneModule, instrument: Instrument) {
  const output = new tone.Gain(0.36).toDestination();
  const synth = instrument === "bells"
    ? new tone.PolySynth(tone.FMSynth, {
        harmonicity: 3,
        modulationIndex: 5,
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.15, release: 0.55 },
        modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.35 },
      })
    : new tone.PolySynth(tone.Synth, {
        oscillator: { type: instrument === "keys" ? "triangle" : "sine" },
        envelope: instrument === "keys"
          ? { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }
          : { attack: 0.12, decay: 0.15, sustain: 0.65, release: 0.8 },
      });
  synth.connect(output);
  return { synth, output };
}

export function InstrumentPlayback({ audioBlob, onStart, onProgress, onFinish }: {
  audioBlob: Blob;
  onStart?: () => void;
  onProgress?: (fraction: number) => void;
  onFinish?: (completed: boolean) => void;
}) {
  const [instrument, setInstrument] = useState<Instrument>("keys");
  const [ready, setReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const toneRef = useRef<ToneModule | null>(null);
  const analysisRef = useRef<{ notes: InstrumentNote[]; duration: number } | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const generation = generationRef;
    const activeEngine = engineRef;
    import("tone").then((tone) => {
      if (mounted) { toneRef.current = tone; setReady(true); }
    }).catch(() => { if (mounted) setError("Tone.js could not be loaded."); });
    return () => {
      mounted = false;
      generation.current++;
      if (activeEngine.current) {
        clearInterval(activeEngine.current.timer);
        activeEngine.current.synth.releaseAll();
        activeEngine.current.synth.dispose();
        activeEngine.current.output.dispose();
        activeEngine.current = null;
      }
    };
  }, []);

  function stop(completed: boolean) {
    generationRef.current++;
    if (engineRef.current) {
      clearInterval(engineRef.current.timer);
      engineRef.current.synth.releaseAll();
      engineRef.current.synth.dispose();
      engineRef.current.output.dispose();
      engineRef.current = null;
    }
    setPlaying(false);
    setPreparing(false);
    onFinish?.(completed);
  }

  async function play() {
    const tone = toneRef.current;
    if (!tone || preparing || playing) return;
    const generation = ++generationRef.current;
    setError("");
    setPreparing(true);
    try {
      onStart?.();
      await tone.start();
      if (!analysisRef.current) {
        const context = new AudioContext();
        let decoded: AudioBuffer;
        try { decoded = await context.decodeAudioData(await audioBlob.arrayBuffer()); }
        finally { await context.close(); }
        const notes = extractInstrumentNotes(decoded.getChannelData(0), decoded.sampleRate);
        if (!notes.length) throw new Error("This sound file has no audible notes to convert.");
        analysisRef.current = { notes, duration: decoded.duration };
      }
      if (generation !== generationRef.current) return;
      const { notes, duration } = analysisRef.current;
      const { synth, output } = makeSynth(tone, instrument);
      const startedAt = tone.immediate() + 0.08;
      let nextNote = 0;
      const tick = () => {
        const elapsed = Math.max(0, tone.immediate() - startedAt);
        while (nextNote < notes.length && notes[nextNote].time <= elapsed + 0.15) {
          const note = notes[nextNote++];
          synth.triggerAttackRelease(note.note, note.duration, startedAt + note.time, note.velocity);
        }
        onProgress?.(Math.min(1, elapsed / duration));
        if (elapsed >= duration + 0.45) stop(true);
      };
      engineRef.current = { synth, output, timer: window.setInterval(tick, 50) };
      setPreparing(false);
      setPlaying(true);
      tick();
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(cause instanceof Error ? cause.message : "Instrument playback could not start.");
      stop(false);
    }
  }

  return <div className="instrument-playback">
    <label>Play the sound file as
      <select value={instrument} disabled={!ready || preparing || playing} onChange={(event) => setInstrument(event.target.value as Instrument)}>
        {instruments.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    <button type="button" disabled={!ready || preparing} onClick={() => playing ? stop(false) : void play()}>
      {preparing ? "Converting sound…" : playing ? "Stop instruments" : ready ? "Play as instruments" : "Loading instruments…"}
    </button>
    <p>Replays the file’s pitch and loudness pattern with Tone.js. This is a new interpretation of the mixed audio.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}
