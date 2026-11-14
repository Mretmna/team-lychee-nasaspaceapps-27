import { sampleFeatures } from "@/lib/track";
import type { FeatureSample } from "@/types/track";

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

const PENTATONIC_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const GRID_SECONDS = 0.125;
const LOOKAHEAD_SECONDS = 0.32;

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function deterministicUnit(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export class SonificationEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voices = new Set<Voice>();
  private scheduledThrough = 0;
  private volume = 0.72;
  private muted = false;

  async initialize() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("This browser does not support Web Audio.");
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -20;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.01;
      this.compressor.release.value = 0.2;
      this.master.connect(this.compressor).connect(this.context.destination);
      this.applyGain();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyGain();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain() {
    if (!this.context || !this.master) return;
    const target = this.muted ? 0 : this.volume * 0.24;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.025);
  }

  reset(videoTime = 0) {
    if (this.context) {
      for (const voice of this.voices) {
        try {
          voice.gain.gain.cancelScheduledValues(this.context.currentTime);
          voice.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.008);
          voice.oscillator.stop(this.context.currentTime + 0.03);
        } catch {
          // A voice may already have ended between scheduler ticks.
        }
      }
    }
    this.voices.clear();
    this.scheduledThrough = videoTime;
  }

  schedule(videoTime: number, duration: number, samples: FeatureSample[]) {
    if (!this.context || !this.master || this.context.state !== "running") return;
    if (Math.abs(this.scheduledThrough - videoTime) > 0.55) this.reset(videoTime);

    const end = Math.min(duration, videoTime + LOOKAHEAD_SECONDS);
    let eventTime = Math.max(videoTime, this.scheduledThrough);
    eventTime = Math.ceil(eventTime / GRID_SECONDS) * GRID_SECONDS;

    while (eventTime < end) {
      const gridIndex = Math.round(eventTime / GRID_SECONDS);
      const feature = sampleFeatures(samples, eventTime);
      const density = 0.08 + feature.motion * 0.62;
      if (deterministicUnit(gridIndex) < density) {
        const delay = Math.max(0.025, eventTime - videoTime + 0.025);
        this.scheduleVoice(feature, gridIndex, this.context.currentTime + delay);
      }
      eventTime += GRID_SECONDS;
    }
    this.scheduledThrough = end;
  }

  private scheduleVoice(feature: FeatureSample, gridIndex: number, startTime: number) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const pitchIndex = Math.min(PENTATONIC_MIDI.length - 1, Math.floor(feature.colorWarmth * PENTATONIC_MIDI.length));
    const octaveNudge = deterministicUnit(gridIndex + 99) > 0.82 ? 12 : 0;
    oscillator.frequency.value = midiToFrequency(PENTATONIC_MIDI[pitchIndex] + octaveNudge);
    oscillator.type = feature.variation > 0.68 ? "sawtooth" : feature.variation > 0.34 ? "triangle" : "sine";
    filter.type = "lowpass";
    filter.frequency.value = 650 + feature.variation * 3000;
    filter.Q.value = 0.4 + feature.variation * 3;

    const duration = 0.11 + (1 - feature.motion) * 0.28;
    const peak = 0.055 + feature.variation * 0.025;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(filter).connect(gain).connect(this.master);

    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => {
      this.voices.delete(voice);
      oscillator.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  dispose() {
    this.reset();
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.master = null;
    this.compressor = null;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
