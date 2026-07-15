/**
 * Voice + language catalog for the DevForge AI TTS pipeline.
 *
 * The catalog is provider-aware: every voice is tagged with either
 *   - "zai"    → synthesized via the Z.ai specialty TTS slot, OR
 *   - "openai" → synthesized via the OpenAI tts-1 fallback.
 *
 * The API route (/api/tts) looks up the requested voice ID in `VOICES`,
 * routes the synthesis call to the correct provider, and gracefully
 * falls back to OpenAI when a Z.ai voice is requested but the Z.ai
 * specialty service isn't configured.
 *
 * Adding a new voice = add one entry to VOICES below. Both the UI
 * (voice-lab, settings) and the API route pick it up automatically.
 */

export type VoiceProvider = "zai" | "openai";
export type VoiceGender = "male" | "female" | "neutral";

export interface Voice {
  /** Stable voice ID — sent to /api/tts as the `voice` param. */
  id: string;
  /** Human-friendly display name (e.g. "Salma"). */
  name: string;
  /** Display language label (e.g. "Arabic (MSA)"). */
  language: string;
  /** BCP-47 language code (e.g. "ar", "ar-EG"). Used for filtering + RTL. */
  languageCode: string;
  gender: VoiceGender;
  /** Optional dialect tag (e.g. "Egyptian", "Gulf"). */
  dialect?: string;
  provider: VoiceProvider;
  /** Short sample phrase used by the UI preview button. */
  preview?: string;
}

/**
 * Sample phrases per language — used by the Voice Lab preview button.
 * Each phrase is a friendly "Hello" in the target language so users can
 * quickly audition a voice without typing.
 */
const PREVIEW_PHRASES: Record<string, string> = {
  en: "Hello! This is a voice preview from DevForge AI.",
  ar: "مرحبا! هذه معاينة صوتية من DevForge AI.",
  fr: "Bonjour ! Ceci est un aperçu vocal de DevForge AI.",
  es: "¡Hola! Esta es una muestra de voz de DevForge AI.",
  de: "Hallo! Dies ist eine Sprachvorschau von DevForge AI.",
  zh: "你好！这是 DevForge AI 的语音预览。",
  ja: "こんにちは！これは DevForge AI の音声プレビューです。",
  ru: "Здравствуйте! Это голосовое превью от DevForge AI.",
  pt: "Olá! Esta é uma prévia de voz do DevForge AI.",
  tr: "Merhaba! Bu, DevForge AI'dan bir ses önizlemesidir.",
  hi: "नमस्ते! यह DevForge AI का ध्वनि पूर्वावलोकन है।",
  it: "Ciao! Questa è un'anteprima vocale di DevForge AI.",
  ko: "안녕하세요! DevForge AI의 음성 미리보기입니다.",
  nl: "Hallo! Dit is een stemvoorbeeld van DevForge AI.",
  pl: "Cześć! To podgląd głosu z DevForge AI.",
  uk: "Привіт! Це голосове попередження від DevForge AI.",
};

function previewFor(languageCode: string): string {
  const base = languageCode.split("-")[0].toLowerCase();
  return PREVIEW_PHRASES[base] ?? PREVIEW_PHRASES.en;
}

// ---------------------------------------------------------------------------
// Voice catalog
// ---------------------------------------------------------------------------

