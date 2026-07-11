/**
 * Deterministic traits shared by the visual and audio renderers.
 *
 * Text is normalised and hashed as UTF-8 bytes so the same word produces the
 * same specimen in every modern browser, including words containing emoji or
 * Japanese characters.
 */

export type AppLanguage = "ja" | "en";

export interface LifeTraits {
  seed: number;
  code: string;
  paletteName: string;
  colors: [string, string, string];
  symmetry: number;
  tempo: number;
  temperament: string;
  particleVariant: number;
}

export interface ShareState {
  word: string;
  mutation: number;
  language: AppLanguage;
}

interface Palette {
  readonly name: string;
  readonly colors: readonly [string, string, string];
}

const PALETTES: readonly Palette[] = [
  {
    name: "薄明の珊瑚 / Coral Dawn",
    colors: ["#ff6b8a", "#ffb36b", "#fff0c2"],
  },
  {
    name: "月下の藤 / Lunar Wisteria",
    colors: ["#805dff", "#c58cff", "#75e6ff"],
  },
  {
    name: "深海燐光 / Abyssal Bloom",
    colors: ["#063b65", "#00c9b7", "#b6ffdf"],
  },
  {
    name: "金色星雲 / Golden Nebula",
    colors: ["#c84d17", "#d79b00", "#7a5a00"],
  },
  {
    name: "夜桜銀河 / Sakura Galaxy",
    colors: ["#38105c", "#e95aa9", "#ffd6ed"],
  },
  {
    name: "翡翠極光 / Jade Aurora",
    colors: ["#075e54", "#37e6a5", "#d0fff1"],
  },
  {
    name: "氷晶の空 / Crystal Sky",
    colors: ["#2176c7", "#78d5ff", "#e9fbff"],
  },
  {
    name: "紅玉の宵 / Ruby Dusk",
    colors: ["#6f163b", "#ef476f", "#ffc2a8"],
  },
] as const;

const TEMPERAMENTS = [
  "静謐 / Serene",
  "夢幻 / Ethereal",
  "燦然 / Radiant",
  "幽玄 / Mysterious",
  "遊星 / Nomadic",
  "鼓動 / Pulsing",
  "深淵 / Abyssal",
] as const;

const DEFAULT_WORD = "KOTODAMA";
const MAX_SHARED_WORD_POINTS = 80;
const MAX_MUTATION = 0xffff_ffff;

/** Canonical form used for generation, deliberately independent of locale. */
export function canonicalizeWord(word: string): string {
  const normalised = word.normalize("NFKC").trim();
  return normalised || DEFAULT_WORD;
}

/**
 * FNV-1a followed by a Murmur-style avalanche. Math.imul keeps all operations
 * explicitly in 32-bit integer space and therefore cross-engine stable.
 */
export function hashUtf8(value: string): number {
  const bytes = new TextEncoder().encode(value.normalize("NFC"));
  let hash = 0x811c9dc5;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Small, deterministic PRNG suited to procedural artwork (not cryptography). */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function normaliseMutation(mutation: number | undefined): number {
  if (mutation === undefined || !Number.isFinite(mutation)) return 0;
  return Math.min(MAX_MUTATION, Math.max(0, Math.trunc(mutation)));
}

function paddedBase36(value: number, length: number): string {
  return (value >>> 0).toString(36).toUpperCase().padStart(length, "0");
}

/** A short museum-style catalogue code that remains stable for the specimen. */
export function formatSpecimenCode(seed: number, mutation = 0): string {
  const seedPart = paddedBase36(seed, 7);
  const mutationPart = paddedBase36(normaliseMutation(mutation), 2).slice(-2);
  return `KT-${seedPart.slice(0, 3)}-${seedPart.slice(3)}-${mutationPart}`;
}

export function createLifeTraits(word: string, mutation = 0): LifeTraits {
  const canonicalWord = canonicalizeWord(word);
  const safeMutation = normaliseMutation(mutation);
  const seed = hashUtf8(`${canonicalWord}\u001f${safeMutation}`);
  const random = createSeededRandom(seed);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)] ?? PALETTES[0]!;
  const temperament =
    TEMPERAMENTS[Math.floor(random() * TEMPERAMENTS.length)] ?? TEMPERAMENTS[0]!;

  return {
    seed,
    code: formatSpecimenCode(seed, safeMutation),
    paletteName: palette.name,
    colors: [...palette.colors],
    symmetry: 3 + Math.floor(random() * 7),
    tempo: 52 + Math.floor(random() * 47),
    temperament,
    particleVariant: Math.floor(random() * 6),
  };
}

function safeSharedWord(word: string): string {
  return Array.from(word.normalize("NFC").trim())
    .slice(0, MAX_SHARED_WORD_POINTS)
    .join("");
}

/**
 * Returns a URL fragment ready to append to the GitHub Pages URL. Fragments
 * are never sent in the HTTP request, so a shared word does not enter hosting
 * access logs.
 */
export function encodeShareState(
  word: string,
  mutation = 0,
  language: AppLanguage = "ja",
): string {
  const params = new URLSearchParams();
  params.set("w", safeSharedWord(word) || DEFAULT_WORD);
  params.set("m", String(normaliseMutation(mutation)));
  params.set("lang", language === "en" ? "en" : "ja");
  return `#${params.toString()}`;
}

/**
 * Parses either `location.search`, a bare query string, or a complete URL.
 * Invalid/untrusted input is rejected without throwing.
 */
export function decodeShareState(search: string): ShareState | null {
  try {
    let query = search.trim();
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(query)) {
      const url = new URL(query);
      query = url.hash || url.search;
    }
    const questionMark = query.indexOf("?");
    if (questionMark >= 0) query = query.slice(questionMark + 1);
    query = query.replace(/^[?#]/, "").split("#", 1)[0] ?? "";

    const params = new URLSearchParams(query);
    const word = safeSharedWord(params.get("w") ?? params.get("word") ?? "");
    if (!word) return null;

    const rawMutation = params.get("m") ?? params.get("mutation") ?? "0";
    if (!/^\d+$/.test(rawMutation)) return null;
    const parsedMutation = Number(rawMutation);
    if (!Number.isSafeInteger(parsedMutation)) return null;

    return {
      word,
      mutation: normaliseMutation(parsedMutation),
      language: params.get("lang") === "en" ? "en" : "ja",
    };
  } catch {
    return null;
  }
}
