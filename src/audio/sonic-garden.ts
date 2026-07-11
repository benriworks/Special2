import type { LifeTraits } from "../core/generation";

type AudioContextConstructor = new (contextOptions?: AudioContextOptions) => AudioContext;

interface Voice {
  oscillator: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  baseFrequency: number;
}

interface GardenGraph {
  input: GainNode;
  master: GainNode;
  voices: Voice[];
  sources: AudioScheduledSourceNode[];
  filters: BiquadFilterNode[];
}

const TAU = Math.PI * 2;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const extendedWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? extendedWindow.webkitAudioContext ?? null;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function selectScale(temperament: string): readonly number[] {
  if (temperament.includes("Abyssal") || temperament.includes("深淵")) {
    return [0, 3, 5, 7, 10];
  }
  if (temperament.includes("Radiant") || temperament.includes("燦然")) {
    return [0, 2, 4, 7, 9];
  }
  if (temperament.includes("Mysterious") || temperament.includes("幽玄")) {
    return [0, 1, 5, 7, 8];
  }
  return [0, 2, 5, 7, 9];
}

function stopSource(source: AudioScheduledSourceNode, when: number): void {
  try {
    source.stop(when);
  } catch {
    // A source may already have ended; stopping sound must remain idempotent.
  }
}

function holdParameter(parameter: AudioParam, when: number): void {
  if (typeof parameter.cancelAndHoldAtTime === "function") {
    parameter.cancelAndHoldAtTime(when);
    return;
  }
  const currentValue = parameter.value;
  parameter.cancelScheduledValues(when);
  parameter.setValueAtTime(currentValue, when);
}

/**
 * A quiet, deterministic Web Audio sound garden.
 *
 * `start`/`toggle` should be called directly from a click or key event so that
 * browsers are allowed to resume the AudioContext. No microphone samples or
 * other data leave the device.
 */
export class SonicGarden {
  private context: AudioContext | null = null;
  private graph: GardenGraph | null = null;
  private active = false;
  private disposed = false;
  private audioOperation = 0;
  private pendingAudioStart: Promise<boolean> | null = null;
  private pendingAudioSeed: number | null = null;
  private energy = 0.42;
  private evolution = 0;
  private currentTraits: LifeTraits | null = null;
  private pendingCloseTimers = new Map<number, AudioContext>();

  private microphoneContext: AudioContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private microphoneAnalyser: AnalyserNode | null = null;
  private microphoneSamples: Float32Array<ArrayBuffer> | null = null;
  private microphoneOperation = 0;
  private pendingMicrophoneStart: Promise<boolean> | null = null;

  get supported(): boolean {
    return audioContextConstructor() !== null;
  }

  get enabled(): boolean {
    return this.active;
  }

  async start(traits: LifeTraits): Promise<boolean> {
    const Context = audioContextConstructor();
    if (!Context || this.disposed) return false;

    if (this.active && this.currentTraits?.seed === traits.seed) {
      try {
        if (this.context?.state === "suspended") await this.context.resume();
        return true;
      } catch {
        return false;
      }
    }

    if (this.pendingAudioStart && this.pendingAudioSeed === traits.seed) {
      return this.pendingAudioStart;
    }

    const operation = ++this.audioOperation;
    this.pendingAudioStart = null;
    this.pendingAudioSeed = null;
    if (this.context) this.releaseCurrentContext(0.08);

    const pending = this.openAudio(Context, traits, operation);
    this.pendingAudioStart = pending;
    this.pendingAudioSeed = traits.seed;
    try {
      return await pending;
    } finally {
      if (this.pendingAudioStart === pending) {
        this.pendingAudioStart = null;
        this.pendingAudioSeed = null;
      }
    }
  }

  stop(): void {
    this.audioOperation += 1;
    this.pendingAudioStart = null;
    this.pendingAudioSeed = null;
    if (!this.context) {
      this.active = false;
      return;
    }
    this.releaseCurrentContext(0.32);
  }

  async toggle(traits: LifeTraits): Promise<boolean> {
    if (this.active || this.pendingAudioStart) {
      this.stop();
      return false;
    }
    return this.start(traits);
  }

  setEnergy(level: number): void {
    this.energy = clamp(level);
    if (!this.context || !this.graph || !this.active) return;

    const now = this.context.currentTime;
    holdParameter(this.graph.master.gain, now);
    this.graph.master.gain.setTargetAtTime(this.targetVolume(), now, 0.16);

    const brightness = 750 + this.energy * 2_100 + this.evolution * 700;
    for (const filter of this.graph.filters) {
      holdParameter(filter.frequency, now);
      filter.frequency.setTargetAtTime(brightness, now, 0.3);
    }
  }

  setEvolution(value: number): void {
    this.evolution = clamp(value);
    if (this.context && this.graph && this.active) {
      this.applyEvolution(this.context.currentTime, 0.55);
    }
  }