export const VOICES: Voice[] = [
  // ---- OpenAI tts-1 voices (language-agnostic) ----
  {
    id: "alloy",
    name: "Alloy",
    language: "English",
    languageCode: "en",
    gender: "neutral",
    provider: "openai",
  },
  {
    id: "echo",
    name: "Echo",
    language: "English",
    languageCode: "en",
    gender: "male",
    provider: "openai",
  },
  {
    id: "fable",
    name: "Fable",
    language: "English",
    languageCode: "en",
    gender: "male",
    provider: "openai",
  },
  {
    id: "onyx",
    name: "Onyx",
    language: "English",
    languageCode: "en",
    gender: "male",
    provider: "openai",
  },
  {
    id: "nova",
    name: "Nova",
    language: "English",
    languageCode: "en",
    gender: "female",
    provider: "openai",
  },
  {
    id: "shimmer",
    name: "Shimmer",
    language: "English",
    languageCode: "en",
    gender: "female",
    provider: "openai",
  },

  // ---- Z.ai legacy voices (kept for backward compat; tuned for Chinese/EN) ----
  {
    id: "tongtong",
    name: "Tongtong",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "female",
    provider: "zai",
    preview: previewFor("zh"),
  },
  {
    id: "chuichui",
    name: "Chuichui",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "female",
    provider: "zai",
    preview: previewFor("zh"),
  },
  {
    id: "xiaochen",
    name: "Xiaochen",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "male",
    provider: "zai",
    preview: previewFor("zh"),
  },
  {
    id: "jam",
    name: "Jam",
    language: "English",
    languageCode: "en",
    gender: "male",
    provider: "zai",
  },
  {
    id: "kazi",
    name: "Kazi",
    language: "English",
    languageCode: "en",
    gender: "neutral",
    provider: "zai",
  },
  {
    id: "douji",
    name: "Douji",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "male",
    provider: "zai",
    preview: previewFor("zh"),
  },
  {
    id: "luodo",
    name: "Luodo",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "female",
    provider: "zai",
    preview: previewFor("zh"),
  },

  // ---- Arabic — Modern Standard Arabic (MSA) ----
  {
    id: "zai-ar-1",
    name: "Salma",
    language: "Arabic (MSA)",
    languageCode: "ar",
    gender: "female",
    provider: "zai",
    preview: previewFor("ar"),
  },
  {
    id: "zai-ar-2",
    name: "Omar",
    language: "Arabic (MSA)",
    languageCode: "ar",
    gender: "male",
    provider: "zai",
    preview: previewFor("ar"),
  },

  // ---- Arabic — regional dialects ----
  {
    id: "zai-ar-eg",
    name: "Ahmed",
    language: "Arabic (Egyptian)",
    languageCode: "ar-EG",
    gender: "male",
    dialect: "Egyptian",
    provider: "zai",
    preview: previewFor("ar"),
  },
  {
    id: "zai-ar-sa",
    name: "Fatima",
    language: "Arabic (Gulf)",
    languageCode: "ar-SA",
    gender: "female",
    dialect: "Gulf",
    provider: "zai",
    preview: previewFor("ar"),
  },
  {
    id: "zai-ar-sy",
    name: "Yousef",
    language: "Arabic (Levantine)",
    languageCode: "ar-SY",
    gender: "male",
    dialect: "Levantine",
    provider: "zai",
    preview: previewFor("ar"),
  },
  {
    id: "zai-ar-ma",
    name: "Aisha",
    language: "Arabic (Maghrebi)",
    languageCode: "ar-MA",
    gender: "female",
    dialect: "Maghrebi",
    provider: "zai",
    preview: previewFor("ar"),
  },

  // ---- French ----
  {
    id: "zai-fr-1",
    name: "Claire",
    language: "French",
    languageCode: "fr",
    gender: "female",
    provider: "zai",
    preview: previewFor("fr"),
  },
  {
    id: "zai-fr-2",
    name: "Louis",
    language: "French",
    languageCode: "fr",
    gender: "male",
    provider: "zai",
    preview: previewFor("fr"),
  },

  // ---- Spanish ----
  {
    id: "zai-es-1",
    name: "Sofia",
    language: "Spanish",
    languageCode: "es",
    gender: "female",
    provider: "zai",
    preview: previewFor("es"),
  },
  {
    id: "zai-es-2",
    name: "Diego",
    language: "Spanish",
    languageCode: "es",
    gender: "male",
    provider: "zai",
    preview: previewFor("es"),
  },

  // ---- German ----
  {
    id: "zai-de-1",
    name: "Hans",
    language: "German",
    languageCode: "de",
    gender: "male",
    provider: "zai",
    preview: previewFor("de"),
  },
  {
    id: "zai-de-2",
    name: "Greta",
    language: "German",
    languageCode: "de",
    gender: "female",
    provider: "zai",
    preview: previewFor("de"),
  },

  // ---- Chinese (Mandarin) ----
  {
    id: "zai-zh-1",
    name: "Mei",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "female",
    provider: "zai",
    preview: previewFor("zh"),
  },
  {
    id: "zai-zh-2",
    name: "Wei",
    language: "Chinese (Mandarin)",
    languageCode: "zh",
    gender: "male",
    provider: "zai",
    preview: previewFor("zh"),
  },

  // ---- Japanese ----
  {
    id: "zai-ja-1",
    name: "Yuki",
    language: "Japanese",
    languageCode: "ja",
    gender: "female",
    provider: "zai",
    preview: previewFor("ja"),
  },
  {
    id: "zai-ja-2",
    name: "Haruto",
    language: "Japanese",
    languageCode: "ja",
    gender: "male",
    provider: "zai",
    preview: previewFor("ja"),
  },

  // ---- Russian ----
  {
    id: "zai-ru-1",
    name: "Anastasia",
    language: "Russian",
    languageCode: "ru",
    gender: "female",
    provider: "zai",
    preview: previewFor("ru"),
  },
  {
    id: "zai-ru-2",
    name: "Dmitri",
    language: "Russian",
    languageCode: "ru",
    gender: "male",
    provider: "zai",
    preview: previewFor("ru"),
  },

  // ---- Portuguese ----
  {
    id: "zai-pt-1",
    name: "Lucas",
    language: "Portuguese",
    languageCode: "pt",
    gender: "male",
    provider: "zai",
    preview: previewFor("pt"),
  },
  {
    id: "zai-pt-2",
    name: "Beatriz",
    language: "Portuguese",
    languageCode: "pt",
    gender: "female",
    provider: "zai",
    preview: previewFor("pt"),
  },

  // ---- Turkish ----
  {
    id: "zai-tr-1",
    name: "Elif",
    language: "Turkish",
    languageCode: "tr",
    gender: "female",
    provider: "zai",
    preview: previewFor("tr"),
  },
  {
    id: "zai-tr-2",
    name: "Mehmet",
    language: "Turkish",
    languageCode: "tr",
    gender: "male",
    provider: "zai",
    preview: previewFor("tr"),
  },

  // ---- Hindi ----
  {
    id: "zai-hi-1",
    name: "Arjun",
    language: "Hindi",
    languageCode: "hi",
    gender: "male",
    provider: "zai",
    preview: previewFor("hi"),
  },
  {
    id: "zai-hi-2",
    name: "Priya",
    language: "Hindi",
    languageCode: "hi",
    gender: "female",
    provider: "zai",
    preview: previewFor("hi"),
  },

  // ---- Italian ----
  {
    id: "zai-it-1",
    name: "Giulia",
    language: "Italian",
    languageCode: "it",
    gender: "female",
    provider: "zai",
    preview: previewFor("it"),
  },

  // ---- Korean ----
  {
    id: "zai-ko-1",
    name: "Min-jun",
    language: "Korean",
    languageCode: "ko",
    gender: "male",
    provider: "zai",
    preview: previewFor("ko"),
  },

  // ---- Dutch ----
  {
    id: "zai-nl-1",
    name: "Lotte",
    language: "Dutch",
    languageCode: "nl",
    gender: "female",
    provider: "zai",
    preview: previewFor("nl"),
  },

  // ---- Polish ----
  {
    id: "zai-pl-1",
    name: "Kasia",
    language: "Polish",
    languageCode: "pl",
    gender: "female",
    provider: "zai",
    preview: previewFor("pl"),
  },

  // ---- Ukrainian ----
  {
    id: "zai-uk-1",
    name: "Olena",
    language: "Ukrainian",
    languageCode: "uk",
    gender: "female",
    provider: "zai",
    preview: previewFor("uk"),
  },
];

