import { SonicGarden } from "../audio/sonic-garden";
import {
  createLifeTraits,
  decodeShareState,
  encodeShareState,
  type AppLanguage,
  type LifeTraits,
} from "../core/generation";
import { OrganismScene } from "../scene/organism";

type BirthStage = "signal" | "seed" | "life";

interface ExperienceState {
  active: boolean;
  word: string;
  mutation: number;
  language: AppLanguage;
  evolution: number;
  pulseCount: number;
  micEnabled: boolean;
  audioEnabled: boolean;
  birthStage: BirthStage;
}

interface Copy {
  brandSub: string;
  eyebrow: string;
  titleA: string;
  titleB: string;
  intro: string;
  inputLabel: string;
  inputPlaceholder: string;
  create: string;
  suggestions: string;
  privacy: string;
  specimen: string;
  palette: string;
  symmetry: string;
  pulse: string;
  evolution: string;
  signal: string;
  seed: string;
  life: string;
  signalDescription: string;
  seedDescription: string;
  lifeDescription: string;
  resonate: string;
  sound: string;
  voice: string;
  mutate: string;
  save: string;
  share: string;
  fullscreen: string;
  another: string;
  about: string;
  close: string;
  aboutLead: string;
  aboutBody: string;
  aboutPrivacy: string;
  controls: string;
  born: string;
  shared: string;
  copied: string;
  saved: string;
  audioUnavailable: string;
  micDenied: string;
  micOn: string;
  micOff: string;
  webglFallback: string;
  saveUnavailable: string;
  fullscreenUnavailable: string;
}

const COPY: Record<AppLanguage, Copy> = {
  ja: {
    brandSub: "ことばの生命体",
    eyebrow: "LIVING WORD / 生きていることば",
    titleA: "ことばをひとつ。",
    titleB: "宇宙に、生命をひとつ。",
    intro:
      "あなたの一語を、色・形・鼓動・音を持つ一体だけの生命へ。すべてはこの端末の中で生まれます。",
    inputLabel: "生命にしたいことば",
    inputPlaceholder: "ことばを入力",
    create: "生む",
    suggestions: "たとえば",
    privacy: "入力・音声は保存も送信もしません",
    specimen: "LIVE SPECIMEN / 観察標本",
    palette: "色彩",
    symmetry: "対称性",
    pulse: "共鳴",
    evolution: "進化段階",
    signal: "SIGNAL / 言葉",
    seed: "SEED / 種",
    life: "LIFE / 生命",
    signalDescription: "文字が光の座標として浮かぶ",
    seedDescription: "意味が折り畳まれ、ひとつの核になる",
    lifeDescription: "固有の形と鼓動を持ち、呼吸を始める",
    resonate: "共鳴",
    sound: "音",
    voice: "声",
    mutate: "変異",
    save: "保存",
    share: "共有",
    fullscreen: "全画面",
    another: "別のことばを生む",
    about: "この作品について",
    close: "閉じる",
    aboutLead: "ことばは、読まれる前にも形を持っている。",
    aboutBody:
      "KOTODAMAは、入力した文字列を決定論的な種へ変換し、星座、種、生命体の三段階を行き来できるブラウザ作品です。同じことばと変異番号からは、いつでも同じ生命が生まれます。",
    aboutPrivacy:
      "サーバーなし、アップロードなし、追跡なし。マイクを許可した場合も音声は端末内で音量だけに変換され、録音・保存・送信されません。",
    controls: "ドラッグ: 視点 / タップ・Space: 共鳴 / M: 音 / V: 声 / F: 全画面",
    born: "が生まれました",
    shared: "共有画面を開きました",
    copied: "共有URLをコピーしました",
    saved: "生命体をPNGで保存しました",
    audioUnavailable: "このブラウザでは音を開始できませんでした",
    micDenied: "マイクを開始できませんでした。許可設定を確認してください",
    micOn: "声への反応を始めました",
    micOff: "声への反応を止めました",
    webglFallback: "3D表示に対応していないため、簡易表示で体験しています",
    saveUnavailable: "簡易表示では画像保存を利用できません",
    fullscreenUnavailable: "全画面表示を開始できませんでした",
  },
  en: {
    brandSub: "a living word",
    eyebrow: "LIVING WORD / ONE OF ONE",
    titleA: "Give us one word.",
    titleB: "Give the universe one life.",
    intro:
      "Turn a word into a singular being with its own color, body, pulse and sound. Everything is born on this device.",
    inputLabel: "A word to bring to life",
    inputPlaceholder: "Type a word",
    create: "Birth",
    suggestions: "Try",
    privacy: "Your text and voice never leave this device",
    specimen: "LIVE SPECIMEN / FIELD NOTE",
    palette: "Color",
    symmetry: "Symmetry",
    pulse: "Echoes",
    evolution: "Evolution",
    signal: "SIGNAL / WORD",
    seed: "SEED / CORE",
    life: "LIFE / BEING",
    signalDescription: "Letters surface as coordinates of light",
    seedDescription: "Meaning folds inward and becomes a core",
    lifeDescription: "A singular body awakens and begins to breathe",
    resonate: "Echo",
    sound: "Sound",
    voice: "Voice",
    mutate: "Mutate",
    save: "Save",
    share: "Share",
    fullscreen: "Expand",
    another: "Birth another word",
    about: "About this work",
    close: "Close",
    aboutLead: "A word has a shape before it is ever read.",
    aboutBody:
      "KOTODAMA turns text into a deterministic seed, then lets you travel between three states: constellation, seed and living form. The same word and mutation always summon the same being.",
    aboutPrivacy:
      "No server, uploads or tracking. If you allow the microphone, audio is reduced to a volume signal on your device. It is never recorded, stored or sent.",
    controls: "Drag: orbit / Tap or Space: echo / M: sound / V: voice / F: fullscreen",
    born: "has been born",
    shared: "Opened the share sheet",
    copied: "Share URL copied",
    saved: "Specimen saved as PNG",
    audioUnavailable: "Sound could not start in this browser",
    micDenied: "Microphone could not start. Please check its permission",
    micOn: "The specimen is now listening",
    micOff: "Voice response stopped",
    webglFallback: "3D is unavailable, so a simplified specimen is shown",
    saveUnavailable: "Image export is unavailable in the simplified view",
    fullscreenUnavailable: "Fullscreen could not be opened",
  },
};