  async startMicrophone(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.microphoneStream) return true;
    if (this.pendingMicrophoneStart) return this.pendingMicrophoneStart;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    const Context = audioContextConstructor();
    if (!Context) return false;

    const operation = ++this.microphoneOperation;
    const pending = this.openMicrophone(Context, operation);
    this.pendingMicrophoneStart = pending;
    try {
      return await pending;
    } finally {
      if (this.pendingMicrophoneStart === pending) this.pendingMicrophoneStart = null;
    }
  }

  stopMicrophone(): void {
    this.microphoneOperation += 1;
    this.pendingMicrophoneStart = null;
    this.microphoneSource?.disconnect();
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    if (this.microphoneContext && this.microphoneContext.state !== "closed") {
      void this.microphoneContext.close().catch(() => undefined);
    }
    this.microphoneContext = null;
    this.microphoneStream = null;
    this.microphoneSource = null;
    this.microphoneAnalyser = null;
    this.microphoneSamples = null;
  }

  private async openMicrophone(
    Context: AudioContextConstructor,
    operation: number,
  ): Promise<boolean> {

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      // The stream is connected only to an analyser, never to destination.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (this.disposed || operation !== this.microphoneOperation) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      context = new Context({ latencyHint: "interactive" });
      await context.resume();
      if (this.disposed || operation !== this.microphoneOperation) {
        stream.getTracks().forEach((track) => track.stop());
        if (context.state !== "closed") await context.close().catch(() => undefined);
        return false;
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

      this.microphoneStream = stream;
      this.microphoneContext = context;
      this.microphoneSource = source;
      this.microphoneAnalyser = analyser;
      this.microphoneSamples = new Float32Array(analyser.fftSize);
      return true;
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
      return false;
    }
  }

  sampleMicrophone(): number {
    const analyser = this.microphoneAnalyser;
    const samples = this.microphoneSamples;
    if (!analyser || !samples) return 0;

    analyser.getFloatTimeDomainData(samples);
    let sumOfSquares = 0;
    for (const sample of samples) sumOfSquares += sample * sample;
    const rms = Math.sqrt(sumOfSquares / samples.length);
    // A soft noise gate keeps a quiet room still; ordinary speech reaches ~1.
    return clamp((rms - 0.012) * 8.5);
  }

  dispose(): void {
    this.disposed = true;
    this.stopMicrophone();
    this.stop();

    for (const [timer, context] of this.pendingCloseTimers) {
      window.clearTimeout(timer);
      if (context.state !== "closed") void context.close().catch(() => undefined);
    }
    this.pendingCloseTimers.clear();
    this.active = false;
    this.currentTraits = null;
  }

  private async openAudio(
    Context: AudioContextConstructor,
    traits: LifeTraits,
    operation: number,
  ): Promise<boolean> {
    let context: AudioContext | null = null;
    let graph: GardenGraph | null = null;
    try {
      context = new Context({ latencyHint: "playback" });
      graph = this.buildGraph(context, traits);
      await context.resume();

      if (this.disposed || operation !== this.audioOperation) {
        this.closeDetachedGraph(context, graph);
        return false;
      }

      this.context = context;
      this.graph = graph;
      this.currentTraits = traits;
      const now = context.currentTime;
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setValueAtTime(0.0001, now);
      graph.master.gain.exponentialRampToValueAtTime(this.targetVolume(), now + 1.25);
      this.active = true;
      this.applyEvolution(now, 1.2);
      return true;
    } catch {
      if (context) this.closeDetachedGraph(context, graph);
      if (operation === this.audioOperation) this.active = false;
      return false;
    }
  }

  private closeDetachedGraph(context: AudioContext, graph: GardenGraph | null): void {
    const now = context.currentTime;
    graph?.sources.forEach((source) => stopSource(source, now));
    if (context.state !== "closed") void context.close().catch(() => undefined);
  }

  private targetVolume(): number {
    // Deliberately conservative; the compressor adds a second safety boundary.
    return 0.025 + this.energy * 0.075;
  }

  private buildGraph(context: AudioContext, traits: LifeTraits): GardenGraph {
    const random = seededRandom(traits.seed ^ 0xa511e9b3);
    const now = context.currentTime;
    const input = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const delay = context.createDelay(2.5);
    const feedback = context.createGain();
    const delayReturn = context.createGain();
    const filters: BiquadFilterNode[] = [];
    const voices: Voice[] = [];
    const sources: AudioScheduledSourceNode[] = [];

    input.gain.value = 0.82;
    master.gain.value = 0.0001;
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.7;
    delay.delayTime.value = 0.32 + (traits.symmetry % 5) * 0.055;
    feedback.gain.value = 0.18;
    delayReturn.gain.value = 0.17;

    input.connect(master);
    input.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayReturn);
    delayReturn.connect(master);
    master.connect(compressor);
    compressor.connect(context.destination);

    const scale = selectScale(traits.temperament);
    const rootFrequency = 48 + (traits.seed % 28);
    const voiceCount = 3 + (traits.symmetry % 2);

    for (let index = 0; index < voiceCount; index += 1) {
      const degree = scale[(index * 2 + traits.particleVariant) % scale.length] ?? 0;
      const octave = index === voiceCount - 1 ? 1 : 0;
      const baseFrequency = rootFrequency * 2 ** ((degree + octave * 12) / 12);
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const amplitudeLfo = context.createOscillator();
      const amplitudeDepth = context.createGain();
      const pitchLfo = context.createOscillator();
      const pitchDepth = context.createGain();
      const amplitude = 0.025 + random() * 0.015;

      oscillator.type = index % 3 === 0 ? "sine" : "triangle";
      oscillator.frequency.value = baseFrequency;
      oscillator.detune.value = (random() - 0.5) * 7;
      filter.type = "lowpass";
      filter.frequency.value = 900 + this.energy * 1_700;
      filter.Q.value = 0.7 + random() * 1.6;
      gain.gain.value = amplitude;

      amplitudeLfo.type = "sine";
      amplitudeLfo.frequency.value =
        0.025 + random() * 0.045 + traits.tempo / 60_000;
      amplitudeLfo.detune.value = random() * 45;
      amplitudeDepth.gain.value = amplitude * 0.72;
      pitchLfo.frequency.value = 0.014 + random() * 0.024;
      pitchDepth.gain.value = 1.4 + random() * 3.2;

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(input);
      amplitudeLfo.connect(amplitudeDepth);
      amplitudeDepth.connect(gain.gain);
      pitchLfo.connect(pitchDepth);
      pitchDepth.connect(oscillator.detune);

      oscillator.start(now);
      amplitudeLfo.start(now + random() * 0.2);
      pitchLfo.start(now + random() * 0.2);
      voices.push({ oscillator, filter, gain, baseFrequency });
      filters.push(filter);
      sources.push(oscillator, amplitudeLfo, pitchLfo);
    }

    this.addBreathLayer(context, input, traits, random, sources, filters);
    return { input, master, voices, sources, filters };
  }

  private addBreathLayer(
    context: AudioContext,
    destination: AudioNode,
    traits: LifeTraits,
    random: () => number,
    sources: AudioScheduledSourceNode[],
    filters: BiquadFilterNode[],
  ): void {
    const duration = 2.5;
    const frameCount = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = random() * 2 - 1;
      previous = previous * 0.96 + white * 0.04;
      const breath = Math.sin((index / frameCount) * TAU * (2 + traits.particleVariant));
      channel[index] = previous * (0.62 + breath * 0.18);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 540 + (traits.seed % 580);
    filter.Q.value = 0.55;
    gain.gain.value = 0.009;
    lfo.frequency.value = 0.035 + (traits.tempo % 24) / 1_200;
    lfoDepth.gain.value = 0.006;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    source.start();
    lfo.start();
    filters.push(filter);
    sources.push(source, lfo);
  }

  private applyEvolution(now: number, transition: number): void {
    const graph = this.graph;
    const traits = this.currentTraits;
    if (!graph || !traits) return;

    const scale = selectScale(traits.temperament);
    for (let index = 0; index < graph.voices.length; index += 1) {
      const voice = graph.voices[index];
      if (!voice) continue;
      const degreeIndex = Math.floor(this.evolution * (scale.length - 1));
      const interval = scale[(degreeIndex + index) % scale.length] ?? 0;
      const destination = voice.baseFrequency * 2 ** (interval / 24);
      holdParameter(voice.oscillator.frequency, now);
      voice.oscillator.frequency.linearRampToValueAtTime(destination, now + transition);
      holdParameter(voice.filter.frequency, now);
      voice.filter.frequency.linearRampToValueAtTime(
        800 + this.energy * 1_900 + this.evolution * 900,
        now + transition,
      );
    }
  }

  private releaseCurrentContext(fadeDuration: number): void {
    const context = this.context;
    const graph = this.graph;
    this.context = null;
    this.graph = null;
    this.currentTraits = null;
    this.active = false;
    if (!context || context.state === "closed") return;

    const now = context.currentTime;
    const end = now + fadeDuration;
    if (graph) {
      holdParameter(graph.master.gain, now);
      graph.master.gain.exponentialRampToValueAtTime(0.0001, end);
      for (const source of graph.sources) stopSource(source, end + 0.025);
    }

    const timer = window.setTimeout(() => {
      this.pendingCloseTimers.delete(timer);
      if (context.state !== "closed") void context.close().catch(() => undefined);
    }, Math.ceil((fadeDuration + 0.08) * 1_000));
    this.pendingCloseTimers.set(timer, context);
  }
}

export default SonicGarden;