// ---------------------------------------------------------------------------
// Languages (BCP-47 base codes) used by the language filter dropdown.
// ---------------------------------------------------------------------------

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  /** RTL flag — true for Arabic, Hebrew, Persian, Urdu, etc. */
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
];

// ---------------------------------------------------------------------------
// Voice styles — sent as the `style` param to /api/tts.
// ---------------------------------------------------------------------------

export type VoiceStyle =
  | "neutral"
  | "cheerful"
  | "sad"
  | "angry"
  | "whisper";

export interface VoiceStyleOption {
  value: VoiceStyle;
  label: string;
  /** Speed multiplier applied by the API route. */
  speedMultiplier: number;
}

export const VOICE_STYLES: VoiceStyleOption[] = [
  { value: "neutral", label: "Neutral", speedMultiplier: 1.0 },
  { value: "cheerful", label: "Cheerful", speedMultiplier: 1.05 },
  { value: "sad", label: "Sad", speedMultiplier: 0.9 },
  { value: "angry", label: "Angry", speedMultiplier: 1.1 },
  { value: "whisper", label: "Whisper", speedMultiplier: 0.85 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns all voices matching the given language code (BCP-47 base).
 * Pass `"all"` (or empty) to get the full list.
 */
export function getVoicesByLanguage(langCode: string): Voice[] {
  if (!langCode || langCode === "all") return VOICES;
  const base = langCode.split("-")[0].toLowerCase();
  return VOICES.filter((v) =>
    v.languageCode.split("-")[0].toLowerCase() === base,
  );
}

/** Case-insensitive voice lookup by ID. */
export function getVoiceById(id: string): Voice | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase();
  return VOICES.find((v) => v.id.toLowerCase() === lower);
}

/** Get the Language record for a BCP-47 code (or undefined). */
export function getLanguageByCode(code: string): Language | undefined {
  if (!code) return undefined;
  const base = code.split("-")[0].toLowerCase();
  return LANGUAGES.find((l) => l.code.toLowerCase() === base);
}

/**
 * Group voices by their display language label, preserving the order in
 * which each language first appears in `VOICES`. Used by the Voice Lab UI
 * to render grouped `<SelectGroup>` sections.
 */
export function groupVoicesByLanguage(
  voices: Voice[],
): { language: string; languageCode: string; voices: Voice[] }[] {
  const groups: { language: string; languageCode: string; voices: Voice[] }[] =
    [];
  for (const v of voices) {
    let g = groups.find(
      (g) => g.language === v.language,
    );
    if (!g) {
      g = { language: v.language, languageCode: v.languageCode, voices: [] };
      groups.push(g);
    }
    g.voices.push(v);
  }
  return groups;
}

/** True if the given text contains Arabic characters (used for RTL hints). */
export function isArabicText(text: string): boolean {
  // Arabic + Arabic Supplement + Arabic Extended-A + Arabic Presentation Forms.
  const ARABIC_RANGE =
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return ARABIC_RANGE.test(text);
}