const DEFAULT_WORD = "ひかり";
const SUGGESTIONS: Record<AppLanguage, readonly string[]> = {
  ja: ["好奇心", "未完成", "また明日"],
  en: ["wonder", "becoming", "tomorrow"],
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const smoothstep = (value: number): number => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function icon(name: "spark" | "sound" | "voice" | "mutate" | "save" | "share" | "expand"): string {
  const paths = {
    spark: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z"/>',
    sound: '<path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16 9c1.2 1.4 1.2 4.6 0 6M19 6c3 3.2 3 8.8 0 12"/>',
    voice: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    mutate: '<path d="M4 7h4c5 0 3 10 8 10h4M17 4l3 3-3 3M4 17h4c1.8 0 2.7-1.3 3.4-3M17 14l3 3-3 3"/>',
    save: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  } as const;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function button(action: string, iconName: Parameters<typeof icon>[0], copyKey: keyof Copy): string {
  const pressedState = action === "audio" || action === "mic" ? ' aria-pressed="false"' : "";
  return `<button class="tool-button" type="button" data-action="${action}" data-label="${copyKey}"${pressedState}>${icon(iconName)}<span data-copy="${copyKey}"></span></button>`;
}

export class KotodamaApp {
  private readonly host: HTMLElement;
  private readonly shell: HTMLElement;
  private readonly sceneHost: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly suggestions: HTMLElement;
  private readonly birthWord: HTMLElement;
  private readonly birthStageLabel: HTMLElement;
  private readonly phaseName: HTMLElement;
  private readonly phaseDescription: HTMLElement;
  private readonly evolutionInput: HTMLInputElement;
  private readonly evolutionOutput: HTMLOutputElement;
  private readonly specimenWord: HTMLElement;
  private readonly specimenCode: HTMLElement;
  private readonly specimenPalette: HTMLElement;
  private readonly specimenSymmetry: HTMLElement;
  private readonly specimenPulse: HTMLElement;
  private readonly toastElement: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private readonly aboutDialog: HTMLDialogElement;
  private readonly audioButton: HTMLButtonElement;
  private readonly micButton: HTMLButtonElement;
  private readonly fallbackOrb: HTMLElement;

  private readonly audio = new SonicGarden();
  private scene: OrganismScene | null = null;
  private traits: LifeTraits;
  private state: ExperienceState;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastFrame = performance.now();
  private frameRequest = 0;
  private birthElapsed = 0;
  private birthDuration = 5.6;
  private autoEvolving = false;
  private toastTimer = 0;
  private energy = 0.12;
  private lastAudioEnergy = -1;
  private microphonePending = false;
  private viewportCorrectionX = 0;
  private viewportCorrectionY = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    const shared = decodeShareState(window.location.hash || window.location.search);
    const initialLanguage = shared?.language ?? this.detectLanguage();
    const initialWord = shared?.word ?? DEFAULT_WORD;
    const initialMutation = shared?.mutation ?? 0;

    this.state = {
      active: shared !== null,
      word: initialWord,
      mutation: initialMutation,
      language: initialLanguage,
      evolution: shared ? 1 : 0.62,
      pulseCount: 0,
      micEnabled: false,
      audioEnabled: false,
      birthStage: shared ? "life" : "seed",
    };
    this.traits = createLifeTraits(initialWord, initialMutation);

    this.host.innerHTML = this.markup();
    this.shell = this.requireElement<HTMLElement>(".experience");
    this.sceneHost = this.requireElement<HTMLElement>("#scene-host");
    this.form = this.requireElement<HTMLFormElement>("#word-form");
    this.input = this.requireElement<HTMLInputElement>("#word-input");
    this.count = this.requireElement<HTMLElement>("#word-count");
    this.suggestions = this.requireElement<HTMLElement>("#suggestions");
    this.birthWord = this.requireElement<HTMLElement>("#birth-word");
    this.birthStageLabel = this.requireElement<HTMLElement>("#birth-stage");
    this.phaseName = this.requireElement<HTMLElement>("#phase-name");
    this.phaseDescription = this.requireElement<HTMLElement>("#phase-description");
    this.evolutionInput = this.requireElement<HTMLInputElement>("#evolution-input");
    this.evolutionOutput = this.requireElement<HTMLOutputElement>("#evolution-output");
    this.specimenWord = this.requireElement<HTMLElement>("#specimen-word");
    this.specimenCode = this.requireElement<HTMLElement>("#specimen-code");
    this.specimenPalette = this.requireElement<HTMLElement>("#specimen-palette");
    this.specimenSymmetry = this.requireElement<HTMLElement>("#specimen-symmetry");
    this.specimenPulse = this.requireElement<HTMLElement>("#specimen-pulse");
    this.toastElement = this.requireElement<HTMLElement>("#toast");
    this.liveRegion = this.requireElement<HTMLElement>("#live-region");
    this.aboutDialog = this.requireElement<HTMLDialogElement>("#about-dialog");
    this.audioButton = this.requireElement<HTMLButtonElement>('[data-action="audio"]');
    this.micButton = this.requireElement<HTMLButtonElement>('[data-action="mic"]');
    this.fallbackOrb = this.requireElement<HTMLElement>("#fallback-orb");

    this.input.value = shared ? shared.word : "";
    this.createScene();
    this.bindEvents();
    this.applyLanguage();
    this.updateSpecimen();
    this.setEvolution(this.state.evolution, false);
    this.shell.classList.toggle("is-active", this.state.active);

    if (shared) {
      this.birthWord.textContent = shared.word;
    }

    this.frameRequest = window.requestAnimationFrame((time) => this.frame(time));
    this.installTestHooks();
  }

  dispose(): void {
    window.cancelAnimationFrame(this.frameRequest);
    window.clearTimeout(this.toastTimer);
    this.scene?.dispose();
    this.audio.dispose();
  }

  advanceTime(milliseconds: number): void {
    const steps = Math.max(1, Math.ceil(Math.max(0, milliseconds) / (1000 / 60)));
    const dt = Math.min(1 / 30, Math.max(1 / 240, milliseconds / 1000 / steps));
    for (let index = 0; index < steps; index += 1) this.update(dt);
  }

  renderState(): string {
    return JSON.stringify({
      coordinateSystem: "3D world centered on the specimen; pointer drag orbits the camera; evolution is 0..1",
      mode: this.state.active ? (this.autoEvolving ? "birth" : "observe") : "intro",
      word: this.state.word,
      mutation: this.state.mutation,
      specimen: this.traits,
      evolution: Number(this.state.evolution.toFixed(3)),
      stage: this.state.birthStage,
      pulseCount: this.state.pulseCount,
      audioEnabled: this.state.audioEnabled,
      microphoneEnabled: this.state.micEnabled,
      visual: this.scene?.getState() ?? { fallback: true },
    });
  }

  private markup(): string {
    return `
      <main class="experience" data-language="${this.state.language}">
        <div id="scene-host" class="scene-host" aria-label="Interactive 3D specimen"></div>
        <div id="fallback-orb" class="fallback-orb" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="paper-light" aria-hidden="true"></div>
        <div class="paper-grain" aria-hidden="true"></div>

        <header class="site-header">
          <a class="brand" href="./" aria-label="KOTODAMA home">
            <span class="brand-mark">K</span>
            <span class="brand-name">KOTODAMA</span>
            <span class="brand-sub" data-copy="brandSub"></span>
          </a>
          <div class="header-actions">
            <button class="text-button" type="button" data-action="language" aria-label="Switch language"><span class="language-current">JA</span><span class="slash">/</span><span class="language-other">EN</span></button>
            <button class="text-button" type="button" data-action="about" data-copy="about"></button>
          </div>
        </header>

        <section class="intro-panel" aria-labelledby="intro-title">
          <p class="eyebrow" data-copy="eyebrow"></p>
          <h1 id="intro-title"><span data-copy="titleA"></span><span class="title-accent" data-copy="titleB"></span></h1>
          <p class="intro-copy" data-copy="intro"></p>
          <form id="word-form" class="word-form">
            <label for="word-input" data-copy="inputLabel"></label>
            <div class="input-row">
              <input id="word-input" name="word" type="text" maxlength="32" autocomplete="off" spellcheck="false" data-placeholder="inputPlaceholder" />
              <span id="word-count" class="word-count">0 / 16</span>
              <button class="birth-button" type="submit"><span data-copy="create"></span>${icon("spark")}</button>
            </div>
          </form>
          <div class="suggestion-row"><span data-copy="suggestions"></span><div id="suggestions"></div></div>
          <p class="privacy-note"><span class="privacy-dot"></span><span data-copy="privacy"></span></p>
        </section>

        <section class="birth-overlay" aria-hidden="true">
          <p id="birth-stage" class="birth-stage"></p>
          <div id="birth-word" class="birth-word"></div>
          <div class="birth-line"><span></span></div>
        </section>

        <aside class="phase-marker" aria-live="polite">
          <span class="phase-index">0<span id="phase-index">1</span></span>
          <div><strong id="phase-name"></strong><p id="phase-description"></p></div>
        </aside>

        <aside class="specimen-sheet" aria-label="Specimen information">
          <div class="sheet-head"><span data-copy="specimen"></span><span id="specimen-code"></span></div>
          <div class="specimen-identity">
            <h2 id="specimen-word"></h2>
            <span class="live-badge"><i></i>LIVE</span>
          </div>
          <dl class="trait-grid">
            <div><dt data-copy="palette"></dt><dd id="specimen-palette"></dd></div>
            <div><dt data-copy="symmetry"></dt><dd id="specimen-symmetry"></dd></div>
            <div><dt data-copy="pulse"></dt><dd id="specimen-pulse">0</dd></div>
          </dl>

          <div class="evolution-control">
            <div class="evolution-head"><label for="evolution-input" data-copy="evolution"></label><output id="evolution-output">100%</output></div>
            <input id="evolution-input" type="range" min="0" max="100" value="100" step="1" />
            <div class="evolution-labels"><span>SIGNAL</span><span>SEED</span><span>LIFE</span></div>
          </div>

          <div class="tool-grid">
            ${button("pulse", "spark", "resonate")}
            ${button("audio", "sound", "sound")}
            ${button("mic", "voice", "voice")}
            ${button("mutate", "mutate", "mutate")}
            ${button("save", "save", "save")}
            ${button("share", "share", "share")}
            ${button("fullscreen", "expand", "fullscreen")}
          </div>
          <button class="another-button" type="button" data-action="reset"><span data-copy="another"></span><span aria-hidden="true">↗</span></button>
        </aside>

        <div id="toast" class="toast" role="status"></div>
        <div id="live-region" class="sr-only" aria-live="assertive"></div>

        <dialog id="about-dialog" class="about-dialog" aria-labelledby="about-title">
          <form method="dialog" class="dialog-close-row"><button type="submit" class="dialog-close" data-copy="close"></button></form>
          <p class="eyebrow">KOTODAMA / 2026</p>
          <h2 id="about-title" data-copy="aboutLead"></h2>
          <p data-copy="aboutBody"></p>
          <p class="dialog-privacy" data-copy="aboutPrivacy"></p>
          <p class="dialog-controls" data-copy="controls"></p>
        </dialog>
      </main>`;
  }

  private createScene(): void {
    try {
      this.scene = new OrganismScene(this.sceneHost, {
        reducedMotion: this.reducedMotion,
        onPulse: () => this.registerPulse(),
      });
      this.scene.generate(this.state.word, this.traits);
    } catch (error) {
      console.warn("KOTODAMA 3D renderer unavailable", error);
      this.shell.classList.add("has-fallback");
      this.updateFallback();
      window.setTimeout(() => this.showToast(COPY[this.state.language].webglFallback), 500);
    }
  }

  private bindEvents(): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.birth(this.input.value, 0);
    });

    this.input.addEventListener("input", () => {
      const points = Array.from(this.input.value);
      if (points.length > 16) this.input.value = points.slice(0, 16).join("");
      this.updateCount();
    });

    this.suggestions.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-word]");
      if (!button) return;
      this.input.value = button.dataset.word ?? "";
      this.updateCount();
    });

    this.evolutionInput.addEventListener("input", () => {
      this.autoEvolving = false;
      this.shell.classList.remove("is-birthing");
      this.setEvolution(Number(this.evolutionInput.value) / 100);
    });

    this.shell.addEventListener("click", (event) => {
      const control = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!control) return;
      const action = control.dataset.action;
      if (action === "language") this.toggleLanguage();
      else if (action === "about") this.aboutDialog.showModal();
      else if (action === "pulse") {
        if (this.scene) this.scene.pulse();
        else this.registerPulse();
      }
      else if (action === "audio") void this.toggleAudio();
      else if (action === "mic") void this.toggleMicrophone();
      else if (action === "mutate") this.birth(this.state.word, this.state.mutation + 1);
      else if (action === "save") void this.saveImage();
      else if (action === "share") void this.share();
      else if (action === "fullscreen") void this.toggleFullscreen();
      else if (action === "reset") this.reset();
    });

    window.addEventListener("keydown", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, input, textarea, select, a, [contenteditable='true']") || this.aboutDialog.open) return;
      if (event.defaultPrevented) return;
      if (event.code === "Space" && this.state.active) {
        event.preventDefault();
        this.scene?.pulse();
      } else if (event.key.toLowerCase() === "m") void this.toggleAudio();
      else if (event.key.toLowerCase() === "v") void this.toggleMicrophone();
      else if (event.key.toLowerCase() === "f") void this.toggleFullscreen();
      else if (event.key === "?") this.aboutDialog.showModal();
    });

    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
      this.reducedMotion = event.matches;
      this.birthDuration = this.reducedMotion ? 0.6 : 5.6;
      this.scene?.setReducedMotion(event.matches);
    });

    window.addEventListener("beforeunload", () => this.dispose(), { once: true });
  }

  private birth(rawWord: string, mutation: number): void {
    const word = Array.from(rawWord.trim()).slice(0, 16).join("");
    if (!word) {
      this.input.focus();
      this.input.classList.add("is-invalid");
      window.setTimeout(() => this.input.classList.remove("is-invalid"), 500);
      return;
    }

    this.state.word = word;
    this.stabilizeViewport();
    this.state.mutation = mutation;
    this.state.active = true;
    this.state.pulseCount = 0;
    this.traits = createLifeTraits(word, mutation);
    this.scene?.generate(word, this.traits);
    this.updateFallback();
    this.birthWord.textContent = word;
    this.shell.classList.add("is-active", "is-birthing");
    this.birthElapsed = 0;
    this.birthDuration = this.reducedMotion ? 0.6 : 5.6;
    this.autoEvolving = true;
    this.setEvolution(0);
    this.updateSpecimen();
    this.updateUrl();

    if (this.audio.enabled) {
      void this.audio.start(this.traits).then((enabled) => {
        this.state.audioEnabled = enabled;
        this.updateToggleButtons();
      });
    }
  }

  private reset(): void {
    this.stabilizeViewport();
    this.autoEvolving = false;
    this.state.active = false;
    this.state.word = DEFAULT_WORD;
    this.state.mutation = 0;
    this.state.pulseCount = 0;
    this.traits = createLifeTraits(DEFAULT_WORD, 0);
    this.scene?.generate(DEFAULT_WORD, this.traits);
    this.setEvolution(0.62, false);
    this.input.value = "";
    this.updateCount();
    this.shell.classList.remove("is-active", "is-birthing");
    this.audio.stopMicrophone();
    this.audio.stop();
    this.state.micEnabled = false;
    this.state.audioEnabled = false;
    this.updateToggleButtons();
    window.history.replaceState({}, "", window.location.pathname);
    if (window.innerWidth >= 861 && !window.matchMedia("(pointer: coarse)").matches) {
      window.setTimeout(() => this.input.focus({ preventScroll: true }), 350);
    }
  }

  private setEvolution(value: number, announce = true): void {
    const evolution = clamp(value);
    this.state.evolution = evolution;
    this.scene?.setEvolution(evolution);
    this.audio.setEvolution(evolution);
    this.evolutionInput.value = String(Math.round(evolution * 100));
    this.evolutionOutput.value = `${Math.round(evolution * 100)}%`;
    this.evolutionInput.style.setProperty("--progress", `${evolution * 100}%`);

    const stage: BirthStage = evolution < 0.34 ? "signal" : evolution < 0.68 ? "seed" : "life";
    if (stage !== this.state.birthStage || !this.phaseName.textContent) {
      this.state.birthStage = stage;
      this.updatePhase(announce);
    }
  }

  private updatePhase(announce: boolean): void {
    const copy = COPY[this.state.language];
    const stage = this.state.birthStage;
    const stageIndex = stage === "signal" ? "1" : stage === "seed" ? "2" : "3";
    const name = copy[stage];
    const description = copy[`${stage}Description` as const];
    this.phaseName.textContent = name;
    this.phaseDescription.textContent = description;
    this.birthStageLabel.textContent = `${stageIndex} / 3 — ${name}`;
    this.requireElement<HTMLElement>("#phase-index").textContent = stageIndex;
    this.shell.dataset.stage = stage;
    if (announce && this.state.active) this.liveRegion.textContent = `${name}. ${description}`;
  }

  private updateSpecimen(): void {
    this.specimenWord.textContent = this.state.word;
    this.specimenCode.textContent = this.traits.code;
    this.specimenPalette.textContent = this.traits.paletteName;
    this.specimenSymmetry.textContent = `${this.traits.symmetry}× / ${this.traits.temperament}`;
    this.specimenPulse.textContent = String(this.state.pulseCount).padStart(2, "0");
    this.shell.style.setProperty("--life-a", this.traits.colors[0]);
    this.shell.style.setProperty("--life-b", this.traits.colors[1]);
    this.shell.style.setProperty("--life-c", this.traits.colors[2]);
  }

  private updateFallback(): void {
    this.fallbackOrb.style.setProperty("--fallback-a", this.traits.colors[0]);
    this.fallbackOrb.style.setProperty("--fallback-b", this.traits.colors[1]);
    this.fallbackOrb.style.setProperty("--fallback-c", this.traits.colors[2]);
    this.fallbackOrb.style.setProperty("--symmetry", String(this.traits.symmetry));
  }

  private registerPulse(): void {
    if (!this.state.active) return;
    this.state.pulseCount += 1;
    this.specimenPulse.textContent = String(this.state.pulseCount).padStart(2, "0");
    this.energy = 1;
    this.audio.setEnergy(1);
    this.shell.classList.remove("is-pulsing");
    void this.shell.offsetWidth;
    this.shell.classList.add("is-pulsing");
  }

  private async toggleAudio(): Promise<void> {
    const enabled = await this.audio.toggle(this.traits);
    this.state.audioEnabled = enabled;
    this.updateToggleButtons();
    if (!enabled && !this.audio.supported) this.showToast(COPY[this.state.language].audioUnavailable);
  }

  private async toggleMicrophone(): Promise<void> {
    if (this.microphonePending) return;
    if (this.state.micEnabled) {
      this.audio.stopMicrophone();
      this.state.micEnabled = false;
      this.showToast(COPY[this.state.language].micOff);
    } else {
      this.microphonePending = true;
      this.micButton.disabled = true;
      this.micButton.setAttribute("aria-busy", "true");
      try {
        const enabled = await this.audio.startMicrophone();
        this.state.micEnabled = enabled;
        this.showToast(COPY[this.state.language][enabled ? "micOn" : "micDenied"]);
      } finally {
        this.microphonePending = false;
        this.micButton.disabled = false;
        this.micButton.removeAttribute("aria-busy");
      }
    }
    this.updateToggleButtons();
  }

  private updateToggleButtons(): void {
    this.audioButton.setAttribute("aria-pressed", String(this.state.audioEnabled));
    this.audioButton.classList.toggle("is-on", this.state.audioEnabled);
    this.micButton.setAttribute("aria-pressed", String(this.state.micEnabled));
    this.micButton.classList.toggle("is-on", this.state.micEnabled);
  }

  private async saveImage(): Promise<void> {
    if (!this.scene) {
      this.showToast(COPY[this.state.language].saveUnavailable);
      return;
    }
    const blob = await this.scene?.captureBlob();
    if (!blob) {
      this.showToast(COPY[this.state.language].saveUnavailable);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kotodama-${this.traits.code.toLowerCase()}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    this.showToast(COPY[this.state.language].saved);
  }

  private async share(): Promise<void> {
    const query = encodeShareState(this.state.word, this.state.mutation, this.state.language);
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    const copy = COPY[this.state.language];
    try {
      if (navigator.share) {
        await navigator.share({
          title: `KOTODAMA — ${this.state.word}`,
          text: `${this.state.word} / ${this.traits.code}`,
          url,
        });
        this.showToast(copy.shared);
      } else {
        await navigator.clipboard.writeText(url);
        this.showToast(copy.copied);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        this.showToast(copy.copied);
      } catch {
        window.prompt(copy.share, url);
      }
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenEnabled) throw new Error("Fullscreen is unavailable");
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.showToast(COPY[this.state.language].fullscreenUnavailable);
    }
  }

  private toggleLanguage(): void {
    this.state.language = this.state.language === "ja" ? "en" : "ja";
    this.applyLanguage();
    if (this.state.active) this.updateUrl();
  }

  private applyLanguage(): void {
    const copy = COPY[this.state.language];
    document.documentElement.lang = this.state.language;
    this.shell.dataset.language = this.state.language;
    this.shell.querySelectorAll<HTMLElement>("[data-copy]").forEach((element) => {
      const key = element.dataset.copy as keyof Copy | undefined;
      if (key) element.textContent = copy[key];
    });
    this.shell.querySelectorAll<HTMLInputElement>("[data-placeholder]").forEach((element) => {
      const key = element.dataset.placeholder as keyof Copy | undefined;
      if (key) element.placeholder = copy[key];
    });
    this.shell.querySelectorAll<HTMLElement>("[data-label]").forEach((element) => {
      const key = element.dataset.label as keyof Copy | undefined;
      if (key) {
        element.setAttribute("aria-label", copy[key]);
        element.setAttribute("title", copy[key]);
      }
    });
    this.requireElement<HTMLElement>(".language-current").textContent = this.state.language.toUpperCase();
    this.requireElement<HTMLElement>(".language-other").textContent = this.state.language === "ja" ? "EN" : "JA";
    this.renderSuggestions();
    this.updatePhase(false);
  }

  private renderSuggestions(): void {
    this.suggestions.replaceChildren(
      ...SUGGESTIONS[this.state.language].map((word) => {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.dataset.word = word;
        buttonElement.textContent = word;
        return buttonElement;
      }),
    );
  }

  private updateCount(): void {
    this.count.textContent = `${Math.min(16, Array.from(this.input.value).length)} / 16`;
  }

  private updateUrl(): void {
    const query = encodeShareState(this.state.word, this.state.mutation, this.state.language);
    window.history.replaceState({}, "", `${window.location.pathname}${query}`);
  }

  private showToast(message: string): void {
    window.clearTimeout(this.toastTimer);
    this.toastElement.textContent = message;
    this.toastElement.classList.add("is-visible");
    this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove("is-visible"), 2_700);
  }

  private frame(time: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    this.pinExperienceToViewport();
    this.update(dt);
    this.frameRequest = window.requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  private update(dt: number): void {
    if (this.autoEvolving) {
      this.birthElapsed += dt;
      const progress = clamp(this.birthElapsed / this.birthDuration);
      let evolution = 0;
      if (progress < 0.25) evolution = smoothstep(progress / 0.25) * 0.12;
      else if (progress < 0.58) evolution = 0.12 + smoothstep((progress - 0.25) / 0.33) * 0.48;
      else evolution = 0.6 + smoothstep((progress - 0.58) / 0.42) * 0.4;
      this.setEvolution(evolution);

      if (progress >= 1) {
        this.autoEvolving = false;
        this.shell.classList.remove("is-birthing");
        this.showToast(`${this.traits.code} ${COPY[this.state.language].born}`);
      }
    }

    const micLevel = this.state.micEnabled ? this.audio.sampleMicrophone() : 0;
    const targetEnergy = Math.max(0.1, micLevel);
    this.energy += (targetEnergy - this.energy) * Math.min(1, dt * (targetEnergy > this.energy ? 12 : 2.8));
    this.scene?.setMicLevel(this.energy);
    this.scene?.update(dt);

    if (Math.abs(this.lastAudioEnergy - this.energy) > 0.035) {
      this.audio.setEnergy(this.energy);
      this.lastAudioEnergy = this.energy;
    }
  }

  private detectLanguage(): AppLanguage {
    return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
  }

  private stabilizeViewport(): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  private pinExperienceToViewport(): void {
    if (this.shell.scrollTop !== 0) this.shell.scrollTop = 0;
    if (this.shell.scrollLeft !== 0) this.shell.scrollLeft = 0;
    const bounds = this.shell.getBoundingClientRect();
    const offsetX = Math.abs(bounds.left) > 0.5 ? bounds.left : 0;
    const offsetY = Math.abs(bounds.top) > 0.5 ? bounds.top : 0;
    if (offsetX === 0 && offsetY === 0) return;
    this.viewportCorrectionX -= offsetX;
    this.viewportCorrectionY -= offsetY;
    this.shell.style.transform = `translate3d(${this.viewportCorrectionX}px, ${this.viewportCorrectionY}px, 0)`;
  }

  private requireElement<T extends Element>(selector: string): T {
    const element = this.host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing required KOTODAMA element: ${selector}`);
    return element;
  }

  private installTestHooks(): void {
    window.render_game_to_text = () => this.renderState();
    window.advanceTime = (milliseconds: number) => this.advanceTime(milliseconds);
  }
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
  }
}
