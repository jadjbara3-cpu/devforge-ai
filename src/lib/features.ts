export const FEATURES = [
  "overview",
  "chat",
  "image",
  "vision",
  "voice",
  "web",
  "snippets",
  "board",
] as const;

export type FeatureKey = (typeof FEATURES)[number];

export const FEATURE_META: Record<
  FeatureKey,
  { title: string; tagline: string }
> = {
  overview: { title: "Overview", tagline: "Your AI developer command center" },
  chat: { title: "AI Chat", tagline: "Multi-turn LLM conversations" },
  image: { title: "Image Studio", tagline: "Generate visuals from prompts" },
  vision: { title: "Vision Lab", tagline: "Understand images with AI" },
  voice: { title: "Voice Lab", tagline: "Speech synthesis & recognition" },
  web: { title: "Web Intelligence", tagline: "Search & read the live web" },
  snippets: { title: "Snippet Vault", tagline: "Your personal code library" },
  board: { title: "Task Board", tagline: "Real-time collaborative kanban" },
};
